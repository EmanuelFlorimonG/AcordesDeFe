import type { ChordPosition } from '../types/song';

// Standard 6-string guitar chord fingerings [E, A, D, G, B, e]
// -1 means string muted (X), 0 means open string (O), 1..12 is fret
export const CHORD_DATABASE: Record<string, ChordPosition> = {
  // Major chords
  'C': { frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  'D': { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], baseFret: 1 },
  'E': { frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], baseFret: 1 },
  'F': { frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], barres: [1], baseFret: 1 },
  'G': { frets: [3, 2, 0, 0, 3, 3], fingers: [2, 1, 0, 0, 3, 4], baseFret: 1 },
  'A': { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  'B': { frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], barres: [2], baseFret: 1 },

  // Minor chords
  'Cm': { frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], barres: [3], baseFret: 1 },
  'Dm': { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], baseFret: 1 },
  'Em': { frets: [0, 2, 2, 0, 0, 0], fingers: [0, 1, 2, 0, 0, 0], baseFret: 1 },
  'Fm': { frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], barres: [1], baseFret: 1 },
  'Gm': { frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], barres: [3], baseFret: 1 },
  'Am': { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], baseFret: 1 },
  'Bm': { frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], barres: [2], baseFret: 1 },

  // Sharps & Flats
  'C#': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barres: [4], baseFret: 1 },
  'Db': { frets: [-1, 4, 6, 6, 6, 4], fingers: [0, 1, 2, 3, 4, 1], barres: [4], baseFret: 1 },
  'D#': { frets: [-1, 6, 8, 8, 8, 6], barres: [6], baseFret: 1 },
  'Eb': { frets: [-1, 6, 8, 8, 8, 6], barres: [6], baseFret: 1 },
  'F#': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barres: [2], baseFret: 1 },
  'Gb': { frets: [2, 4, 4, 3, 2, 2], fingers: [1, 3, 4, 2, 1, 1], barres: [2], baseFret: 1 },
  'G#': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barres: [4], baseFret: 1 },
  'Ab': { frets: [4, 6, 6, 5, 4, 4], fingers: [1, 3, 4, 2, 1, 1], barres: [4], baseFret: 1 },
  'A#': { frets: [-1, 1, 3, 3, 3, 1], barres: [1], baseFret: 1 },
  'Bb': { frets: [-1, 1, 3, 3, 3, 1], barres: [1], baseFret: 1 },

  // Minor Sharps & Flats
  'C#m': { frets: [-1, 4, 6, 6, 5, 4], fingers: [0, 1, 3, 4, 2, 1], barres: [4], baseFret: 1 },
  'D#m': { frets: [-1, 6, 8, 8, 7, 6], fingers: [0, 1, 3, 4, 2, 1], barres: [6], baseFret: 1 },
  'Ebm': { frets: [-1, 6, 8, 8, 7, 6], barres: [6], baseFret: 1 },
  'F#m': { frets: [2, 4, 4, 2, 2, 2], fingers: [1, 3, 4, 1, 1, 1], barres: [2], baseFret: 1 },
  'G#m': { frets: [4, 6, 6, 4, 4, 4], fingers: [1, 3, 4, 1, 1, 1], barres: [4], baseFret: 1 },
  'Abm': { frets: [4, 6, 6, 4, 4, 4], barres: [4], baseFret: 1 },
  'Bbm': { frets: [-1, 1, 3, 3, 2, 1], barres: [1], baseFret: 1 },

  // Seventh chords
  'C7': { frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], baseFret: 1 },
  'D7': { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], baseFret: 1 },
  'E7': { frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], baseFret: 1 },
  'G7': { frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], baseFret: 1 },
  'A7': { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 1, 0, 2, 0], baseFret: 1 },
  'B7': { frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], baseFret: 1 },
  'Am7': { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], baseFret: 1 },
  'Em7': { frets: [0, 2, 2, 0, 3, 3], fingers: [0, 1, 2, 0, 3, 4], baseFret: 1 },
  'Dm7': { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], barres: [1], baseFret: 1 },
  'Bm7': { frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 1, 0, 2, 0, 3], baseFret: 1 },
  'F#m7': { frets: [2, 4, 2, 2, 2, 2], fingers: [1, 3, 1, 1, 1, 1], barres: [2], baseFret: 1 },
  'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], baseFret: 1 },
  'Fmaj7': { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], baseFret: 1 },
  'Gmaj7': { frets: [3, 2, 0, 0, 0, 2], fingers: [2, 1, 0, 0, 0, 3], baseFret: 1 },

  // Suspended & Add chords (very common in worship/Hakuna)
  'Cadd9': { frets: [-1, 3, 2, 0, 3, 3], fingers: [0, 2, 1, 0, 3, 4], baseFret: 1 },
  'Dsus4': { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], baseFret: 1 },
  'Dsus2': { frets: [-1, -1, 0, 2, 3, 0], fingers: [0, 0, 0, 1, 2, 0], baseFret: 1 },
  'Asus4': { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], baseFret: 1 },
  'Asus2': { frets: [-1, 0, 2, 2, 0, 0], fingers: [0, 0, 1, 2, 0, 0], baseFret: 1 },
  'Esus4': { frets: [0, 2, 2, 2, 0, 0], fingers: [0, 2, 3, 4, 0, 0], baseFret: 1 },
  // Fifth string muted: fretting it at 2 adds a B, which makes the chord G(add4), not sus4.
  'Gsus4': { frets: [3, -1, 0, 0, 1, 3], fingers: [2, 0, 0, 0, 1, 3], baseFret: 1 },

  // Slash chords
  'D/F#': { frets: [2, 0, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3], baseFret: 1 },
  'G/B': { frets: [-1, 2, 0, 0, 3, 3], fingers: [0, 1, 0, 0, 3, 4], baseFret: 1 },
  'C/E': { frets: [0, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], baseFret: 1 },
  'A/C#': { frets: [-1, 4, 2, 2, 2, -1], fingers: [0, 4, 1, 2, 3, 0], baseFret: 1 },
  'E/G#': { frets: [4, 2, 2, 4, 0, 0], fingers: [3, 1, 2, 4, 0, 0], baseFret: 1 },
  'F/A': { frets: [-1, 0, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], baseFret: 1 },
};

