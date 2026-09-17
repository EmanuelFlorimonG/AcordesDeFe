import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { Heart, ChevronRight } from 'lucide-react';
import { CoverTile } from './CoverTile';
import { SongRowMenu } from './SongRowMenu';
import { SongMetaLine } from './SongMetaLine';
import type { SongSetlistActions } from './songActions';

interface SongCardProps extends SongSetlistActions {
  song: Song;
  isFavorite: boolean;
  playlists: Playlist[];
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
}

export const SongCard: React.FC<SongCardProps> = ({
  song,
  isFavorite,
  playlists,
  onToggleFavorite,
  onSelectSong,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  setlists,
  onAddToSetlist,
  onCreateSetlistWithSong,
}) => {
  return (
    <div
      onClick={() => onSelectSong(song)}
      className="group bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-500/40 rounded-lg p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between shadow-sm min-w-0"
    >
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-2 mb-3">
          <CoverTile category={song.categories[0]} size="md" />
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(song.id);
              }}
              aria-pressed={isFavorite}
              aria-label={isFavorite ? `Quitar ${song.title} de favoritas` : `Añadir ${song.title} a favoritas`}
              className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
              title={isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
            >
              <Heart
                className={`w-4 h-4 ${isFavorite ? 'fill-blue-600 text-blue-600 dark:fill-blue-400 dark:text-blue-400' : ''}`}
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
          </div>
        </div>

        <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSong(song);
            }}
            className="max-w-full line-clamp-2 text-left rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            {song.title}
          </button>
        </h3>
        {song.artist && (
          <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{song.artist}</p>
        )}
        <SongMetaLine song={song} className="mt-2.5" />
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 dark:border-dark-800 flex items-center justify-end text-xs font-semibold text-blue-600 dark:text-blue-400">
        <span>Ver canción</span>
        <ChevronRight className="w-4 h-4" />
      </div>
    </div>
  );
};
