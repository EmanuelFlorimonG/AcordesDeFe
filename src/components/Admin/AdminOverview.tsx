import React from 'react';
import { ChevronRight, Inbox } from 'lucide-react';
import { RECENT_DAYS, type EditorialRepository } from '../../admin/editorialRepository';
import { adminHash } from '../../admin/routes';
import { STATUS_TONE } from '../../admin/statusTone';
import { useLoad } from '../../admin/useLoad';
import type { SongSubmissionStatus } from '../../catalog/submission';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, AdminSectionTitle, adminCard, adminCardLink } from './AdminNotice';
import { SubmissionListItem } from './SubmissionListItem';

/** The panel's front page: only what the database can count, and the proposals waiting, oldest first. */
export const AdminOverview: React.FC<{ repository: EditorialRepository }> = ({ repository }) => {
  const counts = useLoad(() => repository.countSubmissions(), 'counts');
  const waiting = useLoad(async () => {
    const pending = await repository.listSubmissions({ status: 'pending' });
    return [...pending].sort((a, b) => a.submittedAt.localeCompare(b.submittedAt)).slice(0, 8);
  }, 'waiting');

  const tiles: Array<{ status: SongSubmissionStatus; label: string; hint: string; value: number }> =
    counts.state === 'ready'
      ? [
          { status: 'pending', label: 'Pendientes', hint: 'Requieren revisión', value: counts.value.pending },
          { status: 'changes_requested', label: 'Cambios solicitados', hint: 'Esperan corrección', value: counts.value.changesRequested },
          { status: 'approved', label: 'Aprobadas', hint: `Últimos ${RECENT_DAYS} días`, value: counts.value.approvedRecently },
          { status: 'rejected', label: 'Rechazadas', hint: `Últimos ${RECENT_DAYS} días`, value: counts.value.rejectedRecently },
        ]
      : [];

  return (
    <>
      <AdminPageHeader title="Panel editorial" description="Revisa y administra las canciones propuestas para Acordes de Fe." />

      {counts.state === 'loading' && (
        <div aria-hidden="true" className="grid grid-cols-2 gap-3 motion-safe:animate-pulse lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className={`${adminCard} h-[104px]`} />
          ))}
        </div>
      )}
      {counts.state === 'error' && <AdminError message={counts.error.message} onRetry={counts.reload} />}
      {counts.state === 'ready' && (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((tile) => {
            const tone = STATUS_TONE[tile.status];
            const Icon = tone.icon;
            return (
              <li key={tile.status}>
                <a href={adminHash.submissions(tile.status)} className={`${adminCardLink} group flex h-full items-start gap-3 p-4 sm:p-5`}>
                  <span aria-hidden="true" className={`hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl sm:flex ${tone.soft}`}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold text-slate-600 dark:text-slate-300">{tile.label}</span>
                    <span className="mt-0.5 block text-[1.75rem] font-extrabold leading-tight tabular-nums text-[#10203A] dark:text-white">{tile.value}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{tile.hint}</span>
                  </span>
                  <ChevronRight
                    aria-hidden="true"
                    className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#2464ED] dark:text-slate-600"
                  />
                </a>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-labelledby="requieren-revision" className="mt-10">
        <AdminSectionTitle
          id="requieren-revision"
          aside={
            waiting.state === 'ready' && waiting.value.length > 0 ? (
              <a
                href={adminHash.submissions('pending')}
                className="rounded text-sm font-semibold text-[#2464ED] hover:underline dark:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
              >
                Ver todas las pendientes
              </a>
            ) : undefined
          }
        >
          Requieren revisión
        </AdminSectionTitle>
        {waiting.state === 'loading' && <AdminLoading rows={2} />}
        {waiting.state === 'error' && <AdminError message={waiting.error.message} onRetry={waiting.reload} />}
        {waiting.state === 'ready' &&
          (waiting.value.length === 0 ? (
            <AdminEmpty title="No hay propuestas pendientes." icon={Inbox}>
              Las nuevas aparecerán aquí, la más antigua primero.
            </AdminEmpty>
          ) : (
            <ul className="space-y-2.5">
              {waiting.value.map((item) => (
                <SubmissionListItem key={item.id} item={item} />
              ))}
            </ul>
          ))}
      </section>
    </>
  );
};
