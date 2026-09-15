import {
  FLATS,
  LETTERS,
  SHARPS,
  getNoteIndex,
  normalizeStep,
  parseChordSymbol,
  spellPitchClass,
} from './chordTransposer';
import { resolveChordQuality } from './chordQuality';

/**
 * Piano chord engine.
 *
 * Chords are never stored per song: a chord symbol (already transposed and
 * spelled for its key) is turned into notes on the fly.
 *
 * Two things are kept apart on purpose:
 * - the sound of a note is its pitch class (0-11), which decides which key
 *   lights up on the keyboard;
 * - the name of a note comes from its interval above the root, which decides
 *   the label. The third of Ab is C, the fifth of Eb is Bb, the third of C#
 *   is E#: same keys as D#, A# and F, but spelled as the chord requires.
 */

export interface PianoChordTone {
  pitchClass: number;
  name: string;
  /** Letter steps above the root: 0 root, 2 third, 4 fifth, 6 seventh, 1 ninth/second. */
  degree: number;
  /** Semitones above the root, before any octave placement. */
  semitones: number;
}

export interface PianoBass {
  pitchClass: number;
  /** As written after the slash */
  name: string;
  /** D/F#: yes, F# is in D. C/Bb: no, Bb is added below the chord. */
  isChordTone: boolean;
}

export interface PianoChord {
  /** The chord symbol as displayed, e.g. "D/F#" */
  symbol: string;
  root: PianoChordTone;
  /** Chord tones in root-position order: root, third, fifth, seventh, then additions */
  tones: PianoChordTone[];
  pitchClasses: number[];
  noteNames: string[];
  /** The note written after a slash, if any */
  bass: PianoBass | null;
  /** True when the exact extension wasn't known and a triad was assumed */
  approximate: boolean;
}

/**
 * Turns a chord symbol into the notes a pianist plays.
 * Returns null when the string isn't a recognizable chord.
 */
export function getPianoChord(chord: string): PianoChord | null {
  const parsed = parseChordSymbol(chord);
  if (!parsed) return null;

  const rootPitchClass = getNoteIndex(parsed.root);
  if (rootPitchClass === null) return null;

  const { intervals, approximate } = resolveChordQuality(parsed.suffix);
  const rootLetter = LETTERS.indexOf(parsed.root[0]);
  // Only reached if a name would need three accidentals, which no chord built
  // on a single-accidental root does; kept so a name is never missing.
  const fallbackNames = parsed.root.includes('b') ? FLATS : SHARPS;

  const tones: PianoChordTone[] = intervals.map((interval) => {
    const pitchClass = normalizeStep(rootPitchClass + interval.semitones);
    return {
      pitchClass,
      // Double accidentals are kept when the chord requires them (D# major
      // is D# F## A#): the spelling follows the interval, not convenience.
      name:
        spellPitchClass(pitchClass, (rootLetter + interval.degree) % LETTERS.length, 2) ??
        fallbackNames[pitchClass],
      degree: interval.degree,
      semitones: interval.semitones,
    };
  });

  let bass: PianoBass | null = null;
  if (parsed.bass) {
    const bassPitchClass = getNoteIndex(parsed.bass);
    if (bassPitchClass === null) return null;
    bass = {
      pitchClass: bassPitchClass,
      name: parsed.bass,
      isChordTone: tones.some((tone) => tone.pitchClass === bassPitchClass),
    };
  }

  return {
    symbol: chord.trim(),
    root: tones[0],
    tones,
    pitchClasses: tones.map((tone) => tone.pitchClass),
    noteNames: tones.map((tone) => tone.name),
    bass,
    approximate,
  };
}

// ---------------------------------------------------------------------------
// Voicings: notes placed in real octaves
// ---------------------------------------------------------------------------

export interface VoicedNote {
  /**
   * Semitones above the C at the left edge of the keyboard: octave * 12 +
   * pitch class. This is what keeps E-G-C (first inversion) different from
   * C-E-G: the C of the inversion is at 12, above the G at 7.
   */
  position: number;
  /** 0 for the lowest octave shown; displayed as octave + 4 (C4, E4, G4, C5…) */
  octave: number;
  pitchClass: number;
  name: string;
  isRoot: boolean;
  /** The note written after a slash */
  isBass: boolean;
}

