/**
 * Calendar dates and wall-clock times, in one place.
 *
 * How dates are kept: a day is a "YYYY-MM-DD" string and a time is "HH:MM"
 * (24 h), both read as the local wall clock of whoever uses the app. That is
 * what an activity is: "Sunday the 20th at 6 PM at the parish". Stored this
 * way, an event never moves because a browser, a server or a daylight-saving
 * change thinks in another zone, and sorting and grouping are plain string
 * comparisons. If the ministry ever spans several time zones, an event can
 * gain an optional time zone field and keep every date it already has.
 *
 * Nothing here parses display text; everything shown is formatted with Intl,
 * in Spanish, so month and day names are never written out by hand.
 */

export const LOCALE = 'es';

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const pad = (value: number) => String(value).padStart(2, '0');

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidIsoDate(value: string): boolean {
  const match = value.match(DATE_PATTERN);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** True for a wall-clock time written as HH:MM, from 00:00 to 23:59. */
export function isValidTime(value: string): boolean {
  return TIME_PATTERN.test(value);
}

/** Today (or any date) as YYYY-MM-DD in local time, never shifted by time zones. */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The current wall-clock time as HH:MM. */
export function toLocalTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** A date key as a local Date at midnight (for arithmetic and Intl only). */
function toDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(isoDate: string, days: number): string {
  const date = toDate(isoDate);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

/** 0 = Monday … 6 = Sunday: the week starts on Monday here. */
export function weekdayIndex(isoDate: string): number {
  return (toDate(isoDate).getDay() + 6) % 7;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** A month as { year, month } with month from 1 to 12. */
export interface CalendarMonth {
  year: number;
  month: number;
}

export function monthOf(isoDate: string): CalendarMonth {
  const [year, month] = isoDate.split('-').map(Number);
  return { year, month };
}

export function shiftMonth({ year, month }: CalendarMonth, delta: number): CalendarMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function firstDayOfMonth({ year, month }: CalendarMonth): string {
  return `${year}-${pad(month)}-01`;
}

export function lastDayOfMonth({ year, month }: CalendarMonth): string {
  return `${year}-${pad(month)}-${pad(daysInMonth(year, month))}`;
}

/** The same day in another month, or null when that month is too short (the 31st). */
export function sameDayInMonth(isoDate: string, delta: number): string | null {
  const day = Number(isoDate.slice(8, 10));
  const target = shiftMonth(monthOf(isoDate), delta);
  if (day > daysInMonth(target.year, target.month)) return null;
  return `${target.year}-${pad(target.month)}-${pad(day)}`;
}

/**
 * The weeks a month grid shows, Monday to Sunday, as date keys: whole weeks
 * only, so the first and last rows include days of the neighbouring months.
 */
export function monthGrid(month: CalendarMonth): string[][] {
  const first = firstDayOfMonth(month);
  const last = lastDayOfMonth(month);
  let day = addDays(first, -weekdayIndex(first));
  const end = addDays(last, 6 - weekdayIndex(last));
  const weeks: string[][] = [];
  while (day <= end) {
    const week: string[] = [];
    for (let index = 0; index < 7; index++) {
      week.push(day);
      day = addDays(day, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

// ---------------------------------------------------------------------------
// Showing dates (Intl, Spanish)
// ---------------------------------------------------------------------------

const capitalize = (text: string) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);

/** "Septiembre 2026" */
export function formatMonthTitle(month: CalendarMonth): string {
  const date = toDate(firstDayOfMonth(month));
  const name = new Intl.DateTimeFormat(LOCALE, { month: 'long' }).format(date);
  return `${capitalize(name)} ${month.year}`;
}

/** Monday to Sunday, short: ["lun", "mar", …], from Intl rather than a list. */
export function weekdayNames(style: 'short' | 'narrow' = 'short'): string[] {
  const monday = toDate('2024-01-01'); // a Monday
  const format = new Intl.DateTimeFormat(LOCALE, { weekday: style });
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return format.format(date).replace('.', '');
  });
}

/** "Domingo 20 de septiembre" (and the year when it isn't this year's). */
export function formatLongDate(isoDate: string, todayIso?: string): string {
  const date = toDate(isoDate);
  const withYear = todayIso !== undefined && isoDate.slice(0, 4) !== todayIso.slice(0, 4);
  const text = new Intl.DateTimeFormat(LOCALE, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  }).format(date);
  return capitalize(text.replace(',', ''));
}

/** "20 sep" */
export function formatShortDate(isoDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' }).format(toDate(isoDate)).replace('.', '');
}

/** "Domingo" */
export function formatWeekday(isoDate: string): string {
  return capitalize(new Intl.DateTimeFormat(LOCALE, { weekday: 'long' }).format(toDate(isoDate)));
}

/** "6:00 p. m." from "18:00", as the browser's Spanish writes it. */
export function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date(2024, 0, 1, hours, minutes);
  return new Intl.DateTimeFormat(LOCALE, { hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}
