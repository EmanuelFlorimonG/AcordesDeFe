import type { LiturgicalSeasonId } from '../data/liturgicalSeasons';

// Open-ended: categories are driven by song data (see categoryStyle.ts for
// the known liturgical/style categories), plus the 'Todas' and 'Favoritas'
// sentinel values used by the dashboard filters.
export type SongCategory = string;

export interface ChordPosition {
  frets: number[]; // 6 strings from 6th (E low) to 1st (E high), -1 for muted (x), 0 for open
  fingers?: number[]; // finger numbers (1-4)
  barres?: number[]; // fret number for barre
  baseFret?: number; // base fret (default 1)
}

export interface ChordLineSegment {
  chord?: string;
  lyric: string;
}

/** The musical role of a section, whatever word the author used for it. */
export type SectionKind =
  | 'intro'
  | 'verso'
  | 'precoro'
  | 'coro'
  | 'postcoro'
  | 'puente'
  | 'instrumental'
  | 'interludio'
  | 'solo'
  | 'final'
  /** A label that isn't a standard section: "Primera Parte", "Hombres"… */
  | 'otro';

/**
 * How a header was written, which decides what it covers:
 * - "bracket": [Coro]  covers every line until the next header
 * - "label":   Coro:   covers only the stanza right below it
 * - "cue":     Coro    covers nothing; it means "sing that section here"
 */
export type SectionHeaderForm = 'bracket' | 'label' | 'cue';

export interface SectionHeader {
  kind: SectionKind;
  form: SectionHeaderForm;
  /** Name as the author wrote it, e.g. "Verso 1", "Estribillo", "Primera Parte" */
  label: string;
  number?: number;
  /** Performance hint written after the name, e.g. the "suave" of "Final suave:" */
  note?: string;
  /** Times to repeat, from "(x2)" or "(bis)" */
  repeat?: number;
}

export interface ParsedLine {
  type: 'section' | 'chords-lyrics' | 'comment' | 'empty';
  raw: string;
  sectionTitle?: string;
  section?: SectionHeader;
  segments?: ChordLineSegment[];
}

/**
 * A block of lines under one header. This is the unit that later features hang
 * off: choir notes, voice distribution and auto-scroll anchors belong to a
 * section, so they can be added here without reparsing song text.
 */
export interface SongSection {
  /** Stable within a song, e.g. "section-3"; usable as a DOM anchor */
  id: string;
  /** Null for lines that come before the first header */
  header: SectionHeader | null;
  lines: ParsedLine[];
  /**
   * When a header appears with nothing under it (a bare "Coro" after the
   * chorus was already written out), the id of the section it repeats. Its
   * `lines` are then that section's lines, so the words appear again, while
   * the section keeps its own id: every appearance is still its own section.
   */
  repeatOf?: string;
}

export interface Song {
  id: string;
  title: string;
  artist?: string;
  originalKey?: string;
  recommendedCapo?: number;
  timeSignature?: string;
  tempo?: number; // BPM
  /** Strumming or rhythm pattern, written freely, e.g. "↓ ↓↑ ↑↓↑" */
  rhythmPattern?: string;
  categories: string[];
  /**
   * Liturgical seasons the song suits, independent of its categories. Absent
   * or empty means not classified yet. Read it through getSongSeasons().
   */
  liturgicalSeasons?: LiturgicalSeasonId[];
  tags: string[];
  content: string; // Bracket notation [G] or standard chord/lyric lines
  chordsUsed: string[];
  difficulty?: 'Fácil' | 'Intermedio' | 'Avanzado';
  year?: string;
  youtubeId?: string; // YouTube video id used for in-app audio playback
}

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  createdAt: number;
}

/** Which instrument the chord diagrams are drawn for. */
export type Instrument = 'guitarra' | 'piano';

export interface ViewSettings {
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  showChords: boolean;
  twoColumns: boolean;
  transposeSteps: number; // -11 to +11 semitones
  capoFret: number; // 0 to 7
}