export interface PianoVoicing {
  /** 0 = root position */
  inversion: number;
  label: string;
  /** Lowest to highest, no pitch class repeated */
  notes: VoicedNote[];
}

/** Octave number used in labels: the lowest octave shown is octave 4. */
export const DISPLAY_OCTAVE_OFFSET = 4;

/**
 * How many distinct voicings a chord offers. Every chord tone can be the bass,
 * so a triad has 3 (root position and 2 inversions), a seventh chord 4, a
 * ninth chord 5. A slash chord has exactly one: its bass is already written.
 */
export function getVoicingCount(chord: PianoChord): number {
  return chord.bass ? 1 : chord.tones.length;
}

export function getInversionLabel(inversion: number): string {
  return inversion === 0 ? 'Fundamental' : `${inversion}ª inversión`;
}

function placeNote(
  chord: PianoChord,
  pitchClass: number,
  name: string,
  position: number,
  isBass: boolean
): VoicedNote {
  return {
    position,
    octave: Math.floor(position / 12),
    pitchClass,
    name,
    isRoot: pitchClass === chord.root.pitchClass,
    isBass,
  };
}

/** Other notes stacked closely above a bass note, lowest first. */
function stackAbove(bassPitchClass: number, tones: PianoChordTone[]): Array<{ tone: PianoChordTone; position: number }> {
  return tones
    .map((tone) => ({ tone, position: bassPitchClass + normalizeStep(tone.pitchClass - bassPitchClass) }))
    .sort((a, b) => a.position - b.position);
}

/**
 * The notes of one voicing, in ascending order with real octaves.
 *
 * - Root position keeps the chord as written, each tone above the previous
 *   one: Cadd9 is C E G D, with the D above the G.
 * - Inversion n puts the n-th chord tone in the bass and stacks the others
 *   closely above it: Cmaj7 in 3rd inversion is B C E G.
 * - A slash chord puts the written bass lowest. When the bass is also a chord
 *   tone it is not repeated above: D/F# is F# A D. When it isn't (C/Bb) it is
 *   added below the chord: Bb C E G.
 *
 * The lowest note always sits in the first octave of the keyboard.
 */
export function getPianoVoicing(chord: PianoChord, inversion = 0): PianoVoicing {
  if (chord.bass) {
    const bass = chord.bass;
    const upper = chord.tones.filter((tone) => tone.pitchClass !== bass.pitchClass);
    return {
      inversion: 0,
      label: `Bajo en ${bass.name}`,
      notes: [
        placeNote(chord, bass.pitchClass, bass.name, bass.pitchClass, true),
        ...stackAbove(bass.pitchClass, upper).map(({ tone, position }) =>
          placeNote(chord, tone.pitchClass, tone.name, position, false)
        ),
      ],
    };
  }

  const safeInversion = Math.min(Math.max(Math.trunc(inversion), 0), chord.tones.length - 1);

  if (safeInversion === 0) {
    let previous = -1;
    return {
      inversion: 0,
      label: getInversionLabel(0),
      notes: chord.tones.map((tone) => {
        let position = tone.pitchClass;
        while (position <= previous) position += 12;
        previous = position;
        return placeNote(chord, tone.pitchClass, tone.name, position, false);
      }),
    };
  }

  const bassTone = chord.tones[safeInversion];
  const others = chord.tones.filter((_, index) => index !== safeInversion);
  return {
    inversion: safeInversion,
    label: getInversionLabel(safeInversion),
    notes: [
      placeNote(chord, bassTone.pitchClass, bassTone.name, bassTone.pitchClass, false),
      ...stackAbove(bassTone.pitchClass, others).map(({ tone, position }) =>
        placeNote(chord, tone.pitchClass, tone.name, position, false)
      ),
    ],
  };
}
