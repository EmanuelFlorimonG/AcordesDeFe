/**
 * The history of what was actually sung: one record per activity date that
 * someone explicitly closed as done, with its repertoire.
 *
 * A record is a snapshot, not a view: it answers "what happened that day",
 * never "how is the setlist configured now". Everything needed to read it is
 * copied in when it is created (titles, keys, names, the arrangement), and the
 * ids next to those copies are only references: when the song, the setlist,
 * the member or the activity changes or disappears, the record still reads
 * exactly as it did.
 */

import type { MinistryEventType } from './event';
import type { MinistryRole } from './ministry';
import type { SongTransitionType, VoiceRole } from './setlist';

/** A person as they were on that day. */
export interface PerformancePerson {
  /** Reference to the member; may point at nobody once they are deleted */
  memberId: string;
  /** The name they had that day. Renaming the member later does not change it. */
  name: string;
}

/** Someone of the team of that day, with the roles they had then. */
export interface PerformanceParticipant extends PerformancePerson {
  roles: MinistryRole[];
}

/** What followed a section, as it was read that day. */
export type PerformanceSectionTransition =
  | { type: 'continue' }
  | { type: 'end' }
  /** The label of the section it jumped to ("Coro (2)"), not its id */
  | { type: 'jump'; targetLabel: string };

/**
 * One block of the arrangement used that day. No lyrics and no chords: only
 * how it was performed.
 */
export interface PerformanceSection {
  /** The name it was read by that day: "Verso 1", "Coro (2)" */
  label: string;
  /** Reference to the song's section at the time; never needed to read the record */
  sourceSectionId: string | null;
  repeatCount: number;
  voices: VoiceRole[];
  /** Who sang it, as assigned in the arrangement */
  assigned: PerformancePerson[];
  instruction: string;
  transition: PerformanceSectionTransition;
}

/** One song of the repertoire prepared for that day. */
export interface PerformanceSong {
  /** Identity of this entry inside the record */
  id: string;
  /** Reference to the songbook; the song may no longer exist */
  songId: string;
  title: string;
  /** "" when the song had no artist */
  artist: string;
  /** "Entrada", "Comunión"… "" when none was written */
  moment: string;
  /** False when it was prepared but not sung: kept so the record says what was left out */
  performed: boolean;
  /** The key the congregation heard (sounding key). Null when the song has no key. */
  key: string | null;
  /** With a capo, the key of the chord shapes that were played; null without a capo */
  chordKey: string | null;
  capoFret: number;
  /** Semitones from the song as written, as configured that day */
  transposeSteps: number;
  /**
   * The arrangement as it was played, when one had been prepared. Null means
   * the song was played as written, with nothing decided about voices or
   * repeats.
   */
  sections: PerformanceSection[] | null;
  /** The note of the setlist entry that day ("Intro solo piano") */
  notes: string;
  /** How it led into the next song, when that was decided and it wasn't the last one */
  transitionToNext: { type: SongTransitionType; instruction: string } | null;
}

/** The activity as it was that day. */
export interface PerformanceEventSnapshot {
  title: string;
  type: MinistryEventType;
  allDay: boolean;
  startTime: string | null;
  location: string;
}

export interface PerformanceRecord {
  id: string;
  /** With `occurrenceDate`, identifies the date closed; at most one record each */
  eventId: string;
  /** The date that happened: the activity's own date, or one date of its series */
  occurrenceDate: string;
  event: PerformanceEventSnapshot;
  /** Reference to the setlist used; it may be deleted or changed since */
  setlistId: string | null;
  setlistName: string;
  participants: PerformanceParticipant[];
  /** Every prepared song, in the setlist's order; `performed` says which were sung */
  songs: PerformanceSong[];
  /** About that day: "Se omitió el Ofertorio por falta de tiempo." */
  notes: string;
  createdAt: number;
  updatedAt: number;
}
