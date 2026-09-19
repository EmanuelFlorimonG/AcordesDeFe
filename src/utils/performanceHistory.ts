import type { EventOccurrence, MinistryEvent, MinistryEventType } from '../types/event';
import type { MinistryMember } from '../types/ministry';
import type {
  PerformanceParticipant,
  PerformancePerson,
  PerformanceRecord,
  PerformanceSection,
  PerformanceSong,
} from '../types/performance';
import type { Setlist, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { resolveArrangement, resolvedSectionName } from './arrangement';
import { parseSongSections } from './chordParser';
import { transposeKey } from './chordTransposer';
import { createId, type IdFactory } from './createId';
import { monthOf, type CalendarMonth } from './dates';
import { isKeyName } from './keyPreferences';
import { describeKey } from './keySettings';
import { sortMembers } from './ministryMembers';

/**
 * The history of performances as pure functions: building the snapshot when
 * an activity date is closed, correcting it on purpose, and answering "when
 * was this sung, in which key, by whom".
 *
 * A snapshot is built only here, from the same calculators the rest of the app
 * uses (describeKey for the key, resolveArrangement for the arrangement), so
 * the record says exactly what the setlist and Mass mode showed that day.
 */

export const MAX_PERFORMANCE_NOTES_LENGTH = 500;

// ---------------------------------------------------------------------------
// Building the snapshot
// ---------------------------------------------------------------------------

export interface PerformanceSources {
  event: MinistryEvent;
  /** The date being closed: the activity's own date, or one date of its series */
  occurrenceDate: string;
  setlist: Setlist;
  songsById: Map<string, Song>;
  membersById: Map<string, MinistryMember>;
  /** The setlist entries that were sung; every other prepared entry is kept as not sung */
  performedItemIds: string[];
  notes?: string;
}

const person = (memberId: string, membersById: Map<string, MinistryMember>): PerformancePerson | null => {
  const member = membersById.get(memberId);
  return member ? { memberId, name: member.name } : null;
};

/** The entries of a setlist a record can speak about: those whose song is still in the songbook. */
export function recordableItems(setlist: Setlist, songsById: Map<string, Song>): SetlistItem[] {
  return setlist.items.filter((item) => songsById.has(item.songId));
}

function snapshotSections(
  song: Song,
  item: SetlistItem,
  membersById: Map<string, MinistryMember>
): PerformanceSection[] | null {
  // Played as written: nothing was decided about voices, repeats or order.
  if (!item.arrangement) return null;
  return resolveArrangement(parseSongSections(song.content), item.arrangement).map((entry) => ({
    label: resolvedSectionName(entry),
    sourceSectionId: entry.sourceSectionId || null,
    repeatCount: entry.repeatCount,
    voices: [...entry.voices],
    assigned: entry.assignedMemberIds
      .map((id) => person(id, membersById))
      .filter((entry): entry is PerformancePerson => entry !== null),
    instruction: entry.instruction,
    transition:
      entry.transition.type === 'jump'
        ? entry.transitionTargetLabel
          ? { type: 'jump', targetLabel: entry.transitionTargetLabel }
          : { type: 'continue' }
        : { type: entry.transition.type },
  }));
}

function snapshotSong(
  song: Song,
  item: SetlistItem,
  isLast: boolean,
  performed: boolean,
  membersById: Map<string, MinistryMember>,
  makeId: IdFactory
): PerformanceSong {
  // The same calculator as the setlist, rehearsal and Mass mode.
  const key = describeKey(song.originalKey, item, song.recommendedCapo ?? 0);
  return {
    id: makeId(),
    songId: song.id,
    title: song.title,
    artist: song.artist ?? '',
    moment: item.moment,
    performed,
    key: key ? key.sounding : null,
    chordKey: key ? key.shape : null,
    capoFret: item.capoFret,
    transposeSteps: item.transposeSteps,
    sections: snapshotSections(song, item, membersById),
    notes: item.notes,
    transitionToNext:
      !isLast && item.transitionToNext
        ? { type: item.transitionToNext.type, instruction: item.transitionToNext.instruction }
        : null,
  };
}

/**
 * The record of one closed date, or null when nothing was sung: a date closed
 * without music is simply Realizada, with no empty record next to it.
 */
export function createPerformanceSnapshot(
  { event, occurrenceDate, setlist, songsById, membersById, performedItemIds, notes = '' }: PerformanceSources,
  { now, createId: makeId = createId }: { now: number; createId?: IdFactory }
): PerformanceRecord | null {
  const performed = new Set(performedItemIds);
  const items = recordableItems(setlist, songsById);
  if (!items.some((item) => performed.has(item.id))) return null;
  const lastItemId = setlist.items[setlist.items.length - 1]?.id;

  const participants: PerformanceParticipant[] = sortMembers(
    event.participantIds.map((id) => membersById.get(id)).filter((member): member is MinistryMember => Boolean(member))
  ).map((member) => ({ memberId: member.id, name: member.name, roles: [...member.roles] }));

  return {
    id: makeId(),
    eventId: event.id,
    occurrenceDate,
    event: {
      title: event.title,
      type: event.type,
      allDay: event.allDay,
      startTime: event.startTime,
      location: event.location,
    },
    setlistId: setlist.id,
    setlistName: setlist.name,
    participants,
    songs: items.map((item) =>
      snapshotSong(
        songsById.get(item.songId) as Song,
        item,
        item.id === lastItemId,
        performed.has(item.id),
        membersById,
        makeId
      )
    ),
    notes: cleanPerformanceNotes(notes),
    createdAt: now,
    updatedAt: now,
  };
}

export function cleanPerformanceNotes(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_PERFORMANCE_NOTES_LENGTH) : '';
}

