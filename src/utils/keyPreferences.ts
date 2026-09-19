import type { SingerKeyPreference } from '../types/ministry';
import type { SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { getNoteIndex, normalizeStep, parseKey } from './chordTransposer';
import { MAX_TRANSPOSE, MIN_TRANSPOSE, describeKey, normalizeKeySettings, type KeySettings } from './keySettings';

/**
 * The key a singer usually takes a song in.
 *
 * Only a saved habit: it is shown where it helps and applied only when someone
 * asks, through the same transposition every setlist entry already uses. It
 * never decides anything and never touches the song.
 */

/**
 * Two different questions, kept apart on purpose:
 *
 * - Is it a key at all? Any tonic from A to G with at most one sharp or flat,
 *   major or minor, is a real key. G# major exists: it is written with F##,
 *   which is why nobody chooses it, not because it is invalid.
 * - Which keys do we offer? One spelling per sound, the one with the fewest
 *   accidentals in its key signature (Db, not C#: five flats against seven
 *   sharps; Ab, not G#). When both are equally simple (F# / Gb, D#m / Ebm) the
 *   sharp one is offered, because this songbook lives on the sharp side, the
 *   side guitars read. The music engine itself is not changed by this list.
 */
export const PRACTICAL_MAJOR_KEYS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const PRACTICAL_MINOR_KEYS = ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];

/**
 * True for the name of a real key: "Bb", "C#m", and also "G#" or "Fb", which
 * exist even if they are written with double accidentals. Not "H" or " Bb".
 * Stored preferences are checked with this, so a key someone saved in another
 * spelling is kept as it is.
 */
export function isKeyName(value: unknown): value is string {
  return typeof value === 'string' && value.trim() === value && parseKey(value) !== null;
}

/**
 * The keys offered for a song, in the song's own mode (a song in Em is offered
 * minor keys): one practical spelling per sound, twelve in all.
 */
export function keyOptionsFor(originalKey: string | undefined): string[] {
  const isMinor = Boolean(originalKey && parseKey(originalKey)?.isMinor);
  return isMinor ? PRACTICAL_MINOR_KEYS : PRACTICAL_MAJOR_KEYS;
}

/** Same sound, whatever the spelling: Bb and A# are one key. */
export function isSameKey(a: string, b: string): boolean {
  const first = parseKey(a);
  const second = parseKey(b);
  if (!first || !second || first.isMinor !== second.isMinor) return false;
  return getNoteIndex(first.tonic) === getNoteIndex(second.tonic);
}

/**
 * The settings that make an entry *sound* in a key, reached exactly as if
 * someone had pressed "raise a semitone" until they got there: the capo stays
 * where it is and only the transposition moves, by the shortest way.
 */
export function keySettingsForKey(
  song: Pick<Song, 'originalKey'>,
  settings: KeySettings,
  targetKey: string
): KeySettings | null {
  const original = song.originalKey ? parseKey(song.originalKey) : null;
  const target = parseKey(targetKey);
  if (!original || !target || original.isMinor !== target.isMinor) return null;
  const originalPitch = getNoteIndex(original.tonic);
  const targetPitch = getNoteIndex(target.tonic);
  if (originalPitch === null || targetPitch === null) return null;

  const current = normalizeStep(originalPitch + settings.transposeSteps + settings.capoFret);
  let delta = normalizeStep(targetPitch - current);
  if (delta > 6) delta -= 12;

  let transposeSteps = settings.transposeSteps + delta;
  if (transposeSteps > MAX_TRANSPOSE) transposeSteps -= 12;
  if (transposeSteps < MIN_TRANSPOSE) transposeSteps += 12;
  return normalizeKeySettings({ transposeSteps, capoFret: settings.capoFret });
}

/** True when the entry already sounds in that key. */
export function soundsInKey(
  song: Pick<Song, 'originalKey' | 'recommendedCapo'>,
  settings: KeySettings,
  key: string
): boolean {
  const description = describeKey(song.originalKey, settings, song.recommendedCapo ?? 0);
  return description !== null && isSameKey(description.sounding, key);
}

// ---------------------------------------------------------------------------
// The list of preferences (every change returns a new list)
// ---------------------------------------------------------------------------

export function findKeyPreference(
  preferences: SingerKeyPreference[],
  memberId: string,
  songId: string
): SingerKeyPreference | null {
  return preferences.find((entry) => entry.memberId === memberId && entry.songId === songId) ?? null;
}

/** Adds or replaces the key of one singer for one song. */
export function setKeyPreference(
  preferences: SingerKeyPreference[],
  memberId: string,
  songId: string,
  key: string,
  now: number
): SingerKeyPreference[] {
  if (!memberId || !songId || !isKeyName(key)) return preferences;
  const others = preferences.filter((entry) => !(entry.memberId === memberId && entry.songId === songId));
  return [...others, { memberId, songId, key, updatedAt: now }];
}

export function removeKeyPreference(
  preferences: SingerKeyPreference[],
  memberId: string,
  songId: string
): SingerKeyPreference[] {
  const next = preferences.filter((entry) => !(entry.memberId === memberId && entry.songId === songId));
  return next.length === preferences.length ? preferences : next;
}

/** Everything a member had saved goes with them when they are deleted. */
export function removeMemberKeyPreferences(
  preferences: SingerKeyPreference[],
  memberId: string
): SingerKeyPreference[] {
  const next = preferences.filter((entry) => entry.memberId !== memberId);
  return next.length === preferences.length ? preferences : next;
}

/** One member's keys, only for songs the songbook still has, by song title. */
export function preferencesForMember(
  preferences: SingerKeyPreference[],
  memberId: string,
  songsById: Map<string, Pick<Song, 'title'>>
): Array<SingerKeyPreference & { songTitle: string }> {
  return preferences
    .filter((entry) => entry.memberId === memberId && songsById.has(entry.songId))
    .map((entry) => ({ ...entry, songTitle: songsById.get(entry.songId)!.title }))
    .sort((a, b) => a.songTitle.localeCompare(b.songTitle, 'es'));
}

/** The keys saved for one song, for the members that still exist. */
export function preferencesForSong(
  preferences: SingerKeyPreference[],
  songId: string,
  memberIds: Set<string>
): SingerKeyPreference[] {
  return preferences.filter((entry) => entry.songId === songId && memberIds.has(entry.memberId));
}

/**
 * The preferences worth showing while preparing one entry: those of the
 * people assigned to its sections, when they differ from how it sounds now.
 * Several singers with different keys are all listed — the director decides.
 */
export function keySuggestionsFor(
  song: Pick<Song, 'id' | 'originalKey' | 'recommendedCapo'>,
  item: Pick<SetlistItem, 'arrangement'>,
  settings: KeySettings,
  preferences: SingerKeyPreference[],
  existingMemberIds: Set<string>
): SingerKeyPreference[] {
  const assigned = new Set(
    (item.arrangement?.sections ?? []).flatMap((section) => section.assignedMemberIds ?? [])
  );
  const seen = new Set<string>();
  return preferences.filter((entry) => {
    if (entry.songId !== song.id || !assigned.has(entry.memberId) || !existingMemberIds.has(entry.memberId)) {
      return false;
    }
    if (seen.has(entry.memberId)) return false;
    seen.add(entry.memberId);
    return !soundsInKey(song, settings, entry.key);
  });
}
