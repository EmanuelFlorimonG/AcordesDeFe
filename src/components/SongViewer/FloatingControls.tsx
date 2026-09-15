import React, { useState } from 'react';
import { Minus, Plus, RotateCcw, Type, Columns, Guitar, Play, Pause, Sliders, X } from 'lucide-react';
import type { ViewSettings } from '../../types/song';

interface FloatingControlsProps {
  settings: ViewSettings;
  onUpdateSettings: React.Dispatch<React.SetStateAction<ViewSettings>>;
  currentKey: string;
  isModified: boolean;
  onExitPresentation: () => void;
  onTranspose: (delta: number) => void;
  onCapoChange: (delta: number) => void;
  onResetTranspose: () => void;
  onFontSizeChange: (delta: number) => void;
  onToggleAutoScroll: () => void;
  onChangeScrollSpeed: (delta: number) => void;
  onToggleShowChords: () => void;
  /** Metronome block, so it can be controlled without leaving presentation mode */
  metronomeSlot?: React.ReactNode;
}

export const FloatingControls: React.FC<FloatingControlsProps> = ({
  settings,
  onUpdateSettings,
  currentKey,
  isModified,
  onExitPresentation,
  onTranspose,
  onCapoChange,
  onResetTranspose,
  onFontSizeChange,
  onToggleAutoScroll,
  onChangeScrollSpeed,
  onToggleShowChords,
  metronomeSlot,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-5xl">
      {/* Expanded Tools Tray */}
      {isExpanded && (
        <div className="mb-2 p-4 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg shadow-lg flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Velocidad Scroll:
            </span>
            <div className="flex items-center gap-1 bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
              <button
                onClick={() => onChangeScrollSpeed(-1)}
                disabled={settings.autoScrollSpeed <= 1}
                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400 px-2">
                {settings.autoScrollSpeed}x
              </span>
              <button
                onClick={() => onChangeScrollSpeed(1)}
                disabled={settings.autoScrollSpeed >= 5}
                className="px-2 py-1 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onUpdateSettings((prev) => ({ ...prev, twoColumns: !prev.twoColumns }))
              }
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                settings.twoColumns
                  ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                  : 'bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-700 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-800'
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
              <span>{settings.twoColumns ? '2 Columnas' : '1 Columna'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Bottom Control Dock */}
      <div className="flex items-center justify-between gap-2 p-2.5 sm:p-3 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg shadow-lg overflow-x-auto scrollbar-none">
        {/* Left: Exit presentation mode */}
        <button
          onClick={onExitPresentation}
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-md bg-white dark:bg-dark-900 hover:bg-slate-50 dark:hover:bg-dark-800 text-slate-700 dark:text-slate-200 text-xs sm:text-sm font-medium transition-colors border border-slate-200 dark:border-dark-700"
          title="Salir de modo presentación"
        >
          <X className="w-4 h-4 text-blue-600" />
          <span className="hidden md:inline">Salir</span>
        </button>

        {/* Center: Pitch & Capo Transposer Controls */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Tone Block */}
          <div className="flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
            <button
              onClick={() => onTranspose(-1)}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
            >
              <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <div className="flex flex-col items-center px-1 sm:px-2 min-w-[45px] sm:min-w-[60px]">
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase">
                Tono
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                {currentKey}
              </span>
            </div>

            <button
              onClick={() => onTranspose(1)}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Capo Block */}
          <div className="flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
            <button
              onClick={() => onCapoChange(-1)}
              disabled={settings.capoFret <= 0}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors disabled:opacity-40"
            >
              <Minus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>

            <div className="flex flex-col items-center px-1 sm:px-2 min-w-[45px] sm:min-w-[60px]">
              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-bold tracking-wider uppercase">
                Capo
              </span>
              <span className="text-xs sm:text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                {settings.capoFret === 0 ? '--' : settings.capoFret}
              </span>
            </div>

            <button
              onClick={() => onCapoChange(1)}
              disabled={settings.capoFret >= 11}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded-md bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </button>
          </div>

          {/* Reset Button */}
          {isModified && (
            <button
              onClick={onResetTranspose}
              className="p-1.5 sm:p-2 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-dark-800 rounded-md transition-colors"
              title="Restablecer tono y capo originales"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}

          {metronomeSlot}
        </div>

        {/* Right Section: Font Size, Diagrams, Auto-scroll & Toggle Extra Options */}
        <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
          {/* Toggle Chords */}
          <button
            onClick={onToggleShowChords}
            className={`p-1.5 sm:p-2 rounded-md border transition-colors ${
              settings.showChords
                ? 'bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-700 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-800'
                : 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
            }`}
            title={settings.showChords ? 'Ver solo la letra, sin acordes' : 'Mostrar los acordes de nuevo'}
          >
            <Guitar className="w-4 h-4" />
          </button>

          {/* Font Size Adjuster */}
          <div className="hidden lg:flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
            <button
              onClick={() => onFontSizeChange(-1)}
              disabled={settings.fontSize === 'sm'}
              className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              title="Reducir tamaño de letra"
            >
              <span className="text-xs font-bold">A-</span>
            </button>
            <Type className="w-3.5 h-3.5 text-slate-400 mx-0.5" />
            <button
              onClick={() => onFontSizeChange(1)}
              disabled={settings.fontSize === 'xl'}
              className="w-7 h-7 flex items-center justify-center text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white disabled:opacity-30"
              title="Aumentar tamaño de letra"
            >
              <span className="text-sm font-bold">A+</span>
            </button>
          </div>

          {/* Auto Scroll */}
          <button
            onClick={onToggleAutoScroll}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-md text-xs sm:text-sm font-semibold transition-colors border ${
              settings.isAutoScrolling
                ? 'bg-white dark:bg-dark-900 border-slate-300 dark:border-dark-700 text-slate-900 dark:text-white'
                : 'bg-blue-600 border-blue-600 hover:bg-blue-700 hover:border-blue-700 text-white'
            }`}
            title={settings.isAutoScrolling ? 'Pausar' : 'Auto-scroll'}
          >
            {settings.isAutoScrolling ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4 fill-white" />
            )}
          </button>

          {/* Expand Tray Button */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 sm:p-2 rounded-md border transition-colors ${
              isExpanded
                ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-500/30'
                : 'bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-700 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-dark-800'
            }`}
            title="Más opciones (Velocidad, columnas)"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
