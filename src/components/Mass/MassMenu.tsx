import React from 'react';
import { Check, LogOut, Maximize, Minimize, Moon, Music, Sun } from 'lucide-react';
import type { Instrument } from '../../types/song';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { InstrumentToggle } from '../SongViewer/InstrumentToggle';
import { MetronomeControl } from '../SongViewer/MetronomeControl';
import { Dialog } from '../Setlists/Dialog';
import { sectionHeading } from '../Setlists/ui';

interface MassMenuProps {
  metronome: MetronomeControls;
  /** Null when the song has no chords to draw */
  instrument: Instrument | null;
  onInstrumentChange: (instrument: Instrument) => void;
  showChords: boolean;
  onShowChordsChange: (show: boolean) => void;
  wakeLock: { isSupported: boolean; isActive: boolean };
  fullscreen: { isSupported: boolean; isFullscreen: boolean; toggle: () => void };
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onExit: () => void;
  onClose: () => void;
}

const row =
  'w-full flex items-center justify-between gap-3 h-12 px-3 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';

/**
 * Everything that isn't needed while the choir is singing: the metronome
 * before starting, which instrument the chords are drawn for, the screen, and
 * the way out.
 */
export const MassMenu: React.FC<MassMenuProps> = ({
  metronome,
  instrument,
  onInstrumentChange,
  showChords,
  onShowChordsChange,
  wakeLock,
  fullscreen,
  isDarkMode,
  onToggleDarkMode,
  onExit,
  onClose,
}) => (
  <Dialog title="Modo Misa" onClose={onClose} size="sm">
    <div className="space-y-5">
      {metronome.isSupported && (
        <div>
          <p className={`${sectionHeading} mb-2`}>Metrónomo</p>
          <MetronomeControl metronome={metronome} variant="panel" />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Se detiene solo al cambiar de canción.
          </p>
        </div>
      )}

      <div>
        <p className={`${sectionHeading} mb-2`}>Lo que se ve</p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => onShowChordsChange(!showChords)}
            aria-pressed={showChords}
            className={row}
          >
            <span className="flex items-center gap-2">
              <Music aria-hidden="true" className="w-4 h-4" />
              Acordes
            </span>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {showChords ? 'Se ven' : 'Solo letra'}
            </span>
          </button>

          {instrument && (
            <div className="flex items-center justify-between gap-3 h-12 px-3 rounded-xl border border-slate-200 dark:border-dark-700">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Diagramas</span>
              <InstrumentToggle value={instrument} onChange={onInstrumentChange} />
            </div>
          )}

          <button type="button" onClick={onToggleDarkMode} className={row}>
            <span className="flex items-center gap-2">
              {isDarkMode ? (
                <Moon aria-hidden="true" className="w-4 h-4" />
              ) : (
                <Sun aria-hidden="true" className="w-4 h-4" />
              )}
              Tema
            </span>
            <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
              {isDarkMode ? 'Oscuro' : 'Claro'}
            </span>
          </button>
        </div>
      </div>

      <div>
        <p className={`${sectionHeading} mb-2`}>Pantalla</p>
        <div className="space-y-2">
          {fullscreen.isSupported && (
            <button
              type="button"
              onClick={fullscreen.toggle}
              aria-pressed={fullscreen.isFullscreen}
              className={row}
            >
              <span className="flex items-center gap-2">
                {fullscreen.isFullscreen ? (
                  <Minimize aria-hidden="true" className="w-4 h-4" />
                ) : (
                  <Maximize aria-hidden="true" className="w-4 h-4" />
                )}
                Pantalla completa
              </span>
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">
                {fullscreen.isFullscreen ? 'Activada' : 'Desactivada'}
              </span>
            </button>
          )}

          {/* Nothing is promised here: what it says is what is actually happening. */}
          <p className="flex items-center justify-between gap-3 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
            <span>Pantalla siempre encendida</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold">
              {wakeLock.isActive ? (
                <>
                  <Check aria-hidden="true" className="w-3.5 h-3.5 text-[#2464ED] dark:text-sky-400" />
                  Activa
                </>
              ) : wakeLock.isSupported ? (
                'No disponible ahora'
              ) : (
                'No disponible en este navegador'
              )}
            </span>
          </p>
        </div>
      </div>

      <button
        type="button"
        onClick={onExit}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-xl border border-slate-200 dark:border-dark-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:border-red-300 hover:text-red-600 dark:hover:text-red-400 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        <LogOut aria-hidden="true" className="w-4 h-4" />
        Salir del Modo Misa
      </button>
    </div>
  </Dialog>
);
