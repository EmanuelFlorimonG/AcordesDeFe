import React, { useState } from 'react';
import type { Playlist, Song } from '../../types/song';
import { SongList } from './SongList';
import { ListPlus, Trash2, ArrowLeft, Plus, Music4 } from 'lucide-react';

interface PlaylistsViewProps {
  playlists: Playlist[];
  songs: Song[];
  favorites: string[];
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId?: string) => void;
  onDeletePlaylist: (playlistId: string) => void;
  onShare: (song: Song) => void;
}

export const PlaylistsView: React.FC<PlaylistsViewProps> = ({
  playlists,
  songs,
  favorites,
  onToggleFavorite,
  onSelectSong,
  onToggleInPlaylist,
  onCreatePlaylist,
  onDeletePlaylist,
  onShare,
}) => {
  const [openPlaylistId, setOpenPlaylistId] = useState<string | null>(null);
  const [newListName, setNewListName] = useState('');

  const openPlaylist = playlists.find((p) => p.id === openPlaylistId) || null;

  if (openPlaylist) {
    const playlistSongs = openPlaylist.songIds
      .map((id) => songs.find((s) => s.id === id))
      .filter((s): s is Song => Boolean(s));

    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        <button
          onClick={() => setOpenPlaylistId(null)}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-6 text-sm font-medium"
        >
          <ArrowLeft className="w-4 h-4 text-blue-600" />
          <span>Todas las listas</span>
        </button>

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-extrabold text-[#10203A] dark:text-white tracking-tight">
              {openPlaylist.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {playlistSongs.length} {playlistSongs.length === 1 ? 'canción' : 'canciones'}
            </p>
          </div>
          <button
            onClick={() => {
              onDeletePlaylist(openPlaylist.id);
              setOpenPlaylistId(null);
            }}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 text-sm font-medium transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span className="hidden sm:inline">Eliminar lista</span>
          </button>
        </div>

        {playlistSongs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
            <Music4 className="w-8 h-8 text-slate-300 mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Esta lista está vacía. Añade canciones desde el menú de opciones (⋮) del cancionero.
            </p>
          </div>
        ) : (
          <SongList
            songs={playlistSongs}
            favorites={favorites}
            playlists={playlists}
            onToggleFavorite={onToggleFavorite}
            onSelectSong={onSelectSong}
            onResetFilters={() => {}}
            onToggleInPlaylist={onToggleInPlaylist}
            onCreatePlaylist={(name, songId) => onCreatePlaylist(name, songId)}
            onShare={onShare}
          />
        )}
      </div>
    );
  }

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) return;
    onCreatePlaylist(name);
    setNewListName('');
  };

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-[#10203A] dark:text-white tracking-tight mb-1">
        Listas
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Organiza canciones para tus encuentros y ensayos.
      </p>

      <div className="flex items-center gap-2 mb-6 max-w-md">
        <input
          type="text"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          placeholder="Nombre de la lista (ej. Vigilia de octubre)"
          className="flex-grow min-w-0 px-3.5 py-2.5 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED] text-slate-900 dark:text-slate-100"
        />
        <button
          onClick={handleCreate}
          disabled={!newListName.trim()}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg bg-[#2464ED] text-white text-sm font-semibold disabled:opacity-40 transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Crear</span>
        </button>
      </div>

      {playlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <ListPlus className="w-8 h-8 text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm">
            Aún no tienes listas. Crea la primera arriba, o añade una canción a una lista nueva desde el menú (⋮) del cancionero.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => setOpenPlaylistId(pl.id)}
              className="flex items-center gap-4 p-4 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors text-left"
            >
              <div className="w-12 h-12 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                <ListPlus className="w-5 h-5 text-[#2464ED]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[#10203A] dark:text-white truncate">{pl.name}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {pl.songIds.length} {pl.songIds.length === 1 ? 'canción' : 'canciones'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
