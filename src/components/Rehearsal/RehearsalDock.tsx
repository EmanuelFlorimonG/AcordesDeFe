import React from 'react';
import {
  ALargeSmall,
  ArrowUpToLine,
  Guitar,
  Metronome,
  Music2,
  Pause,
  Piano,
  Play,
  RotateCcw,
} from 'lucide-react';
import type { Instrument } from '../../types/song';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { InstrumentToggle } from '../SongViewer/InstrumentToggle';
import { MetronomeControl } from '../SongViewer/MetronomeControl';
import { MiniPlayer, type CompactPlayerState } from '../Player/MiniPlayer';
import { AutoScrollPausedNotice, PanelLabel, Stepper } from './RehearsalControls';
import type { RehearsalKeyControls } from './RehearsalHeader';

/** Panels that open above the dock; used on phones, where the dock is icons only. */
export type DockPanel = 'speed' | 'font' | 'music' | 'metronome' | 'player';

export interface AutoScrollDockControls {
  isRunning: boolean;
  isInterrupted: boolean;
  speedLabel: string;
  canSpeedUp: boolean;
  canSpeedDown: boolean;
  onToggle: () => void;
  onSpeedUp: () => void;
  onSpeedDown: () => void;
  onScrollToTop: () => void;
}

export interface FontDockControls {
  label: string;
  canIncrease: boolean;
  canDecrease: boolean;
  onIncrease: () => void;
  onDecrease: () => void;
}

interface RehearsalDockProps {
  autoScroll: AutoScrollDockControls;
  font: FontDockControls;
  keyControls: RehearsalKeyControls | null;
  instrument: Instrument | null;
  onInstrumentChange: (instrument: Instrument) => void;
  metronome: MetronomeControls;
  player: CompactPlayerState | null;
  openPanel: DockPanel | null;
  onOpenPanelChange: (panel: DockPanel | null) => void;
}

// 44px targets on phones and on any touch screen; slightly tighter with a mouse.
const dockButton =
  'h-11 min-w-11 md:h-10 md:min-w-10 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:min-w-11 px-2 flex items-center justify-center gap-1.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-30 touch-manipulation';

const activeDockButton = 'bg-slate-100 dark:bg-dark-800 text-slate-900 dark:text-white';

const Divider: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span aria-hidden="true" className={`w-px h-6 shrink-0 bg-slate-200 dark:bg-dark-700 mx-0.5 ${className}`} />
);

/**
 * The floating controls of rehearsal mode. On tablets and computers every
 * control is inline; on phones the dock shows icons that open a small panel,
 * so it stays one comfortable row that doesn't cover the lyrics.
 */
