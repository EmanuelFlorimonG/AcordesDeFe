import React from 'react';
import { ArrowRight } from 'lucide-react';
import type { EventOccurrence } from '../../types/event';
import type { PerformanceRecord } from '../../types/performance';
import { formatShortDate, formatWeekday } from '../../utils/dates';
import { performedSongs } from '../../utils/performanceHistory';
import { occurrenceTimeLabel, type CalendarNow } from '../../utils/ministryEvents';
import { EVENT_TYPE_ICONS, eventSoftClass, eventTextClass } from './eventTypeStyle';

interface UpcomingActivitiesProps {
  occurrences: EventOccurrence[];
  now: CalendarNow;
  onOpen: (occurrence: EventOccurrence) => void;
  onGoToCalendar: () => void;
  /** The most recent recorded celebration, shown as one quiet line */
  lastRecord?: PerformanceRecord | null;
  onOpenRecord?: (recordId: string) => void;
}

/**
 * The next few activities on the home page, kept small so the songbook stays
 * the main thing.
 */
export const UpcomingActivities: React.FC<UpcomingActivitiesProps> = ({
  occurrences,
  now,
  onOpen,
  onGoToCalendar,
  lastRecord = null,
  onOpenRecord,
}) => {
  return (
    <section aria-labelledby="proximas-actividades" className="mb-10">
      <div className="mb-3 flex items-end justify-between gap-3 px-1">
        <h2 id="proximas-actividades" className="text-lg font-extrabold tracking-tight text-[#10203A] dark:text-white">
          Próximas actividades
        </h2>
        <button
          type="button"
          onClick={onGoToCalendar}
          className="shrink-0 whitespace-nowrap inline-flex items-center gap-1 h-9 px-2 -mr-2 rounded-lg text-[13px] font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
        >
          Ver calendario
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
      {occurrences.length === 0 ? (
        <p className="px-1 text-sm text-slate-500 dark:text-slate-400">No hay actividades programadas.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {occurrences.map((occurrence) => {
            const Icon = EVENT_TYPE_ICONS[occurrence.event.type];
            const isToday = occurrence.date === now.date;
            return (
              <li key={occurrence.key}>
                <button
                  type="button"
                  onClick={() => onOpen(occurrence)}
                  className="w-full h-full flex items-start gap-3 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 p-3 text-left hover:border-[#2464ED]/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  <span className={`w-9 h-9 shrink-0 flex items-center justify-center rounded-lg ${eventSoftClass(occurrence.event.type)} ${eventTextClass(occurrence.event.type)}`}>
                    <Icon aria-hidden="true" className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em]">
                      {isToday ? (
                        <span className="rounded bg-[#2464ED] px-1.5 text-white">Hoy</span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">{formatWeekday(occurrence.date)}</span>
                      )}
                      <span className="whitespace-nowrap text-slate-400 dark:text-slate-500 normal-case tracking-normal">
                        {occurrenceTimeLabel(occurrence)}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-bold text-[#10203A] dark:text-white">
                      {occurrence.event.title}
                    </span>
                    {occurrence.event.location && (
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{occurrence.event.location}</span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {lastRecord && onOpenRecord && (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 px-1 text-sm text-slate-500 dark:text-slate-400">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            Última celebración
          </span>
          <span className="min-w-0 truncate">
            <span className="font-semibold text-slate-700 dark:text-slate-200">{lastRecord.event.title}</span> ·{' '}
            {formatShortDate(lastRecord.occurrenceDate)} · {performedSongs(lastRecord).length}{' '}
            {performedSongs(lastRecord).length === 1 ? 'canción' : 'canciones'}
          </span>
          <button
            type="button"
            onClick={() => onOpenRecord(lastRecord.id)}
            aria-label={`Ver la interpretación de ${lastRecord.event.title}`}
            className="h-10 px-2 -ml-2 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
          >
            Ver
          </button>
        </p>
      )}
    </section>
  );
};
