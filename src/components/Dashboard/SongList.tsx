import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { Heart } from 'lucide-react';
import { CoverTile } from './CoverTile';
import { SongRowMenu } from './SongRowMenu';
import { LiturgicalSeasonChips } from '../Liturgy/LiturgicalSeasonChips';

interface SongListProps {
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
    <div className="border-t border-slate-100 dark:border-dark-800 flex flex-col">
      {songs.map((song) => {
        const isFav = favorites.includes(song.id);
        return (
          <div
            key={song.id}
            onClick={() => onSelectSong(song)}
            className="group relative flex items-center py-3 px-3 sm:px-4 border-b border-slate-100 dark:border-dark-800 hover:bg-[#EAF1FF]/40 dark:hover:bg-dark-900 transition-colors cursor-pointer"
          >
            <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#2464ED] opacity-0 group-hover:opacity-100 transition-opacity" />

            <CoverTile category={song.categories[0]} size="sm" className="mr-4" />

            <div className="flex-grow min-w-0 pr-4">
              <div className="flex flex-wrap items-center gap-1 mb-1.5">
                <span className="inline-block px-1.5 py-0.5 bg-[#EAF1FF] dark:bg-blue-500/10 text-[#2464ED] text-[9px] font-bold rounded capitalize tracking-wide">
                  {song.categories[0] || 'Canción'}
                </span>
                <LiturgicalSeasonChips song={song} size="xs" compact />
              </div>
              <h3 className="text-sm font-bold text-[#10203A] dark:text-white truncate leading-tight mb-0.5">
                {song.title}
              </h3>
              {song.artist && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {song.artist}
                </p>
              )}
            </div>

            <div className="hidden md:flex flex-grow basis-[20%] items-center gap-1.5 font-mono text-[11px] text-[#2464ED] font-semibold truncate">
              {song.chordsUsed.length > 0 ? (
                song.chordsUsed.slice(0, 4).map((c, i) => (
                  <React.Fragment key={i}>
                    <span>{c}</span>
                    {i < Math.min(song.chordsUsed.length - 1, 3) && (
                      <span className="text-slate-300 dark:text-dark-700">·</span>
                    )}
                  </React.Fragment>
                ))
              ) : (
                <span className="text-slate-400 italic font-sans font-normal">Sin acordes todavía</span>
              )}
            </div>

            <div className="hidden sm:flex items-center gap-2 w-20 flex-shrink-0 justify-end font-mono text-[11px] font-bold text-[#10203A] dark:text-slate-200">
              {song.originalKey && <span>{song.originalKey}</span>}
              {song.timeSignature && (
                <span className="text-slate-400 font-medium">{song.timeSignature}</span>
              )}
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(song.id);
              }}
              className="ml-4 sm:ml-6 p-1.5 rounded-full hover:bg-white dark:hover:bg-dark-800 transition-colors"
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
            />
          </div>
        );
      })}
    </div>
  );
};
