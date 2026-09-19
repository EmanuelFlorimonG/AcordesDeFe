import type { ChoirPart } from '../utils/voiceParts';

/**
 * The people of the ministry.
 *
 * A member is a person the ministry counts on, not an account: nobody logs in
 * as a member. A later phase may link a member to a user account, and nothing
 * here assumes one exists.
 */

/** What someone does in the ministry. Several at once are normal. */
export type MinistryRole = 'director' | 'singer' | 'musician' | 'coordinator' | 'sound' | 'other';

/** What someone plays. Separate from roles: a director can also play guitar. */
export type MinistryInstrument = 'guitar' | 'keys' | 'bass' | 'drums' | 'percussion' | 'other';

/**
 * The part someone usually sings. It describes the person; an arrangement's
 * VoiceRole describes a section ("sopranos sing this"). They are related but
 * never inferred from each other, and never from a name.
 */
export type VocalPart = ChoirPart;

export interface MinistryMember {
  /** Stable and unique: two people can share a name */
  id: string;
  name: string;
  roles: MinistryRole[];
  instruments: MinistryInstrument[];
  vocalParts: VocalPart[];
  notes: string;
  /** Inactive members keep every reference to them; they just aren't offered for new ones. */
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

/** The editable fields of a member, as entered in its form. */
export interface MinistryMemberDetails {
  name: string;
  roles: MinistryRole[];
  instruments: MinistryInstrument[];
  vocalParts: VocalPart[];
  notes: string;
  isActive: boolean;
}

/**
 * "When María sings this song, we usually prepare it in Bb." A saved habit,
 * not a rule, not a recommendation and not a record of what was sung.
 */
export interface SingerKeyPreference {
  memberId: string;
  songId: string;
  /** A key the music engine understands: "Bb", "C#", "F#m" */
  key: string;
  updatedAt: number;
}
