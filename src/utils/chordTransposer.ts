/**
 * Notes, keys and transposition.
 *
 * Two ideas run through this file:
 *
 * 1. A note is a letter plus accidentals, and its sound is a pitch class
 *    (0-11). Eb and D# are the same key on a piano but different names, and
 *    the name depends on musical context. Sound is computed with pitch
 *    classes; names are always derived from letters and intervals, never
 *    picked from a fixed sharps or flats table.
 *
 * 2. Transposing moves every chord by the interval between two key names,
 *    counted in letters as well as semitones. From G to Ab is "up a minor
 *    second": one letter, one semitone. So D/F# becomes Eb/G, not D#/G.
 */

// Chromatic scales: plain names for a pitch class when no context applies.
export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Natural note letters in order, and the pitch class of each. */
export const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
export const LETTER_PITCH_CLASSES = [0, 2, 4, 5, 7, 9, 11];

const NOTE_REGEX = /^([A-G])(#{1,2}|b{1,2})?$/;

/**
 * Normalizes semitone step to 0-11 range
 */
export function normalizeStep(step: number): number {
  return ((step % 12) + 12) % 12;
}

/**
 * Pitch class (0-11) of a spelled note: a letter plus up to two sharps or
 * flats. "C#", "Db", "E#", "Cb" and "F##" are all understood.
 */
export function getNoteIndex(note: string): number | null {
  const match = note?.match(NOTE_REGEX);
  if (!match) return null;
  const [, letter, accidentals = ''] = match;
  const offset = accidentals.startsWith('#') ? accidentals.length : -accidentals.length;
  return normalizeStep(LETTER_PITCH_CLASSES[LETTERS.indexOf(letter)] + offset);
}

function letterIndexOf(note: string): number {
  return LETTERS.indexOf(note[0]);
}

const ACCIDENTAL_TEXT: Record<number, string> = { [-2]: 'bb', [-1]: 'b', 0: '', 1: '#', 2: '##' };

/**
 * Names a pitch class on a given letter: pitch class 3 on the letter E is
 * "Eb", on D it is "D#". Returns null when that letter would need more
 * accidentals than allowed.
 */
export function spellPitchClass(pitchClass: number, letterIndex: number, maxAccidentals = 2): string | null {
  const natural = LETTER_PITCH_CLASSES[letterIndex];
  let offset = normalizeStep(pitchClass - natural);
  if (offset > 6) offset -= 12;
  if (Math.abs(offset) > maxAccidentals) return null;
  return `${LETTERS[letterIndex]}${ACCIDENTAL_TEXT[offset]}`;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

export interface MusicalKey {
  tonic: string;
  isMinor: boolean;
}

const KEY_REGEX = /^([A-G][#b]?)(m)?$/;
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const NATURAL_MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/** "Ab" → Ab major, "F#m" → F# minor. */
export function parseKey(key: string): MusicalKey | null {
  const match = key?.trim().match(KEY_REGEX);
  return match ? { tonic: match[1], isMinor: Boolean(match[2]) } : null;
}

/**
 * The seven notes of a key, one per letter. Null when the key would need
 * double sharps or flats (G# major, Fb major), which is how keys nobody
 * writes are ruled out without listing them.
 */
export function spellKeyScale({ tonic, isMinor }: MusicalKey): string[] | null {
  const tonicPitchClass = getNoteIndex(tonic);
  if (tonicPitchClass === null) return null;
  const letter = letterIndexOf(tonic);
  const steps = isMinor ? NATURAL_MINOR_SCALE : MAJOR_SCALE;
  const notes = steps.map((step, degree) =>
    spellPitchClass(normalizeStep(tonicPitchClass + step), (letter + degree) % 7, 1)
  );
  return notes.every((note): note is string => note !== null) ? notes : null;
}

type Accidental = '#' | 'b' | null;

interface KeySignature {
  count: number;
  accidental: Accidental;
}

export function getKeySignature(key: MusicalKey): KeySignature | null {
  const scale = spellKeyScale(key);
  if (!scale) return null;
  const sharps = scale.filter((note) => note.includes('#')).length;
  const flats = scale.filter((note) => note.slice(1).includes('b')).length;
  return { count: sharps + flats, accidental: sharps > 0 ? '#' : flats > 0 ? 'b' : null };
}

/**
 * Transposes a key and names it the way it is normally written: the spelling
 * whose key signature has fewer accidentals (Db major, not C# major; Bbm, not
 * A#m). When both spellings are equally simple (F# / Gb, D#m / Ebm), it keeps
 * the direction of the original key, so a song in a flat key stays in flats.
 */
export function transposeKey(key: string, steps: number): string {
  const parsed = parseKey(key);
  if (!parsed || normalizeStep(steps) === 0) return key;

  const pitchClass = normalizeStep((getNoteIndex(parsed.tonic) ?? 0) + steps);
  const sourceDirection = getKeySignature(parsed)?.accidental ?? '#';

  const candidates = [...new Set([SHARPS[pitchClass], FLATS[pitchClass]])]
    .map((tonic) => ({ tonic, signature: getKeySignature({ tonic, isMinor: parsed.isMinor }) }))
    .filter((candidate): candidate is { tonic: string; signature: KeySignature } => candidate.signature !== null)
    .sort((a, b) => {
      const byCount = a.signature.count - b.signature.count;
      if (byCount !== 0) return byCount;
      const penalty = (signature: KeySignature) =>
        signature.accidental && signature.accidental !== sourceDirection ? 1 : 0;
      return penalty(a.signature) - penalty(b.signature);
    });

  const tonic = candidates[0]?.tonic ?? SHARPS[pitchClass];
  return `${tonic}${parsed.isMinor ? 'm' : ''}`;
}

// ---------------------------------------------------------------------------
// Chords
// ---------------------------------------------------------------------------

/**
 * Regex to decompose a chord:
 * Group 1: Root note (e.g. "C#", "Bb", "G")
 * Group 2: Suffix/Quality (e.g. "m", "maj7", "sus4", "add9", "dim7")
 * Group 3: Optional bass note (e.g. "F#", "B")
 */
const CHORD_REGEX = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

export interface ParsedChordSymbol {
  /** Root note as written, e.g. "C#", "Bb", "G" */
  root: string;
  /** Quality/extension as written, e.g. "m", "maj7", "sus4", "" */
  suffix: string;
  /** Bass note of a slash chord, e.g. the "F#" of "D/F#" */
  bass: string | null;
}

/**
 * Splits a chord symbol into root / quality / bass using the same grammar the
 * transposer uses, so every consumer (guitar, piano, transposition) agrees on
 * what a chord *is*. Returns null for anything that isn't a chord.
 */
export function parseChordSymbol(chord: string): ParsedChordSymbol | null {
  if (!chord) return null;
  const match = chord.trim().match(CHORD_REGEX);
  if (!match) return null;

  const [, root, suffix, bass] = match;
  return { root, suffix: suffix ?? '', bass: bass ?? null };
}

/**
 * What may follow the root of a chord: quality words, numbers, accidentals
 * and the usual symbols. Deliberately strict, so a bracketed label that merely
 * starts with a note letter ("[Estribillo]", "[Bridge]", "[Despedida]") is
 * never mistaken for a chord and transposed into nonsense.
 */
const CHORD_SUFFIX_REGEX = /^(?:maj|min|dim|aug|sus|add|m|M|°|ø|Δ|\+|-|\(|\)|#|b|\d)*$/;

/** True when a bracketed token is a chord symbol rather than a text label. */
export function isChordSymbol(token: string): boolean {
  const parsed = parseChordSymbol(token);
  return parsed !== null && CHORD_SUFFIX_REGEX.test(parsed.suffix);
}

/**
 * Moves a chord from one key to another, spelled for the destination key.
 *
 * Root and bass move by the interval between the key names, so the author's
 * spelling logic is kept: in G, D#dim (leading to Em) becomes Edim in Ab
 * (leading to Fm), and a borrowed chord keeps its borrowed spelling. Names
 * that would need a double sharp or flat fall back to the plain name in the
 * destination key's direction. The quality is never touched, and the sound
 * always moves by exactly the interval between the keys.
 */
export function transposeChordBetweenKeys(chord: string, fromKey: string, toKey: string): string {
  const parsed = parseChordSymbol(chord);
  const from = parseKey(fromKey);
  const to = parseKey(toKey);
  if (!parsed || !from || !to) return chord;

  const fromPitchClass = getNoteIndex(from.tonic);
  const toPitchClass = getNoteIndex(to.tonic);
  if (fromPitchClass === null || toPitchClass === null) return chord;

  const letterShift = (letterIndexOf(to.tonic) - letterIndexOf(from.tonic) + 7) % 7;
  const semitoneShift = normalizeStep(toPitchClass - fromPitchClass);
  const plainNames = getKeySignature(to)?.accidental === 'b' ? FLATS : SHARPS;

  const move = (note: string): string => {
    const pitchClass = getNoteIndex(note);
    if (pitchClass === null) return note;
    const target = normalizeStep(pitchClass + semitoneShift);
    return spellPitchClass(target, (letterIndexOf(note) + letterShift) % 7, 1) ?? plainNames[target];
  };

  const root = move(parsed.root);
  const bass = parsed.bass ? move(parsed.bass) : null;
  return bass ? `${root}${parsed.suffix}/${bass}` : `${root}${parsed.suffix}`;
}

/**
 * Formats semitone step into display string, e.g. "+2 semitonos" or "Original"
 */
export function formatTransposeDisplay(steps: number): string {
  if (steps === 0) return 'Tono original';
  return steps > 0 ? `+${steps} semitonos` : `${steps} semitonos`;
}
