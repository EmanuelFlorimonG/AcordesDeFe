import { getBrowserStorage, type KeyValueStorage } from './browserStorage';

/**
 * Songs opened recently, remembered in this browser.
 *
 * A song counts as opened when its page is opened, from the songbook, a
 * search, the player or a setlist, including moving to it inside rehearsal
 * mode. Appearing in search results or playing in the player does not count.
 */

export const RECENT_SONGS_KEY = 'genesaret_recent_songs';
export const RECENT_SONGS_VERSION = 1;
export const MAX_RECENT_SONGS = 20;

export interface RecentSong {
  songId: string;
  lastOpenedAt: number;
}

/**
 * The list after opening a song: it moves to the top with the new time,
 * never appears twice, and the oldest entries fall off past the limit.
 */
export function recordSongOpened(
  recents: readonly RecentSong[],
  songId: string,
  now: number,
  max = MAX_RECENT_SONGS
): RecentSong[] {
  if (!songId) return [...recents];
  return [{ songId, lastOpenedAt: now }, ...recents.filter((entry) => entry.songId !== songId)].slice(0, max);
}

/** A valid list from anything: bad entries dropped, one entry per song, newest first. */
export function sanitizeRecentSongs(value: unknown, max = MAX_RECENT_SONGS): RecentSong[] {
  if (!Array.isArray(value)) return [];
  const latest = new Map<string, number>();
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { songId, lastOpenedAt } = entry as Partial<RecentSong>;
    if (typeof songId !== 'string' || !songId.trim()) continue;
    if (typeof lastOpenedAt !== 'number' || !Number.isFinite(lastOpenedAt) || lastOpenedAt <= 0) continue;
    const id = songId.trim();
    latest.set(id, Math.max(latest.get(id) ?? 0, lastOpenedAt));
  }
  return [...latest.entries()]
    .map(([songId, lastOpenedAt]) => ({ songId, lastOpenedAt }))
    .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt || a.songId.localeCompare(b.songId))
    .slice(0, max);
}

/** Reads stored text; anything unreadable simply means no recent songs. */
export function parseRecentSongs(raw: string | null): RecentSong[] {
  if (!raw) return [];
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return [];
    const { version, songs } = data as { version?: unknown; songs?: unknown };
    return version === RECENT_SONGS_VERSION ? sanitizeRecentSongs(songs) : [];
  } catch {
    return [];
  }
}

export function serializeRecentSongs(recents: readonly RecentSong[]): string {
  return JSON.stringify({ version: RECENT_SONGS_VERSION, songs: recents });
}

export interface RecentSongsStore {
  load(): RecentSong[];
  save(recents: readonly RecentSong[]): void;
}

export function createRecentSongsStore(storage: KeyValueStorage | null = getBrowserStorage()): RecentSongsStore {
  return {
    load() {
      try {
        return parseRecentSongs(storage?.getItem(RECENT_SONGS_KEY) ?? null);
      } catch {
        return [];
      }
    },
    save(recents) {
      try {
        storage?.setItem(RECENT_SONGS_KEY, serializeRecentSongs(recents));
      } catch {
        // storage full or blocked: recent songs last for this visit only
      }
    },
  };
}
