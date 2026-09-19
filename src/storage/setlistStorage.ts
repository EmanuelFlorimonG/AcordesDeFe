import type { Setlist, SetlistItem } from '../types/setlist';
import { normalizeKeySettings } from '../utils/keySettings';
import { normalizeMemberIds, sanitizeArrangement } from '../utils/arrangement';
import { sanitizeSongTransition } from '../utils/songTransition';
import {
  MAX_MOMENT_LENGTH,
  MAX_NOTES_LENGTH,
  cleanSetlistDetails,
  createId,
  type IdFactory,
} from '../utils/setlists';

/**
 * Setlist persistence, in one place.
 *
 * The interface only ever talks to a SetlistRepository, so replacing browser
 * storage with an API later means writing another repository, not touching
 * screens. Stored data is versioned and every value is checked on the way in:
 * a corrupt or hand-edited entry is repaired or skipped, never allowed to
 * crash the app, and unreadable data is backed up before it can be
 * overwritten.
 */

export const SETLIST_STORAGE_KEY = 'genesaret_setlists';
export const SETLIST_BACKUP_KEY = 'genesaret_setlists_backup';
/**
 * 2 added the musical arrangement of each entry, 3 the transition to the next
 * song, 4 the team (participants) and who sings each block. Older versions are
 * read as they are: an entry with no arrangement is played as the song is
 * written, one with no transition has nothing written down for the moment it
 * ends, and a setlist with no team simply has nobody chosen yet, which is
 * exactly what those setlists meant.
 */
export const SETLIST_STORAGE_VERSION = 4;
const READABLE_VERSIONS = [1, 2, 3, 4];

/** The part of the Web Storage API this module needs. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface SetlistLoadResult {
  setlists: Setlist[];
  /** True when stored data couldn't be read at all (it was backed up first). */
  recoveredFromUnreadableData: boolean;
}

export interface SetlistRepository {
  load(): SetlistLoadResult;
  save(setlists: Setlist[]): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

/** A valid entry from stored data, or null when it can't be repaired. */
export function sanitizeSetlistItem(value: unknown, makeId: IdFactory = createId): SetlistItem | null {
  if (!isRecord(value)) return null;
  const songId = asString(value.songId).trim();
  if (!songId) return null;
  const arrangement = sanitizeArrangement(value.arrangement, makeId);
  const transitionToNext = sanitizeSongTransition(value.transitionToNext);
  return {
    id: asString(value.id).trim() || makeId(),
    songId,
    moment: asString(value.moment).trim().slice(0, MAX_MOMENT_LENGTH),
    ...normalizeKeySettings(value),
    notes: asString(value.notes).trim().slice(0, MAX_NOTES_LENGTH),
    ...(arrangement ? { arrangement } : {}),
    ...(transitionToNext ? { transitionToNext } : {}),
  };
}

/** A valid setlist from stored data, or null when it can't be repaired. */
export function sanitizeSetlist(value: unknown, now = Date.now(), makeId: IdFactory = createId): Setlist | null {
  if (!isRecord(value)) return null;
  const details = cleanSetlistDetails({
    name: asString(value.name),
    date: asString(value.date),
    description: asString(value.description),
  });

  const seenItemIds = new Set<string>();
  const items = (Array.isArray(value.items) ? value.items : [])
    .map((item) => sanitizeSetlistItem(item, makeId))
    .filter((item): item is SetlistItem => item !== null)
    .map((item) => {
      // Two entries sharing an id would move and edit together; give the copy its own.
      const id = seenItemIds.has(item.id) ? makeId() : item.id;
      seenItemIds.add(id);
      return id === item.id ? item : { ...item, id };
    });

  const createdAt = asTimestamp(value.createdAt, now);
  return {
    id: asString(value.id).trim() || makeId(),
    name: details.name || 'Setlist sin nombre',
    date: details.date,
    description: details.description,
    participantIds: normalizeMemberIds(value.participantIds),
    items,
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
  };
}

/**
 * Reads stored text. Accepts every version this app has written ({ version,
 * setlists }) and a bare array (version 0). Anything else, including a newer
 * version this code doesn't understand, is reported unreadable rather than
 * guessed at.
 */
export function parseStoredSetlists(
  raw: string | null,
  now = Date.now(),
  makeId: IdFactory = createId
): { setlists: Setlist[]; unreadable: boolean } {
  if (raw === null || raw === '') return { setlists: [], unreadable: false };

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { setlists: [], unreadable: true };
  }

  let list: unknown[];
  if (Array.isArray(data)) {
    list = data; // version 0: a plain array
  } else if (
    isRecord(data) &&
    typeof data.version === 'number' &&
    READABLE_VERSIONS.includes(data.version) &&
    Array.isArray(data.setlists)
  ) {
    // Older versions need no rewriting: every field added since is optional,
    // and the next save stores them in the current version.
    list = data.setlists;
  } else {
    return { setlists: [], unreadable: true };
  }

  const seenIds = new Set<string>();
  const setlists = list
    .map((entry) => sanitizeSetlist(entry, now, makeId))
    .filter((setlist): setlist is Setlist => setlist !== null)
    .map((setlist) => {
      const id = seenIds.has(setlist.id) ? makeId() : setlist.id;
      seenIds.add(id);
      return id === setlist.id ? setlist : { ...setlist, id };
    });

  return { setlists, unreadable: false };
}

export function serializeSetlists(setlists: Setlist[]): string {
  return JSON.stringify({ version: SETLIST_STORAGE_VERSION, setlists });
}

function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage blocked (privacy settings)
  }
}

export function createLocalSetlistRepository(
  storage: KeyValueStorage | null = getBrowserStorage()
): SetlistRepository {
  const read = (key: string) => {
    try {
      return storage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  };
  const write = (key: string, value: string) => {
    try {
      storage?.setItem(key, value);
    } catch {
      // quota exceeded or storage blocked: the setlists stay in memory for this visit
    }
  };

  return {
    load() {
      const raw = read(SETLIST_STORAGE_KEY);
      const { setlists, unreadable } = parseStoredSetlists(raw);
      // Keep the original text before any later save can overwrite it.
      if (unreadable && raw !== null) write(SETLIST_BACKUP_KEY, raw);
      return { setlists, recoveredFromUnreadableData: unreadable };
    },
    save(setlists) {
      write(SETLIST_STORAGE_KEY, serializeSetlists(setlists));
    },
  };
}
