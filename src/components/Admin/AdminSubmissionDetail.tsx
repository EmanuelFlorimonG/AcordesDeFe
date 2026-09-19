import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleCheck,
  CircleX,
  Hash,
  Lock,
  Mail,
  MessageSquareWarning,
  RefreshCw,
  Sparkles,
  Tag,
  TriangleAlert,
  XCircle,
} from 'lucide-react';
import { bundledSongRepository } from '../../catalog/bundledCatalog';
import { draftToSong, songToDraft } from '../../catalog/songDraft';
import { refreshCatalog } from '../../catalog/useCatalog';
import { validateSongDraft } from '../../catalog/validateSongDraft';
import type { EditorialRepository, SubmissionDetail } from '../../admin/editorialRepository';
import { formatDateTime } from '../../admin/format';
import { TYPE_LABELS } from '../../admin/labels';
import { suggestNewSongId } from '../../admin/review';
import { adminHash } from '../../admin/routes';
import { compareSongs } from '../../admin/songDiff';
import { useLoad } from '../../admin/useLoad';
import { PREVIEW_SONG_ID } from '../../editor/preview';
import { listSongCategories } from '../../utils/setlists';
import { SongPreview } from '../SongEditor/SongPreviewPanel';
import { primaryButton, secondaryButton } from '../Setlists/ui';
import { AdminError, AdminLoading, AdminSectionTitle, adminCard } from './AdminNotice';
import { ApproveDialog, NoteDialog } from './ReviewDialogs';
import { ReviewValidation } from './ReviewValidation';
import { SongComparisonView } from './SongComparisonView';
import { SongFacts } from './SongFacts';
import { SubmissionStatusBadge } from './SubmissionStatusBadge';

const BUNDLED_IDS: ReadonlySet<string> = new Set(bundledSongRepository.getAll().map((song) => song.id));
const KNOWN_CATEGORIES = listSongCategories([...bundledSongRepository.getAll()]).map((entry) => entry.name);

/** Destructive, but quiet: an outline, so it never competes with "Aprobar". */
const rejectButton =
  'inline-flex items-center justify-center gap-2 h-10 [@media(pointer:coarse)]:h-11 px-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-sm font-semibold text-red-600 dark:text-red-400 transition-colors hover:border-red-200 hover:bg-red-50 dark:hover:border-red-500/40 dark:hover:bg-red-500/10 disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40';

type OpenDialog = 'approve' | 'changes' | 'reject' | null;

interface AdminSubmissionDetailProps {
  repository: EditorialRepository;
  id: string;
  /** The signed-in reviewer, to say "tú" instead of an id */
  userId: string;
}

/**
 * One proposal, loaded by its id (never by its tracking code): what was sent,
 * checked again, previewed with the songbook's renderer, compared with the
 * published version when it is a correction, and the three decisions.
 */
