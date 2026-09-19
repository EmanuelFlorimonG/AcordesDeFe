import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { PerformanceRecord } from '../../types/performance';
import { formatShortDate } from '../../utils/dates';
import { describePerformedKey, getPerformancesForSong } from '../../utils/performanceHistory';

interface SongHistoryCardProps {
  songId: string;
  records: PerformanceRecord[];
  onOpenHistory: () => void;
}

/**
 * Where this song was really sung, in the song's side column. It says nothing
 * at all until a performance of it has been recorded.
 */
export const SongHistoryCard: React.FC<SongHistoryCardProps> = ({ songId, records, onOpenHistory }) => {
  const performances = getPerformancesForSong(records, songId);
  if (performances.length === 0) return null;
  const last = performances[0];
  const key = describePerformedKey(last.songs[0]);
  const year = last.record.occurrenceDate.slice(0, 4);
  return (
    <section
      aria-labelledby="cancion-historial"
      className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg p-4"
    >
      <h3 id="cancion-historial" className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
        Historial
      </h3>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
        {performances.length === 1 ? 'Interpretada 1 vez' : `Interpretada ${performances.length} veces`}
      </p>
      <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">
        Última vez: {formatShortDate(last.record.occurrenceDate)} {year}
        {key ? ` · ${key}` : ''}
      </p>
      <button
        type="button"
        onClick={onOpenHistory}
        className="mt-2 inline-flex items-center gap-1 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
      >
        Ver historial
        <ArrowRight className="w-4 h-4" />
      </button>
    </section>
  );
};
