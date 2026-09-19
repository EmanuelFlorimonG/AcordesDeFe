import React from 'react';
import { Flag } from 'lucide-react';
import { formatSongCount } from '../../utils/setlists';

interface MassEndScreenProps {
  setlistName: string;
  total: number;
  onBackToSetlist: () => void;
  /** For when "Terminar" was pressed by mistake */
  onResume: () => void;
  exitLabel: string;
  /**
   * Present only when Mass mode was opened from a scheduled activity: starts
   * closing that activity. Reaching this screen never closes anything by itself.
   */
  onFinishCelebration?: () => void;
}

/** The end of the celebration: sober, and a way back. */
export const MassEndScreen: React.FC<MassEndScreenProps> = ({
  setlistName,
  total,
  onBackToSetlist,
  onResume,
  exitLabel,
  onFinishCelebration,
}) => (
  <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-10 text-center">
    <div className="mb-5 w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center">
      <Flag aria-hidden="true" className="w-6 h-6 text-[#2464ED] dark:text-sky-400" />
    </div>
    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
      Fin del Setlist
    </p>
    <h1 className="mt-2 text-xl sm:text-2xl font-bold tracking-tight text-[#10203A] dark:text-white break-words">
      {setlistName}
    </h1>
    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{formatSongCount(total)}</p>

    {onFinishCelebration && (
      <button
        type="button"
        autoFocus
        onClick={onFinishCelebration}
        className="mt-7 inline-flex items-center justify-center h-12 px-5 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        Finalizar celebración
      </button>
    )}
    <button
      type="button"
      autoFocus={!onFinishCelebration}
      onClick={onBackToSetlist}
      className={
        onFinishCelebration
          ? 'mt-3 inline-flex items-center justify-center h-11 px-5 rounded-xl border border-slate-200 dark:border-dark-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40'
          : 'mt-7 inline-flex items-center justify-center h-12 px-5 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40'
      }
    >
      {exitLabel}
    </button>
    <button
      type="button"
      onClick={onResume}
      className="mt-2 h-11 px-3 rounded-lg text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors touch-manipulation"
    >
      Volver a la última canción
    </button>
  </div>
);
