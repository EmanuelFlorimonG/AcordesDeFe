import {
  ALL_YEAR_SEASON_ID,
  LITURGICAL_SEASONS,
  type LiturgicalSeason,
  type LiturgicalSeasonId,
  type SpecificSeasonId,
} from '../data/liturgicalSeasons';
import type { Song } from '../types/song';
import { normalizeText } from './normalizeText';

const SEASONS_BY_ID = new Map<string, LiturgicalSeason>(LITURGICAL_SEASONS.map((season) => [season.id, season]));

// Stored data may carry a season by its id or by its name in any spelling
// ("Cuaresma", "CUARESMA", "tiempo ordinario"); both lead to the same id.
const IDS_BY_TEXT = new Map<string, LiturgicalSeasonId>(
  LITURGICAL_SEASONS.flatMap((season) => [
    [season.id, season.id],
    [normalizeText(season.label), season.id],
  ])
);

export function isLiturgicalSeasonId(value: unknown): value is LiturgicalSeasonId {
  return typeof value === 'string' && SEASONS_BY_ID.has(value);
}

export function getLiturgicalSeason(id: LiturgicalSeasonId): LiturgicalSeason {
  // Every id has an entry: LITURGICAL_SEASONS is built from the same list.
  return SEASONS_BY_ID.get(id) as LiturgicalSeason;
}

/** The seasons offered as filters, in the order of the liturgical year. */
export const SEASON_FILTER_OPTIONS: readonly LiturgicalSeason[] = LITURGICAL_SEASONS.filter(
  (season) => season.id !== ALL_YEAR_SEASON_ID
);

/**
 * Valid seasons from anything: unknown values are dropped, repeats removed,
 * and the result sorted by the liturgical year. "Todo el año" already covers
 * every season, so combined with others it stands alone.
 */
export function normalizeLiturgicalSeasons(value: unknown): LiturgicalSeasonId[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<LiturgicalSeasonId>();
  for (const entry of value) {
    if (typeof entry !== 'string') continue;
    const id = IDS_BY_TEXT.get(entry.trim()) ?? IDS_BY_TEXT.get(normalizeText(entry.trim()).replace(/\s+/g, ' '));
    if (id) ids.add(id);
  }
  if (ids.has(ALL_YEAR_SEASON_ID)) return [ALL_YEAR_SEASON_ID];
  return [...ids].sort((a, b) => getLiturgicalSeason(a).order - getLiturgicalSeason(b).order);
}

/**
 * A song's seasons, ready to show and filter. A song saved before seasons
 * existed, or not reviewed yet, has none: it is "sin clasificar".
 */
export function getSongSeasons(song: Pick<Song, 'liturgicalSeasons'>): LiturgicalSeasonId[] {
  return normalizeLiturgicalSeasons(song.liturgicalSeasons);
}

export function isAllYearSong(song: Pick<Song, 'liturgicalSeasons'>): boolean {
  return getSongSeasons(song).includes(ALL_YEAR_SEASON_ID);
}

/**
 * Whether a song fits a season: songs of that season and songs for all year.
 * No season (null) means every song, classified or not. A song not yet
 * classified never appears under a specific season, so a filter only shows
 * songs known to fit it.
 */
export function songFitsSeason(song: Pick<Song, 'liturgicalSeasons'>, season: SpecificSeasonId | null): boolean {
  if (season === null) return true;
  const seasons = getSongSeasons(song);
  return seasons.includes(season) || seasons.includes(ALL_YEAR_SEASON_ID);
}

export function filterSongsBySeason<T extends Pick<Song, 'liturgicalSeasons'>>(
  songs: readonly T[],
  season: SpecificSeasonId | null
): T[] {
  return songs.filter((song) => songFitsSeason(song, season));
}
