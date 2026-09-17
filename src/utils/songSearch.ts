import type { SpecificSeasonId } from '../data/liturgicalSeasons';
import type { Song } from '../types/song';
import { getNoteIndex, parseKey } from './chordTransposer';
import { SEASON_FILTER_OPTIONS, getLiturgicalSeason, getSongSeasons, songFitsSeason } from './liturgicalSeasons';
import { normalizeText } from './normalizeText';
import { listSongCategories } from './setlists';

/**
 * Finding songs: text search, combinable filters and sorting, as pure
 * functions. Screens only hold the query and the chosen filters; every list
 * of options (categories, artists, keys) is derived from the songs themselves.
 *
 * How filters combine:
 * - Different kinds of filter are joined with AND: Comunión AND Cuaresma AND G.
 * - Several values of the same kind are joined with OR: Comunión OR Adoración.
 *   A song has one key and one artist, so AND inside a kind would always come
 *   back empty; OR is what "show me G or D songs" means.
 * - A liturgical season includes the songs for all year (see songFitsSeason).
 */

export interface SongFilters {
  categories: string[];
  seasons: SpecificSeasonId[];
  artists: string[];
  /** Keys as written in the song data ("G", "Am") */
  keys: string[];
}

export type FilterGroup = keyof SongFilters;

export const FILTER_GROUPS: readonly FilterGroup[] = ['categories', 'seasons', 'keys', 'artists'];

export const EMPTY_FILTERS: SongFilters = { categories: [], seasons: [], artists: [], keys: [] };

export function countActiveFilters(filters: SongFilters): number {
  return FILTER_GROUPS.reduce((total, group) => total + filters[group].length, 0);
}

export function hasActiveFilters(filters: SongFilters): boolean {
  return countActiveFilters(filters) > 0;
}

/** Adds the value if absent, removes it if present. Never mutates. */
export function toggleFilterValue(filters: SongFilters, group: FilterGroup, value: string): SongFilters {
  const current = filters[group] as string[];
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  return { ...filters, [group]: next };
}

export function removeFilterValue(filters: SongFilters, group: FilterGroup, value: string): SongFilters {
  const current = filters[group] as string[];
  if (!current.includes(value)) return filters;
  return { ...filters, [group]: current.filter((entry) => entry !== value) };
}

// ---------------------------------------------------------------------------
// Text search
// ---------------------------------------------------------------------------

/** A song with its searchable text normalized once, not on every keystroke. */
export interface SongSearchEntry {
  song: Song;
  title: string;
  /** Title, artist, categories, seasons, tags and key */
  description: string;
  lyrics: string;
}

const stripChords = (content: string) => content.replace(/\[[^\]]*\]/g, ' ');

export function buildSearchIndex(songs: readonly Song[]): SongSearchEntry[] {
  return songs.map((song) => {
    const seasons = getSongSeasons(song).map((id) => getLiturgicalSeason(id).label);
    const title = normalizeText(song.title);
    return {
      song,
      title,
      description: normalizeText(
        [song.title, song.artist ?? '', ...song.categories, ...seasons, ...song.tags, song.originalKey ?? ''].join(' ')
      ),
      lyrics: normalizeText(stripChords(song.content)).replace(/\s+/g, ' '),
    };
  });
}

export function normalizeQuery(query: string): string {
  return normalizeText(query).replace(/\s+/g, ' ').trim();
}

/** Lyrics only count for phrases long enough not to match half the songbook. */
const MIN_LYRICS_QUERY_LENGTH = 4;

/**
 * How well a song answers a query, 0 when it doesn't. Case and accents are
 * ignored ("maria" finds "María"). Every word must appear somewhere in the
 * song's details, so "comunion cuaresma" finds Communion songs for Lent. A
 * phrase from the lyrics also finds the song, ranked below everything else.
 */
