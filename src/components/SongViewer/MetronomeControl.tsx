import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Metronome, Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { MAX_BPM, MIN_BPM } from '../../utils/metronomeEngine';
import { BANNER_CHIP_CLASS, BANNER_CHIP_LABEL_CLASS, BANNER_CHIP_VALUE_CLASS } from './infoChip';

interface MetronomeControlProps {
  metronome: MetronomeControls;
  /** "banner": chip on the song header. "dock": block in the presentation dock. */
  variant?: 'banner' | 'dock';
}

const HOLD_DELAY_MS = 400;
const HOLD_REPEAT_MS = 70;

/**
 * Press once for one step; keep pressing to keep stepping. Keyboard activation
 * (Enter/Space) steps once.
 */
function useHoldRepeat(action: () => void, disabled: boolean) {
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  const cancel = useCallback(() => {
    if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    if (intervalRef.current !== null) window.clearInterval(intervalRef.current);
    timeoutRef.current = null;
    intervalRef.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  // Reaching the limit while holding stops the repeat.
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled, cancel]);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.button !== 0 || disabled) return;
      action();
      cancel();
      timeoutRef.current = window.setTimeout(() => {
        intervalRef.current = window.setInterval(action, HOLD_REPEAT_MS);
      }, HOLD_DELAY_MS);
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    // Pointer presses are handled above; a click with detail 0 comes from the keyboard.
    onClick: (event: React.MouseEvent) => {
      if (event.detail === 0 && !disabled) action();
    },
  };
}

const BeatDots: React.FC<{ metronome: MetronomeControls }> = ({ metronome }) => {
  const { meter, currentPulse, isRunning } = metronome;
  return (
    <span className="flex items-center gap-1 px-1" aria-hidden="true">
      {meter.pulseLevels.map((level, index) => {
        const isActive = isRunning && currentPulse === index;
        const size = level === 'accent' ? 'w-2 h-2' : level === 'beat' ? 'w-1.5 h-1.5' : 'w-1 h-1';
        // In 6/8 and similar, a small gap shows the groups of three.
        const groupGap = meter.isCompound && index > 0 && index % 3 === 0 ? 'ml-1' : '';
        return (
          <span
            key={index}
            className={`rounded-full transition-[transform,background-color] duration-75 ${size} ${groupGap} ${
              isActive ? 'bg-white scale-125' : 'bg-white/35'
            }`}
          />
        );
      })}
    </span>
  );
};

const bannerIconButton =
  'w-6 h-6 flex items-center justify-center rounded-md text-white hover:bg-white/20 transition-colors disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation';

const dockButton =
  'w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md border transition-colors disabled:opacity-40 touch-manipulation';

export const MetronomeControl: React.FC<MetronomeControlProps> = ({ metronome, variant = 'banner' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isSupported, isRunning, bpm, songBpm, isBpmModified, meter, currentPulse } = metronome;

  const slower = useHoldRepeat(() => metronome.changeBpm(-1), bpm <= MIN_BPM);
  const faster = useHoldRepeat(() => metronome.changeBpm(1), bpm >= MAX_BPM);

  const unsupportedTitle = 'Tu navegador no permite reproducir el metrónomo';

  if (variant === 'dock') {
    return (
      <div className="flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
        <button
          type="button"
          onClick={metronome.toggle}
          disabled={!isSupported}
          aria-pressed={isRunning}
          title={!isSupported ? unsupportedTitle : isRunning ? 'Pausar metrónomo' : 'Iniciar metrónomo'}
          className={`${dockButton} ${
            isRunning
              ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
              : 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800'
          }`}
        >
          <Metronome className="w-4 h-4" />
        </button>
        <button
          type="button"
          {...slower}
          disabled={bpm <= MIN_BPM}
          title="Más lento"
          className={`${dockButton} ml-1 bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800`}
        >
          <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
        <div className="flex flex-col items-center px-1 sm:px-2 min-w-[45px] sm:min-w-[56px]">
          <span className="flex items-center gap-1 text-[9px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase">
            <span
              aria-hidden="true"
              className={`w-1.5 h-1.5 rounded-full transition-colors duration-75 ${
                isRunning && currentPulse === 0 ? 'bg-blue-600 dark:bg-sky-400' : 'bg-slate-300 dark:bg-dark-600'
              }`}
            />
            BPM
          </span>
          <span className="text-xs sm:text-sm font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
            {bpm}
          </span>
        </div>
        <button
          type="button"
          {...faster}
          disabled={bpm >= MAX_BPM}
          title="Más rápido"
          className={`${dockButton} bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800`}
        >
          <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
        </button>
      </div>
    );
  }

  const isOpen = isExpanded || isRunning;

  if (!isOpen) {
    return (
      <span className={`${BANNER_CHIP_CLASS} overflow-hidden`}>
        {songBpm !== null && (
          <span className="flex items-center gap-1.5 pl-2.5 pr-2">
            <span className={BANNER_CHIP_VALUE_CLASS}>{songBpm}</span>
            <span className={BANNER_CHIP_LABEL_CLASS}>BPM</span>
          </span>
        )}
        <button
          type="button"
          onClick={() => {
            setIsExpanded(true);
            metronome.start();
          }}
          disabled={!isSupported}
          title={isSupported ? `Iniciar metrónomo a ${bpm} BPM` : unsupportedTitle}
          className={`h-full flex items-center gap-1.5 px-2.5 font-semibold text-white hover:bg-white/15 transition-colors disabled:opacity-50 ${
            songBpm !== null ? 'border-l border-white/20' : ''
          }`}
        >
          <Play className="w-3 h-3 fill-current" />
          <span>Metrónomo</span>
        </button>
      </span>
    );
  }

  return (
    <span role="group" aria-label="Metrónomo" className={`${BANNER_CHIP_CLASS} gap-0.5 px-1`}>
      <button
        type="button"
        onClick={metronome.toggle}
        aria-pressed={isRunning}
        title={isRunning ? 'Pausar metrónomo' : 'Reanudar metrónomo'}
        className={bannerIconButton}
      >
        {isRunning ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
      </button>

      <span aria-hidden="true" className="w-px h-4 bg-white/20 mx-0.5" />

      <button type="button" {...slower} disabled={bpm <= MIN_BPM} title="Más lento" className={bannerIconButton}>
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="flex items-baseline justify-center gap-1 min-w-[4.5rem] tabular-nums" title={`Compás ${meter.label}`}>
        <span className={BANNER_CHIP_VALUE_CLASS}>{bpm}</span>
        <span className={BANNER_CHIP_LABEL_CLASS}>BPM</span>
      </span>
      <button type="button" {...faster} disabled={bpm >= MAX_BPM} title="Más rápido" className={bannerIconButton}>
        <Plus className="w-3.5 h-3.5" />
      </button>

      <span aria-hidden="true" className="w-px h-4 bg-white/20 mx-0.5" />

      <BeatDots metronome={metronome} />

      {isBpmModified && (
        <button
          type="button"
          onClick={metronome.resetBpm}
          title={`Volver a ${songBpm} BPM, el tempo de la canción`}
          className={bannerIconButton}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          metronome.stop();
          setIsExpanded(false);
        }}
        title="Cerrar metrónomo"
        className={bannerIconButton}
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
};
