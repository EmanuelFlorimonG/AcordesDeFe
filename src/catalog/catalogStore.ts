import type { Song } from '../types/song';
import { listSongCategories } from '../utils/setlists';
import { buildSearchIndex, compareTitles, type SongSearchEntry } from '../utils/songSearch';
import type { CatalogCache } from './catalogCache';
import { fetchRemoteCatalog, type RemoteCatalogFailure, type SongRepository } from './songRepository';

/**
 * The catalog the app shows, from ONE complete source at a time, never mixed:
 *
 *   remote      what Supabase answers now: the source of truth
 *   cache       the last valid remote answer kept in this browser
 *   bundled     the songs shipped inside the app, the last resort
 *
 * At start the app shows the cache if there is one, otherwise the bundled
 * songs, at once; then it asks Supabase. A valid answer replaces what is shown
 * and the cache. A failed, slow or empty answer changes nothing: what is in
 * memory is never degraded. So a song hidden in Supabase does not come back
 * from the bundled songs, and a song approved after the app was built does
 * not vanish because Supabase is down.
 *
 * Everything derived from the songs (map by id, search index, categories) is
 * built here once per catalog, so every screen reads the same source.
 */

export type CatalogSourceName = 'remote' | 'cache' | 'bundled';

/** The state of the last attempt to reach Supabase in this session. */
export type RemoteStatus = 'disabled' | 'idle' | 'loading' | 'ok' | 'failed';

export interface CatalogSnapshot {
  songs: readonly Song[];
  byId: ReadonlyMap<string, Song>;
  searchIndex: SongSearchEntry[];
  categories: string[];
  /** Where what is on screen came from */
  source: CatalogSourceName;
  /** What this build was asked to use (VITE_CATALOG_SOURCE) */
  configuredSource: 'bundled' | 'remote';
  /** For the cache: when that remote answer was received (ISO) */
  savedAt: string | null;
  remote: RemoteStatus;
  /**
   * Why the songbook is not on the remote catalog although it was asked for:
   * the request failed, took too long, came back empty, or came back as
   * something that isn't a catalog. Null when there is nothing to explain.
   * For diagnosis; it carries no data from the answer.
   */
  fallbackReason: RemoteCatalogFailure | null;
}

/**
 * Whether a song id can be shown. 'unverified': not in what is shown, and
 * Supabase could not be asked, so it may exist (a song approved after this
 * device last got the catalog). Only 'missing' means it is not in the catalog.
 */
export type SongAvailability = 'available' | 'checking' | 'unverified' | 'missing';

/** What a list says about a song it can't show, so "offline" never reads as "removed". */
export const UNAVAILABLE_SONG_TEXT: Record<Exclude<SongAvailability, 'available'>, string> = {
  checking: 'Cargando…',
  unverified: 'No disponible sin conexión',
  missing: 'Ya no está en el cancionero',
};

/** The reason for a song id that can't be shown, or null when it can. */
export function unavailableText(availability: SongAvailability): string | null {
  return availability === 'available' ? null : UNAVAILABLE_SONG_TEXT[availability];
}

export interface CatalogStore {
  getSnapshot(): CatalogSnapshot;
  subscribe(listener: () => void): () => void;
  /** Asks Supabase again; at most once per interval unless forced. Never rejects. */
  refresh(options?: { force?: boolean }): Promise<void>;
  availability(songId: string): SongAvailability;
}

/**
 * The song to show for an id, against the catalog that is active now.
 *
 * `opened` is what was on screen when it was opened, which may come from an
 * earlier source (the songs shipped with the app, while the real catalog is
 * still being asked for). It is kept only while the catalog can't answer yet:
 * once it has, a song it doesn't have stops being shown, instead of leaving a
 * song from a source that is no longer the songbook open.
 */
export function songOnScreen(store: CatalogStore, id: string | null, opened: Song | null): Song | null {
  if (!id) return null;
  return store.getSnapshot().byId.get(id) ?? (store.availability(id) === 'checking' ? opened : null);
}

export interface CatalogStoreOptions {
  bundled: readonly Song[];
  /**
   * The remote catalog, or how to load its reader on first use. Null when this
   * build has no backend, or VITE_CATALOG_SOURCE=bundled forces the bundled songs.
   */
  remote: SongRepository | (() => Promise<SongRepository | null>) | null;
  cache: CatalogCache | null;
  timeoutMs?: number;
  /** Refreshes closer than this are skipped unless forced */
  minIntervalMs?: number;
  now?: () => number;
}

