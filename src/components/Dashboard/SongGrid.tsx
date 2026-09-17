import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { SongCard } from './SongCard';
import type { SongSetlistActions } from './songActions';

interface SongGridProps extends SongSetlistActions {
  songs: Song[];
  favorites: string[];
  playlists: Playlist[];
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
}

/** Songs as cards. Empty results are handled by the screen that owns the search. */
export const SongGrid: React.FC<SongGridProps> = ({ songs, favorites, ...actions }) => (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
    {songs.map((song) => (
      <SongCard key={song.id} song={song} isFavorite={favorites.includes(song.id)} {...actions} />
    ))}
  </div>
);