export function scoreSongMatch(entry: SongSearchEntry, query: string): number {
  const phrase = normalizeQuery(query);
  if (!phrase) return 1;
  if (entry.title === phrase) return 100;
  if (entry.title.startsWith(phrase)) return 90;
  if (entry.title.includes(phrase)) return 80;
  const words = phrase.split(' ');
  if (words.every((word) => entry.description.includes(word))) return 50;
  if (phrase.length >= MIN_LYRICS_QUERY_LENGTH && entry.lyrics.includes(phrase)) return 10;
  return 0;
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

function matchesGroup(song: Song, group: FilterGroup, values: readonly string[]): boolean {
  if (values.length === 0) return true;
  switch (group) {
    case 'categories':
      return values.some((category) => song.categories.includes(category));
    case 'seasons':
      return values.some((season) => songFitsSeason(song, season as SpecificSeasonId));
    case 'artists':
      return values.some((artist) => song.artist === artist);
    case 'keys':
      return values.some((key) => song.originalKey === key);
  }
}

/** AND across kinds of filter; `exceptGroup` leaves one kind out (for counts). */
export function songMatchesFilters(song: Song, filters: SongFilters, exceptGroup?: FilterGroup): boolean {
  return FILTER_GROUPS.every((group) => group === exceptGroup || matchesGroup(song, group, filters[group]));
}

export interface SongSearchResult {
  song: Song;
  score: number;
}

/** Songs that answer the query and pass every filter. */
export function searchSongs(index: readonly SongSearchEntry[], query: string, filters: SongFilters): SongSearchResult[] {
  const results: SongSearchResult[] = [];
  for (const entry of index) {
    if (!songMatchesFilters(entry.song, filters)) continue;
    const score = scoreSongMatch(entry, query);
    if (score > 0) results.push({ song: entry.song, score });
  }
  return results;
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

export interface FilterOption {
  value: string;
  label: string;
  /**
   * Songs that would show with this value selected, given the query and the
   * other kinds of filter. Lets the panel show what each choice leads to.
   */
  count: number;
}

export interface CategoryOption extends FilterOption {
  isMassMoment: boolean;
}

export interface FilterOptions {
  categories: CategoryOption[];
  seasons: FilterOption[];
  keys: FilterOption[];
  artists: FilterOption[];
}

/** Keys in musical order: majors from C upward, then minors from C upward. */
export function compareKeys(a: string, b: string): number {
  const keyA = parseKey(a);
  const keyB = parseKey(b);
  if (!keyA || !keyB) return a.localeCompare(b);
  if (keyA.isMinor !== keyB.isMinor) return keyA.isMinor ? 1 : -1;
  return (getNoteIndex(keyA.tonic) ?? 0) - (getNoteIndex(keyB.tonic) ?? 0) || a.localeCompare(b);
}

export function getFilterOptions(index: readonly SongSearchEntry[], query: string, filters: SongFilters): FilterOptions {
  const songs = index.map((entry) => entry.song);
  // Songs that answer the query; each kind of filter is then counted without itself.
  const matching = index.filter((entry) => scoreSongMatch(entry, query) > 0).map((entry) => entry.song);
  const countFor = (group: FilterGroup, value: string) =>
    matching.filter((song) => songMatchesFilters(song, filters, group) && matchesGroup(song, group, [value])).length;

  const artists = [...new Set(songs.map((song) => song.artist?.trim()).filter((artist): artist is string => Boolean(artist)))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  const keys = [...new Set(songs.map((song) => song.originalKey).filter((key): key is string => Boolean(key)))].sort(
    compareKeys
  );

  return {
    categories: listSongCategories(songs).map((category) => ({
      value: category.name,
      label: category.name,
      isMassMoment: category.isMassMoment,
      count: countFor('categories', category.name),
    })),
    seasons: SEASON_FILTER_OPTIONS.map((season) => ({
      value: season.id,
      label: season.label,
      count: countFor('seasons', season.id),
    })),
    keys: keys.map((key) => ({ value: key, label: key, count: countFor('keys', key) })),
    artists: artists.map((artist) => ({ value: artist, label: artist, count: countFor('artists', artist) })),
  };
}

/** Visible label of a selected filter value. */
export function getFilterLabel(group: FilterGroup, value: string): string {
  return group === 'seasons' ? getLiturgicalSeason(value as SpecificSeasonId).label : value;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type SongSortOption = 'az' | 'za' | 'recent' | 'used';

export const SORT_OPTIONS: ReadonlyArray<{ value: SongSortOption; label: string }> = [
  { value: 'az', label: 'Título A–Z' },
  { value: 'za', label: 'Título Z–A' },
  { value: 'recent', label: 'Más recientes' },
  { value: 'used', label: 'Más usadas' },
];

export interface SortContext {
  /** When each song was last opened */
  lastOpenedAt: ReadonlyMap<string, number>;
  /** How many times each song appears in setlists */
  uses: ReadonlyMap<string, number>;
}

export function compareTitles(a: Pick<Song, 'id' | 'title'>, b: Pick<Song, 'id' | 'title'>): number {
  return a.title.localeCompare(b.title, 'es', { sensitivity: 'base' }) || a.id.localeCompare(b.id);
}

/**
 * Sorted copy, always in a stable order: ties fall back to the title and
 * then the id. Songs never opened (or never used) go after the others.
 */
export function sortSongs<T extends Song>(songs: readonly T[], sort: SongSortOption, context: SortContext): T[] {
  const openedAt = (song: Song) => context.lastOpenedAt.get(song.id) ?? -Infinity;
  const usesOf = (song: Song) => context.uses.get(song.id) ?? 0;
  const sorted = [...songs];
  switch (sort) {
    case 'za':
      return sorted.sort((a, b) => compareTitles(b, a));
    case 'recent':
      return sorted.sort((a, b) => openedAt(b) - openedAt(a) || compareTitles(a, b));
    case 'used':
      return sorted.sort((a, b) => usesOf(b) - usesOf(a) || openedAt(b) - openedAt(a) || compareTitles(a, b));
    default:
      return sorted.sort(compareTitles);
  }
}
