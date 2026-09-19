import React from 'react';
import { ChevronLeft, ChevronRight, Minus, Pause, Play, Plus } from 'lucide-react';

interface MassControlsProps {
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  autoScroll: {
    isRunning: boolean;
    speedLabel: string;
    canSpeedUp: boolean;
    canSpeedDown: boolean;
    onToggle: () => void;
    onSpeedUp: () => void;
    onSpeedDown: () => void;
  };
  font: {
    label: string;
    canIncrease: boolean;
    canDecrease: boolean;
    onIncrease: () => void;
    onDecrease: () => void;
  };
}

const tinyButton =
  'w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors disabled:opacity-25 disabled:hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 touch-manipulation';

const songButton =
  'flex items-center gap-1.5 h-11 px-3 sm:px-4 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors disabled:opacity-30 disabled:hover:border-slate-200 dark:disabled:hover:border-dark-700 disabled:hover:text-slate-700 dark:disabled:hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 touch-manipulation';

/**
 * The only controls on screen while playing: where to go next, and how the
 * page moves. Everything else lives behind the menu, so the words stay the
 * biggest thing in the room.
 */
export const MassControls: React.FC<MassControlsProps> = ({
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  autoScroll,
  font,
}) => (
  <div className="shrink-0 border-t border-slate-100 dark:border-dark-800 bg-white/95 dark:bg-dark-950/95 backdrop-blur-sm">
    <div className="mx-auto flex w-full max-w-4xl items-center gap-2 px-3 sm:px-8 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] [@media(max-height:480px)]:py-1 [@media(max-height:480px)]:pb-1">
      <button type="button" onClick={onPrevious} disabled={!canGoPrevious} className={songButton}>
        <ChevronLeft className="w-4 h-4" />
        <span className="hidden sm:inline">Anterior</span>
        <span className="sr-only sm:hidden">Canción anterior</span>
      </button>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 sm:gap-1">
        <button
          type="button"
          onClick={autoScroll.onToggle}
          aria-pressed={autoScroll.isRunning}
          title={autoScroll.isRunning ? 'Detener el desplazamiento' : 'Desplazar solo'}
          className={`flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-11 px-2.5 rounded-lg text-[13px] font-semibold transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
            autoScroll.isRunning
              ? 'bg-[#2464ED] text-white hover:bg-[#1D56D6]'
              : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          {autoScroll.isRunning ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          Auto
        </button>

        <div role="group" aria-label="Velocidad del desplazamiento" className="flex items-center">
          <button
            type="button"
            onClick={autoScroll.onSpeedDown}
            disabled={!autoScroll.canSpeedDown}
            aria-label="Más lento"
            title="Más lento"
            className={tinyButton}
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
          <span className="w-10 text-center font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
            {autoScroll.speedLabel}
          </span>
          <button
            type="button"
            onClick={autoScroll.onSpeedUp}
            disabled={!autoScroll.canSpeedUp}
            aria-label="Más rápido"
            title="Más rápido"
            className={tinyButton}
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>

        <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-slate-200 dark:bg-dark-700" />

        <div role="group" aria-label="Tamaño del texto" className="flex items-center">
          <button
            type="button"
            onClick={font.onDecrease}
            disabled={!font.canDecrease}
            aria-label="Texto más pequeño"
            title={`Texto más pequeño (ahora: ${font.label.toLowerCase()})`}
            className={tinyButton}
          >
            <span className="text-xs font-bold">A−</span>
          </button>
          <button
            type="button"
            onClick={font.onIncrease}
            disabled={!font.canIncrease}
            aria-label="Texto más grande"
            title={`Texto más grande (ahora: ${font.label.toLowerCase()})`}
            className={tinyButton}
          >
            <span className="text-sm font-bold">A+</span>
          </button>
        </div>
      </div>

      <button type="button" onClick={onNext} disabled={!canGoNext} className={songButton}>
        <span className="hidden sm:inline">Siguiente</span>
        <span className="sr-only sm:hidden">Canción siguiente</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  </div>
);
