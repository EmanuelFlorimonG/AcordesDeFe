import React from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, EyeOff, Metronome, RotateCcw } from 'lucide-react';
import type { Instrument, Song } from '../../types/song';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { InstrumentToggle } from '../SongViewer/InstrumentToggle';
import { MetronomeControl } from '../SongViewer/MetronomeControl';
import { Stepper } from './RehearsalControls';

/** The existing transposition controls, as rehearsal mode needs them. */
export interface RehearsalKeyControls {
  /** Key the chords on screen are written in */
  displayedKey: string;
  /** Key the guitar actually sounds in, when a capo makes it differ */
  soundingKey: string | null;
  isModified: boolean;
  onTranspose: (delta: number) => void;
  onReset: () => void;
}

interface RehearsalHeaderProps {
  song: Song;
  keyControls: RehearsalKeyControls | null;
  /** Null hides the capo (piano mode) */
  capoFret: number | null;
  metronome: MetronomeControls;
  /** Null when the song has no chords, so there is nothing to switch */
  instrument: Instrument | null;
  onInstrumentChange: (instrument: Instrument) => void;
  isMetronomeOpen: boolean;
  onToggleMetronome: () => void;
  onEnterCleanScreen: () => void;
  onExit: () => void;
  /** Ready for setlists: shown only when provided. */
  previousSong?: Song | null;
  nextSong?: Song | null;
  onNavigateSong?: (song: Song) => void;
  /** Section navigation, rendered as the header's second row */
  children?: React.ReactNode;
}

const quietButton =
  'flex items-center justify-center gap-1.5 h-10 px-2.5 rounded-lg text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white transition-colors touch-manipulation';

export const RehearsalHeader: React.FC<RehearsalHeaderProps> = ({
  song,
  keyControls,
  capoFret,
  metronome,
  instrument,
  onInstrumentChange,
  isMetronomeOpen,
  onToggleMetronome,
  onEnterCleanScreen,
  onExit,
  previousSong,
  nextSong,
  onNavigateSong,
  children,
}) => {
  // "G · suena A · 72 BPM · 4/4 · Capo 2". The key moves into the stepper
  // once there is room for it, so it isn't shown twice.
  const info: Array<{ key: string; node: React.ReactNode; className?: string }> = [];
  if (keyControls) {
    info.push({
      key: 'tono',
      className: 'md:hidden',
      node: (
        <span className="font-mono font-bold text-blue-600 dark:text-sky-400">{keyControls.displayedKey}</span>
      ),
    });
    if (keyControls.soundingKey) {
      info.push({ key: 'suena', node: `suena ${keyControls.soundingKey}` });
    }
  }
  if (metronome.songBpm !== null) info.push({ key: 'bpm', node: `${metronome.songBpm} BPM` });
  if (song.timeSignature) info.push({ key: 'compas', node: song.timeSignature });
  if (capoFret) info.push({ key: 'capo', node: `Capo ${capoFret}` });

  return (
    <header className="shrink-0 border-b border-slate-200/80 dark:border-dark-800 bg-white/95 dark:bg-dark-950/95 backdrop-blur-sm pt-[env(safe-area-inset-top)]">
      {/* On short screens (a phone held sideways) the row shrinks to its content. */}
      <div className="flex items-center gap-1.5 sm:gap-3 h-14 sm:h-16 [@media(max-height:480px)]:h-auto [@media(max-height:480px)]:py-1 px-2 sm:px-5">
        <button type="button" onClick={onExit} title="Salir del modo ensayo (Esc)" className={quietButton}>
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Salir</span>
        </button>
        <span aria-hidden="true" className="hidden sm:block w-px h-6 bg-slate-200 dark:bg-dark-700" />

        {previousSong && onNavigateSong && (
          <button
            type="button"
            onClick={() => onNavigateSong(previousSong)}
            title={`Canción anterior: ${previousSong.title}`}
            className={quietButton}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] sm:text-base font-bold leading-tight tracking-tight text-slate-900 dark:text-white">
            {song.title}
            {song.artist && (
              <span className="font-medium text-slate-400 dark:text-slate-500"> · {song.artist}</span>
            )}
          </h1>
          {info.length > 0 && (
            <p className="mt-0.5 flex items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 [@media(max-height:480px)]:hidden">
              {info.map((item, index) => (
                <span key={item.key} className={`flex items-center gap-1.5 ${item.className ?? ''}`}>
                  {index > 0 && (
                    <span
                      aria-hidden="true"
                      className={`text-slate-300 dark:text-dark-600 ${index === 1 && keyControls ? 'md:hidden' : ''}`}
                    >
                      ·
                    </span>
                  )}
                  {item.node}
                </span>
              ))}
            </p>
          )}
        </div>

        {nextSong && onNavigateSong && (
          <button
            type="button"
            onClick={() => onNavigateSong(nextSong)}
            title={`Canción siguiente: ${nextSong.title}`}
            className={quietButton}
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}

        {/* On phones these live in the dock instead. */}
        <div className="hidden md:flex items-center gap-2">
          {keyControls && (
            <div className="flex items-center gap-1">
              <Stepper
                label="Tono"
                value={<span className="font-mono">{keyControls.displayedKey}</span>}
                onDecrease={() => keyControls.onTranspose(-1)}
                onIncrease={() => keyControls.onTranspose(1)}
                decreaseTitle="Bajar medio tono (−)"
                increaseTitle="Subir medio tono (+)"
              />
              {keyControls.isModified && (
                <button
                  type="button"
                  onClick={keyControls.onReset}
                  title="Volver al tono original"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 dark:hover:text-sky-400 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {instrument && <InstrumentToggle value={instrument} onChange={onInstrumentChange} />}

          <div data-rehearsal-popover className="relative">
            <button
              type="button"
              onClick={onToggleMetronome}
              aria-expanded={isMetronomeOpen}
              title="Metrónomo (M)"
              className={`flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-11 px-3 rounded-lg border text-sm font-semibold transition-colors ${
                metronome.isRunning
                  ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                  : 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800'
              }`}
            >
              <Metronome className="w-4 h-4" />
              <span className="font-mono tabular-nums">{metronome.bpm}</span>
            </button>
            {isMetronomeOpen && (
              <div className="absolute right-0 top-full z-20 mt-2 rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-3 shadow-xl">
                <MetronomeControl metronome={metronome} variant="panel" />
              </div>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onEnterCleanScreen}
          title="Pantalla limpia: solo la letra"
          aria-label="Pantalla limpia"
          className={quietButton}
        >
          <EyeOff className="w-4 h-4" />
          <span className="hidden xl:inline">Pantalla limpia</span>
        </button>
      </div>

      {children}
    </header>
  );
};
