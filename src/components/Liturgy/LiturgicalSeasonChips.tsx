import React from 'react';
import type { LiturgicalColor, LiturgicalSeasonId } from '../../data/liturgicalSeasons';
import type { Song } from '../../types/song';
import { getLiturgicalSeason, getSongSeasons } from '../../utils/liturgicalSeasons';

// The liturgical colour is only a small dot: the chip itself stays neutral, so
// a list of songs never turns into a list of colours.
const DOT_CLASSES: Record<LiturgicalColor, string> = {
  violeta: 'bg-violet-500 dark:bg-violet-400',
  // White and gold: a white dot with a thin gold ring, visible on white too.
  blanco: 'bg-white ring-1 ring-inset ring-amber-400 dark:bg-amber-50 dark:ring-amber-300',
  verde: 'bg-emerald-500 dark:bg-emerald-400',
  // The Triduum has no single colour: half red, half gold.
  variable: 'bg-[linear-gradient(90deg,#dc2626_50%,#fbbf24_50%)]',
  // "Todo el año": no liturgical colour, just an outline.
  ninguno: 'ring-1 ring-inset ring-slate-300 dark:ring-slate-500',
};

/** The small liturgical-colour dot, shared by chips and the season picker. */
export const LiturgicalSeasonDot: React.FC<{ id: LiturgicalSeasonId; className?: string }> = ({
  id,
  className = 'w-2 h-2',
}) => (
  <span
    aria-hidden="true"
    className={`shrink-0 rounded-full ${className} ${DOT_CLASSES[getLiturgicalSeason(id).color]}`}
  />
);

const SIZE_CLASSES = {
  xs: { chip: 'h-[18px] gap-1 px-1.5 text-[10px]', dot: 'w-1.5 h-1.5' },
  sm: { chip: 'h-[22px] gap-1.5 px-1.5 text-[11px]', dot: 'w-2 h-2' },
  md: { chip: 'h-7 gap-1.5 px-2.5 text-xs', dot: 'w-2 h-2' },
};

const VARIANT_CLASSES = {
  default:
    'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300',
  /** On a coloured background, such as the song page header */
  onColor: 'border-white/30 bg-white/10 text-white',
};

interface LiturgicalSeasonChipsProps {
  /** The song whose seasons to show; its data is validated here */
  song?: Pick<Song, 'liturgicalSeasons'>;
  /** Or the seasons directly */
  seasons?: LiturgicalSeasonId[];
  size?: keyof typeof SIZE_CLASSES;
  variant?: keyof typeof VARIANT_CLASSES;
  /** Short names ("Ordinario") where space is tight */
  compact?: boolean;
  className?: string;
}

/**
 * The liturgical seasons of a song, as small outlined chips. Deliberately a
 * different shape from category labels, which are filled: a season is a
 * different kind of classification. Renders nothing for songs not classified.
 */
export const LiturgicalSeasonChips: React.FC<LiturgicalSeasonChipsProps> = ({
  song,
  seasons,
  size = 'sm',
  variant = 'default',
  compact = false,
  className = '',
}) => {
  const ids = seasons ?? (song ? getSongSeasons(song) : []);
  if (ids.length === 0) return null;
  const sizeClasses = SIZE_CLASSES[size];

  return (
    <ul aria-label="Tiempo litúrgico" className={`flex flex-wrap items-center gap-1 min-w-0 ${className}`}>
      {ids.map((id) => {
        const season = getLiturgicalSeason(id);
        return (
          <li
            key={id}
            title={`${season.label} · ${season.colorNote}`}
            className={`inline-flex items-center rounded-md border font-medium leading-none whitespace-nowrap ${sizeClasses.chip} ${VARIANT_CLASSES[variant]}`}
          >
            <LiturgicalSeasonDot id={id} className={sizeClasses.dot} />
            {compact ? season.shortLabel : season.label}
          </li>
        );
      })}
    </ul>
  );
};
