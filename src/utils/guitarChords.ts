import type { ChordPosition } from '../types/song';
import { getChordFingering, getCuratedVariations, hasExactFingering } from '../data/chordDictionary';
import { getNoteIndex, normalizeStep, parseChordSymbol, type ParsedChordSymbol } from './chordTransposer';
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
 * Positions for a chord without a slash, the default first. Exact positions
 * always come before a simplified stand-in, so the default is never a guess
 * when an exact shape exists.
 */
function getStandardPositions(clean: string): GuitarPosition[] {

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

  for (const variation of getCuratedVariations(clean)) {
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

// ---------------------------------------------------------------------------
// Slash chords
// ---------------------------------------------------------------------------

/**
 * Standard tuning as pitches (MIDI numbers, E2 = 40 … E4 = 64). The lowest
 * string that plays is not always the lowest note: the A string at fret 10
 * (G3) sounds higher than the open D string (D3). The bass of a slash chord is
 * therefore checked against real pitches, not just string order.
 */
export const OPEN_STRING_MIDI = [40, 45, 50, 55, 59, 64];

const STRING_COUNT = OPEN_STRING_MIDI.length;
/** Generated positions stay within the first twelve frets. */
const MAX_GENERATED_FRET = 12;
/** The hand covers its lowest fretted note and three frets above it. */
const HAND_SPAN = 3;
const MIN_SOUNDING_STRINGS = 4;
const MAX_FINGERS = 4;
/** Muting one string inside a chord is common (D/F#: 2x0232); more is not. */
const MAX_INNER_MUTED_STRINGS = 1;

interface SlashChordSpec {
  bass: number;
  /** Pitch classes allowed to sound: the chord tones and the bass */
  allowed: Set<number>;
  /** Pitch classes that must sound: every chord tone except a perfect fifth */
  required: number[];
  fifth: number | null;
}

interface FingerPlan {
  /** Finger per string, 0 for open or muted */
  fingers: number[];
  barreFret: number | null;
  fingersUsed: number;
}

/**
 * How the fretting hand plays a set of frets, or null when it would need more
 * than four fingers. The index finger may lie across several strings at the
 * lowest fret, but only across strings that are all pressed at that fret or
 * higher: a barre can't leave an open or muted string underneath it.
 */
function planFingers(frets: number[]): FingerPlan | null {
  const fretted = frets.flatMap((fret, string) => (fret > 0 ? [{ fret, string }] : []));
  const fingers = frets.map(() => 0);
  if (fretted.length === 0) return { fingers, barreFret: null, fingersUsed: 0 };

  const lowestFret = Math.min(...fretted.map((note) => note.fret));
  const atLowestFret = fretted.filter((note) => note.fret === lowestFret).map((note) => note.string);

  let barreStrings: number[] = [];
  for (let i = 0; i < atLowestFret.length; i++) {
    for (let j = atLowestFret.length - 1; j > i; j--) {
      const from = atLowestFret[i];
      const to = atLowestFret[j];
      const crossesOnlyPressedStrings = frets.slice(from, to + 1).every((fret) => fret >= lowestFret);
      const covered = atLowestFret.filter((string) => string >= from && string <= to);
      if (crossesOnlyPressedStrings && covered.length > barreStrings.length) barreStrings = covered;
    }
  }

  const rest = fretted
    .filter((note) => !barreStrings.includes(note.string))
    .sort((a, b) => a.fret - b.fret || a.string - b.string);
  const fingersUsed = (barreStrings.length > 0 ? 1 : 0) + rest.length;
  if (fingersUsed > MAX_FINGERS) return null;

  for (const string of barreStrings) fingers[string] = 1;
  let nextFinger = barreStrings.length > 0 ? 2 : 1;
  for (const note of rest) fingers[note.string] = nextFinger++;

  return { fingers, barreFret: barreStrings.length > 0 ? lowestFret : null, fingersUsed };
}

function getSlashChordSpec(parsed: ParsedChordSymbol): SlashChordSpec | null {
  const root = getNoteIndex(parsed.root);
  const bass = parsed.bass ? getNoteIndex(parsed.bass) : null;
  if (root === null || bass === null) return null;

  const quality = resolveChordQuality(parsed.suffix);
  // An unknown extension can't be voiced exactly, and a slash chord is never
  // shown with a shape that might be wrong.
  if (quality.approximate) return null;

  const tones = quality.intervals.map((interval) => ({
    pitchClass: normalizeStep(root + interval.semitones),
    isPerfectFifth: interval.semitones === 7,
  }));
  return {
    bass,
    allowed: new Set([...tones.map((tone) => tone.pitchClass), bass]),
    required: tones.filter((tone) => !tone.isPerfectFifth).map((tone) => tone.pitchClass),
    fifth: tones.find((tone) => tone.isPerfectFifth)?.pitchClass ?? null,
  };
}

interface SlashVoicingCheck {
  plan: FingerPlan;
  lowestString: number;
}

/**
 * Whether a set of frets plays the slash chord correctly and can be played.
 * Musical correctness comes first: only chord tones and the bass sound, every
 * chord tone except an optional fifth is present, and the written bass is both
 * the lowest note and the lowest string that plays.
 */
function checkSlashVoicing(frets: number[], spec: SlashChordSpec): SlashVoicingCheck | null {
  const sounding = frets.flatMap((fret, string) => (fret >= 0 ? [string] : []));
  if (sounding.length < MIN_SOUNDING_STRINGS) return null;

  const pitches = sounding.map((string) => OPEN_STRING_MIDI[string] + frets[string]);
  const pitchClasses = pitches.map((pitch) => pitch % 12);
  if (pitchClasses.some((pitchClass) => !spec.allowed.has(pitchClass))) return null;
  if (pitchClasses[0] !== spec.bass || Math.min(...pitches) % 12 !== spec.bass) return null;
  if (spec.required.some((pitchClass) => !pitchClasses.includes(pitchClass))) return null;

  const lowestString = sounding[0];
  const highestString = sounding[sounding.length - 1];
  const innerMuted = frets.slice(lowestString, highestString + 1).filter((fret) => fret < 0).length;
  if (innerMuted > MAX_INNER_MUTED_STRINGS) return null;

  const fretted = frets.filter((fret) => fret > 0);
  if (fretted.length > 0) {
    if (Math.max(...fretted) > MAX_GENERATED_FRET) return null;
    if (Math.max(...fretted) - Math.min(...fretted) > HAND_SPAN) return null;
  }

  const plan = planFingers(frets);
  return plan ? { plan, lowestString } : null;
}

/** Lower is better: comfort and fullness, among positions already known to be correct. */
function scoreSlashVoicing(frets: number[], check: SlashVoicingCheck, spec: SlashChordSpec): number {
  const fretted = frets.filter((fret) => fret > 0);
  const lowestFret = fretted.length > 0 ? Math.min(...fretted) : 0;
  const highestFret = fretted.length > 0 ? Math.max(...fretted) : 0;
  const openStrings = frets.filter((fret) => fret === 0).length;
  // Strings above the bass that must stay silent: a strum has to avoid them.
  const mutedAboveBass = frets.slice(check.lowestString).filter((fret) => fret < 0).length;
  // Silencing a string between two ringing treble strings (3 1 1 3 x 3) needs
  // a fingertip leaning on it; muting a low string beside the bass (2 x 0 2 3 2)
  // is done naturally by the finger playing the bass.
  const mutedBetweenTrebleStrings = frets.filter(
    (fret, string) =>
      fret < 0 &&
      string >= 3 &&
      frets.slice(0, string).some((other) => other >= 0) &&
      frets.slice(string + 1).some((other) => other >= 0)
  ).length;
  const pitchClasses = frets.flatMap((fret, string) => (fret >= 0 ? [(OPEN_STRING_MIDI[string] + fret) % 12] : []));

  // An open string trapped between fretted strings makes the hand arch over
  // it; harmless in a first-position chord, awkward once the hand is higher.
  const firstFretted = frets.findIndex((fret) => fret > 0);
  const lastFretted = frets.length - 1 - [...frets].reverse().findIndex((fret) => fret > 0);
  const trappedOpenStrings = frets.filter(
    (fret, string) => fret === 0 && firstFretted >= 0 && string > firstFretted && string < lastFretted
  ).length;

  let score = 0;
  score += mutedAboveBass * 3; // a choir guitar strums: every silent string is a hazard
  score += mutedBetweenTrebleStrings * 2;
  score += (highestFret - lowestFret) ** 2; // stretch: spanning three frets is much harder than two
  score += trappedOpenStrings * Math.max(0, highestFret - 2) * 1.5;
  score += openStrings * Math.max(0, lowestFret - 2) * 0.75; // open strings far from the hand
  score += lowestFret * 0.6; // nearer the nut
  score += check.plan.fingersUsed * 0.8;
  if (check.plan.barreFret !== null) score += 1.5;
  score += check.lowestString * 2; // bass on a thinner string sounds weaker
  if (spec.fifth !== null && !pitchClasses.includes(spec.fifth)) score += 1;
  // A first-position chord with every string above the bass ringing.
  if (openStrings > 0 && mutedAboveBass === 0 && highestFret <= 4) score -= 2;
  return score;
}

/**
 * Searches the fretboard for positions of a slash chord. Each four-fret window
 * from the nut to fret 12 is tried; on each string only silence, the open
 * string, or a fret that sounds a chord tone or the bass is considered. The
 * bass rule is applied while searching: until a string sounds, the only note
 * it may play is the bass.
 */
function searchSlashVoicings(spec: SlashChordSpec): Array<{ frets: number[]; check: SlashVoicingCheck; score: number }> {
  const found = new Map<string, { frets: number[]; check: SlashVoicingCheck; score: number }>();
  const frets = new Array<number>(STRING_COUNT).fill(-1);

  for (let windowStart = 1; windowStart + HAND_SPAN <= MAX_GENERATED_FRET; windowStart++) {
    const choices = OPEN_STRING_MIDI.map((open) => {
      const options = [-1];
      if (spec.allowed.has(open % 12)) options.push(0);
      for (let fret = windowStart; fret <= windowStart + HAND_SPAN; fret++) {
        if (spec.allowed.has((open + fret) % 12)) options.push(fret);
      }
      return options;
    });

    const visit = (string: number, anySounding: boolean) => {
      if (string === STRING_COUNT) {
        const key = frets.join(',');
        if (found.has(key)) return;
        const check = checkSlashVoicing(frets, spec);
        if (check) found.set(key, { frets: [...frets], check, score: scoreSlashVoicing(frets, check, spec) });
        return;
      }
      for (const fret of choices[string]) {
        if (!anySounding && fret >= 0 && (OPEN_STRING_MIDI[string] + fret) % 12 !== spec.bass) continue;
        frets[string] = fret;
        visit(string + 1, anySounding || fret >= 0);
      }
      frets[string] = -1;
    };
    visit(0, false);
  }

  return [...found.values()].sort((a, b) => a.score - b.score);
}

/**
 * True when two positions are the same hand shape: identical wherever both
 * play, differing only in strings one of them mutes, with the bass on the same
 * string. The better-scored one is kept. A shape with the bass on another
 * string (1 x 3 1 2 1 and x x 3 1 2 1) is a different position and stays.
 */
function isSameShape(a: number[], b: number[]): boolean {
  const lowestString = (frets: number[]) => frets.findIndex((fret) => fret >= 0);
  return (
    lowestString(a) === lowestString(b) &&
    a.every((fret, string) => fret === b[string] || fret < 0 || b[string] < 0)
  );
}

function getSlashPositions(clean: string, parsed: ParsedChordSymbol): GuitarPosition[] {
  const spec = getSlashChordSpec(parsed);
  if (!spec) return [];

  const positions: GuitarPosition[] = [];
  const add = (position: ChordPosition, description?: string) => {
    // Even a stored shape must honour the bass before it is shown.
    const check = checkSlashVoicing(position.frets, spec);
    if (!check || positions.some((existing) => existing.position.frets.join() === position.frets.join())) return;
    const bassString = `bajo en la ${STRING_COUNT - check.lowestString}ª cuerda`;
    positions.push({
      position,
      description: `${description ?? describePosition(position)} · ${bassString}`,
      approximate: false,
    });
  };

  if (hasExactFingering(clean)) {
    const stored = getChordFingering(clean);
    if (stored) add(stored);
  }
  for (const variation of getCuratedVariations(clean)) add(variation.position, variation.description);

  for (const candidate of searchSlashVoicings(spec)) {
    if (positions.length >= MAX_POSITIONS) break;
    if (positions.some((existing) => isSameShape(existing.position.frets, candidate.frets))) continue;
    const fretted = candidate.frets.filter((fret) => fret > 0);
    add({
      frets: candidate.frets,
      fingers: candidate.check.plan.fingers,
      barres: candidate.check.plan.barreFret !== null ? [candidate.check.plan.barreFret] : [],
      baseFret: fretted.length > 0 ? Math.min(...fretted) : 1,
    });
  }

  return positions.slice(0, MAX_POSITIONS);
}

// ---------------------------------------------------------------------------

const positionsCache = new Map<string, GuitarPosition[]>();

/**
 * Every known way to play a chord, the default first.
 *
 * A slash chord is searched on the fretboard with its bass as a hard rule. If
 * no playable position has the written bass as its lowest note, the list is
 * empty: the diagram then says the position isn't available instead of showing
 * a shape that ignores the bass.
 */
export function getGuitarPositions(chord: string): GuitarPosition[] {
  if (!chord) return [];
  const clean = chord.trim();
  const cached = positionsCache.get(clean);
  if (cached) return cached;

  const parsed = parseChordSymbol(clean);
  const positions = parsed?.bass ? getSlashPositions(clean, parsed) : getStandardPositions(clean);
  positionsCache.set(clean, positions);
  return positions;
}

/** The position shown when a chord isn't opened. */
export function getDefaultGuitarPosition(chord: string): GuitarPosition | null {
  return getGuitarPositions(chord)[0] ?? null;
}
