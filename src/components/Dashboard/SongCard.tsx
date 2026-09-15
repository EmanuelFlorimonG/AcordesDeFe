import React from 'react';
import type { Playlist, Song } from '../../types/song';
import { Heart, Music, ChevronRight, Gauge } from 'lucide-react';
import { CoverTile } from './CoverTile';
import { SongRowMenu } from './SongRowMenu';

interface SongCardProps {
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
}) => {
  return (
    <div
      onClick={() => onSelectSong(song)}
      className="group bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 hover:border-blue-300 dark:hover:border-blue-500/40 rounded-lg p-4 transition-colors duration-150 cursor-pointer flex flex-col justify-between shadow-sm"
    >
      <div>
        <div className="flex items-start justify-between gap-2 mb-3">
          <CoverTile category={song.categories[0]} size="md" />
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(song.id);
              }}
              className={`p-1.5 rounded-lg border transition-colors ${
                isFavorite
                  ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-600 dark:text-blue-400'
                  : 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-400 hover:text-blue-600 hover:border-slate-300'
              }`}
              title={isFavorite ? 'Quitar de favoritos' : 'Agregar a favoritos'}
            >
              <Heart className={`w-4 h-4 ${isFavorite ? 'fill-blue-600 dark:fill-blue-400' : ''}`} />
            </button>
            <SongRowMenu
              song={song}
              playlists={playlists}
              onToggleInPlaylist={onToggleInPlaylist}
              onCreatePlaylist={onCreatePlaylist}
              onShare={onShare}
            />
          </div>
        </div>

        <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20">
          {song.categories[0]}
        </span>

        <h3 className="text-lg font-bold text-slate-900 dark:text-white group-hover:text-blue-700 dark:group-hover:text-blue-400 transition-colors line-clamp-1 mt-2.5">
          {song.title}
        </h3>
        {song.artist && (
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 line-clamp-1">
            {song.artist}
          </p>
        )}

        <div className="flex items-center gap-1.5 overflow-hidden mb-4 py-1">
          {song.chordsUsed.length > 0 ? (
            <>
              <span className="text-[11px] text-slate-400 font-mono">Acordes:</span>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {song.chordsUsed.slice(0, 5).map((chord) => (
                  <span
                    key={chord}
                    className="px-1.5 py-0.5 rounded bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-blue-600 dark:text-blue-400 font-mono text-xs font-semibold whitespace-nowrap"
                  >
                    {chord}
                  </span>
                ))}
                {song.chordsUsed.length > 5 && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    +{song.chordsUsed.length - 5}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-[11px] text-slate-400 italic">Sin acordes todavía</span>
          )}
        </div>
      </div>

      <div className="pt-3 border-t border-slate-100 dark:border-dark-800 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3 whitespace-nowrap">
          {song.originalKey && (
            <div className="flex items-center gap-1 font-mono">
              <Music className="w-3.5 h-3.5 text-blue-500" />
              <span className="font-semibold text-slate-700 dark:text-slate-200">Tono: {song.originalKey}</span>
            </div>
          )}

          {song.timeSignature && (
            <div className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-slate-400" />
              <span>{song.timeSignature}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
          <span>Ver acordes</span>
          <ChevronRight className="w-4 h-4" />
        </div>
      </div>
    </div>
  );
};
