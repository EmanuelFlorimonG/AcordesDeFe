import { useCallback, useMemo, useState } from 'react';
import {
  createSongDurationStore,
  shouldRecordDuration,
  type SongDurations,
} from '../storage/songDurationStorage';

function getBrowserStorage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/** Durations the player has actually reported, remembered between visits. */
export function useSongDurations() {
  const store = useMemo(() => createSongDurationStore(getBrowserStorage()), []);
  const [durations, setDurations] = useState<SongDurations>(() => store.load());

  const recordDuration = useCallback(
    (songId: string, seconds: number) => {
      setDurations((current) => {
        if (!shouldRecordDuration(current, songId, seconds)) return current;
        const next = { ...current, [songId]: Math.round(seconds) };
        store.save(next);
        return next;
      });
    },
    [store]
  );

  return { durations, recordDuration };
}
