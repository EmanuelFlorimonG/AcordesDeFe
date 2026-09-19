import React, { useDeferredValue, useId, useMemo, useState } from 'react';
import { Inbox, Search } from 'lucide-react';
import type { SongSubmissionStatus } from '../../catalog/submission';
import type { EditorialRepository } from '../../admin/editorialRepository';
import { ADMIN_STATUS_LABELS } from '../../admin/labels';
import { adminHash } from '../../admin/routes';
import { matchesSubmission } from '../../admin/search';
import { useLoad } from '../../admin/useLoad';
import { textField } from '../Setlists/ui';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, adminCard } from './AdminNotice';
import { SubmissionListItem } from './SubmissionListItem';

const FILTERS: Array<{ status: SongSubmissionStatus | null; label: string }> = [
  { status: null, label: 'Todas' },
  { status: 'pending', label: 'Pendientes' },
  { status: 'changes_requested', label: ADMIN_STATUS_LABELS.changes_requested },
  { status: 'approved', label: 'Aprobadas' },
  { status: 'rejected', label: 'Rechazadas' },
];

/**
 * The inbox: every proposal the reviewer may read (Row Level Security
 * decides which), most recent first. Loaded once; the status tabs and their
 * counts come from that same list, so switching tabs asks nothing more. The
 * status is part of the address, so it survives a reload.
 */
export const AdminSubmissions: React.FC<{ repository: EditorialRepository; status: SongSubmissionStatus | null }> = ({ repository, status }) => {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const list = useLoad(() => repository.listSubmissions(), 'submissions');

  const counts = useMemo(() => {
    const all = list.state === 'ready' ? list.value : [];
    const byStatus = new Map<SongSubmissionStatus | null, number>([[null, all.length]]);
    for (const item of all) byStatus.set(item.status, (byStatus.get(item.status) ?? 0) + 1);
    return byStatus;
  }, [list]);

  const inTab = list.state === 'ready' ? list.value.filter((item) => status === null || item.status === status) : [];
  const visible = inTab.filter((item) => matchesSubmission(item, deferredQuery));

  return (
    <>
      <AdminPageHeader title="Propuestas" description="Revisa y gestiona las canciones enviadas por la comunidad." />

      <div className={`${adminCard} mb-5 flex flex-col gap-3 p-2 lg:flex-row lg:items-center lg:justify-between`}>
        <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-1">
          {FILTERS.map((filter) => {
            const active = filter.status === status;
            const count = list.state === 'ready' ? counts.get(filter.status) ?? 0 : null;
            return (
              <a
                key={filter.label}
                href={adminHash.submissions(filter.status)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 [@media(pointer:coarse)]:h-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                  active
                    ? 'bg-[#2464ED] text-white shadow-[0_1px_2px_rgba(36,100,237,0.3)]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-800 dark:hover:text-white'
                }`}
              >
                {filter.label}
                {count !== null && (
                  <span
                    className={`min-w-[1.5rem] rounded-md px-1.5 py-0.5 text-center text-xs font-bold tabular-nums ${
                      active ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-dark-800 dark:text-slate-400'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </a>
            );
          })}
        </nav>
        <div className="relative lg:w-80">
          <label htmlFor={searchId} className="sr-only">
            Buscar por título, artista o código
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, artista o código"
            className={`${textField} pl-9`}
          />
        </div>
      </div>

      {list.state === 'loading' && <AdminLoading />}
      {list.state === 'error' && <AdminError message={list.error.message} onRetry={list.reload} />}
      {list.state === 'ready' && (
        <>
          <div className="mb-3 flex items-center justify-between gap-3 px-1 text-sm text-slate-500 dark:text-slate-400">
            <p role="status" aria-live="polite">
              {visible.length === inTab.length
                ? `${inTab.length} ${inTab.length === 1 ? 'propuesta' : 'propuestas'}`
                : `${visible.length} de ${inTab.length} propuestas`}
            </p>
            <p>Más recientes primero</p>
          </div>
          {visible.length === 0 ? (
            <AdminEmpty title={inTab.length === 0 ? 'No hay propuestas con este estado.' : 'Ninguna propuesta coincide con la búsqueda.'} icon={Inbox} />
          ) : (
            <ul className="space-y-2.5">
              {visible.map((item) => (
                <SubmissionListItem key={item.id} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
};
