import type { ChordPosition } from '../types/song';
import { CHORD_VARIATIONS, getChordFingering, hasExactFingering } from '../data/chordDictionary';
import { getNoteIndex, normalizeStep, parseChordSymbol } from './chordTransposer';
import { resolveChordQuality, type QualityKey } from './chordQuality';

/**
 * Guitar chord positions.
 *
 * A chord can be played in several places on the neck. The first position is
 * the one shown everywhere by default; the rest appear when a chord is opened.
 * Positions come from three sources, in this order:
 *
 *   1. the dictionary's standard fingering,
 *   2. hand-picked alternatives (open voicings, reduced forms),
 *   3. movable barré shapes, computed for any root.
 *
 * Because (3) is computed rather than stored, a chord that only exists after
 * transposing (say Bbmaj7) still gets exact positions instead of a guess.
 */

export interface GuitarPosition {
  position: ChordPosition;
  description: string;
  /** True when this shape is a simplified stand-in, not the exact chord. */
  approximate: boolean;
}

/** Standard tuning, low to high: E A D G B E. */
export const OPEN_STRING_PITCH_CLASSES = [4, 9, 2, 7, 11, 4];

const MAX_POSITIONS = 4;

interface MovableShape {
  /** String the root sits on: 0 = low E ("forma de Mi"), 1 = A ("forma de La"). */
  rootString: 0 | 1;
  /** Fret offsets from the root fret; null = muted string. */
  offsets: Array<number | null>;
  fingers: number[];
  /** Whether the index finger lies across the strings at the root fret. */
  barre: boolean;
}

const E_SHAPE = 0;
const A_SHAPE = 1;
const x = null;

const MOVABLE_SHAPES: Partial<Record<QualityKey, MovableShape[]>> = {
  major: [
    { rootString: E_SHAPE, offsets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1], barre: true },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1], barre: true },
  ],
  minor: [
    { rootString: E_SHAPE, offsets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1], barre: true },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1], barre: true },
  ],
  dom7: [
    { rootString: E_SHAPE, offsets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1], barre: true },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1], barre: true },
  ],
  m7: [
    { rootString: E_SHAPE, offsets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1], barre: true },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1], barre: true },
  ],
  maj7: [
    { rootString: E_SHAPE, offsets: [0, x, 1, 1, 0, x], fingers: [1, 0, 3, 4, 2, 0], barre: false },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1], barre: true },
  ],
  sus4: [
    { rootString: E_SHAPE, offsets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1], barre: true },
    { rootString: A_SHAPE, offsets: [x, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1], barre: true },
  ],
  sus2: [
    { rootString: A_SHAPE, offsets: [x, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1], barre: true },
  ],
  dim: [
    { rootString: A_SHAPE, offsets: [x, 0, 1, 2, 1, x], fingers: [0, 1, 2, 4, 3, 0], barre: false },
  ],
  dom9: [
    { rootString: A_SHAPE, offsets: [x, 0, -1, 0, 0, 0], fingers: [0, 2, 1, 3, 3, 3], barre: false },
  ],
};

function frettedRange(position: ChordPosition): { min: number; max: number } | null {
  const fretted = position.frets.filter((fret) => fret > 0);
  if (fretted.length === 0) return null;
  return { min: Math.min(...fretted), max: Math.max(...fretted) };
}

function describePosition(position: ChordPosition): string {
  if (position.barres && position.barres.length > 0) {
    return `Barré en el traste ${position.barres[0]}`;
  }
  const range = frettedRange(position);
  if (!range || (position.frets.includes(0) && range.max <= 4)) return 'Acorde abierto';
  return `Traste ${range.min}`;
}

/** Barré positions for any chord whose quality has a movable shape. */
function getMovablePositions(chord: string): ChordPosition[] {
  const parsed = parseChordSymbol(chord);
  // A slash chord needs its written bass lowest, which these shapes don't give.
  if (!parsed || parsed.bass) return [];

  const rootPitchClass = getNoteIndex(parsed.root);
  const quality = resolveChordQuality(parsed.suffix);
  const shapes = MOVABLE_SHAPES[quality.key];
  if (rootPitchClass === null || quality.approximate || !shapes) return [];

  return shapes
    .map((shape): (ChordPosition & { baseFret: number }) | null => {
      const rootFret = normalizeStep(rootPitchClass - OPEN_STRING_PITCH_CLASSES[shape.rootString]);
      // A shape reaching below the nut can't be played in this position.
      // (Checked on the offsets: a computed -1 would otherwise read as "muted".)
      if (shape.offsets.some((offset) => offset !== null && rootFret + offset < 0)) return null;

      const frets = shape.offsets.map((offset) => (offset === null ? -1 : rootFret + offset));
      const fretted = frets.filter((fret) => fret > 0);
      // At fret 0 the shape is an open chord: the nut does the barré's job.
      // Duplicates of dictionary chords are removed further down.
      return {
        frets,
        fingers: rootFret === 0 ? frets.map(() => 0) : shape.fingers,
        barres: shape.barre && rootFret > 0 ? [rootFret] : [],
        baseFret: fretted.length > 0 ? Math.min(...fretted) : 1,
      };
    })
    .filter((position): position is ChordPosition & { baseFret: number } => position !== null)
    .sort((a, b) => a.baseFret - b.baseFret);
}

/**
 * Every known way to play a chord, the default first. Exact positions always
 * come before a simplified stand-in, so the default is never a guess when an
 * exact shape exists.
 */
export function getGuitarPositions(chord: string): GuitarPosition[] {
  if (!chord) return [];
  const clean = chord.trim();

  const exact: GuitarPosition[] = [];
  const dictionaryFingering = getChordFingering(clean);
  const dictionaryIsExact = hasExactFingering(clean);

  if (dictionaryFingering && dictionaryIsExact) {
    exact.push({
      position: dictionaryFingering,
      description: describePosition(dictionaryFingering),
      approximate: false,
    });
  }

  for (const variation of CHORD_VARIATIONS[clean] ?? []) {
    exact.push({ ...variation, approximate: false });
  }

  for (const position of getMovablePositions(clean)) {
    exact.push({ position, description: describePosition(position), approximate: false });
  }

  const candidates =
    exact.length > 0 || !dictionaryFingering
      ? exact
      : [
          {
            position: dictionaryFingering,
            description: 'Aproximado: acorde base',
            approximate: true,
          },
        ];

  // The same fret pattern can arrive from two sources (e.g. the dictionary's
  // F and the computed E-shape barré at fret 1); keep the first.
  const seen = new Set<string>();
  return candidates
    .filter(({ position }) => {
      const signature = position.frets.join(',');
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    })
    .slice(0, MAX_POSITIONS);
}

/** The position shown when a chord isn't opened. */
export function getDefaultGuitarPosition(chord: string): GuitarPosition | null {
  return getGuitarPositions(chord)[0] ?? null;
}
