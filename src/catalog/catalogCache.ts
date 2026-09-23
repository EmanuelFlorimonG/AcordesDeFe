import type { Song } from '../types/song';
import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';
import { validateCatalogSnapshot } from './songRepository';
import { catalogRowProblem, songFromRow, songToRow, type SongRow } from './supabaseSongRepository';

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
 * makes it unusable instead of mixing catalogs. Version 2 added each song's
 * published version: a version 1 cache is dropped (it can't say which version
 * its songs are) and replaced by the next remote answer.
 *
 * It is read whole too: one row that can't be read, or a repeated id, and the
 * whole thing is ignored. Half a catalog is not a catalog, and the bundled
 * songs are a better answer than a songbook with a song missing.
 */

export const CATALOG_CACHE_KEY = 'genesaret_catalog_cache';
export const CATALOG_CACHE_VERSION = 2;
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
      // Each row is read like a remote one, and the lot is checked together.
      const songs: Song[] = [];
      for (const row of stored.rows) {
        let song: Song | null = null;
        try {
          song = catalogRowProblem(row) ? null : songFromRow(row);
        } catch {
          song = null;
        }
        if (!song) return null;
        songs.push(song);
      }
      const checked = validateCatalogSnapshot(songs, { requireVersion: true });
      return checked.ok ? { songs: checked.songs, savedAt: stored.savedAt } : null;
    },
    write(songs, now = new Date()) {
      // Only a catalog worth reading back is written down: what is stored here
      // is a remote answer, so every song carries its published version.
      if (!storage || !validateCatalogSnapshot(songs, { requireVersion: true }).ok) return false;
      const rows = songs.map((song) => ({ ...songToRow(song), current_version: song.version as number }));
      // Written only if it would be read back: the same gate on both sides, so
      // what the remote frontier refuses never gets in through this one.
      if (rows.some((row) => catalogRowProblem(row) !== null)) return false;
      const stored: StoredCatalog = { version: CATALOG_CACHE_VERSION, projectUrl, savedAt: now.toISOString(), rows };
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
