import type { KeyValueStorage } from './setlistStorage';

/**
 * Song durations as reported by the YouTube player while a song actually
 * played. Songs don't carry a duration in their data, so this is the only
 * reliable source; a song that was never played simply has no duration.
 */

export const SONG_DURATIONS_KEY = 'genesaret_song_durations';

/** Longer than this isn't a song. */
const MAX_SONG_SECONDS = 60 * 60;

export type SongDurations = Record<string, number>;

export function parseSongDurations(raw: string | null): SongDurations {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || Array.isArray(data)) return {};
    return Object.fromEntries(
      Object.entries(data).filter(
        ([songId, seconds]) =>
          songId.length > 0 &&
          typeof seconds === 'number' &&
          Number.isFinite(seconds) &&
          seconds > 0 &&
          seconds <= MAX_SONG_SECONDS
      )
    ) as SongDurations;
  } catch {
    return {};
  }
}

/** A duration worth storing: real, and not a rounding wobble of the one already known. */
export function shouldRecordDuration(durations: SongDurations, songId: string, seconds: number): boolean {
  if (!songId || !Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SONG_SECONDS) return false;
  const known = durations[songId];
  return known === undefined || Math.abs(known - seconds) >= 1;
}

export function createSongDurationStore(storage: KeyValueStorage | null) {
  return {
    load(): SongDurations {
      try {
        return parseSongDurations(storage?.getItem(SONG_DURATIONS_KEY) ?? null);
      } catch {
        return {};
      }
    },
    save(durations: SongDurations) {
      try {
        storage?.setItem(SONG_DURATIONS_KEY, JSON.stringify(durations));
      } catch {
        // storage unavailable: durations are simply not remembered
      }
    },
  };
}