export interface CuratedVariation {
  position: ChordPosition;
  description: string;
}

/**
 * Hand-picked alternatives that can't be derived from a movable shape: open
 * voicings with a different top note, reduced forms for beginners, and so on.
 * Movable barré positions don't belong here; guitarChords.ts computes those
 * for every root, so they keep working after any transposition.
 */
export const CHORD_VARIATIONS: Record<string, CuratedVariation[]> = {
  C: [
    {
      position: { frets: [-1, 3, 2, 0, 1, 3], fingers: [0, 3, 2, 0, 1, 4] },
      description: 'Abierto, con Sol arriba',
    },
  ],
  G: [
    {
      position: { frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3] },
      description: 'Abierto clásico',
    },
  ],
  Em: [
    {
      position: { frets: [0, 2, 2, 0, 0, 3], fingers: [0, 1, 2, 0, 0, 4] },
      description: 'Abierto, con Sol arriba',
    },
  ],
  F: [
    {
      position: { frets: [-1, -1, 3, 2, 1, 1], fingers: [0, 0, 3, 2, 1, 1], barres: [1] },
      description: 'Forma reducida, sin barré completo',
    },
  ],
  Bm: [
    {
      position: { frets: [-1, -1, 4, 4, 3, 2], fingers: [0, 0, 3, 4, 2, 1] },
      description: 'Forma reducida, sin barré',
    },
  ],
  Cadd9: [
    {
      position: { frets: [-1, 3, 2, 0, 3, 0], fingers: [0, 2, 1, 0, 3, 0] },
      description: 'Abierto, primera cuerda al aire',
    },
  ],
  'D/F#': [
    {
      position: { frets: [2, -1, 0, 2, 3, 2], fingers: [1, 0, 0, 2, 4, 3] },
      description: 'Quinta cuerda apagada',
    },
  ],
  'G/B': [
    {
      position: { frets: [-1, 2, 0, 0, 0, 3], fingers: [0, 1, 0, 0, 0, 3] },
      description: 'Abierto, con Sol arriba',
    },
  ],
};

/** True when the dictionary has this exact chord, not a simplified stand-in. */
export function hasExactFingering(chord: string): boolean {
  return Boolean(chord && CHORD_DATABASE[chord.trim()]);
}

/**
 * Returns guitar chord diagram information, or falls back to root chord if modifier isn't exact
 */
export function getChordFingering(chord: string): ChordPosition | null {
  if (!chord) return null;
  const clean = chord.trim();

  // 1. Direct match
  if (CHORD_DATABASE[clean]) {
    return CHORD_DATABASE[clean];
  }

  // 2. Try matching root note for slash chords if full chord not found (e.g. "E/G#" -> "E")
  if (clean.includes('/')) {
    const [rootPart] = clean.split('/');
    if (CHORD_DATABASE[rootPart]) {
      return CHORD_DATABASE[rootPart];
    }
  }

  // 3. Try removing extra complex extensions (e.g. "Am9" -> "Am7" -> "Am")
  const match = clean.match(/^([A-G][#b]?)(m|maj|sus|dim|aug)?/);
  if (match) {
    const simplified = match[1] + (match[2] === 'm' ? 'm' : '');
    if (CHORD_DATABASE[simplified]) {
      return CHORD_DATABASE[simplified];
    }
    if (CHORD_DATABASE[match[1]]) {
      return CHORD_DATABASE[match[1]];
    }
  }

  return null;
}
