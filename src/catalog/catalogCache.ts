import type { Song } from '../types/song';
import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';
import { songFromRow, songToRow, type SongRow } from './supabaseSongRepository';

/**
 * The last remote catalog that was received and valid, kept in this browser.
 *
 * It is what the app shows while the backend answers, and what it keeps
 * showing if the backend can't be reached, so a song approved after the app
 * was built never disappears just because Supabase is down. It holds only
 * published songs (public data), in the same row format the backend sends,
 * and reads back through the same songFromRow the remote catalog uses.
 *
 * It is replaced whole, and only by a remote answer that was valid; it never
 * expires by age (it is the last thing known for certain, and the app says
 * when it was saved). A new format version, or another Supabase project,
 * makes it unusable instead of mixing catalogs.
 */

export const CATALOG_CACHE_KEY = 'genesaret_catalog_cache';
export const CATALOG_CACHE_VERSION = 1;
/** Above this the catalog is not cached (today it is about 100 KB). */
export const MAX_CATALOG_CACHE_BYTES = 3 * 1024 * 1024;

interface StoredCatalog {
  version: typeof CATALOG_CACHE_VERSION;
  projectUrl: string;
  savedAt: string;
  rows: SongRow[];
}

export interface CachedCatalog {
  songs: Song[];
  /** When the remote answer it holds was received (ISO) */
  savedAt: string;
}

export interface CatalogCache {
  read(): CachedCatalog | null;
  /** False when it could not be saved (too big, quota, private mode); the app carries on. */
  write(songs: readonly Song[], now?: Date): boolean;
  clear(): void;
}

export function createCatalogCache(storage: KeyValueStorage | null, projectUrl: string): CatalogCache {
  return {
    read() {
      if (!storage) return null;
      let parsed: unknown;
      try {
        const raw = storage.getItem(CATALOG_CACHE_KEY);
        if (!raw) return null;
        parsed = JSON.parse(raw);
      } catch {
        return null;
      }
      const stored = parsed as Partial<StoredCatalog> | null;
      if (
        !stored ||
        stored.version !== CATALOG_CACHE_VERSION ||
        stored.projectUrl !== projectUrl ||
        typeof stored.savedAt !== 'string' ||
        !Array.isArray(stored.rows)
      ) {
        return null;
      }
      // Each row is read like a remote one; anything unreadable is left out, a repeated id keeps its first appearance.
      const seen = new Set<string>();
      const songs: Song[] = [];
      for (const row of stored.rows) {
        let song: Song | null = null;
        try {
          song = songFromRow(row);
        } catch {
          song = null;
        }
        if (!song || seen.has(song.id)) continue;
        seen.add(song.id);
        songs.push(song);
      }
      return songs.length > 0 ? { songs, savedAt: stored.savedAt } : null;
    },
    write(songs, now = new Date()) {
      if (!storage || songs.length === 0) return false;
      const stored: StoredCatalog = { version: CATALOG_CACHE_VERSION, projectUrl, savedAt: now.toISOString(), rows: songs.map(songToRow) };
      const json = JSON.stringify(stored);
      if (json.length * 2 > MAX_CATALOG_CACHE_BYTES) return false;
      try {
        storage.setItem(CATALOG_CACHE_KEY, json);
        return true;
      } catch {
        return false;
      }
    },
    clear() {
      try {
        (storage as Storage | null)?.removeItem?.(CATALOG_CACHE_KEY);
      } catch {
        // nothing to clear
      }
    },
  };
}

/** The cache of this browser for this project. */
export function getCatalogCache(projectUrl: string): CatalogCache {
  return createCatalogCache(getBrowserStorage(), projectUrl);
}