export const RehearsalDock: React.FC<RehearsalDockProps> = ({
  autoScroll,
  font,
  keyControls,
  instrument,
  onInstrumentChange,
  metronome,
  player,
  openPanel,
  onOpenPanelChange,
}) => {
  const togglePanel = (panel: DockPanel) => onOpenPanelChange(openPanel === panel ? null : panel);
  const hasMusicPanel = Boolean(keyControls || instrument);

  const speedStepper = (size: 'md' | 'lg') => (
    <Stepper
      size={size}
      label="Velocidad del auto-scroll"
      value={<span className="font-mono">{autoScroll.speedLabel}</span>}
      onDecrease={autoScroll.onSpeedDown}
      onIncrease={autoScroll.onSpeedUp}
      canDecrease={autoScroll.canSpeedDown}
      canIncrease={autoScroll.canSpeedUp}
      decreaseTitle="Más lento (↓)"
      increaseTitle="Más rápido (↑)"
    />
  );

  const fontStepper = (size: 'md' | 'lg') => (
    <Stepper
      size={size}
      label="Tamaño de letra"
      value={font.label}
      valueClassName="min-w-[5.75rem] text-xs sm:text-sm"
      onDecrease={font.onDecrease}
      onIncrease={font.onIncrease}
      canDecrease={font.canDecrease}
      canIncrease={font.canIncrease}
      decreaseTitle="Letra más pequeña"
      increaseTitle="Letra más grande"
    />
  );

  let panel: React.ReactNode = null;
  switch (openPanel) {
    case 'speed':
      panel = (
        <>
          <PanelLabel>Velocidad del auto-scroll</PanelLabel>
          <div className="flex items-center gap-2">
            {speedStepper('lg')}
            <button type="button" onClick={autoScroll.onScrollToTop} className={`${dockButton} gap-1.5 px-3`}>
              <ArrowUpToLine className="w-4 h-4" />
              Arriba
            </button>
          </div>
        </>
      );
      break;
    case 'font':
      panel = (
        <>
          <PanelLabel>Tamaño de letra</PanelLabel>
          {fontStepper('lg')}
        </>
      );
      break;
    case 'music':
      panel = (
        <div className="space-y-3">
          {keyControls && (
            <div>
              <PanelLabel>Tono</PanelLabel>
              <div className="flex items-center gap-2">
                <Stepper
                  size="lg"
                  label="Tono"
                  value={<span className="font-mono">{keyControls.displayedKey}</span>}
                  onDecrease={() => keyControls.onTranspose(-1)}
                  onIncrease={() => keyControls.onTranspose(1)}
                  decreaseTitle="Bajar medio tono"
                  increaseTitle="Subir medio tono"
                />
                {keyControls.isModified && (
                  <button
                    type="button"
                    onClick={keyControls.onReset}
                    title="Volver al tono original"
                    aria-label="Volver al tono original"
                    className={dockButton}
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
          {instrument && (
            <div>
              <PanelLabel>Instrumento</PanelLabel>
              <InstrumentToggle value={instrument} onChange={onInstrumentChange} />
            </div>
          )}
        </div>
      );
      break;
    case 'metronome':
      panel = (
        <>
          <PanelLabel>Metrónomo</PanelLabel>
          <MetronomeControl metronome={metronome} variant="panel" />
        </>
      );
      break;
    case 'player':
      panel = player && <MiniPlayer player={player} />;
      break;
  }

  const floatingAbove = panel ? (
    <div
      role="dialog"
      aria-label="Ajustes"
      className="absolute bottom-full left-1/2 mb-2 w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-3 shadow-xl"
    >
      {panel}
    </div>
  ) : autoScroll.isInterrupted ? (
    <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap">
      <AutoScrollPausedNotice onResume={autoScroll.onToggle} />
    </div>
  ) : null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div data-rehearsal-popover className="pointer-events-auto relative">
        {floatingAbove}

        <div
          role="toolbar"
          aria-label="Controles del ensayo"
          className="flex items-center gap-0.5 md:gap-1 rounded-2xl border border-slate-200/80 dark:border-dark-700 bg-white/90 dark:bg-dark-900/90 p-1.5 shadow-[0_12px_40px_-12px_rgba(15,23,42,0.35)] backdrop-blur-md"
        >
          <button
            type="button"
            onClick={autoScroll.onToggle}
            aria-pressed={autoScroll.isRunning}
            title={autoScroll.isRunning ? 'Pausar auto-scroll (Espacio)' : 'Iniciar auto-scroll (Espacio)'}
            className={`h-11 md:h-10 [@media(pointer:coarse)]:h-11 min-w-11 flex items-center justify-center gap-2 px-3 rounded-xl text-sm font-semibold transition-colors touch-manipulation ${
              autoScroll.isRunning
                ? 'bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-sky-300 ring-1 ring-inset ring-blue-200 dark:ring-blue-500/30'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {autoScroll.isRunning ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            <span className="hidden lg:inline">Auto-scroll</span>
          </button>

          {/* Speed and back to top: inline from tablets up, in a panel on phones */}
          <div className="hidden md:flex items-center gap-1">
            {speedStepper('md')}
            <button
              type="button"
              onClick={autoScroll.onScrollToTop}
              title="Volver arriba"
              aria-label="Volver arriba"
              className={dockButton}
            >
              <ArrowUpToLine className="w-4 h-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => togglePanel('speed')}
            aria-expanded={openPanel === 'speed'}
            title="Velocidad del auto-scroll"
            className={`md:hidden font-mono ${dockButton} ${openPanel === 'speed' ? activeDockButton : ''}`}
          >
            {autoScroll.speedLabel}
          </button>

          <Divider />

          <div className="hidden md:flex">{fontStepper('md')}</div>
          <button
            type="button"
            onClick={() => togglePanel('font')}
            aria-expanded={openPanel === 'font'}
            title="Tamaño de letra"
            aria-label="Tamaño de letra"
            className={`md:hidden ${dockButton} ${openPanel === 'font' ? activeDockButton : ''}`}
          >
            <ALargeSmall className="w-5 h-5" />
          </button>

          {/* Phones only: the header holds these on larger screens */}
          {hasMusicPanel && (
            <button
              type="button"
              onClick={() => togglePanel('music')}
              aria-expanded={openPanel === 'music'}
              title="Tono e instrumento"
              aria-label="Tono e instrumento"
              className={`md:hidden ${dockButton} ${openPanel === 'music' ? activeDockButton : ''}`}
            >
              {keyControls ? (
                <span className="font-mono">{keyControls.displayedKey}</span>
              ) : instrument === 'piano' ? (
                <Piano className="w-5 h-5" />
              ) : (
                <Guitar className="w-5 h-5" />
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() => togglePanel('metronome')}
            aria-expanded={openPanel === 'metronome'}
            title="Metrónomo"
            aria-label="Metrónomo"
            className={`md:hidden ${dockButton} ${openPanel === 'metronome' ? activeDockButton : ''} ${
              metronome.isRunning ? 'text-blue-600 dark:text-sky-400' : ''
            }`}
          >
            <Metronome className="w-5 h-5" />
          </button>

          {player && (
            <>
              <Divider className="hidden md:block" />
              <div className="hidden md:flex">
                <MiniPlayer player={player} />
              </div>
              <button
                type="button"
                onClick={() => togglePanel('player')}
                aria-expanded={openPanel === 'player'}
                title="Reproductor"
                aria-label="Reproductor"
                className={`md:hidden relative ${dockButton} ${openPanel === 'player' ? activeDockButton : ''}`}
              >
                <Music2 className="w-5 h-5" />
                {player.isPlaying && (
                  <span aria-hidden="true" className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-blue-600" />
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
