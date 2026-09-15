import { normalizeStep } from './chordTransposer';

/**
 * Physical layout of the mini keyboard, independent of how it is drawn.
 *
 * Positions are semitones above the C at the left edge (0 = C, 1 = the black
 * key between C and D, 12 = the next C). A note's name never reaches this
 * file: C# and Db are both position 1, so both light the same black key.
 */

const WHITE_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

/**
 * Black keys are not centred on the gaps between white keys. On a real piano
 * the C–E group is divided into five equal slices and the F–B group into
 * seven, and each black key takes one slice. Offsets are in white-key widths
 * from the start of the octave.
 */
const BLACK_KEY_SLOTS: Record<number, { groupStart: number; slice: number; slices: number; groupWhites: number }> = {
  1: { groupStart: 0, slice: 1, slices: 5, groupWhites: 3 },
  3: { groupStart: 0, slice: 3, slices: 5, groupWhites: 3 },
  6: { groupStart: 3, slice: 1, slices: 7, groupWhites: 4 },
  8: { groupStart: 3, slice: 3, slices: 7, groupWhites: 4 },
  10: { groupStart: 3, slice: 5, slices: 7, groupWhites: 4 },
};

/** Black keys reach about 63% down the white keys, as on a real keyboard. */
export const BLACK_KEY_HEIGHT_RATIO = 0.63;

/**
 * Two octaves from C. Every voicing the app draws starts in the first octave
 * and spans at most 11 semitones, except root-position ninths (14), so this
 * range fits nearly every chord and every chord looks like the same keyboard.
 */
export const BASE_KEYBOARD_KEYS = 24;

export interface KeyboardKey {
  position: number;
  pitchClass: number;
  isBlack: boolean;
  /** Left edge, in white-key widths */
  x: number;
  /** Width, in white-key widths */
  width: number;
}

export interface KeyboardLayout {
  /** Last position shown (always a white key) */
  end: number;
  whiteKeyCount: number;
  whiteKeys: KeyboardKey[];
  blackKeys: KeyboardKey[];
}

export function isBlackKey(position: number): boolean {
  return !WHITE_PITCH_CLASSES.includes(normalizeStep(position));
}

/**
 * The keys to draw for a voicing whose highest note is at `highestPosition`.
 * Normally two octaves; extended by a few keys only when a chord doesn't fit.
 */
export function getKeyboardLayout(highestPosition: number): KeyboardLayout {
  let end = Math.max(BASE_KEYBOARD_KEYS - 1, highestPosition);
  while (isBlackKey(end)) end++;

  const whiteKeys: KeyboardKey[] = [];
  const blackKeys: KeyboardKey[] = [];

  for (let position = 0; position <= end; position++) {
    const pitchClass = normalizeStep(position);
    const octaveStart = Math.floor(position / 12) * 7;

    if (!isBlackKey(position)) {
      whiteKeys.push({
        position,
        pitchClass,
        isBlack: false,
        x: octaveStart + WHITE_PITCH_CLASSES.indexOf(pitchClass),
        width: 1,
      });
    } else {
      const slot = BLACK_KEY_SLOTS[pitchClass];
      const width = slot.groupWhites / slot.slices;
      blackKeys.push({
        position,
        pitchClass,
        isBlack: true,
        x: octaveStart + slot.groupStart + slot.slice * width,
        width,
      });
    }
  }

  return { end, whiteKeyCount: whiteKeys.length, whiteKeys, blackKeys };
}
