import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { Heart } from 'lucide-react';
import { CoverTile } from './CoverTile';
import { SongRowMenu } from './SongRowMenu';
import { SongMetaLine } from './SongMetaLine';
import type { SongSetlistActions } from './songActions';

interface SongListProps extends SongSetlistActions {
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

export const SongList: React.FC<SongListProps> = ({
  songs,
  favorites,
  playlists,
  onToggleFavorite,
  onSelectSong,
  onResetFilters,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  setlists,
  onAddToSetlist,
  onCreateSetlistWithSong,
}) => {
  if (songs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl bg-slate-50/50 dark:bg-dark-900/50 mt-4">
        <h3 className="text-base font-bold text-[#10203A] dark:text-white mb-1">
          No se encontraron canciones
        </h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
          Intenta ajustar los filtros o los términos de búsqueda.
        </p>
        <button
          onClick={onResetFilters}
          className="px-4 py-2 rounded-lg bg-[#2464ED] hover:bg-blue-700 text-white text-sm font-semibold transition-colors"
        >
          Mostrar todas
        </button>
      </div>
    );
  }

  return (
    <ul className="border-t border-slate-100 dark:border-dark-800 flex flex-col">
      {songs.map((song) => {
        const isFav = favorites.includes(song.id);
        return (
          <li
            key={song.id}
            onClick={() => onSelectSong(song)}
            className="group relative flex items-center gap-3 sm:gap-4 py-3 pl-3 pr-1 sm:pl-4 sm:pr-2 border-b border-slate-100 dark:border-dark-800 hover:bg-[#EAF1FF]/40 dark:hover:bg-dark-900 transition-colors cursor-pointer"
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#2464ED] opacity-0 group-hover:opacity-100 transition-opacity" />

            <CoverTile category={song.categories[0]} size="sm" />

            <div className="flex-grow min-w-0">
              <h3 className="text-sm font-bold text-[#10203A] dark:text-white leading-tight">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSong(song);
                  }}
                  className="max-w-full truncate text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  {song.title}
                </button>
              </h3>
              {song.artist && (
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{song.artist}</p>
              )}
              <SongMetaLine song={song} className="mt-1.5" />
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(song.id);
              }}
              aria-pressed={isFav}
              aria-label={isFav ? `Quitar ${song.title} de favoritas` : `Añadir ${song.title} a favoritas`}
              className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg hover:bg-white dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
              title={isFav ? 'Quitar de favoritas' : 'Añadir a favoritas'}
            >
              <Heart
                className={`w-[18px] h-[18px] ${
                  isFav ? 'fill-[#2464ED] text-[#2464ED]' : 'text-slate-300 dark:text-slate-600'
                }`}
              />
            </button>

            <SongRowMenu
              song={song}
              playlists={playlists}
              onToggleInPlaylist={onToggleInPlaylist}
              onCreatePlaylist={onCreatePlaylist}
              onShare={onShare}
              setlists={setlists}
              onAddToSetlist={onAddToSetlist}
              onCreateSetlistWithSong={onCreateSetlistWithSong}
            />
          </li>
        );
      })}
    </ul>
  );
};
