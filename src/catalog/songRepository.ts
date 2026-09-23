import type { Song } from '../types/song';

/**
 * Where the official catalog comes from, behind one contract. Search, the
 * song viewer, setlists and everything else keep working with plain Song
 * objects; only this layer knows whether they were bundled with the app or
 * read from the backend. Song ids never change between sources: every local
 * list (favourites, recents, setlists, preferences, history) points at them.
 */

export type CatalogSource = 'bundled' | 'remote';

/** The published version of a song; the bundled songs (and older cached ones) are version 1. */
export function songVersionOf(song: Pick<Song, 'version'>): number {
  return song.version ?? 1;
}

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

/** Why there is no usable remote catalog right now. */
export type RemoteCatalogFailure =
  /** The request failed, or the network did */
  | 'error'
  /** It took longer than the app is willing to wait */
  | 'timeout'
  /** It answered, with nothing in it */
  | 'empty'
  /** It answered with something that is not a catalog: a row that can't be read, a repeated id */
  | 'invalid';

export type RemoteCatalogResult =
  | { ok: true; songs: Song[] }
  | { ok: false; reason: RemoteCatalogFailure };

/** A remote answer that isn't a catalog. Thrown by the reader, never shown to anyone. */
export class InvalidRemoteCatalog extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidRemoteCatalog';
  }
}

/**
 * Whether a list of songs can be the catalog: every song readable, with an id
 * of its own, and at least one of them.
 *
 * It is all or nothing on purpose. A catalog with one unreadable row is not a
 * catalog with one song less: something is wrong with the answer, and showing
 * the rest would quietly hide a song from the songbook. The number of songs is
 * never checked against anything: the catalog grows every time a proposal is
 * approved.
 */
export function validateCatalogSnapshot(songs: readonly unknown[]): { ok: true; songs: Song[] } | { ok: false; reason: 'empty' | 'invalid' } {
  if (!Array.isArray(songs)) return { ok: false, reason: 'invalid' };
  if (songs.length === 0) return { ok: false, reason: 'empty' };
  const ids = new Set<string>();
  for (const entry of songs) {
    const song = entry as Song | null;
    if (!song || typeof song !== 'object') return { ok: false, reason: 'invalid' };
    const readable =
      typeof song.id === 'string' &&
      song.id.trim() !== '' &&
      typeof song.title === 'string' &&
      typeof song.content === 'string' &&
      Array.isArray(song.categories) &&
      Array.isArray(song.tags) &&
      Array.isArray(song.chordsUsed) &&
      (song.version === undefined || (Number.isInteger(song.version) && song.version >= 1));
    if (!readable || ids.has(song.id)) return { ok: false, reason: 'invalid' };
    ids.add(song.id);
  }
  return { ok: true, songs: songs as Song[] };
}

/**
 * The remote catalog, or why there isn't one. It only fetches and checks: it
 * never falls back and never mixes sources (catalogStore decides what is
 * shown). An answer with no songs, with a row that can't be read or with a
 * repeated id is a failure, never a smaller catalog.
 *
 * The wait is capped (six seconds by default): a bad connection leaves the
 * songbook on what it already has instead of on a spinner. It is long enough
 * for a slow phone and short enough not to feel stuck.
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
    return validateCatalogSnapshot(answer);
  } catch (error) {
    // Told apart for diagnosis: a catalog that isn't one is not a network problem.
    return { ok: false, reason: error instanceof InvalidRemoteCatalog ? 'invalid' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}
