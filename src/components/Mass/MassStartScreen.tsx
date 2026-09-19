import React from 'react';
import { ChevronRight, Play } from 'lucide-react';
import type { Song } from '../../types/song';
import type { MassStop } from '../../utils/massMode';
import { formatSetlistDate, formatSongCount } from '../../utils/setlists';
import { unavailableText } from '../../catalog/catalogStore';
import { useSongAvailability } from '../../catalog/useCatalog';

interface MassStartScreenProps {
  setlistName: string;
  /** "YYYY-MM-DD" or empty */
  date: string;
  stops: MassStop[];
  songsById: Map<string, Song>;
  /** The song the celebration starts with, unless another one is chosen */
  firstItemId: string | null;
  onStart: (itemId: string) => void;
  onExit: () => void;
  exitLabel: string;
}

/**
 * The half-second before the celebration begins: what is going to be sung, in
 * order, and one button. Any song can be the starting point, for the times
 * when the first ones have already been sung.
 */
export const MassStartScreen: React.FC<MassStartScreenProps> = ({
  setlistName,
  date,
  stops,
  songsById,
  firstItemId,
  onStart,
  onExit,
  exitLabel,
}) => {
  const availability = useSongAvailability();
  // "domingo, 20 de septiembre de 2026" with one capital, like the setlist page.
  const longDate = formatSetlistDate(date, 'long');
  const dateLabel = longDate ? longDate.charAt(0).toUpperCase() + longDate.slice(1) : '';
  const playable = stops.filter((stop) => stop.isPlayable);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-xl px-5 sm:px-8 py-8 sm:py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#2464ED] dark:text-sky-400">
          Modo Misa
        </p>
        <h1 className="mt-2 text-2xl sm:text-3xl font-bold leading-tight tracking-tight text-[#10203A] dark:text-white break-words">
          {setlistName}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {dateLabel && <span>{dateLabel} · </span>}
          {formatSongCount(playable.length)}
        </p>

        <ol className="mt-6 rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
          {stops.map(({ item, position, isPlayable }) => {
            const song = songsById.get(item.songId);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!isPlayable}
                  onClick={() => onStart(item.id)}
                  title={isPlayable ? `Empezar en ${song?.title ?? 'esta canción'}` : undefined}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 ${
                    isPlayable ? 'hover:bg-slate-50 dark:hover:bg-dark-800' : 'opacity-60'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="w-6 shrink-0 text-center font-mono text-xs tabular-nums text-slate-300 dark:text-dark-600"
                  >
                    {position !== null ? String(position).padStart(2, '0') : '—'}
                  </span>
                  <span className="min-w-0 flex-1">
                    {item.moment && (
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2464ED] dark:text-sky-400">
                        {item.moment}
                      </span>
                    )}
                    <span className="block truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {song?.title ?? 'Canción no disponible'}
                    </span>
                    {!isPlayable && (
                      <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                        {unavailableText(availability(item.songId)) ?? 'Ya no está en el cancionero'}
                      </span>
                    )}
                  </span>
                  {isPlayable && (
                    <ChevronRight
                      aria-hidden="true"
                      className="w-4 h-4 shrink-0 text-slate-300 dark:text-dark-600"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          <button
            type="button"
            autoFocus
            disabled={!firstItemId}
            onClick={() => firstItemId && onStart(firstItemId)}
            className="inline-flex items-center gap-2 h-12 px-5 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors disabled:opacity-40 touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            <Play className="w-4 h-4" />
            Comenzar
          </button>
          <button
            type="button"
            onClick={onExit}
            className="h-12 px-3 rounded-xl text-sm font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors touch-manipulation"
          >
            {exitLabel}
          </button>
        </div>

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          También puedes empezar en cualquier canción de la lista.
        </p>
      </div>
    </div>
  );
};
