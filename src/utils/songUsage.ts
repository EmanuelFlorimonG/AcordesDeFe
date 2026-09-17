import type { Setlist } from '../types/setlist';
import type { Song } from '../types/song';
import { compareTitles } from './songSearch';

/**
 * "Más usadas por GENESARET": how often each song appears in the setlists
 * saved in this browser. It is not a count of plays nor a global statistic.
 *
 * Every appearance counts: a song sung at the opening and again at the close
 * of the same setlist adds two uses. The number of different setlists is
 * kept too, so the wording can say both.
 */

export interface SongUsage {
  songId: string;
  /** Appearances across all setlists */
  uses: number;
  /** Different setlists it appears in */
  setlistCount: number;
}

export function countSongUsage(setlists: readonly Setlist[]): Map<string, SongUsage> {
  const usage = new Map<string, SongUsage>();
  for (const setlist of setlists) {
    const seenInThisSetlist = new Set<string>();
    for (const item of setlist.items) {
      const entry = usage.get(item.songId) ?? { songId: item.songId, uses: 0, setlistCount: 0 };
      entry.uses++;
      if (!seenInThisSetlist.has(item.songId)) {
        entry.setlistCount++;
        seenInThisSetlist.add(item.songId);
      }
      usage.set(item.songId, entry);
    }
  }
  return usage;
}

export interface MostUsedSong extends SongUsage {
  song: Song;
}

/**
 * Songs in use, most used first. Ties are broken by the most recently opened
 * and then by title, so the order never changes between renders. Setlist
 * entries whose song is no longer in the songbook are left out.
 */
export function getMostUsedSongs(
  songs: readonly Song[],
  usage: ReadonlyMap<string, SongUsage>,
  lastOpenedAt: ReadonlyMap<string, number> = new Map()
): MostUsedSong[] {
  const openedAt = (song: Song) => lastOpenedAt.get(song.id) ?? -Infinity;
  return songs
    .flatMap((song) => {
      const entry = usage.get(song.id);
      return entry && entry.uses > 0 ? [{ ...entry, song }] : [];
    })
    .sort((a, b) => b.uses - a.uses || openedAt(b.song) - openedAt(a.song) || compareTitles(a.song, b.song));
}

/** "Usada 2 veces en 1 Setlist" */
export function formatSongUsage({ uses, setlistCount }: Pick<SongUsage, 'uses' | 'setlistCount'>): string {
  const times = uses === 1 ? 'Usada 1 vez' : `Usada ${uses} veces`;
  return `${times} en ${setlistCount} ${setlistCount === 1 ? 'Setlist' : 'Setlists'}`;
}
