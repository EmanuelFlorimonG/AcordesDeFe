import type { LiturgicalSeasonId } from '../data/liturgicalSeasons';
import type { SupabaseClient } from '../lib/supabase';
import type { Song } from '../types/song';
import { isLiturgicalSeasonId } from '../utils/liturgicalSeasons';
import { SONG_DIFFICULTIES, type SongDifficulty } from './songDraft';
import { InvalidRemoteCatalog, isPublishedVersion, type SongRepository } from './songRepository';

/**
 * The catalog read from Supabase: the `songs` table, only published rows
 * (Row Level Security guarantees it; the filter here just says so).
 *
 * The source of truth of the catalog (the bundled songs are only a fallback,
 * see catalogStore.ts). Read in pages, so it never stops at the API's row
 * limit however large the catalog grows.
 */

/** One row of `songs`, as the REST API returns it (column names are snake_case). */
export interface SongRow {
  id: string;
  title: string;
  artist: string | null;
  original_key: string | null;
  recommended_capo: number | null;
  time_signature: string | null;
  tempo: number | null;
  rhythm_pattern: string | null;
  categories: string[];
  liturgical_seasons: string[] | null;
  tags: string[];
  content: string;
  chords_used: string[];
  difficulty: string | null;
  year: string | null;
  youtube_id: string | null;
  /** Read, never written by songToRow: only the database raises it */
  current_version?: number | null;
}

/** The song's own columns: what the import writes and what a version snapshot holds. */
export const SONG_COLUMNS: Array<keyof SongRow> = [
  'id',
  'title',
  'artist',
  'original_key',
  'recommended_capo',
  'time_signature',
  'tempo',
  'rhythm_pattern',
  'categories',
  'liturgical_seasons',
  'tags',
  'content',
  'chords_used',
  'difficulty',
  'year',
  'youtube_id',
];

/** What the app reads: the song and the version it is at. */
export const SONG_READ_COLUMNS: Array<keyof SongRow> = [...SONG_COLUMNS, 'current_version'];

const isVersion = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1;
/** A column that says something: null and an absent column both mean nothing. */
const given = (value: unknown): boolean => value !== null && value !== undefined;

// ---------------------------------------------------------------------------
// The contract of a row of `songs`
// ---------------------------------------------------------------------------

/**
 * What the database promises for each column, written here as the CHECK
 * constraints of the `songs` table write it (see the editorial_catalog
 * migration). It is read before anything is turned into a Song, because a
 * number where the key should be is not a song with a strange key: it is an
 * answer that isn't the catalog. Nothing is repaired, defaulted or dropped to
 * make a broken row fit.
 */
type ColumnCheck = (value: unknown) => boolean;

/** Text as the column declares it: not blank when it is required, never longer than allowed. */
const text = (max: number, { blank = false }: { blank?: boolean } = {}): ColumnCheck => (value) =>
  typeof value === 'string' && value.length <= max && (blank || value.trim() !== '');
const matching = (pattern: RegExp, max: number): ColumnCheck => (value) => text(max)(value) && pattern.test(value as string);
const whole = (min: number, max: number): ColumnCheck => (value) =>
  typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
/** A text[] column: a list of words, and only a list. Empty is a legitimate value; "abc", 42 or {} are not. */
const words: ColumnCheck = (value) => Array.isArray(value) && value.every((entry) => typeof entry === 'string' && entry.trim() !== '');
/** A column the schema declares nullable: nothing is a value, anything else has to be of its type. */
const nothingOr = (check: ColumnCheck): ColumnCheck => (value) => value === null || value === undefined || check(value);

