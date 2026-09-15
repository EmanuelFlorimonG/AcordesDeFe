import React from 'react';
import type { Song } from '../../types/song';
import { CoverTile } from '../Dashboard/CoverTile';
import { getPlayButtonState } from '../../utils/playerStatus';
import { Play, Pause, SkipBack, SkipForward, Heart, Volume2, VolumeX, ListMusic } from 'lucide-react';

interface PlayerBarProps {
  song: Song;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onOpenSong: () => void;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onGoToPlaylists: () => void;
  hasVideo: boolean;
  isPlayerReady: boolean;
  playerError: string | null;
  currentTime: number;
  duration: number;
  onSeek: (seconds: number) => void;
  volume: number;
  onVolumeChange: (volume: number) => void;
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  song,
  isPlaying,
  onTogglePlay,
  onNext,
  onPrev,
  onOpenSong,
  isFavorite,
  onToggleFavorite,
  onGoToPlaylists,
  hasVideo,
  isPlayerReady,
  playerError,
  currentTime,
  duration,
  onSeek,
  volume,
  onVolumeChange,
}) => {
  const { disabled: playDisabled, title: playTitle } = getPlayButtonState({
    hasVideo,
    isReady: isPlayerReady,
    error: playerError,
    isPlaying,
  });

  return (
    <div className="sticky bottom-0 z-30 border-t border-slate-200 dark:border-dark-800 bg-white dark:bg-dark-950 px-3 sm:px-5 py-2.5 flex items-center gap-3 sm:gap-5 print:hidden">
      <button
        onClick={onOpenSong}
        className="flex items-center gap-3 min-w-0 flex-shrink text-left"
        title="Abrir letra y acordes"
      >
        <CoverTile category={song.categories[0]} size="sm" />
        <div className="min-w-0">
          <p className="text-sm font-bold text-[#10203A] dark:text-white truncate">{song.title}</p>
          {song.artist && (
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{song.artist}</p>
          )}
        </div>
      </button>

      <button
        onClick={onToggleFavorite}
        className="hidden sm:flex p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-dark-800 flex-shrink-0"
        title={isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
      >
        <Heart className={`w-4 h-4 ${isFavorite ? 'fill-[#2464ED] text-[#2464ED]' : 'text-slate-300'}`} />
      </button>

      <div className="flex-grow flex flex-col items-center gap-1 min-w-0 max-w-xl mx-auto">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            onClick={onPrev}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#10203A] dark:hover:text-white transition-colors"
            title="Canción anterior"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={onTogglePlay}
            disabled={playDisabled}
            className="w-9 h-9 rounded-full bg-[#10203A] dark:bg-[#2464ED] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
            title={playTitle}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>
          <button
            onClick={onNext}
            className="p-1.5 text-slate-500 dark:text-slate-400 hover:text-[#10203A] dark:hover:text-white transition-colors"
            title="Siguiente canción"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        {playerError ? (
          <p className="hidden sm:block text-[11px] text-red-500 dark:text-red-400 truncate w-full text-center">
            {playerError}
          </p>
        ) : hasVideo ? (
          <div className="hidden sm:flex items-center gap-2 w-full">
            <span className="text-[10px] font-mono text-slate-400 w-8 text-right">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={1}
              value={Math.min(currentTime, duration || 0)}
              onChange={(e) => onSeek(Number(e.target.value))}
              disabled={!duration}
              className="flex-grow accent-[#2464ED] disabled:opacity-40"
              title="Adelantar o retroceder"
            />
            <span className="text-[10px] font-mono text-slate-400 w-8">{formatTime(duration)}</span>
          </div>
        ) : (
          <div className="hidden sm:flex items-center gap-2 w-full">
            <span className="text-[10px] font-mono text-slate-300 dark:text-dark-700 w-8 text-right">
              0:00
            </span>
            <div className="flex-grow h-1 rounded-full bg-slate-100 dark:bg-dark-900 overflow-hidden">
              <div className="h-full w-0 bg-slate-300 dark:bg-dark-700" />
            </div>
            <span className="text-[10px] text-slate-400 italic whitespace-nowrap">
              Audio no disponible
            </span>
          </div>
        )}
      </div>

      <div className="hidden md:flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onVolumeChange(volume === 0 ? 70 : 0)}
          className="text-slate-400"
          title={volume === 0 ? 'Activar sonido' : 'Silenciar'}
        >
          {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          className="w-20 accent-[#2464ED]"
          title="Volumen"
        />
      </div>

      <button
        onClick={onGoToPlaylists}
        className="p-1.5 text-slate-400 hover:text-[#10203A] dark:hover:text-white flex-shrink-0"
        title="Ir a listas"
      >
        <ListMusic className="w-4 h-4" />
      </button>
    </div>
  );
};
