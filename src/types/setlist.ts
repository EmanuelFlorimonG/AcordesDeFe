/**
 * A setlist is one concrete occasion: a Sunday Mass, a retreat, a Friday
 * rehearsal. Its songs are kept in the order they will be played, each with
 * the settings chosen for that occasion. Songs themselves are never modified:
 * a setlist only refers to them by id.
 */

export interface SetlistItem {
  /**
   * Unique within the setlist, and different from the song id, so the same
   * song can appear twice (an opening and a closing reprise).
   */
  id: string;
  songId: string;
  /** Moment of the occasion, written freely: "Entrada", "Comunión", "Dinámica"… */
  moment: string;
  /** Semitones from the song as written, for this occasion only. */
  transposeSteps: number;
  /** Capo fret for this occasion only. */
  capoFret: number;
  /** Notes for this arrangement: "Intro solo piano", "Último coro x2". */
  notes: string;
}

export interface Setlist {
  id: string;
  name: string;
  /** Calendar date of the occasion as "YYYY-MM-DD", or "" when not set. */
  date: string;
  description: string;
  /** Playing order is the array order. */
  items: SetlistItem[];
  createdAt: number;
  updatedAt: number;
}

/** The editable details of a setlist, as entered in its form. */
export interface SetlistDetails {
  name: string;
  date: string;
  description: string;
}

/**
 * One song being played as part of a setlist. The song viewer and rehearsal
 * mode receive this instead of reaching for setlists themselves: they show the
 * settings of this occasion and move along it, while the song stays untouched.
 */
export interface SetlistStep {
  title: string;
  moment: string;
  onSelect: () => void;
}

export interface SetlistPlayback {
  setlistId: string;
  setlistName: string;
  item: SetlistItem;
  /** 1-based, counting only songs that can be opened */
  position: number;
  total: number;
  previous: SetlistStep | null;
  /** Null on the last song: a setlist ends, it doesn't start over. */
  next: SetlistStep | null;
  onBackToSetlist: () => void;
  /** Opens the same song as it is in the songbook, with no setlist settings. */
  onViewOriginal: () => void;
  /** Saves a new key or capo for this occasion only. */
  onKeySettingsChange: (settings: { transposeSteps: number; capoFret: number }) => void;
}