// ---------------------------------------------------------------------------
// Correcting a record, on purpose
// ---------------------------------------------------------------------------

export interface PerformanceChanges {
  /** Entries of the record that were sung (ids of its songs) */
  performedSongIds?: string[];
  /** The key heard, per entry id; the chord key follows the capo that was used */
  keys?: Record<string, string>;
  participants?: PerformanceParticipant[];
  notes?: string;
}

export type PerformanceEditError = 'no-songs';

export function validatePerformanceChanges(
  record: PerformanceRecord,
  changes: PerformanceChanges
): PerformanceEditError | null {
  if (!changes.performedSongIds) return null;
  const ids = new Set(changes.performedSongIds);
  return record.songs.some((song) => ids.has(song.id)) ? null : 'no-songs';
}

/**
 * A correction written by someone who knows what happened: it never looks at
 * the setlist, the songs or the members as they are now. Names of people added
 * here are the names they have today, which is the day of the correction.
 */
export function updatePerformanceRecord(
  record: PerformanceRecord,
  changes: PerformanceChanges,
  now: number
): PerformanceRecord {
  if (validatePerformanceChanges(record, changes)) throw new Error('Un registro necesita al menos una canción.');
  const performed = changes.performedSongIds ? new Set(changes.performedSongIds) : null;
  const songs = record.songs.map((song) => {
    let next = song;
    if (performed && performed.has(song.id) !== song.performed) next = { ...next, performed: performed.has(song.id) };
    const key = changes.keys?.[song.id];
    if (key !== undefined && isKeyName(key) && key !== song.key) {
      next = { ...next, key, chordKey: song.capoFret > 0 ? transposeKey(key, -song.capoFret) : null };
    }
    return next;
  });
  return {
    ...record,
    songs,
    participants: changes.participants ? dedupePeople(changes.participants) : record.participants,
    notes: changes.notes !== undefined ? cleanPerformanceNotes(changes.notes) : record.notes,
    updatedAt: now,
  };
}

