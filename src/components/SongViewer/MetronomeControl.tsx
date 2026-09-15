import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Minus, Pause, Play, Plus, RotateCcw, X } from 'lucide-react';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { MAX_BPM, MIN_BPM } from '../../utils/metronomeEngine';
import { BANNER_CHIP_CLASS, BANNER_CHIP_LABEL_CLASS, BANNER_CHIP_VALUE_CLASS } from './infoChip';

interface MetronomeControlProps {
  metronome: MetronomeControls;
  /**
   * "banner": chip on the coloured song header.
   * "panel": full controls on a light surface (rehearsal mode panels).
   */
  variant?: 'banner' | 'panel';
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

/** One dot per click of the bar; the first is larger, the one being heard lights up. */
const BeatDots: React.FC<{ metronome: MetronomeControls; tone: 'onColor' | 'light' }> = ({ metronome, tone }) => {
  const { meter, currentPulse, isRunning } = metronome;
  return (
    <span className="flex items-center gap-1 px-1" aria-hidden="true">
      {meter.pulseLevels.map((level, index) => {
        const isActive = isRunning && currentPulse === index;
        const size = level === 'accent' ? 'w-2 h-2' : level === 'beat' ? 'w-1.5 h-1.5' : 'w-1 h-1';
        // In 6/8 and similar, a small gap shows the groups of three.
        const groupGap = meter.isCompound && index > 0 && index % 3 === 0 ? 'ml-1' : '';
        const color =
          tone === 'onColor'
            ? isActive
              ? 'bg-white'
              : 'bg-white/35'
            : isActive
              ? 'bg-blue-600 dark:bg-sky-400'
              : 'bg-slate-300 dark:bg-dark-600';
        return (
          <span
            key={index}
            data-beat={index}
            data-active={isActive ? 'true' : undefined}
            className={`rounded-full transition-[transform,background-color] duration-75 ${size} ${groupGap} ${color} ${
              isActive ? 'scale-125' : ''
            }`}
          />
        );
      })}
    </span>
  );
};

const bannerIconButton =
  'w-6 h-6 flex items-center justify-center rounded-md text-white hover:bg-white/20 transition-colors disabled:opacity-40 disabled:hover:bg-transparent touch-manipulation';

const panelStepButton =
  'w-11 h-11 flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-dark-700 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent touch-manipulation';

export const MetronomeControl: React.FC<MetronomeControlProps> = ({ metronome, variant = 'banner' }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { isSupported, isRunning, bpm, songBpm, isBpmModified, meter } = metronome;

  const slower = useHoldRepeat(() => metronome.changeBpm(-1), bpm <= MIN_BPM);
  const faster = useHoldRepeat(() => metronome.changeBpm(1), bpm >= MAX_BPM);

  const unsupportedTitle = 'Tu navegador no permite reproducir el metrónomo';

  if (variant === 'panel') {
    return (
      <div role="group" aria-label="Metrónomo" className="w-[17.5rem] max-w-full space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={metronome.toggle}
            disabled={!isSupported}
            aria-pressed={isRunning}
            title={!isSupported ? unsupportedTitle : isRunning ? 'Pausar metrónomo' : 'Iniciar metrónomo'}
            className={`h-11 w-11 shrink-0 flex items-center justify-center rounded-xl transition-colors disabled:opacity-40 touch-manipulation ${
              isRunning
                ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-sky-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {isRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
          </button>

          <div
            role="group"
            aria-label="Tempo"
            className="flex flex-1 items-center justify-between rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-50/80 dark:bg-dark-800/60 p-0.5"
          >
            <button type="button" {...slower} disabled={bpm <= MIN_BPM} title="Más lento" aria-label="Más lento" className={panelStepButton}>
              <Minus className="w-4 h-4" />
            </button>
            <span className="flex items-baseline gap-1 tabular-nums" aria-live="polite">
              <span data-metronome-bpm="" className="font-mono text-lg font-bold text-slate-900 dark:text-white">
                {bpm}
              </span>
              <span className="text-xs text-slate-400">BPM</span>
            </span>
            <button type="button" {...faster} disabled={bpm >= MAX_BPM} title="Más rápido" aria-label="Más rápido" className={panelStepButton}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-[1.75rem] items-center justify-between gap-3">
          <span className="flex items-center gap-2" title={meter.isAssumed ? 'Compás supuesto: 4/4' : `Compás ${meter.label}`}>
            <BeatDots metronome={metronome} tone="light" />
            <span className="font-mono text-xs text-slate-400">{meter.label}</span>
          </span>
          {isBpmModified ? (
            <button
              type="button"
              onClick={metronome.resetBpm}
              title={`Volver a ${songBpm} BPM, el tempo de la canción`}
              className="flex items-center gap-1.5 h-7 px-2 rounded-lg text-xs font-semibold text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {songBpm} BPM
            </button>
          ) : (
            <span className="text-xs text-slate-400">
              {songBpm !== null ? 'Tempo de la canción' : 'Tempo sugerido'}
            </span>
          )}
        </div>
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

      <BeatDots metronome={metronome} tone="onColor" />

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
