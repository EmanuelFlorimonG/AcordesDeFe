import React from 'react';
import { Pause, Play, SkipBack, SkipForward } from 'lucide-react';
import type { Song } from '../../types/song';
import { getPlayButtonState } from '../../utils/playerStatus';

/**
 * What a compact player needs from the app's existing player state. It only
 * sends commands through these callbacks: the single YouTube engine in App
 * stays the one and only player.
 */
export interface CompactPlayerState {
  song: Song;
  isPlaying: boolean;
  hasVideo: boolean;
  isReady: boolean;
  error: string | null;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
}

const skipButton =
  'w-10 h-10 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors touch-manipulation';

export const MiniPlayer: React.FC<{ player: CompactPlayerState }> = ({ player }) => {
  const { disabled, title } = getPlayButtonState(player);
  const status = player.error ?? (player.hasVideo ? player.song.artist ?? null : 'Audio no disponible');

  return (
    <div role="group" aria-label="Reproductor" className="flex items-center gap-0.5 min-w-0">
      <button type="button" onClick={player.onPrev} title="Canción anterior" className={skipButton}>
        <SkipBack className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={player.onTogglePlay}
        disabled={disabled}
        title={title}
        aria-label={title}
        className="w-10 h-10 shrink-0 rounded-full bg-[#10203A] dark:bg-[#2464ED] text-white flex items-center justify-center hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
      >
        {player.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
      </button>
      <button type="button" onClick={player.onNext} title="Siguiente canción" className={skipButton}>
        <SkipForward className="w-4 h-4" />
      </button>
      <div className="min-w-0 max-w-[11rem] pl-1.5 pr-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-slate-900 dark:text-white">
          {player.song.title}
        </p>
        {status && (
          <p
            className={`truncate text-[11px] leading-tight ${
              player.error ? 'text-red-500 dark:text-red-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {status}
          </p>
        )}
      </div>
    </div>
  );
};
