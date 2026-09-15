/**
 * Time signatures, as the metronome needs them: how many clicks make a bar,
 * how long each one lasts relative to the BPM, and which ones are stressed.
 */

/** How strongly a click is played. */
export type PulseLevel = 'accent' | 'beat' | 'sub';

export interface Meter {
  /** As written, e.g. "6/8" */
  label: string;
  /** Felt beats per bar: 4 in 4/4, 2 in 6/8 */
  beats: number;
  /** Clicks per felt beat: 1 in simple meters, 3 in compound (6/8, 9/8, 12/8) */
  pulsesPerBeat: 1 | 3;
  /** Total clicks per bar */
  pulses: number;
  /** Stress of each click in the bar */
  pulseLevels: PulseLevel[];
  isCompound: boolean;
  /** True when the song had no usable time signature and 4/4 was assumed */
  isAssumed: boolean;
}

const DEFAULT_SIGNATURE = '4/4';

/**
 * Parses "N/D". Compound meters (6/8, 9/8, 12/8) are felt in groups of three
 * eighths, so 6/8 is two beats of three clicks: STRONG-click-click
 * medium-click-click. In those meters the BPM counts the felt beat (the dotted
 * quarter), which is how compound tempos are normally written.
 */
export function parseTimeSignature(value?: string): Meter {
  const match = value?.trim().match(/^(\d{1,2})\s*\/\s*(\d{1,2})$/);
  const top = match ? Number(match[1]) : NaN;
  const bottom = match ? Number(match[2]) : NaN;
  const isValid = top >= 1 && top <= 16 && [1, 2, 4, 8, 16].includes(bottom);

  if (!isValid) {
    return { ...parseTimeSignature(DEFAULT_SIGNATURE), isAssumed: true };
  }

  const isCompound = bottom === 8 && top > 3 && top % 3 === 0;
  const pulsesPerBeat = isCompound ? 3 : 1;
  const beats = isCompound ? top / 3 : top;

  const pulseLevels: PulseLevel[] = Array.from({ length: top }, (_, index) => {
    if (index === 0) return 'accent';
    if (!isCompound) return 'beat';
    return index % 3 === 0 ? 'beat' : 'sub';
  });

  return {
    label: `${top}/${bottom}`,
    beats,
    pulsesPerBeat,
    pulses: top,
    pulseLevels,
    isCompound,
    isAssumed: false,
  };
}