export const AdminSubmissionDetail: React.FC<AdminSubmissionDetailProps> = ({ repository, id, userId }) => {
  const loaded = useLoad(async () => {
    const submission = await repository.getSubmission(id);
    if (!submission || submission.type !== 'update' || !submission.targetSongId) return { submission, published: null, nextVersion: null };
    const [published, versions] = await Promise.all([repository.getSong(submission.targetSongId), repository.listVersions(submission.targetSongId)]);
    return { submission, published, nextVersion: (versions[0]?.version ?? 0) + 1 };
  }, `submission:${id}`);

  const [dialog, setDialog] = useState<OpenDialog>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [flash, setFlash] = useState<{ tone: 'ok' | 'warning'; text: string; link?: { href: string; label: string } } | null>(null);
  const [takenIds, setTakenIds] = useState<ReadonlySet<string> | null>(null);

  const submission = loaded.state === 'ready' ? loaded.value.submission : null;
  const draft = submission?.proposedSong ?? null;
  const validation = useMemo(() => (draft ? validateSongDraft(draft, { knownCategories: KNOWN_CATEGORIES }) : null), [draft]);
  const previewSong = useMemo(() => (draft ? draftToSong(draft, PREVIEW_SONG_ID) : null), [draft]);
  const published = loaded.state === 'ready' ? loaded.value.published : null;
  const comparison = useMemo(() => {
    if (!draft || !published) return null;
    return compareSongs(songToDraft(published), draft);
  }, [draft, published]);

  if (loaded.state === 'loading') return <AdminLoading />;
  if (loaded.state === 'error') return <AdminError message={loaded.error.message} onRetry={loaded.reload} />;
  if (!submission) {
    return (
      <>
        <BackLink />
        <AdminError message="No existe ninguna propuesta con ese identificador, o no tienes acceso a ella." />
      </>
    );
  }

  const openApprove = async () => {
    setActionError('');
    setFlash(null);
    if (submission.type === 'create' && !takenIds) {
      try {
        setTakenIds(new Set(await repository.listSongIds()));
      } catch {
        setFlash({ tone: 'warning', text: 'No se pudo comprobar qué identificadores están ocupados. Inténtalo de nuevo.' });
        return;
      }
    }
    setDialog('approve');
  };

  const run = async (operation: () => Promise<{ text: string; link?: { href: string; label: string } }>) => {
    setBusy(true);
    setActionError('');
    try {
      const result = await operation();
      setDialog(null);
      setFlash({ tone: 'ok', ...result });
      loaded.reload();
    } catch (error) {
      const failure = error as { reason?: string; message?: string };
      if (failure.reason === 'not-reviewable') {
        // Someone else decided first: show what the proposal is now.
        setDialog(null);
        setFlash({ tone: 'warning', text: failure.message ?? '' });
        loaded.reload();
      } else {
        setActionError(failure.message ?? 'No se pudo completar la operación.');
      }
    } finally {
      setBusy(false);
    }
  };

  const reviewable = submission.status === 'pending' || submission.status === 'changes_requested';
  const blocking = !draft || (validation?.errors.length ?? 0) > 0;
  const openNote = (kind: 'changes' | 'reject') => {
    setActionError('');
    setDialog(kind);
  };
  const errorCount = validation?.errors.length ?? 0;
  const warningCount = validation?.warnings.length ?? 0;

  return (
    <>
      <BackLink />
      <header className={`${adminCard} mb-5 p-5 sm:p-6`}>
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="min-w-0 break-words text-[1.625rem] font-extrabold leading-tight tracking-tight text-[#10203A] dark:text-white sm:text-[1.875rem]">
                {draft?.title || 'Propuesta sin título'}
              </h1>
              <SubmissionStatusBadge status={submission.status} size="md" />
            </div>
            <p className={`mt-1 text-[15px] ${draft?.artist ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500'}`}>
              {draft?.artist || 'Artista sin indicar'}
            </p>
            <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <Tag aria-hidden="true" className="h-3.5 w-3.5" />
                {TYPE_LABELS[submission.type]}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
                Enviada el {formatDateTime(submission.submittedAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono">
                <Hash aria-hidden="true" className="h-3.5 w-3.5" />
                {submission.trackingCode}
              </span>
              {validation && (
                <a
                  href="#validacion"
                  onClick={(event) => {
                    event.preventDefault();
                    document.getElementById('validacion')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className={`inline-flex items-center gap-1.5 rounded font-semibold hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                    errorCount ? 'text-red-600 dark:text-red-400' : warningCount ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'
                  }`}
                >
                  {errorCount ? <CircleX aria-hidden="true" className="h-3.5 w-3.5" /> : warningCount ? <TriangleAlert aria-hidden="true" className="h-3.5 w-3.5" /> : <CircleCheck aria-hidden="true" className="h-3.5 w-3.5" />}
                  {errorCount || warningCount
                    ? [errorCount && `${errorCount} ${errorCount === 1 ? 'error' : 'errores'}`, warningCount && `${warningCount} ${warningCount === 1 ? 'aviso' : 'avisos'}`]
                        .filter(Boolean)
                        .join(' · ')
                    : 'Validación sin errores'}
                </a>
              )}
            </p>
          </div>

          {reviewable && (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap lg:shrink-0 lg:justify-end [&>button]:w-full sm:[&>button]:w-auto">
              <button type="button" onClick={() => openNote('reject')} disabled={busy} className={rejectButton}>
                <XCircle aria-hidden="true" className="h-4 w-4" />
                Rechazar
              </button>
              {submission.status === 'pending' && (
                <button type="button" onClick={() => openNote('changes')} disabled={busy} className={secondaryButton}>
                  <MessageSquareWarning aria-hidden="true" className="h-4 w-4" />
                  Solicitar cambios
                </button>
              )}
              <button type="button" onClick={openApprove} disabled={blocking || busy} className={primaryButton}>
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                Aprobar y publicar
              </button>
            </div>
          )}
        </div>

        {(reviewable ? submission.status === 'changes_requested' || blocking : true) && (
          <div className="mt-5 space-y-1 border-t border-slate-100 pt-4 text-sm dark:border-dark-800">
            {!reviewable && (
              <p className="text-slate-600 dark:text-slate-300">
                Revisión terminada. {submission.status === 'approved' ? 'La propuesta está publicada.' : 'La propuesta no se aprobó.'} Es una decisión final.
              </p>
            )}
            {reviewable && submission.status === 'changes_requested' && (
              <p className="text-slate-600 dark:text-slate-300">
                Se pidieron cambios. Si el colaborador no puede reenviarla, puedes publicarla tal como está o rechazarla.
              </p>
            )}
            {reviewable && blocking && (
              <p className="font-medium text-red-700 dark:text-red-300">
                Tiene errores de validación: no se puede publicar así.{' '}
                {submission.status === 'pending' ? 'Pide cambios o recházala.' : 'Espera la corrección del colaborador o recházala.'}
              </p>
            )}
          </div>
        )}
      </header>

      {submission.resubmissionCount > 0 && (
        <p className="mb-5 flex items-start gap-2.5 rounded-2xl border border-[#2464ED]/20 bg-[#EAF1FF] px-4 py-3 text-sm text-[#1D56D6] dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300">
          <RefreshCw aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            El colaborador la reenvió corregida
            {submission.resubmissionCount > 1 ? ` (${submission.resubmissionCount} veces)` : ''} el {formatDateTime(submission.resubmittedAt)}.
            {submission.reviewNote && submission.status === 'pending' && (
              <>
                {' '}Se le había pedido: <span className="italic">«{submission.reviewNote}»</span>
              </>
            )}
          </span>
        </p>
      )}

      {flash && (
        <div
          role="status"
          className={`mb-5 rounded-2xl border px-4 py-3 text-sm ${
            flash.tone === 'ok'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200'
          }`}
        >
          {flash.text}
          {flash.link && (
            <a href={flash.link.href} className="ml-1.5 font-semibold underline underline-offset-2">
              {flash.link.label}
            </a>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          {!draft ? (
            <AdminError message="El contenido guardado de esta propuesta no se puede leer como canción. No se puede publicar." />
          ) : (
            <>
              {submission.type === 'create' ? (
                <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  <Sparkles aria-hidden="true" className="h-4 w-4 shrink-0 text-[#2464ED] dark:text-sky-400" />
                  Nueva canción: no hay una versión publicada con la que comparar.
                </p>
              ) : comparison ? (
                <SongComparisonView comparison={comparison} />
              ) : (
                <AdminError message="La canción que corrige esta propuesta ya no está publicada." />
              )}
              {previewSong && <SongPreview song={previewSong} subtitle="Así se verá si se publica, con el mismo visor del cancionero." />}
            </>
          )}
        </div>

        <aside className="min-w-0 space-y-4">
          {validation && <ReviewValidation result={validation} />}
          {draft && <SongFacts draft={draft} layout="list" />}
          <Contributor submission={submission} />
          <EditorialRecord submission={submission} userId={userId} />
        </aside>
      </div>

      {dialog === 'approve' && draft && (
        <ApproveDialog
          kind={submission.type}
          songTitle={draft.title}
          suggestedId={suggestNewSongId(draft.title, takenIds ?? new Set(), BUNDLED_IDS)}
          takenIds={takenIds ?? new Set()}
          reservedIds={BUNDLED_IDS}
          nextVersion={loaded.value.nextVersion}
          busy={busy}
          error={actionError}
          onClose={() => setDialog(null)}
          onConfirm={(options) =>
            run(async () => {
              const result = await repository.approve(submission.id, options);
              // The songbook of this tab asks Supabase again: the new song is there when it is shown.
              void refreshCatalog();
              return {
                text: `Publicada como «${result.songId}», versión ${result.version}.`,
                link: { href: adminHash.song(result.songId), label: 'Ver la canción' },
              };
            })
          }
        />
      )}
      {(dialog === 'changes' || dialog === 'reject') && (
        <NoteDialog
          kind={dialog}
          busy={busy}
          error={actionError}
          onClose={() => setDialog(null)}
          onConfirm={(note) =>
            run(async () => {
              if (dialog === 'changes') {
                await repository.requestChanges(submission.id, note);
                return { text: 'Se pidieron cambios. El colaborador verá tu mensaje con su código.' };
              }
              await repository.reject(submission.id, note);
              return { text: 'Propuesta rechazada. El colaborador verá el motivo con su código.' };
            })
          }
        />
      )}
    </>
  );
};

const BackLink: React.FC = () => (
  <a
    href={adminHash.submissions()}
    className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-500 hover:text-[#2464ED] dark:text-slate-400 dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
  >
    <ArrowLeft aria-hidden="true" className="h-4 w-4" />
    Propuestas
  </a>
);

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
    <dt className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="min-w-0 break-words text-right text-sm text-slate-800 dark:text-slate-100">{children}</dd>
  </div>
);

/** When, who and what: the editorial record kept on the proposal. */
const EditorialRecord: React.FC<{ submission: SubmissionDetail; userId: string }> = ({ submission, userId }) => (
  <section aria-labelledby="datos-editoriales" className={`${adminCard} p-4 sm:p-5`}>
    <AdminSectionTitle id="datos-editoriales">Datos editoriales</AdminSectionTitle>
    <dl className="divide-y divide-slate-100 dark:divide-dark-800">
      <Row label="Código">
        <span className="font-mono">{submission.trackingCode}</span>
      </Row>
      <Row label="Enviada">{formatDateTime(submission.submittedAt)}</Row>
      {submission.resubmittedAt && <Row label="Reenviada">{formatDateTime(submission.resubmittedAt)}</Row>}
      <Row label="Última revisión">{submission.reviewedAt ? formatDateTime(submission.reviewedAt) : <span className="italic text-slate-400">Todavía no</span>}</Row>
      {submission.reviewedAt && (
        <Row label="Revisada por">{submission.reviewedBy === userId ? 'Tú' : submission.reviewedBy ? 'Otro miembro del equipo' : 'Sin registrar'}</Row>
      )}
      {submission.publishedSongId && (
        <Row label="Publicada como">
          <a href={adminHash.song(submission.publishedSongId)} className="font-mono text-[#2464ED] hover:underline dark:text-sky-400">
            {submission.publishedSongId}
          </a>
          {submission.publishedVersion && <span className="text-slate-500 dark:text-slate-400"> · v{submission.publishedVersion}</span>}
        </Row>
      )}
    </dl>
    {submission.reviewNote && (
      <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-dark-950/60">
        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Mensaje de la revisión (lo ve el colaborador)</p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-slate-800 dark:text-slate-100">{submission.reviewNote}</p>
      </div>
    )}
  </section>
);

/** Private to the team, set apart calmly: not a warning, just a different surface. */
const Contributor: React.FC<{ submission: SubmissionDetail }> = ({ submission }) => (
  <section aria-labelledby="colaborador" className="rounded-2xl border border-slate-200/80 bg-slate-50 p-4 dark:border-dark-800 dark:bg-dark-900/60 sm:p-5">
    <AdminSectionTitle
      id="colaborador"
      aside={
        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-dark-800 dark:text-slate-400 dark:ring-dark-700">
          <Lock aria-hidden="true" className="h-3 w-3" />
          Privado
        </span>
      }
    >
      Colaborador
    </AdminSectionTitle>
    {!submission.contributorName && !submission.contributorEmail ? (
      <p className="text-sm italic text-slate-500 dark:text-slate-400">No dejó nombre ni correo.</p>
    ) : (
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Nombre</dt>
          <dd className="break-words text-slate-800 dark:text-slate-100">{submission.contributorName ?? <span className="italic text-slate-400">Sin indicar</span>}</dd>
        </div>
        <div>
          <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">Correo</dt>
          <dd className="break-all">
            {submission.contributorEmail ? (
              <a href={`mailto:${submission.contributorEmail}`} className="inline-flex items-center gap-1 text-[#2464ED] hover:underline dark:text-sky-400">
                <Mail aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {submission.contributorEmail}
              </a>
            ) : (
              <span className="italic text-slate-400">Sin indicar</span>
            )}
          </dd>
        </div>
      </dl>
    )}
    <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Solo lo ve el equipo editorial. No se publica con la canción.</p>
  </section>
);
