import type { LiturgicalSeasonId } from '../data/liturgicalSeasons';
import type { SupabaseClient } from '../lib/supabase';
import type { Song } from '../types/song';
import { isLiturgicalSeasonId } from '../utils/liturgicalSeasons';
import { SONG_DIFFICULTIES, type SongDifficulty } from './songDraft';
import type { SongRepository } from './songRepository';

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
  if (row.artist !== null) song.artist = row.artist;
  if (row.original_key !== null) song.originalKey = row.original_key;
  if (row.recommended_capo !== null) song.recommendedCapo = row.recommended_capo;
  if (row.time_signature !== null) song.timeSignature = row.time_signature;
  if (row.tempo !== null) song.tempo = row.tempo;
  if (row.rhythm_pattern !== null) song.rhythmPattern = row.rhythm_pattern;
  if (Array.isArray(row.liturgical_seasons)) {
    song.liturgicalSeasons = row.liturgical_seasons.filter(isLiturgicalSeasonId) as LiturgicalSeasonId[];
  }
  if (row.difficulty !== null && SONG_DIFFICULTIES.includes(row.difficulty as SongDifficulty)) {
    song.difficulty = row.difficulty as SongDifficulty;
  }
  if (row.year !== null) song.year = row.year;
  if (row.youtube_id !== null) song.youtubeId = row.youtube_id;
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
  const song = songFromRow(rows[0]);
  if (!song || song.version === undefined) throw new Error('La canción llegó sin versión.');
  return { song, version: song.version };
}

export function createSupabaseSongRepository(client: SupabaseClient): SongRepository {
  const toSongs = (rows: SongRow[]) => rows.map(songFromRow).filter((song): song is Song => song !== null);
  return {
    source: 'remote',
    async listSongs(options) {
      // A stable order (title, then id) so pages never overlap or skip a song.
      const songs: Song[] = [];
      for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await client.select<SongRow>(
          'songs',
          `${SELECT}&status=eq.published&order=title.asc,id.asc&limit=${SONG_PAGE_SIZE}&offset=${page * SONG_PAGE_SIZE}`,
          options
        );
        songs.push(...toSongs(rows));
        if (rows.length < SONG_PAGE_SIZE) break;
      }
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