const SONG_ROW_CONTRACT: ReadonlyArray<readonly [keyof SongRow, ColumnCheck]> = [
  ['id', matching(/^[a-z0-9]+(-[a-z0-9]+)*$/, 80)],
  ['title', text(120)],
  ['artist', nothingOr(text(120, { blank: true }))],
  // 1 to 8 characters, like the column. Whether it is a key the chord engine
  // knows is not checked: the database allows any short text there, and the
  // app already copes with a key it can't read (it leaves it as it is).
  ['original_key', nothingOr(text(8))],
  ['recommended_capo', nothingOr(whole(0, 11))],
  ['time_signature', nothingOr(matching(/^[0-9]{1,2}\/(2|4|8|16)$/, 8))],
  ['tempo', nothingOr(whole(30, 300))],
  ['rhythm_pattern', nothingOr(text(120, { blank: true }))],
  ['categories', words],
  // Null means "not classified yet"; an empty list does not mean the same.
  ['liturgical_seasons', nothingOr(words)],
  ['tags', words],
  ['content', text(20000)],
  ['chords_used', words],
  ['difficulty', nothingOr((value) => SONG_DIFFICULTIES.includes(value as SongDifficulty))],
  ['year', nothingOr(matching(/^[0-9]{4}$/, 4))],
  ['youtube_id', nothingOr(matching(/^[A-Za-z0-9_-]{11}$/, 11))],
  ['current_version', isPublishedVersion],
];

/**
 * What is wrong with a row of the catalog, or null when nothing is.
 *
 * It is the one gate for rows that arrive from the backend, whether straight
 * from Supabase or from what this browser saved, and both frontiers use this
 * same function so that neither accepts what the other refuses. Every column
 * the app reads has to be what the database says it is, and the row has to
 * say which published version it is: that is what the rest of the songbook
 * takes for granted when it trims a key, counts a capo or lists categories.
 *
 * Unknown liturgical seasons are still dropped when the song is read (a
 * season added later is not a broken row), but a hole in the list is.
 */
export function catalogRowProblem(row: SongRow): string | null {
  if (!row || typeof row !== 'object') return 'Fila ilegible del catálogo';
  const where = typeof row.id === 'string' ? ` (${row.id})` : '';
  for (const [column, accepts] of SONG_ROW_CONTRACT) {
    if (!accepts((row as unknown as Record<string, unknown>)[column])) return `Columna «${column}» fuera de contrato${where}`;
  }
  return null;
}

/** A Song for the app, with exactly the optional fields the bundled catalog would have. Null if unusable. */
export function songFromRow(row: SongRow): Song | null {
  if (!row || typeof row.id !== 'string' || typeof row.title !== 'string' || typeof row.content !== 'string') return null;
  const song: Song = {
    id: row.id,
    title: row.title,
    categories: Array.isArray(row.categories) ? [...row.categories] : [],
    tags: Array.isArray(row.tags) ? [...row.tags] : [],
    content: row.content,
    chordsUsed: Array.isArray(row.chords_used) ? [...row.chords_used] : [],
  };
  if (given(row.artist)) song.artist = row.artist as string;
  if (given(row.original_key)) song.originalKey = row.original_key as string;
  if (given(row.recommended_capo)) song.recommendedCapo = row.recommended_capo as number;
  if (given(row.time_signature)) song.timeSignature = row.time_signature as string;
  if (given(row.tempo)) song.tempo = row.tempo as number;
  if (given(row.rhythm_pattern)) song.rhythmPattern = row.rhythm_pattern as string;
  if (Array.isArray(row.liturgical_seasons)) {
    song.liturgicalSeasons = row.liturgical_seasons.filter(isLiturgicalSeasonId) as LiturgicalSeasonId[];
  }
  if (given(row.difficulty) && SONG_DIFFICULTIES.includes(row.difficulty as SongDifficulty)) {
    song.difficulty = row.difficulty as SongDifficulty;
  }
  if (given(row.year)) song.year = row.year as string;
  if (given(row.youtube_id)) song.youtubeId = row.youtube_id as string;
  if (isVersion(row.current_version)) song.version = row.current_version;
  return song;
}

