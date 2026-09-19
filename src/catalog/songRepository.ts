import type { Song } from '../types/song';

/**
 * Where the official catalog comes from, behind one contract. Search, the
 * song viewer, setlists and everything else keep working with plain Song
 * objects; only this layer knows whether they were bundled with the app or
 * read from the backend. Song ids never change between sources: every local
 * list (favourites, recents, setlists, preferences, history) points at them.
 */

export type CatalogSource = 'bundled' | 'remote';

export interface SongRepository {
  readonly source: CatalogSource;
  /** Every published song */
  listSongs(options?: { signal?: AbortSignal }): Promise<Song[]>;
  getSong(id: string, options?: { signal?: AbortSignal }): Promise<Song | null>;
}

/** The catalog shipped inside the app: always there, even offline or with the backend down. */
export interface BundledSongRepository extends SongRepository {
  readonly source: 'bundled';
  /** The same songs, synchronously: the app can render its first screen without waiting. */
  getAll(): readonly Song[];
}

export function createBundledSongRepository(songs: readonly Song[]): BundledSongRepository {
  const byId = new Map(songs.map((song) => [song.id, song]));
  return {
    source: 'bundled',
    getAll: () => songs,
    listSongs: async () => [...songs],
    getSong: async (id) => byId.get(id) ?? null,
  };
}

// ---------------------------------------------------------------------------
// Asking the backend for the catalog
// ---------------------------------------------------------------------------

export type RemoteCatalogResult =
  | { ok: true; songs: Song[] }
  | { ok: false; reason: 'error' | 'timeout' | 'empty' };

/**
 * The remote catalog, or why there isn't one. It only fetches and checks: it
 * never falls back and never mixes sources (catalogStore decides what is
 * shown). An answer with no songs is a failure, not an empty catalog, and a
 * repeated id keeps its first appearance.
 */
export async function fetchRemoteCatalog(remote: SongRepository, { timeoutMs = 6000 }: { timeoutMs?: number } = {}): Promise<RemoteCatalogResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The timeout wins even against a repository that ignores the abort signal.
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  try {
    const answer = await Promise.race([remote.listSongs({ signal: controller.signal }), timeout]);
    if (answer === 'timeout') return { ok: false, reason: 'timeout' };
    const seen = new Set<string>();
    const songs = answer.filter((song) => {
      if (seen.has(song.id)) {
        console.warn(`Catálogo remoto: id repetido ${song.id}; se conserva la primera aparición.`);
        return false;
      }
      seen.add(song.id);
      return true;
    });
    return songs.length > 0 ? { ok: true, songs } : { ok: false, reason: 'empty' };
  } catch {
    return { ok: false, reason: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
