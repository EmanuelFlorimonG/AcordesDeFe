import React, { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, Plus, TriangleAlert } from 'lucide-react';
import type { EventOccurrence, MinistryEvent } from '../../types/event';
import {
  firstDayOfMonth,
  formatLongDate,
  formatMonthTitle,
  monthGrid,
  monthOf,
  shiftMonth,
} from '../../utils/dates';
import { getEventsForMonth, getUpcomingEvents, isOccurrencePast, type CalendarNow } from '../../utils/ministryEvents';
import { primaryButton, secondaryButton } from '../Setlists/ui';
import { EventRow } from './EventRow';
import { MonthGrid } from './MonthGrid';

export type CalendarViewMode = 'month' | 'agenda';

interface CalendarViewProps {
  events: MinistryEvent[];
  now: CalendarNow;
  /** The day in focus; its month is the one shown */
  selectedDate: string;
  view: CalendarViewMode;
  onChangeView: (view: CalendarViewMode) => void;
  onSelectDate: (date: string) => void;
  onOpenOccurrence: (occurrence: EventOccurrence) => void;
  onCreate: (date: string) => void;
  /** True when the saved activities couldn't be read and were set aside */
  recoveredFromUnreadableData?: boolean;
}

/** How many coming activities the agenda lists. */
const AGENDA_LIMIT = 60;

const navButton =
  'shrink-0 w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';

/**
 * The ministry's calendar: a real month to look around in, and an agenda of
 * what comes next. Past months stay reachable: nothing is deleted because its
 * day has gone.
 */
