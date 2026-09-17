import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';

/** Adding a song to a setlist from anywhere a song is listed. Optional: without it the menu omits the option. */
export interface SongSetlistActions {
  setlists?: Setlist[];
  onAddToSetlist?: (setlistId: string, song: Song) => void;
  onCreateSetlistWithSong?: (name: string, song: Song) => void;
}
