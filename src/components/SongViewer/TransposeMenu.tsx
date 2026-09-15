import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpDown, ChevronDown, Minus, Plus, RotateCcw } from 'lucide-react';

interface TransposeMenuProps {
  currentKey: string;
  soundingKeyWithCapo: string | null;
  capoFret: number;
  isModified: boolean;
  onTranspose: (delta: number) => void;
  onCapoChange: (delta: number) => void;
  onReset: () => void;
  /**
   * Hides the capo controls, which mean nothing on a piano. The capo value
   * itself is untouched, so it comes back as it was on returning to guitar.
   */
  showCapo?: boolean;
}

export const TransposeMenu: React.FC<TransposeMenuProps> = ({
  currentKey,
  soundingKeyWithCapo,
  capoFret,
  isModified,
  onTranspose,
  onCapoChange,
  onReset,
  showCapo = true,
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold border transition-colors ${
          isModified
            ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400'
            : 'bg-white dark:bg-dark-900 border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800'
        }`}
      >
        <ArrowUpDown className="w-4 h-4" />
        <span>Transponer</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-72 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg shadow-lg z-20 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Tono</p>
              <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">{currentKey}</p>
            </div>
            <div className="flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
              <button
                onClick={() => onTranspose(-1)}
                className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                onClick={() => onTranspose(1)}
                className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 ml-1"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {showCapo && (
            <>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Cejilla</p>
                  <p className="text-lg font-mono font-bold text-slate-900 dark:text-white">
                    {capoFret === 0 ? 'Sin cejilla' : `Traste ${capoFret}`}
                  </p>
                </div>
                <div className="flex items-center bg-slate-50 dark:bg-dark-800 p-1 rounded-md border border-slate-200 dark:border-dark-700">
                  <button
                    onClick={() => onCapoChange(-1)}
                    disabled={capoFret <= 0}
                    className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 disabled:opacity-40"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => onCapoChange(1)}
                    disabled={capoFret >= 11}
                    className="w-8 h-8 flex items-center justify-center rounded bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 disabled:opacity-40 ml-1"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {soundingKeyWithCapo && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  Suena en <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">{soundingKeyWithCapo}</span> con cejilla en el traste {capoFret}
                </p>
              )}
            </>
          )}

          {isModified && (
            <button
              onClick={onReset}
              className="w-full flex items-center justify-center gap-1.5 mt-4 pt-3 border-t border-slate-100 dark:border-dark-800 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {showCapo ? 'Restablecer tono y cejilla original' : 'Restablecer el tono original'}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
