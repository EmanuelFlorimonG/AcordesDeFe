/**
 * Activities of the ministry: when and where something happens.
 *
 * An activity is not a setlist. A setlist is repertoire; an activity is a
 * Mass on Sunday at 6 PM, a Friday rehearsal, a meeting with no songs at all.
 * An activity may point at a setlist, and it has its own team: who is called
 * for that day, which is not always who prepared the repertoire.
 */

export type MinistryEventType =
  | 'mass'
  | 'rehearsal'
  | 'adoration'
  | 'retreat'
  | 'meeting'
  | 'community'
  | 'special'
  | 'other';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly';

/**
 * What became of one date of an activity. Only an explicit action changes it:
 * a date going by never makes an activity "done", because it may have been
 * cancelled, changed, or never happened.
 */
export type EventStatus = 'scheduled' | 'completed' | 'cancelled';
/** The statuses that are stored; anything else is still scheduled. */
export type ClosedEventStatus = Exclude<EventStatus, 'scheduled'>;

/**
 * A simple repeating rule. Every occurrence is the same activity on another
 * date; the series is edited as a whole. `excludedDates` removes single dates
 * from the series, and is the place where "only this Friday" changes can be
 * attached later (an exception keyed by the date it replaces).
 */
export interface EventRecurrence {
  frequency: RecurrenceFrequency;
  /** Last date that can have an occurrence, inclusive; null repeats with no end */
  until: string | null;
  excludedDates: string[];
}

export interface MinistryEvent {
  /** Stable: history and sharing will point at it later */
  id: string;
  title: string;
  type: MinistryEventType;
  /** The day, as YYYY-MM-DD on the local wall calendar (the first one, if it repeats) */
  date: string;
  allDay: boolean;
  /** HH:MM, local wall clock; null for all-day activities */
  startTime: string | null;
  /** Optional, never earlier than the start; null when no end was given */
  endTime: string | null;
  location: string;
  notes: string;
  /** The repertoire, by id only; null when the activity has none */
  setlistId: string | null;
  /** Who is called for this activity, by member id. Independent of the setlist's team. */
  participantIds: string[];
  recurrence: EventRecurrence | null;
  /**
   * The dates that were closed, as "YYYY-MM-DD" → status. A single activity
   * uses its own date; a series closes one date at a time, so marking one
   * Friday as done never touches the others. A date missing here is scheduled.
   */
  occurrenceStatuses: Record<string, ClosedEventStatus>;
  createdAt: number;
  updatedAt: number;
}

/** The editable fields, as entered in the form. Statuses change only through their own actions. */
export type MinistryEventDetails = Omit<MinistryEvent, 'id' | 'createdAt' | 'updatedAt' | 'occurrenceStatuses'>;

/** One appearance of an activity on the calendar: itself for a single one, one date of a series. */
export interface EventOccurrence {
  event: MinistryEvent;
  date: string;
  /** Unique across the calendar: "<event id>@<date>" */
  key: string;
  /** What became of this date */
  status: EventStatus;
}