export const CalendarView: React.FC<CalendarViewProps> = ({
  events,
  now,
  selectedDate,
  view,
  onChangeView,
  onSelectDate,
  onOpenOccurrence,
  onCreate,
  recoveredFromUnreadableData = false,
}) => {
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const month = monthOf(selectedDate);
  // The whole grid (with the neighbouring days it shows) is grouped once per
  // month, not once per selected day.
  const monthKey = selectedDate.slice(0, 7);
  const eventsByDay = useMemo(() => {
    const shown = monthOf(`${monthKey}-01`);
    const weeks = monthGrid(shown);
    return getEventsForMonth(events, shown, { from: weeks[0][0], to: weeks[weeks.length - 1][6] });
  }, [events, monthKey]);
  const dayOccurrences = eventsByDay.get(selectedDate) ?? [];
  const agenda = useMemo(() => getUpcomingEvents(events, now, AGENDA_LIMIT), [events, now]);

  const goToMonth = (delta: number) => {
    const target = shiftMonth(month, delta);
    const today = monthOf(now.date);
    onSelectDate(target.year === today.year && target.month === today.month ? now.date : firstDayOfMonth(target));
  };

  const header = (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Calendario</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Misas, ensayos y actividades del ministerio.</p>
      </div>
      <button type="button" onClick={() => onCreate(selectedDate)} className={primaryButton}>
        <Plus className="w-4 h-4" />
        Nueva actividad
      </button>
    </header>
  );

  const notice = recoveredFromUnreadableData && !isNoticeDismissed && (
    <div
      role="status"
      className="flex items-start gap-3 mb-6 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3"
    >
      <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-semibold">No se pudieron leer las actividades guardadas en este navegador.</p>
        <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/80">
          Se guardó una copia de los datos originales antes de empezar de nuevo, por si hiciera falta recuperarlos.
        </p>
      </div>
      <button
        type="button"
        onClick={() => setIsNoticeDismissed(true)}
        className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:underline"
      >
        Entendido
      </button>
    </div>
  );

  if (events.length === 0) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {header}
        {notice}
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <CalendarDays className="w-6 h-6 text-[#2464ED]" />
          </div>
          <h2 className="text-base font-bold text-[#10203A] dark:text-white">No hay actividades programadas.</h2>
          <p className="mt-1.5 mb-5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Añade la próxima Misa, el ensayo del viernes o cualquier actividad del ministerio.
          </p>
          <button type="button" onClick={() => onCreate(now.date)} className={primaryButton}>
            <Plus className="w-4 h-4" />
            Crear primera actividad
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {header}
      {notice}

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* The agenda always starts today, so it has no month to move through. */}
        {view === 'month' && (
          <div className="flex w-full sm:w-auto items-center gap-2">
            <button type="button" onClick={() => goToMonth(-1)} aria-label="Mes anterior" className={navButton}>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h2
              aria-live="polite"
              className="min-w-0 flex-1 sm:flex-none sm:min-w-[10.5rem] truncate text-center text-lg font-bold text-[#10203A] dark:text-white"
            >
              {formatMonthTitle(month)}
            </h2>
            <button type="button" onClick={() => goToMonth(1)} aria-label="Mes siguiente" className={navButton}>
              <ChevronRight className="w-4 h-4" />
            </button>
            <button type="button" onClick={() => onSelectDate(now.date)} className={`${secondaryButton} shrink-0 sm:ml-1`}>
              Hoy
            </button>
          </div>
        )}

        <div role="group" aria-label="Vista" className="flex rounded-lg border border-slate-200 dark:border-dark-700 p-0.5 bg-slate-50 dark:bg-dark-900">
          {(['month', 'agenda'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChangeView(mode)}
              aria-pressed={view === mode}
              className={`h-9 [@media(pointer:coarse)]:h-10 px-3.5 rounded-md text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                view === mode
                  ? 'bg-white dark:bg-dark-800 text-[#10203A] dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {mode === 'month' ? 'Mes' : 'Agenda'}
            </button>
          ))}
        </div>
      </div>

      {view === 'month' ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950">
            <MonthGrid
              month={month}
              eventsByDay={eventsByDay}
              selectedDate={selectedDate}
              todayIso={now.date}
              onSelectDate={onSelectDate}
            />
          </div>

          <section aria-labelledby="dia-seleccionado" className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 id="dia-seleccionado" className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
                {selectedDate === now.date ? 'Hoy · ' : ''}
                {formatLongDate(selectedDate, now.date)}
              </h2>
            </div>
            {dayOccurrences.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
                Nada programado este día.
              </p>
            ) : (
              <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
                {dayOccurrences.map((occurrence) => (
                  <li key={occurrence.key}>
                    <EventRow
                      occurrence={occurrence}
                      onOpen={onOpenOccurrence}
                      isPast={isOccurrencePast(occurrence, now)}
                    />
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => onCreate(selectedDate)}
              className="mt-2 inline-flex items-center gap-1.5 h-10 px-2.5 -ml-2.5 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
            >
              <Plus className="w-4 h-4" />
              Añadir actividad este día
            </button>
          </section>
        </div>
      ) : (
        <section aria-label="Próximas actividades">
          {agenda.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No hay actividades próximas. Las pasadas siguen en la vista de mes.
            </p>
          ) : (
            <AgendaGroups occurrences={agenda} now={now} onOpen={onOpenOccurrence} />
          )}
        </section>
      )}
    </div>
  );
};

const AgendaGroups: React.FC<{
  occurrences: EventOccurrence[];
  now: CalendarNow;
  onOpen: (occurrence: EventOccurrence) => void;
}> = ({ occurrences, now, onOpen }) => {
  const groups: Array<{ date: string; items: EventOccurrence[] }> = [];
  for (const occurrence of occurrences) {
    const last = groups[groups.length - 1];
    if (last && last.date === occurrence.date) last.items.push(occurrence);
    else groups.push({ date: occurrence.date, items: [occurrence] });
  }
  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.date}>
          <h3 className="mb-1.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            {group.date === now.date && (
              <span className="rounded-md bg-[#2464ED] px-1.5 py-0.5 text-[10px] text-white">Hoy</span>
            )}
            {formatLongDate(group.date, now.date)}
          </h3>
          <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
            {group.items.map((occurrence) => (
              <li key={occurrence.key}>
                <EventRow occurrence={occurrence} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
