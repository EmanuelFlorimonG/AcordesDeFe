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