interface CatalogContent {
  songs: readonly Song[];
  byId: ReadonlyMap<string, Song>;
  searchIndex: SongSearchEntry[];
  categories: string[];
  /** To tell an identical answer apart without re-rendering */
  signature: string;
}

/**
 * Every source in the same order (the songbook's title order, then id), so
 * moving from the bundled songs or the cache to the remote answer never
 * reorders anything: previous/next in the song viewer stays the same.
 */
function ordered(songs: readonly Song[]): Song[] {
  return [...songs].sort(compareTitles);
}

function contentOf(unordered: readonly Song[]): CatalogContent {
  const songs = ordered(unordered);
  const byId = new Map<string, Song>();
  for (const song of songs) if (!byId.has(song.id)) byId.set(song.id, song);
  return {
    songs,
    byId,
    searchIndex: buildSearchIndex(songs),
    categories: listSongCategories([...songs]).map((entry) => entry.name),
    signature: JSON.stringify(songs),
  };
}

export function createCatalogStore({ bundled, remote, cache, timeoutMs = 6000, minIntervalMs = 120_000, now = Date.now }: CatalogStoreOptions): CatalogStore {
  const cached = remote && cache ? cache.read() : null;
  let content = contentOf(cached ? cached.songs : bundled);
  let snapshot: CatalogSnapshot = {
    songs: content.songs,
    byId: content.byId,
    searchIndex: content.searchIndex,
    categories: content.categories,
    source: cached ? 'cache' : 'bundled',
    configuredSource: remote ? 'remote' : 'bundled',
    savedAt: cached ? cached.savedAt : null,
    remote: remote ? 'idle' : 'disabled',
    fallbackReason: null,
  };
  const listeners = new Set<() => void>();
  let reader: SongRepository | null = typeof remote === 'function' ? null : remote;
  let inFlight: Promise<void> | null = null;
  let lastAttempt = -Infinity;

  const publish = (changes: Partial<CatalogSnapshot>) => {
    snapshot = { ...snapshot, ...changes };
    for (const listener of listeners) listener();
  };

  const run = async (): Promise<void> => {
    if (!remote) return;
    publish({ remote: 'loading' });
    // Opening the reader is part of the errand, so it is part of its time too.
    const open = async () => {
      if (!reader && typeof remote === 'function') reader = await remote();
      return reader;
    };
    const result = await fetchRemoteCatalog(reader ?? open, { timeoutMs });
    if (!result.ok) {
      // Nothing shown is replaced, and nothing is written down: the songs in
      // memory stay as they are and the cache keeps the last good answer.
      publish({ remote: 'failed', fallbackReason: result.reason });
      return;
    }
    if (JSON.stringify(ordered(result.songs)) !== content.signature) {
      content = contentOf(result.songs);
      publish({
        songs: content.songs,
        byId: content.byId,
        searchIndex: content.searchIndex,
        categories: content.categories,
        source: 'remote',
        savedAt: null,
        remote: 'ok',
        fallbackReason: null,
      });
    } else {
      // Identical songs: same objects, nothing below re-renders; only the source is now confirmed.
      publish({ source: 'remote', savedAt: null, remote: 'ok', fallbackReason: null });
    }
    // Only a valid remote answer replaces the cache.
    cache?.write(result.songs);
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    refresh({ force = false } = {}) {
      if (!remote) return Promise.resolve();
      if (inFlight) return inFlight;
      if (!force && now() - lastAttempt < minIntervalMs) return Promise.resolve();
      lastAttempt = now();
      inFlight = run()
        .catch(() => publish({ remote: 'failed', fallbackReason: 'error' }))
        .finally(() => {
          inFlight = null;
        });
      return inFlight;
    },
    availability(songId) {
      if (snapshot.byId.has(songId)) return 'available';
      // Confirmed by Supabase in this session: it is not (or no longer) published.
      if (snapshot.source === 'remote') return 'missing';
      if (snapshot.remote === 'disabled') return 'missing';
      if (snapshot.remote === 'idle' || snapshot.remote === 'loading') return 'checking';
      return 'unverified';
    },
  };
}
