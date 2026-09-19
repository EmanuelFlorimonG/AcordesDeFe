import type { MinistryMember, SingerKeyPreference } from '../types/ministry';
import { createId, type IdFactory } from '../utils/createId';
import { isKeyName } from '../utils/keyPreferences';
import { cleanMemberDetails } from '../utils/ministryMembers';
import {
  createLocalRepository,
  getBrowserStorage,
  type KeyValueStorage,
  type Repository,
} from './localRepository';

/**
 * Where the ministry's members and their preferred keys are kept.
 *
 * Two stores, two keys, each versioned: members change rarely and are the
 * source of identity, preferences are many small facts about member + song.
 * Screens only ever see a repository, so browser storage can be replaced by an
 * API later without rewriting them. Everything read is checked: corrupt or
 * hand-edited data is repaired or skipped, and unreadable data is backed up
 * before anything can overwrite it.
 */

export const MEMBERS_STORAGE_KEY = 'genesaret_ministry_members';
export const MEMBERS_BACKUP_KEY = 'genesaret_ministry_members_backup';
export const MEMBERS_STORAGE_VERSION = 1;

export const KEY_PREFERENCES_STORAGE_KEY = 'genesaret_key_preferences';
export const KEY_PREFERENCES_BACKUP_KEY = 'genesaret_key_preferences_backup';
export const KEY_PREFERENCES_STORAGE_VERSION = 1;

export type { KeyValueStorage, LoadResult, Repository } from './localRepository';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asTimestamp = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

/** A valid member from stored data, or null when it can't be repaired. */
export function sanitizeMember(value: unknown, now = Date.now(), makeId: IdFactory = createId): MinistryMember | null {
  if (!isRecord(value)) return null;
  const details = cleanMemberDetails({
    name: value.name as string,
    roles: value.roles as MinistryMember['roles'],
    instruments: value.instruments as MinistryMember['instruments'],
    vocalParts: value.vocalParts as MinistryMember['vocalParts'],
    notes: value.notes as string,
    isActive: typeof value.isActive === 'boolean' ? value.isActive : true,
  });
  if (!details.name) return null;
  const createdAt = asTimestamp(value.createdAt, now);
  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : makeId(),
    ...details,
    createdAt,
    updatedAt: asTimestamp(value.updatedAt, createdAt),
  };
}

export function parseStoredMembers(
  raw: string | null,
  now = Date.now(),
  makeId: IdFactory = createId
): { members: MinistryMember[]; unreadable: boolean } {
  if (raw === null || raw === '') return { members: [], unreadable: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { members: [], unreadable: true };
  }
  // A version this code doesn't know is never guessed at.
  if (!isRecord(data) || data.version !== MEMBERS_STORAGE_VERSION || !Array.isArray(data.members)) {
    return { members: [], unreadable: true };
  }
  const seen = new Set<string>();
  const members = data.members
    .map((entry) => sanitizeMember(entry, now, makeId))
    .filter((member): member is MinistryMember => member !== null)
    .map((member) => {
      // Two people sharing an id would be edited together; the second gets its own.
      const id = seen.has(member.id) ? makeId() : member.id;
      seen.add(id);
      return id === member.id ? member : { ...member, id };
    });
  return { members, unreadable: false };
}

export function serializeMembers(members: MinistryMember[]): string {
  return JSON.stringify({ version: MEMBERS_STORAGE_VERSION, members });
}

// ---------------------------------------------------------------------------
// Preferred keys
// ---------------------------------------------------------------------------

export function sanitizeKeyPreference(value: unknown, now = Date.now()): SingerKeyPreference | null {
  if (!isRecord(value)) return null;
  const memberId = typeof value.memberId === 'string' ? value.memberId.trim() : '';
  const songId = typeof value.songId === 'string' ? value.songId.trim() : '';
  if (!memberId || !songId || !isKeyName(value.key)) return null;
  return { memberId, songId, key: value.key, updatedAt: asTimestamp(value.updatedAt, now) };
}

export function parseStoredKeyPreferences(
  raw: string | null,
  now = Date.now()
): { preferences: SingerKeyPreference[]; unreadable: boolean } {
  if (raw === null || raw === '') return { preferences: [], unreadable: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { preferences: [], unreadable: true };
  }
  if (
    !isRecord(data) ||
    data.version !== KEY_PREFERENCES_STORAGE_VERSION ||
    !Array.isArray(data.preferences)
  ) {
    return { preferences: [], unreadable: true };
  }
  // One key per singer and song: if the same pair appears twice, the newest wins.
  const byPair = new Map<string, SingerKeyPreference>();
  for (const entry of data.preferences) {
    const preference = sanitizeKeyPreference(entry, now);
    if (!preference) continue;
    const pair = JSON.stringify([preference.memberId, preference.songId]);
    const existing = byPair.get(pair);
    if (!existing || existing.updatedAt <= preference.updatedAt) byPair.set(pair, preference);
  }
  return { preferences: [...byPair.values()], unreadable: false };
}

export function serializeKeyPreferences(preferences: SingerKeyPreference[]): string {
  return JSON.stringify({ version: KEY_PREFERENCES_STORAGE_VERSION, preferences });
}

// ---------------------------------------------------------------------------
// Browser repositories
// ---------------------------------------------------------------------------

export function createLocalMemberRepository(
  storage: KeyValueStorage | null = getBrowserStorage()
): Repository<MinistryMember> {
  return createLocalRepository(
    storage,
    MEMBERS_STORAGE_KEY,
    MEMBERS_BACKUP_KEY,
    (raw) => {
      const { members, unreadable } = parseStoredMembers(raw);
      return { items: members, unreadable };
    },
    serializeMembers
  );
}

export function createLocalKeyPreferenceRepository(
  storage: KeyValueStorage | null = getBrowserStorage()
): Repository<SingerKeyPreference> {
  return createLocalRepository(
    storage,
    KEY_PREFERENCES_STORAGE_KEY,
    KEY_PREFERENCES_BACKUP_KEY,
    (raw) => {
      const { preferences, unreadable } = parseStoredKeyPreferences(raw);
      return { items: preferences, unreadable };
    },
    serializeKeyPreferences
  );
}
