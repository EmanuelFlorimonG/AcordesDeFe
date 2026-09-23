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

/** A published version: what `current_version` is in the database, nothing else. */
export function isPublishedVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1;
}

/** A list of words the app will read and show: no holes, no empty entries. */
const isWordList = (value: unknown): boolean =>
  Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');

/**
 * Whether a list of songs can be the catalog: every song readable, with an id
 * of its own, and at least one of them.
 *
 * It is all or nothing on purpose. A catalog with one unreadable row is not a
 * catalog with one song less: something is wrong with the answer, and showing
 * the rest would quietly hide a song from the songbook. The number of songs is
 * never checked against anything: the catalog grows every time a proposal is
 * approved.
 *
 * What is required is what the database itself guarantees (a title and a text
 * that are not empty, lists of words, a published version of 1 or more) and
 * what the app would otherwise break on: a category that is null makes the
 * songbook's own category list throw while it starts.
 *
 * `requireVersion` is for songs that come from the backend, directly or from
 * the cache: there, a song without a version, or with a version that isn't
 * one, is a broken answer. The songs shipped inside the app carry no version
 * (they are version 1 by definition), so they are checked without it.
 */
export function validateCatalogSnapshot(
  songs: readonly unknown[],
  { requireVersion = false }: { requireVersion?: boolean } = {}
): { ok: true; songs: Song[] } | { ok: false; reason: 'empty' | 'invalid' } {
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
      song.title.trim() !== '' &&
      typeof song.content === 'string' &&
      song.content.trim() !== '' &&
      isWordList(song.categories) &&
      isWordList(song.tags) &&
      isWordList(song.chordsUsed) &&
      (song.liturgicalSeasons === undefined || isWordList(song.liturgicalSeasons)) &&
      (requireVersion ? isPublishedVersion(song.version) : song.version === undefined || isPublishedVersion(song.version));
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
export async function fetchRemoteCatalog(
  remote: SongRepository | (() => Promise<SongRepository | null>),
  { timeoutMs = 6000 }: { timeoutMs?: number } = {}
): Promise<RemoteCatalogResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let expired = false;
  // The whole errand is on the clock, opening the reader included: a module
  // that never arrives can't leave the songbook waiting either. And the
  // timeout wins over a repository that ignores the abort signal.
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => {
      expired = true;
      controller.abort();
      resolve('timeout');
    }, timeoutMs);
  });
  try {
    const reader = typeof remote === 'function' ? await Promise.race([remote(), timeout]) : remote;
    if (reader === 'timeout') return { ok: false, reason: 'timeout' };
    if (!reader) return { ok: false, reason: 'error' };
    const answer = await Promise.race([reader.listSongs({ signal: controller.signal }), timeout]);
    if (answer === 'timeout') return { ok: false, reason: 'timeout' };
    // From the backend: every song says which published version it is.
    return validateCatalogSnapshot(answer, { requireVersion: true });
  } catch (error) {
    // Told apart for diagnosis: a catalog that isn't one is not a network
    // problem, and a read cut short by the clock is a timeout even when what
    // comes back is the abort's own error.
    if (expired) return { ok: false, reason: 'timeout' };
    return { ok: false, reason: error instanceof InvalidRemoteCatalog ? 'invalid' : 'error' };
  } finally {
    clearTimeout(timer);
  }
}
