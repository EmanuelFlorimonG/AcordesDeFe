import { FLATS, SHARPS, getNoteIndex, normalizeStep, parseChordSymbol } from './chordTransposer';
import { isExtensionInterval, resolveChordQuality } from './chordQuality';

/**
 * Piano chord engine.
 *
 * Chords are never stored per song: a chord symbol (already transposed by the
 * existing transposer) is turned into notes on the fly, so piano diagrams and
 * inversions follow transposition automatically, exactly like the guitar ones.
 *
 * Parsing and chromatic tables come from chordTransposer, and what a suffix
 * means comes from chordQuality, so guitar, piano and transposition can never
 * disagree about what a chord is.
 */

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
/** Pitch class of each natural letter. */
const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

// Deliberately no double accidentals. D# major is strictly D#-F##-A#, but a
// double sharp is unreadable for a parish choir, so such notes fall back to a
// plain name (D#-G-A#). The key to press is identical either way.
const ACCIDENTALS: Record<number, string> = {
  [-1]: 'b',
  0: '',
  1: '#',
};

/**
 * Names a pitch class using a specific letter, e.g. pitch class 3 written on
 * the letter E gives "Eb", written on D it gives "D#". Returns null when that
 * letter would need a double accidental.
 */
function spellNote(pitchClass: number, letterIndex: number): string | null {
  const letter = LETTERS[letterIndex];
  const natural = LETTER_PITCH_CLASSES[letterIndex];

  // Distance from the natural note, folded into -5..6 so that, say, C against
  // B reads as -1 (Cb) rather than +11.
  let offset = normalizeStep(pitchClass - natural);
  if (offset > 6) offset -= 12;

  const accidental = ACCIDENTALS[offset];
  return accidental === undefined ? null : `${letter}${accidental}`;
}

export interface PianoChordTone {
  pitchClass: number;
  name: string;
  /** Letter steps above the root: 0 root, 2 third, 4 fifth, 6 seventh. */
  degree: number;
  /** An added colour tone (9th, 6th) that never goes in the bass of an inversion. */
  isExtension: boolean;
}

export interface PianoChord {
  /** The chord symbol as displayed, e.g. "D/F#" */
  symbol: string;
  /** Pitch classes (0-11) that make up the chord, in root-position order */
  pitchClasses: number[];
  /** Note names in the chord's own spelling, e.g. ["D", "F#", "A"] */
  noteNames: string[];
  /** Every tone with its role in the chord, in root-position order */
  tones: PianoChordTone[];
  /** Pitch class of the slash bass note, if any */
  bassPitchClass: number | null;
  /** Bass note name, e.g. "F#" */
  bassName: string | null;
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

  const rootIndex = getNoteIndex(parsed.root);
  if (rootIndex === null) return null;

  const { intervals, approximate } = resolveChordQuality(parsed.suffix);

  const rootLetterIndex = LETTERS.indexOf(parsed.root[0]);
  // A chord written with a flat root is spelled with flats, otherwise sharps.
  // Only used where the interval spelling itself doesn't settle the question.
  const fallbackScale = parsed.root.includes('b') ? FLATS : SHARPS;

  // Each note is named from its *interval*, not from a fixed chromatic table:
  // the third of Cm is two letters above C, so it comes out Eb, not D#.
  const tones: PianoChordTone[] = intervals.map((interval) => {
    const pitchClass = normalizeStep(rootIndex + interval.semitones);
    const letterIndex = (rootLetterIndex + interval.degree) % LETTERS.length;
    return {
      pitchClass,
      name: spellNote(pitchClass, letterIndex) ?? fallbackScale[pitchClass],
      degree: interval.degree,
      isExtension: isExtensionInterval(interval, intervals),
    };
  });

  const bassPitchClass = parsed.bass ? getNoteIndex(parsed.bass) : null;

  return {
    symbol: chord.trim(),
    pitchClasses: tones.map((tone) => tone.pitchClass),
    noteNames: tones.map((tone) => tone.name),
    tones,
    bassPitchClass,
    bassName: parsed.bass,
    approximate,
  };
}

// ---------------------------------------------------------------------------
// Voicings and inversions
// ---------------------------------------------------------------------------

export type VoicedNoteRole = 'root' | 'tone' | 'bass';

export interface VoicedNote {
  /**
   * Semitones above the C that starts the lowest octave of the voicing. Unlike
   * a pitch class this keeps octaves apart, which is what makes E-G-C
   * (first inversion) look different from C-E-G.
   */
  position: number;
  pitchClass: number;
  name: string;
  role: VoicedNoteRole;
}

export interface PianoVoicing {
  inversion: number;
  label: string;
  /** Every note to press, lowest first. A slash chord's bass comes first. */
  notes: VoicedNote[];
}

/** How many inversions a chord has: one per tone that can sit in the bass. */
export function getInversionCount(chord: PianoChord): number {
  return chord.tones.filter((tone) => !tone.isExtension).length;
}

export function getInversionLabel(inversion: number): string {
  return inversion === 0 ? 'Fundamental' : `${inversion}ª inversión`;
}

/** Smallest position above `floor` that has the given pitch class. */
function nextPositionAbove(pitchClass: number, floor: number): number {
  let position = pitchClass;
  while (position <= floor) position += 12;
  return position;
}

/**
 * Builds the notes for one inversion, computed from the chord tones rather
 * than stored: inversion n puts the n-th chord tone lowest and stacks the rest
 * closely above it. Colour tones (9th, 6th) go on top. For a slash chord the
 * written bass is played below, and the right hand sits above it.
 */
export function getPianoVoicing(chord: PianoChord, inversion: number): PianoVoicing {
  const chordTones = chord.tones.filter((tone) => !tone.isExtension);
  const extensions = chord.tones.filter((tone) => tone.isExtension);
  const safeInversion = Math.max(0, Math.min(inversion, chordTones.length - 1));

  const ordered = [
    ...chordTones.slice(safeInversion),
    ...chordTones.slice(0, safeInversion),
    ...extensions,
  ];

  const rootPitchClass = chord.tones[0].pitchClass;
  const rightHand: VoicedNote[] = [];
  let floor = -1;
  for (const tone of ordered) {
    const position = nextPositionAbove(tone.pitchClass, floor);
    rightHand.push({
      position,
      pitchClass: tone.pitchClass,
      name: tone.name,
      role: tone.pitchClass === rootPitchClass ? 'root' : 'tone',
    });
    floor = position;
  }

  if (chord.bassPitchClass === null || chord.bassName === null) {
    return { inversion: safeInversion, label: getInversionLabel(safeInversion), notes: rightHand };
  }

  // Slash chord: the bass goes in the lowest octave and the right hand is
  // lifted, whole octaves at a time, until it sits entirely above it.
  const bassPosition = chord.bassPitchClass;
  let lift = 0;
  while (rightHand[0].position + lift <= bassPosition) lift += 12;

  return {
    inversion: safeInversion,
    label: getInversionLabel(safeInversion),
    notes: [
      { position: bassPosition, pitchClass: chord.bassPitchClass, name: chord.bassName, role: 'bass' },
      ...rightHand.map((note) => ({ ...note, position: note.position + lift })),
    ],
  };
}
