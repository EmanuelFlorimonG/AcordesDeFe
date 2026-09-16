import React, { useState } from 'react';
import { CalendarDays, ChevronRight, ListOrdered, Plus, TriangleAlert } from 'lucide-react';
import type { Setlist, SetlistDetails } from '../../types/setlist';
import {
  formatDurationSummary,
  formatSongCount,
  groupSetlistsByDate,
  summarizeSetlistDuration,
  toLocalIsoDate,
} from '../../utils/setlists';
import { SetlistFormDialog } from './SetlistFormDialog';
import { primaryButton, sectionHeading } from './ui';

interface SetlistsViewProps {
  setlists: Setlist[];
  durations: Record<string, number>;
  /** Stored setlists couldn't be read; a copy was kept before anything was saved. */
  recoveredFromUnreadableData: boolean;
  onOpen: (setlistId: string) => void;
  onCreate: (details: SetlistDetails) => void;
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "Hoy" and "Mañana" read better than a date, and only for the next two days. */
function relativeDayLabel(isoDate: string, todayIso: string): string | null {
  if (isoDate === todayIso) return 'Hoy';
  const [year, month, day] = todayIso.split('-').map(Number);
  const tomorrow = new Date(year, month - 1, day + 1);
  return isoDate === toLocalIsoDate(tomorrow) ? 'Mañana' : null;
}

const SetlistRow: React.FC<{
  setlist: Setlist;
  durations: Record<string, number>;
  todayIso: string;
  onOpen: () => void;
}> = ({ setlist, durations, todayIso, onOpen }) => {
  const summary = summarizeSetlistDuration(setlist, durations);
  const duration = summary.knownSeconds > 0 ? formatDurationSummary(summary) : '';
  const [year, month, day] = setlist.date ? setlist.date.split('-').map(Number) : [];
  const relative = setlist.date ? relativeDayLabel(setlist.date, todayIso) : null;

  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group w-full flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 text-left transition-colors hover:bg-[#EAF1FF]/50 dark:hover:bg-dark-900/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40"
      >
        <span
          aria-hidden="true"
          className="w-12 h-12 shrink-0 flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-800"
        >
          {setlist.date ? (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wide text-[#2464ED] dark:text-sky-400">
                {MONTHS[(month ?? 1) - 1]}
              </span>
              <span className="text-base font-extrabold leading-none text-[#10203A] dark:text-white tabular-nums">
                {day}
              </span>
            </>
          ) : (
            <CalendarDays className="w-5 h-5 text-slate-300 dark:text-dark-600" />
          )}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="truncate text-sm sm:text-base font-bold text-[#10203A] dark:text-white">
              {setlist.name}
            </span>
            {relative && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[#EAF1FF] dark:bg-blue-500/15 text-[10px] font-bold uppercase tracking-wide text-[#2464ED] dark:text-sky-400">
                {relative}
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
            {formatSongCount(setlist.items.length)}
            {duration && ` · ${duration}`}
            {setlist.description && ` · ${setlist.description}`}
          </span>
          {setlist.date && (
            <span className="sr-only">
              {day} de {MONTHS[(month ?? 1) - 1]} de {year}
            </span>
          )}
        </span>

        <ChevronRight className="w-4 h-4 shrink-0 text-slate-300 dark:text-dark-600 transition-colors group-hover:text-[#2464ED]" />
      </button>
    </li>
  );
};

/** A quiet sketch of what a setlist looks like, for the empty screen. */
const EmptyPreview: React.FC = () => (
  <div
    aria-hidden="true"
    className="w-full max-w-xs rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-3 space-y-2.5"
  >
    {['Entrada', 'Gloria', 'Comunión'].map((moment, index) => (
      <div key={moment} className="flex items-center gap-2.5">
        <span className="font-mono text-[10px] font-bold text-slate-300 dark:text-dark-600">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="w-16 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#2464ED]/70 dark:text-sky-400/70">
          {moment}
        </span>
        <span
          className="h-2 rounded-full bg-slate-100 dark:bg-dark-800"
          style={{ width: `${[54, 38, 46][index]}%` }}
        />
      </div>
    ))}
  </div>
);

export const SetlistsView: React.FC<SetlistsViewProps> = ({
  setlists,
  durations,
  recoveredFromUnreadableData,
  onOpen,
  onCreate,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [isNoticeDismissed, setIsNoticeDismissed] = useState(false);
  const todayIso = toLocalIsoDate(new Date());
  const { upcoming, recent } = groupSetlistsByDate(setlists, todayIso);

  const groups = [
    { id: 'upcoming', title: 'Próximos', setlists: upcoming },
    { id: 'recent', title: 'Recientes', setlists: recent },
  ].filter((group) => group.setlists.length > 0);

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-[#10203A] dark:text-white mb-1">Setlists</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            El orden, el tono y las notas de cada celebración.
          </p>
        </div>
        {setlists.length > 0 && (
          <button type="button" onClick={() => setIsCreating(true)} className={primaryButton}>
            <Plus className="w-4 h-4" />
            Nuevo Setlist
          </button>
        )}
      </div>

      {recoveredFromUnreadableData && !isNoticeDismissed && (
        <div
          role="status"
          className="flex items-start gap-3 mb-6 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3"
        >
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1 text-sm text-amber-900 dark:text-amber-200">
            <p className="font-semibold">No se pudieron leer los Setlists guardados en este navegador.</p>
            <p className="mt-0.5 text-amber-800/90 dark:text-amber-200/80">
              Se guardó una copia de los datos originales antes de empezar de nuevo, por si hiciera falta
              recuperarlos.
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
      )}

      {setlists.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 px-6 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <ListOrdered className="w-6 h-6 text-[#2464ED]" />
          </div>
          <h2 className="text-lg font-bold text-[#10203A] dark:text-white">Aún no tienes Setlists</h2>
          <p className="mt-1.5 mb-6 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Un Setlist reúne las canciones de una misa, un ensayo o un retiro en el orden en que se cantan, cada una
            con el tono, la cejilla y las notas de ese día. El cancionero no cambia.
          </p>
          <EmptyPreview />
          <button type="button" onClick={() => setIsCreating(true)} className={`${primaryButton} mt-6`}>
            <Plus className="w-4 h-4" />
            Crear el primer Setlist
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((group) => (
            <section key={group.id}>
              <h2 className={`${sectionHeading} mb-2 px-1`}>
                {group.title} <span className="text-slate-300 dark:text-dark-600">({group.setlists.length})</span>
              </h2>
              <ol className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800 overflow-hidden bg-white dark:bg-dark-950">
                {group.setlists.map((setlist) => (
                  <SetlistRow
                    key={setlist.id}
                    setlist={setlist}
                    durations={durations}
                    todayIso={todayIso}
                    onOpen={() => onOpen(setlist.id)}
                  />
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}

      {isCreating && (
        <SetlistFormDialog
          mode="create"
          onSubmit={(details) => {
            setIsCreating(false);
            onCreate(details);
          }}
          onClose={() => setIsCreating(false)}
        />
      )}
    </div>
  );
};
