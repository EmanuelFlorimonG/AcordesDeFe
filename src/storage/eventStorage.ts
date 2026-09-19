import type { ClosedEventStatus, MinistryEvent } from '../types/event';
import { isValidIsoDate } from '../utils/dates';
import { createId, type IdFactory } from '../utils/createId';
import { cleanEventDetails, validateEventDetails } from '../utils/ministryEvents';
import {
  createLocalRepository,
  getBrowserStorage,
  type KeyValueStorage,
  type Repository,
} from './localRepository';

/**
 * Where the ministry's activities are kept: one versioned list of their own,
 * apart from setlists and members, behind a repository that an API can
 * replace. Everything read is checked: an activity with no title or no real
 * date cannot be repaired and is left out; an unknown type becomes "Otro";
 * references to members or setlists that no longer exist are kept as ids and
 * simply not shown, so nothing crashes and nothing is invented.
 *
 * Version 2 added the status of each date (Realizada, Cancelada). Version 1
 * data is read as it is, with every date still scheduled: an old date that
 * went by is never assumed to have happened.
 */

export const EVENTS_STORAGE_KEY = 'genesaret_ministry_events';
export const EVENTS_BACKUP_KEY = 'genesaret_ministry_events_backup';
export const EVENTS_STORAGE_VERSION = 2;
const READABLE_VERSIONS = [1, 2];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/** Only real dates with a known closed status; anything else is scheduled (absent). */
function sanitizeStatuses(value: unknown): Record<string, ClosedEventStatus> {
  const statuses: Record<string, ClosedEventStatus> = {};
  if (!isRecord(value)) return statuses;
  for (const [date, status] of Object.entries(value)) {
    if (isValidIsoDate(date) && (status === 'completed' || status === 'cancelled')) statuses[date] = status;
  }
  return statuses;
}

/** A valid activity from stored data, or null when it can't be repaired. */
export function sanitizeEvent(value: unknown, now = Date.now(), makeId: IdFactory = createId): MinistryEvent | null {
  if (!isRecord(value)) return null;
  const cleaned = cleanEventDetails(value as Partial<MinistryEvent>);
  // Damaged times are repaired rather than losing the activity: an end before
  // the start is dropped, and without a readable start it is kept as all-day.
  const withEnd =
    cleaned.endTime && cleaned.startTime && cleaned.endTime < cleaned.startTime ? { ...cleaned, endTime: null } : cleaned;
  const details = !withEnd.allDay && !withEnd.startTime ? { ...withEnd, allDay: true, endTime: null } : withEnd;
  if (validateEventDetails(details).length > 0) return null;
  const createdAt = asTimestamp(value.createdAt, now);
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : makeId(),
    ...details,
    occurrenceStatuses: sanitizeStatuses(value.occurrenceStatuses),
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
  };
}

export function parseStoredEvents(
  raw: string | null,
  now = Date.now(),
  makeId: IdFactory = createId
): { events: MinistryEvent[]; unreadable: boolean } {
  if (raw === null || raw === '') return { events: [], unreadable: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { events: [], unreadable: true };
  }
  // A version this code doesn't know (a newer app, a hand edit) is never guessed at.
  if (
    !isRecord(data) ||
    typeof data.version !== 'number' ||
    !READABLE_VERSIONS.includes(data.version) ||
    !Array.isArray(data.events)
  ) {
    return { events: [], unreadable: true };
  }
  const seen = new Set<string>();
  const events = data.events
    .map((entry) => sanitizeEvent(entry, now, makeId))
    .filter((event): event is MinistryEvent => event !== null)
    .map((event) => {
      const id = seen.has(event.id) ? makeId() : event.id;
      seen.add(id);
      return id === event.id ? event : { ...event, id };
    });
  return { events, unreadable: false };
}

export function serializeEvents(events: MinistryEvent[]): string {
  return JSON.stringify({ version: EVENTS_STORAGE_VERSION, events });
}

export function createLocalEventRepository(
  storage: KeyValueStorage | null = getBrowserStorage()
): Repository<MinistryEvent> {
  return createLocalRepository(
    storage,
    EVENTS_STORAGE_KEY,
    EVENTS_BACKUP_KEY,
    (raw) => {
      const { events, unreadable } = parseStoredEvents(raw);
      return { items: events, unreadable };
    },
    serializeEvents
  );
}
