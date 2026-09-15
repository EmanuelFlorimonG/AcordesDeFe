/**
 * Chord quality: what the suffix of a chord symbol means, independent of any
 * instrument. The piano engine turns it into keys to press and the guitar
 * engine into movable shapes, so both read the same definition of "m7" or
 * "sus4" and can never disagree.
 */

/**
 * An interval is both a distance in semitones and a distance in letter names,
 * because those two are not the same thing: the third of Cm is 3 semitones up
 * *and* two letters up from C, which makes it Eb and not D#. Tracking the
 * letter step is what keeps note spelling musically correct.
 */
export interface Interval {
  semitones: number;
  /** Letter steps above the root: 2 = a third, 4 = a fifth, 6 = a seventh. */
  degree: number;
}

const ROOT: Interval = { semitones: 0, degree: 0 };
const NINTH: Interval = { semitones: 2, degree: 1 };
const MINOR_3RD: Interval = { semitones: 3, degree: 2 };
const MAJOR_3RD: Interval = { semitones: 4, degree: 2 };
const FOURTH: Interval = { semitones: 5, degree: 3 };
const DIM_5TH: Interval = { semitones: 6, degree: 4 };
const PERFECT_5TH: Interval = { semitones: 7, degree: 4 };
const AUG_5TH: Interval = { semitones: 8, degree: 4 };
const SIXTH: Interval = { semitones: 9, degree: 5 };
const DIM_7TH: Interval = { semitones: 9, degree: 6 };
const MINOR_7TH: Interval = { semitones: 10, degree: 6 };
const MAJOR_7TH: Interval = { semitones: 11, degree: 6 };

export type QualityKey =
  | 'major'
  | 'minor'
  | 'dom7'
  | 'maj7'
  | 'm7'
  | 'sus2'
  | 'sus4'
  | 'dom7sus4'
  | 'add9'
  | 'madd9'
  | 'dim'
  | 'dim7'
  | 'm7b5'
  | 'aug'
  | 'maj6'
  | 'min6'
  | 'dom9'
  | 'm9'
  | 'maj9';

/** Chord tones in root-position order: root, third, fifth, seventh, then extensions. */
const QUALITY_INTERVALS: Record<QualityKey, Interval[]> = {
  major: [ROOT, MAJOR_3RD, PERFECT_5TH],
  minor: [ROOT, MINOR_3RD, PERFECT_5TH],
  dom7: [ROOT, MAJOR_3RD, PERFECT_5TH, MINOR_7TH],
  maj7: [ROOT, MAJOR_3RD, PERFECT_5TH, MAJOR_7TH],
  m7: [ROOT, MINOR_3RD, PERFECT_5TH, MINOR_7TH],
  sus2: [ROOT, NINTH, PERFECT_5TH],
  sus4: [ROOT, FOURTH, PERFECT_5TH],
  dom7sus4: [ROOT, FOURTH, PERFECT_5TH, MINOR_7TH],
  add9: [ROOT, MAJOR_3RD, PERFECT_5TH, NINTH],
  madd9: [ROOT, MINOR_3RD, PERFECT_5TH, NINTH],
  dim: [ROOT, MINOR_3RD, DIM_5TH],
  dim7: [ROOT, MINOR_3RD, DIM_5TH, DIM_7TH],
  m7b5: [ROOT, MINOR_3RD, DIM_5TH, MINOR_7TH],
  aug: [ROOT, MAJOR_3RD, AUG_5TH],
  maj6: [ROOT, MAJOR_3RD, PERFECT_5TH, SIXTH],
  min6: [ROOT, MINOR_3RD, PERFECT_5TH, SIXTH],
  dom9: [ROOT, MAJOR_3RD, PERFECT_5TH, MINOR_7TH, NINTH],
  m9: [ROOT, MINOR_3RD, PERFECT_5TH, MINOR_7TH, NINTH],
  maj9: [ROOT, MAJOR_3RD, PERFECT_5TH, MAJOR_7TH, NINTH],
};

/**
 * Chord suffix as written -> quality key. Case matters in places ("m7" is a
 * minor seventh, "M7" is a major seventh), so this is an explicit table
 * rather than a lowercased lookup.
 */
const QUALITY_ALIASES: Record<string, QualityKey> = {
  '': 'major',
  M: 'major',
  maj: 'major',
  major: 'major',

  m: 'minor',
  '-': 'minor',
  min: 'minor',
  minor: 'minor',

  '7': 'dom7',
  dom7: 'dom7',

  maj7: 'maj7',
  Maj7: 'maj7',
  MAJ7: 'maj7',
  M7: 'maj7',
  '7M': 'maj7',

  m7: 'm7',
  min7: 'm7',
  '-7': 'm7',

  sus: 'sus4',
  sus2: 'sus2',
  '2': 'sus2',
  sus4: 'sus4',
  '4': 'sus4',
  '7sus4': 'dom7sus4',
  '7sus': 'dom7sus4',

  add9: 'add9',
  add2: 'add9',
  madd9: 'madd9',
  madd: 'madd9',
  madd2: 'madd9',

  dim: 'dim',
  dim7: 'dim7',
  m7b5: 'm7b5',

  aug: 'aug',

  '6': 'maj6',
  m6: 'min6',
  '9': 'dom9',
  m9: 'm9',
  maj9: 'maj9',
  M9: 'maj9',
};

/** Symbols musicians write instead of words. */
function expandSymbolicSuffix(suffix: string): string {
  return suffix
    .replace(/[()]/g, '')
    .replace(/\s+/g, '')
    .replace(/°7/g, 'dim7')
    .replace(/°/g, 'dim')
    .replace(/ø/g, 'm7b5')
    .replace(/Δ/g, 'maj7')
    .replace(/\+/g, 'aug');
}

export interface ChordQuality {
  key: QualityKey;
  intervals: Interval[];
  /** True when the exact suffix wasn't known and a base triad was assumed. */
  approximate: boolean;
}

export function resolveChordQuality(rawSuffix: string): ChordQuality {
  const suffix = expandSymbolicSuffix(rawSuffix);
  const key = QUALITY_ALIASES[suffix];

  if (key) {
    return { key, intervals: QUALITY_INTERVALS[key], approximate: false };
  }

  // Unknown extension: fall back to the underlying triad and flag it, so the
  // UI can say the diagram is approximate instead of pretending it's exact.
  const isMinor = /^(m|min|-)(?!aj)/.test(suffix);
  const fallback: QualityKey = isMinor ? 'minor' : 'major';
  return { key: fallback, intervals: QUALITY_INTERVALS[fallback], approximate: true };
}

/** Every quality the engine knows, e.g. for exhaustive tests. */
export const SUPPORTED_QUALITIES = Object.keys(QUALITY_INTERVALS) as QualityKey[];

export function getQualityIntervals(key: QualityKey): Interval[] {
  return QUALITY_INTERVALS[key];
}

/** Qualities built on a minor third: the tonic of a minor key. */
export function isMinorQuality(key: QualityKey): boolean {
  return QUALITY_INTERVALS[key].some((interval) => interval.semitones === 3 && interval.degree === 2);
}
