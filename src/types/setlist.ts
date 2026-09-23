/**
 * A setlist is one concrete occasion: a Sunday Mass, a retreat, a Friday
 * rehearsal. Its songs are kept in the order they will be played, each with
 * the settings chosen for that occasion. Songs themselves are never modified:
 * a setlist only refers to them by id.
 */

/**
 * Who sings a section in one arrangement. These are roles, not people: the
 * name of the singer behind "solista" belongs to the members of the ministry,
 * which this phase does not touch.
 */
export type VoiceRole =
  | 'all'
  | 'men'
  | 'women'
  | 'soloist'
  | 'choir'
  | 'soprano'
  | 'alto'
  | 'tenor'
  | 'bass';

/**
 * What happens when a section ends. It is written for the musicians to read,
 * not executed: nothing navigates on its own during rehearsal.
 */
export type ArrangementTransition =
  | { type: 'continue' }
  | { type: 'jump'; targetId: string }
  | { type: 'end' };

/**
 * One block of the arrangement: this song's section, played here, this way.
 *
 * Its id is the identity of this appearance, not of the section: a chorus sung
 * three times is three entries with three ids and one sourceSectionId, so each
 * one can carry its own voices, repeats and instruction, and a jump can name
 * exactly which one to come back to.
 */
export interface ArrangementSection {
  id: string;
  /** The section of the song text it plays ("section-3"), never its name. */
  sourceSectionId: string;
  /**
   * What proves this block plays the right section. Section ids are
   * positions in one version of the song's text, so they only mean something
   * together with the version they were checked against; the signature is
   * what that section actually said (its name and its lines with their
   * chords). A block whose evidence doesn't hold for the version being played
   * is not played at all: someone reviews it. Absent in blocks saved before
   * this was recorded, which are reviewed by hand on any version change.
   */
  source?: { signature: string; version: number };
  /**
   * Set the moment this block could not prove what it plays. It stays set
   * until someone chooses its section, even if a later version of the song
   * happens to say again exactly what the block recorded: having needed a
   * person is not something a new version can undo.
   */
  needsReview?: true;
  /**
   * The name the section had when it was added ("Coro", "Verso 1"). Kept so an
   * arrangement can still be read after the song's text changed.
   */
  label: string;
  /** How many times in a row it is sung, 1 to 4. The lyric is written once. */
  repeatCount: number;
  /** Empty means nobody in particular: everyone sings as usual. */
  voices: VoiceRole[];
  /**
   * The people who sing this block, by member id. It sits next to `voices`
   * and never replaces it: "Solista" says a soloist sings, this says who.
   * Empty (or absent, in arrangements saved before members existed) means
   * nobody has been chosen yet, which is perfectly valid. Names are never
   * copied here, so renaming someone shows the new name everywhere.
   */
  assignedMemberIds?: string[];
  /** Free text for this block: "Piano solo", "Entrar suave". */
  instruction: string;
  transition: ArrangementTransition;
}

/**
 * How a song is played in one setlist: its order, repeats, voices and
 * instructions. It only refers to the song's sections; lyrics and chords are
 * never copied here, and the song itself is never modified.
 */
export interface SetlistArrangement {
  sections: ArrangementSection[];
  /**
   * The published version of the song the arrangement was made on. Section ids
   * are positions in that version's text, so they only mean the same thing
   * while the song is at that version. Absent in arrangements saved before
   * songs had versions: those were all made on version 1.
   */
  songVersion?: number;
}

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
  /**
   * How this song is played on this occasion. Absent means it is played as it
   * is written: an arrangement is only stored once someone changes something,
   * and setlists made before this existed have none.
   */
  arrangement?: SetlistArrangement;
  /**
   * What happens when this song ends and the next one begins. Absent means
   * nothing was decided, which is not the same as deciding to stop. It is
   * ignored while this entry is the last one of the setlist, without being
   * deleted: moving it back up makes it apply again.
   */
  transitionToNext?: SetlistSongTransition;
}

/**
 * How the band gets from one song of the setlist to the next one.
 *
 * It belongs to the song you leave *from*, never to a pair of songs: if the
 * order changes, the indication still describes "when this song ends", which
 * is how musicians think about it.
 *
 * - "stop": the song finishes and there is a pause.
 * - "direct": one song goes straight into the next.
 * - "instrumental": the music keeps playing in between.
 * - "custom": whatever the instruction says.
 */
export type SongTransitionType = 'stop' | 'direct' | 'instrumental' | 'custom';

export interface SetlistSongTransition {
  type: SongTransitionType;
  /** Free text for the musicians: "Terminar en G y mantener 2 compases". */
  instruction: string;
}

export interface Setlist {
  id: string;
  name: string;
  /** Calendar date of the occasion as "YYYY-MM-DD", or "" when not set. */
  date: string;
  description: string;
  /**
   * The members taking part in this celebration, by id. Only ids are kept, so
   * names and roles always come from the member as it is now.
   */
  participantIds: string[];
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
