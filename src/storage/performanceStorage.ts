import type { SongTransitionType } from '../types/setlist';
import type {
  PerformanceParticipant,
  PerformancePerson,
  PerformanceRecord,
  PerformanceSection,
  PerformanceSectionTransition,
  PerformanceSong,
} from '../types/performance';
import { clampRepeatCount, cleanInstruction, normalizeVoices } from '../utils/arrangement';
import { createId, type IdFactory } from '../utils/createId';
import { isValidIsoDate, isValidTime } from '../utils/dates';
import { isKeyName } from '../utils/keyPreferences';
import { MAX_CAPO, MAX_TRANSPOSE, MIN_CAPO, MIN_TRANSPOSE } from '../utils/keySettings';
import { isEventType } from '../utils/ministryEvents';
import { normalizeRoles } from '../utils/ministryMembers';
import { cleanPerformanceNotes } from '../utils/performanceHistory';
import {
  createLocalRepository,
  getBrowserStorage,
  type KeyValueStorage,
  type Repository,
} from './localRepository';

/**
 * Where the history of performances is kept: its own versioned list, apart
 * from activities, setlists and members, so deleting any of those never
 * touches it. Everything read is checked; a record that can't say what was
 * sung, on which date, for which activity, is left out rather than guessed.
 * Two records for the same date of the same activity can't exist: if stored
 * data has them, the most recently corrected one is kept.
 */

export const PERFORMANCE_STORAGE_KEY = 'genesaret_performance_history';
export const PERFORMANCE_BACKUP_KEY = 'genesaret_performance_history_backup';
export const PERFORMANCE_STORAGE_VERSION = 1;

