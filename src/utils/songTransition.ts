import type { SetlistItem, SetlistSongTransition, SongTransitionType } from '../types/setlist';

/**
 * Transitions between songs of a setlist.
 *
 * This is not the same thing as an arrangement's transition: that one happens
 * *inside* a song, between its sections. This one happens between one song and
 * the next, and it belongs to the song being left.
 *
 * Everything here is an indication written for the musicians. Nothing decides
 * chords, keys or progressions, and nothing plays anything on its own.
 */

export const SONG_TRANSITION_TYPES: SongTransitionType[] = [
  'stop',
  'direct',
  'instrumental',
  'custom',
];

export const MAX_TRANSITION_INSTRUCTION_LENGTH = 160;

export const SONG_TRANSITION_LABELS: Record<SongTransitionType, string> = {
  stop: 'Pausa',
  direct: 'Directa',
  instrumental: 'Instrumental',
  custom: 'Personalizada',
};

/** One line explaining each choice, for the editor. */
export const SONG_TRANSITION_HINTS: Record<SongTransitionType, string> = {
  stop: 'La canción termina y se hace silencio antes de la siguiente.',
  direct: 'Se enlaza directamente con la siguiente, sin parar.',
  instrumental: 'La música sigue sonando entre las dos canciones.',
  custom: 'Lo que diga la indicación.',
};

export function isSongTransitionType(value: unknown): value is SongTransitionType {
  return typeof value === 'string' && SONG_TRANSITION_TYPES.includes(value as SongTransitionType);
}

export function cleanTransitionInstruction(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_TRANSITION_INSTRUCTION_LENGTH) : '';
}

export function createSongTransition(
  type: SongTransitionType,
  instruction = ''
): SetlistSongTransition {
  return { type, instruction: cleanTransitionInstruction(instruction) };
}

/**
 * A transition from stored data, or undefined when there is nothing usable.
 * A type this version doesn't know ("teleport") is not a transition at all:
 * saying nothing is safer than guessing what someone meant.
 */
export function sanitizeSongTransition(value: unknown): SetlistSongTransition | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (!isSongTransitionType(record.type)) return undefined;
  return { type: record.type, instruction: cleanTransitionInstruction(record.instruction) };
}

/**
 * The transition that actually applies right now.
 *
 * The last song of a setlist has nothing to go into, so its transition is not
 * shown; it is kept in the data because moving the song back up the list makes
 * it useful again.
 */
export function getTransitionToNext(
  item: Pick<SetlistItem, 'transitionToNext'> | null | undefined,
  hasNext: boolean
): SetlistSongTransition | null {
  if (!item || !hasNext) return null;
  return item.transitionToNext ?? null;
}

/** "Directa · Mantener G durante 2 compases", for one compact line. */
export function describeSongTransition(transition: SetlistSongTransition): string {
  const label = SONG_TRANSITION_LABELS[transition.type];
  return transition.instruction ? `${label} · ${transition.instruction}` : label;
}
