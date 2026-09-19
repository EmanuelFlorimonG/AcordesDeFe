import type {
  ClosedEventStatus,
  EventOccurrence,
  EventStatus,
  EventRecurrence,
  MinistryEvent,
  MinistryEventDetails,
  MinistryEventType,
  RecurrenceFrequency,
} from '../types/event';
import { createId, type IdFactory } from './createId';
import {
  addDays,
  firstDayOfMonth,
  formatTime,
  isValidIsoDate,
  isValidTime,
  lastDayOfMonth,
  monthOf,
  sameDayInMonth,
  shiftMonth,
  type CalendarMonth,
} from './dates';
import { normalizeMemberIds } from './arrangement';

/**
 * Activities of the ministry as pure functions. Every screen asks these for
 * "what happens on this day", "what comes next", "what is this person
 * called for": nothing filters events its own way.
 */

export const MAX_EVENT_TITLE_LENGTH = 120;
export const MAX_EVENT_LOCATION_LENGTH = 120;
export const MAX_EVENT_NOTES_LENGTH = 500;
/** How far ahead a series is looked at for "upcoming": a year is plenty. */
export const UPCOMING_HORIZON_DAYS = 366;

export const EVENT_TYPES: MinistryEventType[] = [
  'mass',
  'rehearsal',
  'adoration',
  'retreat',
  'meeting',
  'community',
  'special',
  'other',
];

export const EVENT_TYPE_LABELS: Record<MinistryEventType, string> = {
  mass: 'Misa',
  rehearsal: 'Ensayo',
  adoration: 'Adoración',
  retreat: 'Retiro',
  meeting: 'Reunión',
  community: 'Convivencia',
  special: 'Actividad especial',
  other: 'Otro',
};

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'biweekly', 'monthly'];

export const RECURRENCE_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Cada semana',
  biweekly: 'Cada 2 semanas',
  monthly: 'Cada mes',
};

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  scheduled: 'Programada',
  completed: 'Realizada',
  cancelled: 'Cancelada',
};

