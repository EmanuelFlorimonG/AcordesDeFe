import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { SongCard } from './SongCard';
import { Music4 } from 'lucide-react';

interface SongGridProps {
  songs: Song[];
  favorites: string[];
  playlists: Playlist[];
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onResetFilters: () => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
}

export const SongGrid: React.FC<SongGridProps> = ({
  songs,
  favorites,
  playlists,
  onToggleFavorite,
  onSelectSong,
  onResetFilters,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
}) => {
  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-4 text-center border-2 border-dashed border-slate-200 dark:border-dark-700 rounded-lg bg-slate-50 dark:bg-dark-900/50">
        <div className="w-16 h-16 bg-white dark:bg-dark-900 rounded-lg flex items-center justify-center mb-4 border border-slate-200 dark:border-dark-700">
          <Music4 className="w-8 h-8 text-slate-300" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
          No se encontraron canciones
        </h3>
        <p className="text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Intenta ajustar los filtros o los términos de búsqueda para encontrar lo que buscas.
        </p>
        <button
          onClick={onResetFilters}
          className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          Mostrar todas las canciones
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
      {songs.map((song) => (
        <SongCard
          key={song.id}
          song={song}
          isFavorite={favorites.includes(song.id)}
          playlists={playlists}
          onToggleFavorite={onToggleFavorite}
          onSelectSong={onSelectSong}
          onToggleInPlaylist={onToggleInPlaylist}
          onCreatePlaylist={onCreatePlaylist}
          onShare={onShare}
        />
      ))}
    </div>
  );
};
