import React, { useId, useMemo, useState } from 'react';
import { CalendarDays, History, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import type { MinistryEventType } from '../../types/event';
import type { PerformanceRecord } from '../../types/performance';
import { formatMonthTitle, formatShortDate } from '../../utils/dates';
import { EVENT_TYPES, EVENT_TYPE_LABELS } from '../../utils/ministryEvents';
import {
  EMPTY_PERFORMANCE_FILTERS,
  countSoloSongsForMember,
  describePerformedKey,
  describeRecordSize,
  filterPerformances,
  getPerformancesForMember,
  getSongPerformanceCount,
  groupPerformancesByMonth,
  hasPerformanceFilters,
  listHistoryPeople,
  listHistorySongs,
  performedSongs,
  soloistsOf,
  type PerformanceFilters,
} from '../../utils/performanceHistory';
import { EventTypeBadge } from '../Calendar/EventTypeBadge';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';
import { DatePicker } from '../ui/DatePicker';

interface HistoryViewProps {
  records: PerformanceRecord[];
  filters: PerformanceFilters;
  onChangeFilters: (filters: PerformanceFilters) => void;
  onOpenRecord: (recordId: string) => void;
  onGoToCalendar: () => void;
  recoveredFromUnreadableData: boolean;
}

const selectClass = `${textField} pr-8`;

/**
 * What was really sung, day by day. Only records made on purpose appear here:
 * never songs someone opened (that is "Recientes"), never dates that simply
 * went by.
 */
export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  filters,
  onChangeFilters,
  onOpenRecord,
  onGoToCalendar,
  recoveredFromUnreadableData,
}) => {
  const [showFilters, setShowFilters] = useState(() => hasPerformanceFilters(filters));
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const ids = { type: useId(), song: useId(), member: useId(), from: useId(), to: useId() };

  const songOptions = useMemo(() => listHistorySongs(records), [records]);
  const peopleOptions = useMemo(() => listHistoryPeople(records), [records]);
  const filtered = useMemo(() => filterPerformances(records, filters), [records, filters]);
  const groups = useMemo(() => groupPerformancesByMonth(filtered), [filtered]);
  const active = hasPerformanceFilters(filters);
  const set = <K extends keyof PerformanceFilters>(key: K, value: PerformanceFilters[K]) =>
    onChangeFilters({ ...filters, [key]: value });

  const songTitle = songOptions.find((entry) => entry.songId === filters.songId)?.title;
  const personName = peopleOptions.find((entry) => entry.memberId === filters.memberId)?.name;

  const notice = recoveredFromUnreadableData && !isNoticeDismissed && (
    <div
      role="status"
      className="flex items-start gap-3 mb-6 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3"
    >
      <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
        <p className="font-semibold">No se pudo leer el historial guardado en este navegador.</p>
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

  const header = (
    <header className="mb-5">
      <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Historial</h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        Lo que se interpretó en cada actividad realizada, tal como quedó registrado ese día.
      </p>
    </header>
  );

  if (records.length === 0) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {header}
        {notice}
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <History className="w-6 h-6 text-[#2464ED]" />
          </div>
          <h2 className="text-base font-bold text-[#10203A] dark:text-white">Todavía no hay interpretaciones registradas.</h2>
          <p className="mt-1.5 mb-5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Se registran al marcar una actividad como realizada, desde el Calendario o al finalizar el Modo Misa.
          </p>
          <button type="button" onClick={onGoToCalendar} className={primaryButton}>
            <CalendarDays className="w-4 h-4" />
            Ir al Calendario
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {header}
      {notice}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowFilters((value) => !value)}
          aria-expanded={showFilters}
          aria-controls="historial-filtros"
          className={secondaryButton}
        >
          <SlidersHorizontal className="w-4 h-4" />
          Filtros
        </button>
        {active && (
          <button type="button" onClick={() => onChangeFilters(EMPTY_PERFORMANCE_FILTERS)} className={secondaryButton}>
            <X className="w-4 h-4" />
            Quitar filtros
          </button>
        )}
      </div>

      {showFilters && (
        <div
          id="historial-filtros"
          className="mb-6 grid gap-3 rounded-xl border border-slate-200 dark:border-dark-700 p-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          <div>
            <label htmlFor={ids.song} className={fieldLabel}>
              Canción
            </label>
            <select id={ids.song} value={filters.songId} onChange={(event) => set('songId', event.target.value)} className={selectClass}>
              <option value="">Todas</option>
              {songOptions.map((entry) => (
                <option key={entry.songId} value={entry.songId}>
                  {entry.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.member} className={fieldLabel}>
              Miembro
            </label>
            <select id={ids.member} value={filters.memberId} onChange={(event) => set('memberId', event.target.value)} className={selectClass}>
              <option value="">Todos</option>
              {peopleOptions.map((entry) => (
                <option key={entry.memberId} value={entry.memberId}>
                  {entry.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.type} className={fieldLabel}>
              Tipo de actividad
            </label>
            <select
              id={ids.type}
              value={filters.type}
              onChange={(event) => set('type', event.target.value as MinistryEventType | '')}
              className={selectClass}
            >
              <option value="">Todos</option>
              {EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {EVENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={ids.from} className={fieldLabel}>
              Desde
            </label>
            <DatePicker id={ids.from} value={filters.from} onChange={(value) => set('from', value)} max={filters.to || undefined} clearable placeholder="Cualquier fecha" />
          </div>
          <div>
            <label htmlFor={ids.to} className={fieldLabel}>
              Hasta
            </label>
            <DatePicker id={ids.to} value={filters.to} onChange={(value) => set('to', value)} min={filters.from || undefined} clearable placeholder="Cualquier fecha" />
          </div>
        </div>
      )}

      {/* A question about one song or one person gets its answer first. */}
      {filters.songId && songTitle && (
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-bold text-[#10203A] dark:text-white">{songTitle}</span> ·{' '}
          {formatTimes(getSongPerformanceCount(filtered, filters.songId))}
        </p>
      )}
      {filters.memberId && personName && !filters.songId && (
        <p className="mb-4 text-sm text-slate-700 dark:text-slate-200">
          <span className="font-bold text-[#10203A] dark:text-white">{personName}</span> ·{' '}
          {formatActivities(getPerformancesForMember(filtered, filters.memberId).length)}
          {countSoloSongsForMember(filtered, filters.memberId) > 0 &&
            ` · solista en ${formatSongs(countSoloSongsForMember(filtered, filters.memberId))}`}
        </p>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {filtered.length === 1 ? '1 registro' : `${filtered.length} registros`}
      </p>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
          Ningún registro coincide con los filtros.
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={`historial-${group.key}`}>
              <h2
                id={`historial-${group.key}`}
                className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500"
              >
                {formatMonthTitle(group.month)}
              </h2>
              <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
                {group.records.map((record) => (
                  <li key={record.id}>
                    <HistoryRow record={record} songId={filters.songId} onOpen={() => onOpenRecord(record.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

const HistoryRow: React.FC<{ record: PerformanceRecord; songId: string; onOpen: () => void }> = ({ record, songId, onOpen }) => {
  const [day, month] = formatShortDate(record.occurrenceDate).split(' ');
  // Filtered by a song: how it was sung that day (key, soloist), right in the list.
  const songLines = songId ? performedSongs(record).filter((song) => song.songId === songId) : [];
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full flex items-start gap-3 px-3 py-3 min-h-[44px] text-left hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40"
    >
      <span className="w-12 shrink-0 text-center">
        <span className="block text-lg font-extrabold leading-none tabular-nums text-[#10203A] dark:text-white">{day}</span>
        <span className="block mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
          {month}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-[#10203A] dark:text-white">{record.event.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          <EventTypeBadge type={record.event.type} />
          <span>{describeRecordSize(record)}</span>
        </span>
        {songLines.map((song) => {
          const soloists = soloistsOf(song);
          return (
            <span key={song.id} className="mt-1 block text-xs text-slate-600 dark:text-slate-300">
              {[
                song.moment,
                describePerformedKey(song),
                soloists.length > 0 ? `${soloists.map((entry) => entry.name).join(', ')} · Solista` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          );
        })}
      </span>
    </button>
  );
};

function formatTimes(count: number): string {
  return count === 1 ? 'Interpretada 1 vez' : `Interpretada ${count} veces`;
}

function formatActivities(count: number): string {
  return count === 1 ? '1 actividad' : `${count} actividades`;
}

function formatSongs(count: number): string {
  return count === 1 ? '1 canción' : `${count} canciones`;
}