const MAX_TEXT = 200;
const SONG_TRANSITIONS: SongTransitionType[] = ['stop', 'direct', 'instrumental', 'custom'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max = MAX_TEXT) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const integer = (value: unknown, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(Math.max(Math.round(value), min), max) : 0;

const asTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

function sanitizePerson(value: unknown): PerformancePerson | null {
  if (!isRecord(value)) return null;
  const memberId = text(value.memberId);
  const name = text(value.name, 80);
  return memberId && name ? { memberId, name } : null;
}

function sanitizeParticipant(value: unknown): PerformanceParticipant | null {
  const base = sanitizePerson(value);
  return base && isRecord(value) ? { ...base, roles: normalizeRoles(value.roles) } : null;
}

function sanitizeTransition(value: unknown): PerformanceSectionTransition {
  if (isRecord(value)) {
    if (value.type === 'end') return { type: 'end' };
    if (value.type === 'jump' && text(value.targetLabel)) return { type: 'jump', targetLabel: text(value.targetLabel) };
  }
  return { type: 'continue' };
}

function sanitizeSection(value: unknown): PerformanceSection | null {
  if (!isRecord(value)) return null;
  const label = text(value.label, 80);
  if (!label) return null;
  return {
    label,
    sourceSectionId: text(value.sourceSectionId) || null,
    repeatCount: clampRepeatCount(value.repeatCount),
    voices: normalizeVoices(value.voices),
    assigned: (Array.isArray(value.assigned) ? value.assigned : [])
      .map(sanitizePerson)
      .filter((entry): entry is PerformancePerson => entry !== null),
    instruction: cleanInstruction(value.instruction),
    transition: sanitizeTransition(value.transition),
  };
}

function sanitizeSong(value: unknown, makeId: IdFactory): PerformanceSong | null {
  if (!isRecord(value)) return null;
  const songId = text(value.songId);
  const title = text(value.title);
  if (!songId || !title) return null;
  const key = typeof value.key === 'string' && isKeyName(value.key) ? value.key : null;
  const capoFret = integer(value.capoFret, MIN_CAPO, MAX_CAPO);
  const transition = value.transitionToNext;
  return {
    id: text(value.id) || makeId(),
    songId,
    title,
    artist: text(value.artist),
    moment: text(value.moment, 40),
    performed: value.performed !== false,
    key,
    chordKey: key && capoFret > 0 && typeof value.chordKey === 'string' && isKeyName(value.chordKey) ? value.chordKey : null,
    capoFret,
    transposeSteps: integer(value.transposeSteps, MIN_TRANSPOSE, MAX_TRANSPOSE),
    sections: Array.isArray(value.sections)
      ? value.sections.map(sanitizeSection).filter((entry): entry is PerformanceSection => entry !== null)
      : null,
    notes: text(value.notes, 500),
    transitionToNext:
      isRecord(transition) && SONG_TRANSITIONS.includes(transition.type as SongTransitionType)
        ? { type: transition.type as SongTransitionType, instruction: text(transition.instruction) }
        : null,
  };
}

/** A readable record from stored data, or null when it can't be repaired. */
export function sanitizePerformanceRecord(
  value: unknown,
  now = Date.now(),
  makeId: IdFactory = createId
): PerformanceRecord | null {
  if (!isRecord(value) || !isRecord(value.event)) return null;
  const eventId = text(value.eventId);
  const occurrenceDate = typeof value.occurrenceDate === 'string' ? value.occurrenceDate : '';
  const title = text(value.event.title, 120);
  if (!eventId || !isValidIsoDate(occurrenceDate) || !title || !Array.isArray(value.songs)) return null;
  const songs = value.songs.map((song) => sanitizeSong(song, makeId)).filter((song): song is PerformanceSong => song !== null);
  if (songs.length === 0) return null;
  const seenSongIds = new Set<string>();
  const createdAt = asTimestamp(value.createdAt, now);
  const startTime = typeof value.event.startTime === 'string' && isValidTime(value.event.startTime) ? value.event.startTime : null;
  return {
    id: text(value.id) || makeId(),
    eventId,
    occurrenceDate,
    event: {
      title,
      type: isEventType(value.event.type) ? value.event.type : 'other',
      allDay: Boolean(value.event.allDay) || !startTime,
      startTime,
      location: text(value.event.location, 120),
    },
    setlistId: text(value.setlistId) || null,
    setlistName: text(value.setlistName, 120),
    participants: (Array.isArray(value.participants) ? value.participants : [])
      .map(sanitizeParticipant)
      .filter((entry): entry is PerformanceParticipant => entry !== null),
    // Entry ids are unique inside a record, so a correction always names one entry.
    songs: songs.map((song) => {
      const id = seenSongIds.has(song.id) ? makeId() : song.id;
      seenSongIds.add(id);
      return id === song.id ? song : { ...song, id };
    }),
    notes: cleanPerformanceNotes(value.notes),
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
  };
}

export function parseStoredPerformances(
  raw: string | null,
  now = Date.now(),
  makeId: IdFactory = createId
): { records: PerformanceRecord[]; unreadable: boolean } {
  if (raw === null || raw === '') return { records: [], unreadable: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { records: [], unreadable: true };
  }
  if (!isRecord(data) || data.version !== PERFORMANCE_STORAGE_VERSION || !Array.isArray(data.records)) {
    return { records: [], unreadable: true };
  }
  const sanitized = data.records
    .map((entry) => sanitizePerformanceRecord(entry, now, makeId))
    .filter((record): record is PerformanceRecord => record !== null);

  // One record per date of an activity: the most recently corrected one wins.
  const byOccurrence = new Map<string, PerformanceRecord>();
  for (const record of sanitized) {
    const key = `${record.eventId}@${record.occurrenceDate}`;
    const kept = byOccurrence.get(key);
    if (!kept || record.updatedAt > kept.updatedAt) byOccurrence.set(key, record);
  }
  const seenIds = new Set<string>();
  const records = sanitized
    .filter((record) => byOccurrence.get(`${record.eventId}@${record.occurrenceDate}`) === record)
    .map((record) => {
      const id = seenIds.has(record.id) ? makeId() : record.id;
      seenIds.add(id);
      return id === record.id ? record : { ...record, id };
    });
  return { records, unreadable: false };
}

export function serializePerformances(records: PerformanceRecord[]): string {
  return JSON.stringify({ version: PERFORMANCE_STORAGE_VERSION, records });
}

export function createLocalPerformanceRepository(
  storage: KeyValueStorage | null = getBrowserStorage()
): Repository<PerformanceRecord> {
  return createLocalRepository(
    storage,
    PERFORMANCE_STORAGE_KEY,
    PERFORMANCE_BACKUP_KEY,
    (raw) => {
      const { records, unreadable } = parseStoredPerformances(raw);
      return { items: records, unreadable };
    },
    serializePerformances
  );
}
