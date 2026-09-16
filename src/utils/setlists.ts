import type { Setlist, SetlistDetails, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { MAX_CAPO, MIN_CAPO, moveCapoBy, normalizeKeySettings, transposeBy } from './keySettings';

/**
 * Setlist operations as pure functions: every change returns a new setlist
 * and never touches a song. Persistence and interface sit on top of these, so
 * storage can later move to an API without changing any of this.
 */

export const MAX_SETLIST_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_MOMENT_LENGTH = 40;
export const MAX_NOTES_LENGTH = 500;

/** The parts of a Mass, in the order they are sung. */
export const MASS_MOMENTS = [
  'Entrada',
  'Piedad',
  'Gloria',
  'Aclamación',
  'Ofertorio',
  'Santo',
  'Paz',
  'Cordero',
  'Comunión',
  'Salida',
];

/** Moments offered as suggestions; any other text can be typed. */
export const SUGGESTED_MOMENTS = [
  ...MASS_MOMENTS,
  'Apertura',
  'Adoración',
  'Reflexión',
  'Dinámica',
  'Cierre',
];

export interface SongCategoryCount {
  name: string;
  count: number;
  /** True for the parts of the Mass, which have an order of their own */
  isMassMoment: boolean;
}

/**
 * The categories the songbook actually uses: the parts of the Mass first, in
 * the order they are sung, then the rest (themes and styles) by how many songs
 * carry them. Nothing is invented: a part with no songs simply isn't offered.
 */
export function listSongCategories(songs: Array<Pick<Song, 'categories'>>): SongCategoryCount[] {
  const counts = new Map<string, number>();
  for (const song of songs) {
    for (const category of song.categories) {
      const name = category.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const massMoments = MASS_MOMENTS.filter((name) => counts.has(name)).map((name) => ({
    name,
    count: counts.get(name) ?? 0,
    isMassMoment: true,
  }));

  const others = [...counts.entries()]
    .filter(([name]) => !MASS_MOMENTS.includes(name))
    .map(([name, count]) => ({ name, count, isMassMoment: false }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  return [...massMoments, ...others];
}

export type IdFactory = () => string;

export const createId: IdFactory = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

interface ChangeOptions {
  now: number;
  createId?: IdFactory;
}

type SongForSetlist = Pick<Song, 'id' | 'recommendedCapo'>;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isValidIsoDate(value: string): boolean {
  const match = value.match(DATE_PATTERN);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** Today (or any date) as YYYY-MM-DD in local time, never shifted by time zones. */
export function toLocalIsoDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** "20 sep 2026" */
export function formatSetlistDate(isoDate: string, style: 'short' | 'long' = 'short'): string {
  if (!isValidIsoDate(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    ...(style === 'long' ? { weekday: 'long' } : {}),
  })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

// ---------------------------------------------------------------------------
// Setlists
// ---------------------------------------------------------------------------

export function cleanSetlistDetails(details: Partial<SetlistDetails>): SetlistDetails {
  const date = (details.date ?? '').trim();
  return {
    name: (details.name ?? '').trim().slice(0, MAX_SETLIST_NAME_LENGTH),
    date: isValidIsoDate(date) ? date : '',
    description: (details.description ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

export function createSetlist(details: Partial<SetlistDetails>, { now, createId: makeId = createId }: ChangeOptions): Setlist {
  const clean = cleanSetlistDetails(details);
  if (!clean.name) throw new Error('Un setlist necesita un nombre.');
  return { id: makeId(), ...clean, items: [], createdAt: now, updatedAt: now };
}

export function updateSetlistDetails(setlist: Setlist, details: Partial<SetlistDetails>, now: number): Setlist {
  const clean = cleanSetlistDetails({
    name: details.name ?? setlist.name,
    date: details.date ?? setlist.date,
    description: details.description ?? setlist.description,
  });
  if (!clean.name) throw new Error('Un setlist necesita un nombre.');
  return { ...setlist, ...clean, updatedAt: now };
}

/**
 * A copy with the same songs, order, keys, capos, moments and notes, but new
 * ids everywhere, so editing the copy never affects the original.
 */
export function duplicateSetlist(
  setlist: Setlist,
  details: Partial<SetlistDetails>,
  { now, createId: makeId = createId }: ChangeOptions
): Setlist {
  const copy = createSetlist(
    {
      name: details.name ?? setlist.name,
      date: details.date ?? setlist.date,
      description: details.description ?? setlist.description,
    },
    { now, createId: makeId }
  );
  return { ...copy, items: setlist.items.map((item) => ({ ...item, id: makeId() })) };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** A song as it enters a setlist: its own key and recommended capo. */
export function createSetlistItem(
  song: SongForSetlist,
  makeId: IdFactory = createId,
  moment = ''
): SetlistItem {
  return {
    id: makeId(),
    songId: song.id,
    moment: moment.trim().slice(0, MAX_MOMENT_LENGTH),
    ...normalizeKeySettings({ transposeSteps: 0, capoFret: song.recommendedCapo ?? 0 }),
    notes: '',
  };
}

export function addSongsToSetlist(
  setlist: Setlist,
  songs: SongForSetlist[],
  // `moment` marks the songs as they are added, for when they are chosen by
  // the part of the Mass they are for.
  { now, createId: makeId = createId, moment = '' }: ChangeOptions & { moment?: string }
): Setlist {
  if (songs.length === 0) return setlist;
  return {
    ...setlist,
    items: [...setlist.items, ...songs.map((song) => createSetlistItem(song, makeId, moment))],
    updatedAt: now,
  };
}

export function removeSetlistItem(setlist: Setlist, itemId: string, now: number): Setlist {
  if (!setlist.items.some((item) => item.id === itemId)) return setlist;
  return { ...setlist, items: setlist.items.filter((item) => item.id !== itemId), updatedAt: now };
}

/** Moves an entry to a position in the list (clamped to the list). */
export function moveSetlistItem(setlist: Setlist, itemId: string, toIndex: number, now: number): Setlist {
  const from = setlist.items.findIndex((item) => item.id === itemId);
  if (from < 0) return setlist;
  const target = Math.max(0, Math.min(setlist.items.length - 1, Math.round(toIndex)));
  if (target === from) return setlist;
  const items = [...setlist.items];
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved);
  return { ...setlist, items, updatedAt: now };
}

/** Moves an entry up (-1) or down (+1). */
export function moveSetlistItemBy(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const from = setlist.items.findIndex((item) => item.id === itemId);
  return from < 0 ? setlist : moveSetlistItem(setlist, itemId, from + delta, now);
}

export interface SetlistItemChanges {
  moment?: string;
  notes?: string;
  transposeSteps?: number;
  capoFret?: number;
}

export function updateSetlistItem(
  setlist: Setlist,
  itemId: string,
  changes: SetlistItemChanges,
  now: number
): Setlist {
  if (!setlist.items.some((item) => item.id === itemId)) return setlist;
  return {
    ...setlist,
    items: setlist.items.map((item) => {
      if (item.id !== itemId) return item;
      const keySettings = normalizeKeySettings({
        transposeSteps: changes.transposeSteps ?? item.transposeSteps,
        capoFret: changes.capoFret ?? item.capoFret,
      });
      return {
        ...item,
        ...keySettings,
        moment: (changes.moment ?? item.moment).trim().slice(0, MAX_MOMENT_LENGTH),
        notes: (changes.notes ?? item.notes).trim().slice(0, MAX_NOTES_LENGTH),
      };
    }),
    updatedAt: now,
  };
}

/** Raises or lowers the sound of one entry by semitones; the song is untouched. */
export function transposeSetlistItem(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const item = setlist.items.find((candidate) => candidate.id === itemId);
  if (!item) return setlist;
  const next = transposeBy(item, delta);
  return next === item ? setlist : updateSetlistItem(setlist, itemId, next, now);
}

/** Moves the capo of one entry, keeping what sounds (reactive capo). */
export function moveSetlistItemCapo(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const item = setlist.items.find((candidate) => candidate.id === itemId);
  if (!item) return setlist;
  const next = moveCapoBy(item, delta);
  return next === item ? setlist : updateSetlistItem(setlist, itemId, next, now);
}

export { MAX_CAPO, MIN_CAPO };

// ---------------------------------------------------------------------------
// Playing through a setlist
// ---------------------------------------------------------------------------

export interface SetlistPosition {
  item: SetlistItem;
  /** 0-based among playable entries */
  index: number;
  total: number;
  previous: SetlistItem | null;
  next: SetlistItem | null;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Where an entry sits in the setlist. Entries whose song can't be opened (for
 * example a song removed from the songbook) are skipped, so previous and next
 * always lead to something playable. The last entry has no next: a setlist
 * ends, it doesn't loop.
 */
export function getSetlistPosition(
  setlist: Setlist,
  itemId: string,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistPosition | null {
  const playable = setlist.items.filter(isPlayable);
  const index = playable.findIndex((item) => item.id === itemId);
  if (index < 0) return null;
  return {
    item: playable[index],
    index,
    total: playable.length,
    previous: playable[index - 1] ?? null,
    next: playable[index + 1] ?? null,
    isFirst: index === 0,
    isLast: index === playable.length - 1,
  };
}

export function getFirstPlayableItem(
  setlist: Setlist,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistItem | null {
  return setlist.items.find(isPlayable) ?? null;
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface DurationSummary {
  songCount: number;
  /** Sum of the durations that are actually known */
  knownSeconds: number;
  /** Entries whose duration isn't known */
  unknownCount: number;
}

export function summarizeSetlistDuration(setlist: Setlist, durations: Record<string, number>): DurationSummary {
  let knownSeconds = 0;
  let unknownCount = 0;
  for (const item of setlist.items) {
    const seconds = durations[item.songId];
    if (typeof seconds === 'number' && seconds > 0) knownSeconds += seconds;
    else unknownCount++;
  }
  return { songCount: setlist.items.length, knownSeconds, unknownCount };
}

/** "~24 min", "~24 min + 2 sin duración", or "Duración desconocida". Never a guess. */
export function formatDurationSummary(summary: DurationSummary): string {
  if (summary.songCount === 0) return '';
  if (summary.knownSeconds === 0) return 'Duración desconocida';
  const minutes = Math.max(1, Math.round(summary.knownSeconds / 60));
  const missing =
    summary.unknownCount > 0
      ? ` + ${summary.unknownCount} ${summary.unknownCount === 1 ? 'canción' : 'canciones'} sin duración`
      : '';
  return `~${minutes} min${missing}`;
}

export function formatSongCount(count: number): string {
  return `${count} ${count === 1 ? 'canción' : 'canciones'}`;
}

/**
 * Upcoming: dated today or later, soonest first. Recent: everything else,
 * newest date first, and setlists without a date by last change.
 */
export function groupSetlistsByDate(setlists: Setlist[], todayIso: string): { upcoming: Setlist[]; recent: Setlist[] } {
  const upcoming = setlists
    .filter((setlist) => setlist.date && setlist.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date) || b.updatedAt - a.updatedAt);
  const recent = setlists
    .filter((setlist) => !setlist.date || setlist.date < todayIso)
    .sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt;
      if (a.date !== b.date) return a.date ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  return { upcoming, recent };
}