/** The row for a Song: what the one-time import of the bundled catalog will write, ids unchanged. */
export function songToRow(song: Song): SongRow {
  return {
    id: song.id,
    title: song.title,
    artist: song.artist ?? null,
    original_key: song.originalKey ?? null,
    recommended_capo: song.recommendedCapo ?? null,
    time_signature: song.timeSignature ?? null,
    tempo: song.tempo ?? null,
    rhythm_pattern: song.rhythmPattern ?? null,
    categories: [...song.categories],
    liturgical_seasons: song.liturgicalSeasons ? [...song.liturgicalSeasons] : null,
    tags: [...song.tags],
    content: song.content,
    chords_used: [...song.chordsUsed],
    difficulty: song.difficulty ?? null,
    year: song.year ?? null,
    // "" means "no video" in the bundled data; the database stores that as null.
    youtube_id: song.youtubeId || null,
  };
}

const SELECT = `select=${SONG_READ_COLUMNS.join(',')}`;
/** PostgREST returns at most this many rows per request (max_rows in the project). */
export const SONG_PAGE_SIZE = 1000;
/** A safety stop: 50 pages is 50 000 songs. */
const MAX_PAGES = 50;

/** A published song as it is right now, to start an edit from: always asked to Supabase, never the cache. */
export interface SongForEdit {
  song: Song;
  /** The version the edit is made on (its baseVersion) */
  version: number;
}

/**
 * The song to edit, read now from Supabase. Null when it isn't published
 * (hidden, or it never existed). Throws when Supabase can't be reached, or
 * answers without a version: an edit must never guess the version it is based on.
 */
export async function fetchSongForEdit(client: SupabaseClient, id: string, options?: { signal?: AbortSignal }): Promise<SongForEdit | null> {
  const rows = await client.select<SongRow>('songs', `${SELECT}&status=eq.published&id=eq.${encodeURIComponent(id)}&limit=1`, options);
  if (!rows[0]) return null;
  // The same gate as the catalog: an edit is never started from a row that is
  // not what the database promises it is.
  if (catalogRowProblem(rows[0])) throw new Error('La canción llegó ilegible.');
  const song = songFromRow(rows[0]);
  if (!song || song.version === undefined) throw new Error('La canción llegó sin versión.');
  return { song, version: song.version };
}

export function createSupabaseSongRepository(client: SupabaseClient): SongRepository {
  /**
   * Every row or none: a row that can't be read, or that doesn't say which
   * published version it is, is not one song less. It is an answer that can't
   * be trusted as the catalog (see validateCatalogSnapshot), and the version
   * is what every edit is proposed against.
   */
  const toSongs = (rows: SongRow[]) =>
    rows.map((row) => {
      const problem = catalogRowProblem(row);
      if (problem) throw new InvalidRemoteCatalog(problem);
      return songFromRow(row) as Song;
    });
  return {
    source: 'remote',
    async listSongs(options) {
      // A stable order (title, then id) so pages never overlap or skip a song.
      const songs: Song[] = [];
      let complete = false;
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await client.select<SongRow>(
          'songs',
          `${SELECT}&status=eq.published&order=title.asc,id.asc&limit=${SONG_PAGE_SIZE}&offset=${page * SONG_PAGE_SIZE}`,
          options
        );
        songs.push(...toSongs(rows));
        if (rows.length < SONG_PAGE_SIZE) {
          complete = true;
          break;
        }
      }
      // Reading stopped at the safety limit: what came back is part of the
      // catalog, not the catalog, and half a songbook is never shown.
      if (!complete) throw new InvalidRemoteCatalog(`El catálogo no cabe en ${MAX_PAGES} páginas`);
      return songs;
    },
    async getSong(id, options) {
      const rows = await client.select<SongRow>(
        'songs',
        `${SELECT}&status=eq.published&id=eq.${encodeURIComponent(id)}&limit=1`,
        options
      );
      return toSongs(rows)[0] ?? null;
    },
  };
}
