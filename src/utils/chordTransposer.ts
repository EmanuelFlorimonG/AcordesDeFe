// Chromatic scales
export const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export const FLATS  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map flats to standard chromatic indices
const NOTE_TO_INDEX: Record<string, number> = {
  'C': 0, 'B#': 0,
  'C#': 1, 'Db': 1,
  'D': 2,
  'D#': 3, 'Eb': 3,
  'E': 4, 'Fb': 4,
  'F': 5, 'E#': 5,
  'F#': 6, 'Gb': 6,
  'G': 7,
  'G#': 8, 'Ab': 8,
  'A': 9,
  'A#': 10, 'Bb': 10,
  'B': 11, 'Cb': 11,
};

// Keys that naturally use flats
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm']);

/**
 * Normalizes semitone step to 0-11 range
 */
export function normalizeStep(step: number): number {
  return ((step % 12) + 12) % 12;
}

/**
 * Parses a single note string into its chromatic index (0-11)
 */
export function getNoteIndex(note: string): number | null {
  if (note in NOTE_TO_INDEX) {
    return NOTE_TO_INDEX[note];
  }
  return null;
}

/**
 * Transposes an individual note by a number of semitones.
 * Uses flats if useFlats is true or target note is better represented as flat.
 */
function transposeNote(note: string, steps: number, useFlats: boolean = false): string {
  const index = getNoteIndex(note);
  if (index === null) return note;

  const newIndex = normalizeStep(index + steps);
  return useFlats ? FLATS[newIndex] : SHARPS[newIndex];
}

/**
 * Regex to decompose a chord:
 * Group 1: Root note (e.g. "C#", "Bb", "G")
 * Group 2: Suffix/Quality (e.g. "m", "maj7", "sus4", "add9", "dim7")
 * Group 3: Optional slash separator
 * Group 4: Optional bass note (e.g. "F#", "B")
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
 * Transposes a chord string (e.g., "Am7", "D/F#", "Cadd9", "Bb") by given semitones.
 */
export function transposeChord(chord: string, steps: number, preferFlats: boolean = false): string {
  if (!chord || steps === 0) return chord;

  const match = chord.trim().match(CHORD_REGEX);
  if (!match) return chord; // Not a standard identifiable chord, return untouched

  const [, root, suffix, bass] = match;

  const transposedRoot = transposeNote(root, steps, preferFlats);
  const transposedBass = bass ? transposeNote(bass, steps, preferFlats) : null;

  if (transposedBass) {
    return `${transposedRoot}${suffix}/${transposedBass}`;
  }

  return `${transposedRoot}${suffix}`;
}

/**
 * Transposes a key name (e.g. "G", "Em", "F#m") by semitones
 */
export function transposeKey(key: string, steps: number): string {
  if (!key || steps === 0) return key;
  const isMinor = key.endsWith('m') && !key.endsWith('dim');
  const baseNote = isMinor ? key.slice(0, -1) : key;
  
  // Decide if the target key tends to use flats
  const targetIndex = normalizeStep((getNoteIndex(baseNote) ?? 0) + steps);
  const sampleNote = SHARPS[targetIndex] + (isMinor ? 'm' : '');
  const useFlats = FLAT_KEYS.has(sampleNote) || FLAT_KEYS.has(FLATS[targetIndex] + (isMinor ? 'm' : ''));

  const transposed = transposeNote(baseNote, steps, useFlats);
  return `${transposed}${isMinor ? 'm' : ''}`;
}

/**
 * Formats semitone step into display string, e.g. "+2 semitonos" or "Original"
 */
export function formatTransposeDisplay(steps: number): string {
  if (steps === 0) return 'Tono original';
  return steps > 0 ? `+${steps} semitonos` : `${steps} semitonos`;
}
