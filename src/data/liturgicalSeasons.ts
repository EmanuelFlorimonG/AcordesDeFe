/**
 * The liturgical seasons a song can be suited to: the one place that knows
 * their ids, names, order and colours. Everything else refers to a season by
 * its id, never by its visible name.
 *
 * A season is a different kind of classification from a song's categories:
 * "Comunión" says when in the Mass a song is sung, "María" what it is about,
 * "Cuaresma" in which part of the year it fits.
 */

export const LITURGICAL_SEASON_IDS = [
  'adviento',
  'navidad',
  'tiempo-ordinario',
  'cuaresma',
  'triduo-pascual',
  'pascua',
  'todo-el-ano',
] as const;

export type LiturgicalSeasonId = (typeof LITURGICAL_SEASON_IDS)[number];

/** A song for any time of year, whatever the season. */
export const ALL_YEAR_SEASON_ID = 'todo-el-ano' satisfies LiturgicalSeasonId;

/** A season that can be chosen as a filter: "Todo el año" is not one. */
export type SpecificSeasonId = Exclude<LiturgicalSeasonId, typeof ALL_YEAR_SEASON_ID>;

/**
 * The colour of the season's vestments. The Triduum has none of its own: it
 * changes with each celebration (white on Holy Thursday and at the Vigil, red
 * on Good Friday).
 */
export type LiturgicalColor = 'violeta' | 'blanco' | 'verde' | 'variable' | 'ninguno';

export interface LiturgicalSeason {
  id: LiturgicalSeasonId;
  label: string;
  /** For tight spaces such as song rows */
  shortLabel: string;
  /** Position in the liturgical year */
  order: number;
  color: LiturgicalColor;
  /** Explains the colour, shown as a tooltip */
  colorNote: string;
}

export const LITURGICAL_SEASONS: readonly LiturgicalSeason[] = [
  { id: 'adviento', label: 'Adviento', shortLabel: 'Adviento', order: 1, color: 'violeta', colorNote: 'Color litúrgico: morado' },
  { id: 'navidad', label: 'Navidad', shortLabel: 'Navidad', order: 2, color: 'blanco', colorNote: 'Color litúrgico: blanco' },
  {
    id: 'tiempo-ordinario',
    label: 'Tiempo Ordinario',
    shortLabel: 'Ordinario',
    order: 3,
    color: 'verde',
    colorNote: 'Color litúrgico: verde',
  },
  { id: 'cuaresma', label: 'Cuaresma', shortLabel: 'Cuaresma', order: 4, color: 'violeta', colorNote: 'Color litúrgico: morado' },
  {
    id: 'triduo-pascual',
    label: 'Triduo Pascual',
    shortLabel: 'Triduo',
    order: 5,
    color: 'variable',
    colorNote: 'El color cambia: blanco el Jueves Santo y en la Vigilia, rojo el Viernes Santo',
  },
  { id: 'pascua', label: 'Pascua', shortLabel: 'Pascua', order: 6, color: 'blanco', colorNote: 'Color litúrgico: blanco' },
  {
    id: 'todo-el-ano',
    label: 'Todo el año',
    shortLabel: 'Todo el año',
    order: 7,
    color: 'ninguno',
    colorNote: 'Sirve en cualquier tiempo litúrgico',
  },
];