function dedupePeople<T extends PerformancePerson>(people: T[]): T[] {
  const seen = new Set<string>();
  return people.filter((entry) => {
    if (seen.has(entry.memberId)) return false;
    seen.add(entry.memberId);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Reading a record
// ---------------------------------------------------------------------------

export function performedSongs(record: PerformanceRecord): PerformanceSong[] {
  return record.songs.filter((song) => song.performed);
}

/** Who sang a song as soloist that day: people assigned to a block marked "Solista". Nothing is inferred. */
export function soloistsOf(song: PerformanceSong): PerformancePerson[] {
  return dedupePeople(
    (song.sections ?? []).filter((section) => section.voices.includes('soloist')).flatMap((section) => section.assigned)
  );
}

/** Everyone the record names that day: the team, and anyone assigned in a sung song. */
export function peopleOf(record: PerformanceRecord): PerformancePerson[] {
  return dedupePeople([
    ...record.participants,
    ...performedSongs(record).flatMap((song) => (song.sections ?? []).flatMap((section) => section.assigned)),
  ]);
}

/** "Acordes en G · cejilla 3" when a capo made the played shapes differ from the sound; "" otherwise. */
export function describeCapoShapes(song: Pick<PerformanceSong, 'chordKey' | 'capoFret'>): string {
  return song.chordKey && song.capoFret > 0 ? `Acordes en ${song.chordKey} · cejilla ${song.capoFret}` : '';
}

/** "Bb", or "Bb (acordes en G, cejilla 3)" when a capo made the shapes differ. */
export function describePerformedKey(song: Pick<PerformanceSong, 'key' | 'chordKey' | 'capoFret'>): string {
  if (!song.key) return '';
  return song.chordKey && song.capoFret > 0
    ? `${song.key} (acordes en ${song.chordKey}, cejilla ${song.capoFret})`
    : song.key;
}

// ---------------------------------------------------------------------------
// Finding records
// ---------------------------------------------------------------------------

/** Newest first: by date, then by start time, then by when it was recorded. */
export function compareRecords(a: PerformanceRecord, b: PerformanceRecord): number {
  if (a.occurrenceDate !== b.occurrenceDate) return a.occurrenceDate < b.occurrenceDate ? 1 : -1;
  const time = (b.event.startTime ?? '').localeCompare(a.event.startTime ?? '');
  return time || b.createdAt - a.createdAt;
}

export function sortRecords(records: PerformanceRecord[]): PerformanceRecord[] {
  return [...records].sort(compareRecords);
}

/** The record of one date of one activity, if it was recorded. There is never more than one. */
export function getPerformanceForOccurrence(
  records: PerformanceRecord[],
  eventId: string,
  occurrenceDate: string
): PerformanceRecord | null {
  return records.find((record) => record.eventId === eventId && record.occurrenceDate === occurrenceDate) ?? null;
}

export function getPerformancesForEvent(records: PerformanceRecord[], eventId: string): PerformanceRecord[] {
  return sortRecords(records.filter((record) => record.eventId === eventId));
}

export function getPerformancesForSetlist(records: PerformanceRecord[], setlistId: string): PerformanceRecord[] {
  return sortRecords(records.filter((record) => record.setlistId === setlistId));
}

export function getRecentPerformances(records: PerformanceRecord[], limit = 5): PerformanceRecord[] {
  return sortRecords(records).slice(0, limit);
}

export interface SongPerformance {
  record: PerformanceRecord;
  /** The entries of that song sung that day (usually one; two for a reprise) */
  songs: PerformanceSong[];
}

/**
 * Where a song was sung, newest first. One entry per record: a song sung at
 * the opening and again at the end of the same Mass is one performance of it
 * that day, and a chorus sung three times is still one song.
 */
export function getPerformancesForSong(records: PerformanceRecord[], songId: string): SongPerformance[] {
  return sortRecords(records).flatMap((record) => {
    const songs = performedSongs(record).filter((song) => song.songId === songId);
    return songs.length > 0 ? [{ record, songs }] : [];
  });
}

/** How many recorded activities include this song as sung. */
export function getSongPerformanceCount(records: PerformanceRecord[], songId: string): number {
  return records.filter((record) => record.songs.some((song) => song.performed && song.songId === songId)).length;
}

/** Records where someone took part: in the team of that day, or assigned in a sung song. */
export function getPerformancesForMember(records: PerformanceRecord[], memberId: string): PerformanceRecord[] {
  return sortRecords(records.filter((record) => peopleOf(record).some((entry) => entry.memberId === memberId)));
}

/**
 * How many sung songs had this person assigned to a block marked "Solista",
 * counted once per song per record. It is an exact count of what the
 * arrangements said, never a guess from someone's voice part.
 */
export function countSoloSongsForMember(records: PerformanceRecord[], memberId: string): number {
  return records.reduce(
    (total, record) =>
      total + performedSongs(record).filter((song) => soloistsOf(song).some((entry) => entry.memberId === memberId)).length,
    0
  );
}

export interface PerformanceFilters {
  from: string;
  to: string;
  type: MinistryEventType | '';
  songId: string;
  memberId: string;
}

export const EMPTY_PERFORMANCE_FILTERS: PerformanceFilters = { from: '', to: '', type: '', songId: '', memberId: '' };

export function hasPerformanceFilters(filters: PerformanceFilters): boolean {
  return Object.values(filters).some(Boolean);
}

export function filterPerformances(records: PerformanceRecord[], filters: PerformanceFilters): PerformanceRecord[] {
  return sortRecords(
    records.filter(
      (record) =>
        (!filters.from || record.occurrenceDate >= filters.from) &&
        (!filters.to || record.occurrenceDate <= filters.to) &&
        (!filters.type || record.event.type === filters.type) &&
        (!filters.songId || record.songs.some((song) => song.performed && song.songId === filters.songId)) &&
        (!filters.memberId || peopleOf(record).some((entry) => entry.memberId === filters.memberId))
    )
  );
}

export interface PerformanceMonthGroup {
  /** "2026-09" */
  key: string;
  month: CalendarMonth;
  records: PerformanceRecord[];
}

/** Records grouped by month, newest month first; each month newest first. */
export function groupPerformancesByMonth(records: PerformanceRecord[]): PerformanceMonthGroup[] {
  const groups: PerformanceMonthGroup[] = [];
  for (const record of sortRecords(records)) {
    const key = record.occurrenceDate.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.records.push(record);
    else groups.push({ key, month: monthOf(record.occurrenceDate), records: [record] });
  }
  return groups;
}

/**
 * The songs and people that appear in the history, for the filters: each one
 * once, by id, named as in their most recent record.
 */
export function listHistorySongs(records: PerformanceRecord[]): Array<{ songId: string; title: string }> {
  const byId = new Map<string, string>();
  for (const record of sortRecords(records)) {
    for (const song of performedSongs(record)) if (!byId.has(song.songId)) byId.set(song.songId, song.title);
  }
  return [...byId].map(([songId, title]) => ({ songId, title })).sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

export function listHistoryPeople(records: PerformanceRecord[]): PerformancePerson[] {
  const byId = new Map<string, string>();
  for (const record of sortRecords(records)) {
    for (const entry of peopleOf(record)) if (!byId.has(entry.memberId)) byId.set(entry.memberId, entry.name);
  }
  return [...byId].map(([memberId, name]) => ({ memberId, name })).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

/** "7 canciones · 4 participantes" */
export function describeRecordSize(record: PerformanceRecord): string {
  const songs = performedSongs(record).length;
  const people = record.participants.length;
  return [
    `${songs} ${songs === 1 ? 'canción' : 'canciones'}`,
    people > 0 ? `${people} ${people === 1 ? 'participante' : 'participantes'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

// ---------------------------------------------------------------------------
// What a date of an activity offers, by status
// ---------------------------------------------------------------------------

export type OccurrenceAction =
  | 'complete'
  | 'cancel'
  | 'restore'
  | 'reopen'
  | 'view-performance'
  | 'record-performance';

/**
 * The actions one date offers, most important first:
 *
 * - Programada: mark it as done, or cancel it.
 * - Realizada: see what was sung (or record it, when there is a repertoire and
 *   nothing was recorded), and reopen it. Reopening with a record is refused
 *   with an explanation (see statusChangeError), never done silently.
 * - Cancelada: restore it.
 */
export function occurrenceActions({
  status,
  hasPerformance,
  canRecord,
}: {
  status: EventOccurrence['status'];
  hasPerformance: boolean;
  /** There is a repertoire with at least one song still in the songbook */
  canRecord: boolean;
}): OccurrenceAction[] {
  if (status === 'cancelled') return ['restore'];
  if (status === 'scheduled') return ['complete', 'cancel'];
  if (hasPerformance) return ['view-performance', 'reopen'];
  return canRecord ? ['record-performance', 'reopen'] : ['reopen'];
}

/**
 * "Finalizar celebración" appears at the end of Mass mode only when it was
 * opened from an activity date that is still scheduled. From a setlist there
 * is no activity to close; a date already closed has nothing left to finish.
 */
export function canFinishCelebration(occurrence: EventOccurrence | null): boolean {
  return occurrence !== null && occurrence.status === 'scheduled';
}
