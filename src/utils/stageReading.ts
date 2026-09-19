import type { ViewSettings } from '../types/song';

/**
 * Reading a song from a distance: the text sizes and the pace of auto-scroll.
 *
 * Rehearsal mode and mass mode read the same way (a music stand, an arm's
 * length away), so both take these from here instead of each having its own.
 */

export type StageFontSize = ViewSettings['fontSize'];

export const STAGE_FONT_SIZES: StageFontSize[] = ['sm', 'base', 'lg', 'xl'];

export const STAGE_FONT_LABELS: Record<StageFontSize, string> = {
  sm: 'Pequeño',
  base: 'Normal',
  lg: 'Grande',
  xl: 'Extra grande',
};

/**
 * Bigger text makes the song taller, so at the same pixels per second it would
 * feel slower. Scaling keeps "1x" at roughly the same pace in lines.
 */
export const STAGE_SPEED_SCALE: Record<StageFontSize, number> = {
  sm: 0.85,
  base: 1,
  lg: 1.2,
  xl: 1.45,
};

/** A size read from storage may be stale or hand-edited; never trust it blindly. */
export function normalizeStageFontSize(value: unknown): StageFontSize {
  return STAGE_FONT_SIZES.includes(value as StageFontSize) ? (value as StageFontSize) : 'base';
}

/** Moves one step through the sizes, staying inside the list. */
export function changeStageFontSize(current: StageFontSize, delta: number): StageFontSize {
  const index = STAGE_FONT_SIZES.indexOf(current) + delta;
  return STAGE_FONT_SIZES[Math.min(Math.max(index, 0), STAGE_FONT_SIZES.length - 1)];
}
