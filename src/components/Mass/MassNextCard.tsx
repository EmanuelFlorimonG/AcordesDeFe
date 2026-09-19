import React from 'react';
import { ChevronRight, Flag, MessageSquare, Music4, Square, Zap } from 'lucide-react';
import type { SetlistSongTransition, SongTransitionType } from '../../types/setlist';
import type { MassKeyInfo } from '../../utils/massMode';
import { SONG_TRANSITION_LABELS } from '../../utils/songTransition';

export interface MassNextSong {
  title: string;
  moment: string;
  keyInfo: MassKeyInfo | null;
}

interface MassNextCardProps {
  next: MassNextSong | null;
  /** The song being played now, to show both keys side by side */
  currentTitle: string;
  currentMoment: string;
  currentKeyInfo: MassKeyInfo | null;
  /** Null on the last song, or when nothing was written down */
  transition: SetlistSongTransition | null;
  setlistName: string;
  total: number;
  onNext: () => void;
  onFinish: () => void;
}

const TRANSITION_ICONS: Record<SongTransitionType, React.ElementType> = {
  stop: Square,
  direct: Zap,
  instrumental: Music4,
  custom: MessageSquare,
};

const KeyLine: React.FC<{ label: string; title: string; keyInfo: MassKeyInfo | null }> = ({
  label,
  title,
  keyInfo,
}) => (
  <div className="min-w-0">
    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
      {label}
    </p>
    <p className="mt-0.5 truncate text-sm text-slate-600 dark:text-slate-300">
      {title}
      {keyInfo && (
        <>
          {' · '}
          <span className="font-mono font-bold text-blue-600 dark:text-sky-400">{keyInfo.displayed}</span>
        </>
      )}
    </p>
  </div>
);

/**
 * What comes after this song: which one it is, in what key, and what was
 * decided for the moment in between. Everything here is information for
 * whoever is playing; nothing happens on its own.
 */
export const MassNextCard: React.FC<MassNextCardProps> = ({
  next,
  currentTitle,
  currentMoment,
  currentKeyInfo,
  transition,
  setlistName,
  total,
  onNext,
  onFinish,
}) => {
  if (!next) {
    return (
      <section
        aria-label="Final del Setlist"
        className="mt-16 rounded-2xl border border-slate-200 dark:border-dark-700 bg-slate-50/70 dark:bg-dark-900/60 p-5 text-center"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          Última canción
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {setlistName} · {total} {total === 1 ? 'canción' : 'canciones'}
        </p>
        <button
          type="button"
          onClick={onFinish}
          className="mt-4 inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
        >
          <Flag className="w-4 h-4" />
          Terminar
        </button>
      </section>
    );
  }

  const changesMoment = Boolean(next.moment) && next.moment !== currentMoment;
  const TransitionIcon = transition ? TRANSITION_ICONS[transition.type] : null;

  return (
    <section
      aria-label="Siguiente canción"
      className={`rounded-2xl border border-slate-200 dark:border-dark-700 bg-slate-50/70 dark:bg-dark-900/60 p-4 sm:p-5 ${
        // A change of moment in the celebration deserves a little more air.
        changesMoment ? 'mt-20' : 'mt-14'
      }`}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
        Siguiente
      </p>

      <p className="mt-1.5 text-base sm:text-lg font-bold leading-snug text-[#10203A] dark:text-white break-words">
        {next.title}
      </p>

      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm">
        {next.moment && (
          <span
            className={`font-semibold uppercase tracking-[0.12em] ${
              changesMoment ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-400 dark:text-slate-500'
            }`}
          >
            {next.moment}
          </span>
        )}
        {next.keyInfo && (
          <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
            {next.keyInfo.displayed}
          </span>
        )}
        {next.keyInfo && next.keyInfo.capoFret > 0 && (
          <span className="text-slate-500 dark:text-slate-400">Cejilla {next.keyInfo.capoFret}</span>
        )}
      </p>

      {transition && TransitionIcon && (
        <div className="mt-3 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-3 py-2.5">
          <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
            <TransitionIcon
              aria-hidden="true"
              className={`w-3.5 h-3.5 shrink-0 ${transition.type === 'stop' ? 'fill-current' : ''}`}
            />
            Transición · {SONG_TRANSITION_LABELS[transition.type]}
          </p>
          {transition.instruction && (
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {transition.instruction}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-slate-200/80 dark:border-dark-700 pt-3">
        <KeyLine label="Ahora" title={currentTitle} keyInfo={currentKeyInfo} />
        <KeyLine label="Después" title={next.title} keyInfo={next.keyInfo} />
      </div>

      <button
        type="button"
        onClick={onNext}
        className="mt-4 inline-flex w-full sm:w-auto items-center justify-center gap-2 h-11 px-4 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        Ir a la siguiente
        <ChevronRight className="w-4 h-4" />
      </button>
    </section>
  );
};
