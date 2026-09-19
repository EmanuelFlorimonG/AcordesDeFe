import React from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { Song } from '../../types/song';
import type { MassStop } from '../../utils/massMode';
import { getMassKey } from '../../utils/massMode';
import { Dialog } from '../Setlists/Dialog';
import { unavailableText } from '../../catalog/catalogStore';
import { useSongAvailability } from '../../catalog/useCatalog';

interface MassSetlistNavigatorProps {
  setlistName: string;
  stops: MassStop[];
  songsById: Map<string, Song>;
  currentItemId: string;
  /** Position of the song being played, to tell what is already behind us */
  currentPosition: number;
  isPiano: boolean;
  onSelect: (itemId: string) => void;
  onClose: () => void;
}

/**
 * The whole celebration at a glance, for the moment someone says "we're
 * skipping this one". Choosing a song only moves where we are: the setlist
 * itself is never changed from here.
 */
export const MassSetlistNavigator: React.FC<MassSetlistNavigatorProps> = ({
  setlistName,
  stops,
  songsById,
  currentItemId,
  currentPosition,
  isPiano,
  onSelect,
  onClose,
}) => {
  const availability = useSongAvailability();
  return (
    <Dialog title={setlistName} description="Toca una canción para ir a ella" onClose={onClose} size="sm">
      <ol className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
        {stops.map(({ item, position, isPlayable }) => {
          const song = songsById.get(item.songId);
          const isCurrent = item.id === currentItemId;
          const isPast = position !== null && position < currentPosition;
          const keyInfo = getMassKey(song, item, isPiano);

          return (
            <li key={item.id}>
              <button
                type="button"
                disabled={!isPlayable}
                onClick={() => onSelect(item.id)}
                aria-current={isCurrent ? 'true' : undefined}
                className={`w-full flex items-center gap-2.5 px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 ${
                  isCurrent
                    ? 'bg-[#EAF1FF] dark:bg-blue-500/10'
                    : isPlayable
                      ? 'hover:bg-slate-50 dark:hover:bg-dark-800'
                      : 'opacity-60'
                }`}
              >
                <span className="w-5 shrink-0 flex items-center justify-center" aria-hidden="true">
                  {isCurrent ? (
                    <ChevronRight className="w-4 h-4 text-[#2464ED] dark:text-sky-400" />
                  ) : isPast ? (
                    <Check className="w-4 h-4 text-slate-300 dark:text-dark-600" />
                  ) : (
                    <span className="font-mono text-[11px] tabular-nums text-slate-300 dark:text-dark-600">
                      {position !== null ? String(position).padStart(2, '0') : '—'}
                    </span>
                  )}
                </span>

                <span className="min-w-0 flex-1">
                  {item.moment && (
                    <span className="block truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-[#2464ED] dark:text-sky-400">
                      {item.moment}
                    </span>
                  )}
                  <span
                    className={`block truncate text-sm ${
                      isCurrent
                        ? 'font-bold text-[#10203A] dark:text-white'
                        : 'font-semibold text-slate-700 dark:text-slate-200'
                    }`}
                  >
                    {song?.title ?? 'Canción no disponible'}
                  </span>
                  {!isPlayable && (
                    <span className="block truncate text-[11px] text-slate-400 dark:text-slate-500">
                      {unavailableText(availability(item.songId)) ?? 'Ya no está en el cancionero'}
                    </span>
                  )}
                </span>

                {keyInfo && (
                  <span className="shrink-0 font-mono text-sm font-bold text-blue-600 dark:text-sky-400">
                    {keyInfo.displayed}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ol>
    </Dialog>
  );
};
