import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RECENT_SONGS_KEY,
  createRecentSongsStore,
  recordSongOpened,
  type RecentSong,
  type RecentSongsStore,
} from '../storage/recentSongsStorage';

/**
 * Songs opened recently in this browser. `recordOpened` is the only way in:
 * call it when a song's page opens, never for songs merely listed.
 */
export function useRecentSongs(store?: RecentSongsStore) {
  const recentStore = useMemo(() => store ?? createRecentSongsStore(), [store]);
  const [recents, setRecents] = useState<RecentSong[]>(() => recentStore.load());

  const recordOpened = useCallback(
    (songId: string) => {
      setRecents((current) => {
        const next = recordSongOpened(current, songId, Date.now());
        recentStore.save(next);
        return next;
      });
    },
    [recentStore]
  );

  // Songs opened in another tab show up here too.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === RECENT_SONGS_KEY) setRecents(recentStore.load());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [recentStore]);

  const lastOpenedAt = useMemo(
    () => new Map(recents.map((entry) => [entry.songId, entry.lastOpenedAt])),
    [recents]
  );

  return { recents, lastOpenedAt, recordOpened };
}