export function isEventType(value: unknown): value is MinistryEventType {
  return typeof value === 'string' && EVENT_TYPES.includes(value as MinistryEventType);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type EventValidationError = 'title' | 'date' | 'startTime' | 'endTime' | 'until';

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().replace(/[ \t]+/g, ' ').slice(0, max) : '';

function cleanRecurrence(value: Partial<EventRecurrence> | null | undefined, date: string): EventRecurrence | null {
  if (!value || !RECURRENCE_FREQUENCIES.includes(value.frequency as RecurrenceFrequency)) return null;
  const until = typeof value.until === 'string' && isValidIsoDate(value.until) && value.until >= date ? value.until : null;
  const excludedDates = [
    ...new Set((Array.isArray(value.excludedDates) ? value.excludedDates : []).filter(
      (entry): entry is string => typeof entry === 'string' && isValidIsoDate(entry)
    )),
  ].sort();
  return { frequency: value.frequency as RecurrenceFrequency, until, excludedDates };
}

/** The fields as they would be stored: trimmed, bounded, times dropped for all-day. */
export function cleanEventDetails(details: Partial<MinistryEventDetails>): MinistryEventDetails {
  const date = typeof details.date === 'string' ? details.date.trim() : '';
  const allDay = Boolean(details.allDay);
  const startTime = !allDay && typeof details.startTime === 'string' && isValidTime(details.startTime) ? details.startTime : null;
  const endTime =
    !allDay && startTime && typeof details.endTime === 'string' && isValidTime(details.endTime) ? details.endTime : null;
  return {
    title: text(details.title, MAX_EVENT_TITLE_LENGTH),
    type: isEventType(details.type) ? details.type : 'other',
    date,
    allDay,
    startTime,
    endTime,
    location: text(details.location, MAX_EVENT_LOCATION_LENGTH),
    notes: typeof details.notes === 'string' ? details.notes.trim().slice(0, MAX_EVENT_NOTES_LENGTH) : '',
    setlistId: typeof details.setlistId === 'string' && details.setlistId.trim() ? details.setlistId.trim() : null,
    participantIds: normalizeMemberIds(details.participantIds),
    recurrence: isValidIsoDate(date) ? cleanRecurrence(details.recurrence, date) : null,
  };
}

/**
 * What is wrong with an activity, if anything: a title, a real date, a start
 * time unless it lasts all day, and an end that is not before the start.
 */
export function validateEventDetails(details: Partial<MinistryEventDetails>): EventValidationError[] {
  const errors: EventValidationError[] = [];
  if (!text(details.title, MAX_EVENT_TITLE_LENGTH)) errors.push('title');
  if (typeof details.date !== 'string' || !isValidIsoDate(details.date.trim())) errors.push('date');
  if (!details.allDay) {
    const start = details.startTime ?? '';
    if (!isValidTime(start)) errors.push('startTime');
    const end = details.endTime ?? '';
    if (end && (!isValidTime(end) || (isValidTime(start) && end < start))) errors.push('endTime');
  }
  const until = details.recurrence?.until;
  if (details.recurrence && until && (!isValidIsoDate(until) || (typeof details.date === 'string' && until < details.date))) {
    errors.push('until');
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Creating and changing (every function returns a new event)
// ---------------------------------------------------------------------------

export function createEvent(
  details: Partial<MinistryEventDetails>,
  { now, createId: makeId = createId }: { now: number; createId?: IdFactory }
): MinistryEvent {
  if (validateEventDetails(details).length > 0) throw new Error('Actividad incompleta.');
  return { id: makeId(), ...cleanEventDetails(details), occurrenceStatuses: {}, createdAt: now, updatedAt: now };
}

export function updateEvent(event: MinistryEvent, details: Partial<MinistryEventDetails>, now: number): MinistryEvent {
  const merged = { ...event, ...details };
  if (validateEventDetails(merged).length > 0) throw new Error('Actividad incompleta.');
  // The statuses stay keyed by the dates they were given: editing the form never closes or reopens anything.
  return { ...event, ...cleanEventDetails(merged), occurrenceStatuses: event.occurrenceStatuses, updatedAt: now };
}

// ---------------------------------------------------------------------------
// Status: scheduled, completed, cancelled (one date at a time)
// ---------------------------------------------------------------------------

/** What became of one date of an activity. Nothing is inferred from the date itself. */
export function getOccurrenceStatus(event: MinistryEvent, date: string): EventStatus {
  return event.occurrenceStatuses[date] ?? 'scheduled';
}

/**
 * Why a status change is not allowed, or null when it is. The rule is kept
 * strict and small:
 *
 * - Programada → Realizada, Programada → Cancelada.
 * - Cancelada → Programada (restore).
 * - Realizada → Programada (reopen), only while no performance record exists
 *   for that date: the record has to be deleted first, so history never
 *   contradicts the calendar silently.
 * - Anything else (Realizada → Cancelada, Cancelada → Realizada) goes through
 *   Programada first.
 */
export type StatusChangeError = 'has-performance' | 'not-allowed';

export function statusChangeError(
  current: EventStatus,
  next: EventStatus,
  hasPerformance: boolean
): StatusChangeError | null {
  if (current === next) return null;
  if (current === 'scheduled') return null;
  if (next !== 'scheduled') return 'not-allowed';
  if (current === 'completed' && hasPerformance) return 'has-performance';
  return null;
}

/** One date closed or reopened; the rest of a series is untouched. */
export function setOccurrenceStatus(event: MinistryEvent, date: string, status: EventStatus, now: number): MinistryEvent {
  if (getOccurrenceStatus(event, date) === status) return event;
  const occurrenceStatuses: Record<string, ClosedEventStatus> = { ...event.occurrenceStatuses };
  if (status === 'scheduled') delete occurrenceStatuses[date];
  else occurrenceStatuses[date] = status;
  return { ...event, occurrenceStatuses, updatedAt: now };
}

/**
 * A single activity that was closed keeps its date: moving it would leave its
 * status (and its history) pointing at a day it no longer has. Reopening it
 * first frees the date again. A series has no such lock: its dates are closed
 * one by one.
 */
export function isDateLocked(event: MinistryEvent): boolean {
  return event.recurrence === null && getOccurrenceStatus(event, event.date) !== 'scheduled';
}

/**
 * The fields of a copy, as a template for a new activity: same title, type,
 * place, team, repertoire and notes, and the date the user chooses. Nothing
 * assumes "a week later", and a copy of a series is a single activity.
 */
export function duplicateEventDetails(event: MinistryEvent): MinistryEventDetails {
  return {
    title: event.title,
    type: event.type,
    date: event.date,
    allDay: event.allDay,
    startTime: event.startTime,
    endTime: event.endTime,
    location: event.location,
    notes: event.notes,
    setlistId: event.setlistId,
    participantIds: [...event.participantIds],
    recurrence: null,
  };
}

/** The team of the activity, replaced (from a picker, or from the setlist's team). */
export function setEventParticipants(event: MinistryEvent, memberIds: string[], now: number): MinistryEvent {
  return { ...event, participantIds: normalizeMemberIds(memberIds), updatedAt: now };
}

export function setEventSetlist(event: MinistryEvent, setlistId: string | null, now: number): MinistryEvent {
  return { ...event, setlistId, updatedAt: now };
}

/** A deleted member is called for nothing anymore. */
export function removeMemberFromEvents(events: MinistryEvent[], memberId: string, now: number): MinistryEvent[] {
  let changed = false;
  const next = events.map((event) => {
    if (!event.participantIds.includes(memberId)) return event;
    changed = true;
    return { ...event, participantIds: event.participantIds.filter((id) => id !== memberId), updatedAt: now };
  });
  return changed ? next : events;
}

/**
 * A deleted setlist leaves its activities in place, without repertoire: the
 * Mass still happens even if its song list is gone.
 */
export function clearSetlistFromEvents(events: MinistryEvent[], setlistId: string, now: number): MinistryEvent[] {
  let changed = false;
  const next = events.map((event) => {
    if (event.setlistId !== setlistId) return event;
    changed = true;
    return { ...event, setlistId: null, updatedAt: now };
  });
  return changed ? next : events;
}

// ---------------------------------------------------------------------------
// Occurrences: when an activity actually happens
// ---------------------------------------------------------------------------

/** A guard against a runaway series; no real range needs more. */
const MAX_OCCURRENCES_PER_RANGE = 1000;

/**
 * The dates an activity happens on between two days, inclusive. A single
 * activity happens once. A weekly series every 7 days, a fortnightly one every
 * 14, a monthly one on the same day of the month — and a month without that
 * day (a series on the 31st in April) simply has no occurrence, rather than
 * moving it to another day nobody chose.
 */
export function occurrenceDates(event: MinistryEvent, from: string, to: string): string[] {
  const { recurrence } = event;
  if (!recurrence) return event.date >= from && event.date <= to ? [event.date] : [];

  const last = recurrence.until && recurrence.until < to ? recurrence.until : to;
  const excluded = new Set(recurrence.excludedDates);
  const dates: string[] = [];

  if (recurrence.frequency === 'monthly') {
    for (let step = 0; dates.length < MAX_OCCURRENCES_PER_RANGE; step++) {
      if (firstDayOfMonth(shiftMonth(monthOf(event.date), step)) > last) break;
      // Too short a month (no 31st in April) has no occurrence.
      const candidate = sameDayInMonth(event.date, step);
      if (candidate && candidate >= from && candidate <= last && !excluded.has(candidate)) dates.push(candidate);
    }
    return dates;
  }

  const every = recurrence.frequency === 'weekly' ? 7 : 14;
  let candidate = event.date;
  // Jump near the start of the range instead of walking from the first date.
  if (candidate < from) {
    const gap = Math.floor(daysBetween(candidate, from) / every) * every;
    candidate = addDays(candidate, gap);
  }
  while (candidate <= last && dates.length < MAX_OCCURRENCES_PER_RANGE) {
    if (candidate >= from && !excluded.has(candidate)) dates.push(candidate);
    candidate = addDays(candidate, every);
  }
  return dates;
}

function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export function occurrenceKey(eventId: string, date: string): string {
  return `${eventId}@${date}`;
}

function toOccurrence(event: MinistryEvent, date: string): EventOccurrence {
  return { event, date, key: occurrenceKey(event.id, date), status: getOccurrenceStatus(event, date) };
}

/**
 * The calendar's order: by day; within a day, all-day activities first, then
 * by start time, then by title. Two activities at the same time are both kept:
 * nothing decides which one is "wrong".
 */
export function compareOccurrences(a: EventOccurrence, b: EventOccurrence): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.event.allDay !== b.event.allDay) return a.event.allDay ? -1 : 1;
  const time = (a.event.startTime ?? '').localeCompare(b.event.startTime ?? '');
  if (time !== 0) return time;
  return a.event.title.localeCompare(b.event.title, 'es') || a.event.id.localeCompare(b.event.id);
}

export function sortOccurrences(occurrences: EventOccurrence[]): EventOccurrence[] {
  return [...occurrences].sort(compareOccurrences);
}

/** Every occurrence of every activity between two days, in calendar order. */
export function occurrencesBetween(events: MinistryEvent[], from: string, to: string): EventOccurrence[] {
  return sortOccurrences(
    events.flatMap((event) =>
      occurrenceDates(event, from, to).map((date) => toOccurrence(event, date))
    )
  );
}

export function getEventsForDate(events: MinistryEvent[], date: string): EventOccurrence[] {
  return occurrencesBetween(events, date, date);
}

/**
 * A month (plus the neighbouring days its grid shows), grouped by day once,
 * so a grid cell looks its day up instead of filtering every event again.
 */
export function getEventsForMonth(
  events: MinistryEvent[],
  month: CalendarMonth,
  range: { from: string; to: string } = { from: firstDayOfMonth(month), to: lastDayOfMonth(month) }
): Map<string, EventOccurrence[]> {
  const byDay = new Map<string, EventOccurrence[]>();
  for (const occurrence of occurrencesBetween(events, range.from, range.to)) {
    const list = byDay.get(occurrence.date);
    if (list) list.push(occurrence);
    else byDay.set(occurrence.date, [occurrence]);
  }
  return byDay;
}

/** "Now", as the calendar compares it: the local day and wall-clock time. */
export interface CalendarNow {
  date: string;
  time: string;
}

/**
 * True when an occurrence is over. An all-day activity lasts until the day
 * ends; a timed one until its end time, or its start time if it has no end.
 */
export function isOccurrencePast(occurrence: EventOccurrence, now: CalendarNow): boolean {
  if (occurrence.date !== now.date) return occurrence.date < now.date;
  if (occurrence.event.allDay) return false;
  const endsAt = occurrence.event.endTime ?? occurrence.event.startTime ?? '23:59';
  return endsAt < now.time;
}

/** What comes next, from now on, in order; never something that is over, cancelled or already done. */
export function getUpcomingEvents(
  events: MinistryEvent[],
  now: CalendarNow,
  limit = 5,
  filter: (event: MinistryEvent) => boolean = () => true
): EventOccurrence[] {
  const upcoming = occurrencesBetween(events.filter(filter), now.date, addDays(now.date, UPCOMING_HORIZON_DAYS)).filter(
    (occurrence) => occurrence.status === 'scheduled' && !isOccurrencePast(occurrence, now)
  );
  return upcoming.slice(0, limit);
}

/** What someone is called for next. */
export function getEventsForMember(
  events: MinistryEvent[],
  memberId: string,
  now: CalendarNow,
  limit = 5
): EventOccurrence[] {
  return getUpcomingEvents(events, now, limit, (event) => event.participantIds.includes(memberId));
}

/**
 * The activities a setlist is used in: the next ones still scheduled, and the
 * most recent earlier dates with whatever status they have (a past date is not
 * a performed one: the list shows each date's status as it is).
 */
export function getEventsForSetlist(
  events: MinistryEvent[],
  setlistId: string,
  now: CalendarNow,
  { upcoming = 5, past = 3 }: { upcoming?: number; past?: number } = {}
): { upcoming: EventOccurrence[]; past: EventOccurrence[] } {
  const own = events.filter((event) => event.setlistId === setlistId);
  const next = getUpcomingEvents(own, now, upcoming);
  const earlier = occurrencesBetween(own, addDays(now.date, -UPCOMING_HORIZON_DAYS), now.date)
    .filter((occurrence) => isOccurrencePast(occurrence, now))
    .reverse()
    .slice(0, past);
  return { upcoming: next, past: earlier };
}

/** An occurrence by route: the event and one of its dates, or null when either is gone. */
export function findOccurrence(events: MinistryEvent[], eventId: string, date?: string | null): EventOccurrence | null {
  const event = events.find((candidate) => candidate.id === eventId);
  if (!event) return null;
  const day = date && isValidIsoDate(date) ? date : event.date;
  if (occurrenceDates(event, day, day).length === 0) {
    // A date the series doesn't have (edited since the link was made): show the event itself.
    return toOccurrence(event, event.date);
  }
  return toOccurrence(event, day);
}

/** The title a type suggests while nothing else was typed. */
export function suggestedTitle(type: MinistryEventType): string {
  return type === 'special' || type === 'other' ? '' : EVENT_TYPE_LABELS[type];
}

/** "6:00 p. m.", "6:00 p. m. a 8:00 p. m." or "Todo el día". */
export function occurrenceTimeLabel(occurrence: Pick<EventOccurrence, 'event'>): string {
  const { event } = occurrence;
  if (event.allDay || !event.startTime) return 'Todo el día';
  return event.endTime ? `${formatTime(event.startTime)} a ${formatTime(event.endTime)}` : formatTime(event.startTime);
}
