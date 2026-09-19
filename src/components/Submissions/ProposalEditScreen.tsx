import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, LoaderCircle } from 'lucide-react';
import { getSubmissionRepository } from '../../catalog/services';
import { SUBMISSION_STATUS_LABELS, type SubmissionForEdit } from '../../catalog/submission';
import { SubmissionError } from '../../catalog/submissionRepository';
import { normalizeTrackingCode } from '../../catalog/trackingCode';
import { createMySubmissionsStore } from '../../editor/mySubmissions';
import { SongEditorScreen } from '../SongEditor/SongEditorScreen';
import { secondaryButton } from '../Setlists/ui';

interface ProposalEditScreenProps {
  /** From the address (#/propuesta/GS-XXXX-XXXX/editar). The edit token is never in the address. */
  code: string;
  categories: string[];
  onCheckStatus: (trackingCode: string) => void;
  onBackToSongbook: () => void;
}

type Loaded =
  | { state: 'loading' }
  | { state: 'no-token' }
  | { state: 'not-found' }
  | { state: 'not-editable'; status: SubmissionForEdit['status'] }
  | { state: 'error'; message: string }
  | { state: 'ready'; proposal: SubmissionForEdit & { song: NonNullable<SubmissionForEdit['song']> }; editToken: string };

/**
 * "Editar propuesta": the author's own proposal, recovered with the tracking
 * code and the edit token this browser kept when it was sent, opened in the
 * same song editor. Without the token here, the proposal can still be
 * checked, but not edited.
 */
export const ProposalEditScreen: React.FC<ProposalEditScreenProps> = ({ code: rawCode, categories, onCheckStatus, onBackToSongbook }) => {
  const repository = useMemo(() => getSubmissionRepository(), []);
  const code = normalizeTrackingCode(rawCode) ?? rawCode;
  const editToken = useMemo(() => createMySubmissionsStore().editTokenFor(code), [code]);
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;
    Promise.resolve()
      .then(async (): Promise<Loaded> => {
        if (!editToken) return { state: 'no-token' };
        if (!repository) return { state: 'error', message: 'La edición no está disponible en este momento.' };
        const proposal = await repository.getForEdit(code, editToken);
        if (!proposal || !proposal.song) return { state: 'not-found' };
        if (proposal.status !== 'changes_requested') return { state: 'not-editable', status: proposal.status };
        return { state: 'ready', proposal: { ...proposal, song: proposal.song }, editToken };
      })
      .catch((error: unknown): Loaded => ({
        state: 'error',
        message: error instanceof SubmissionError ? error.message : 'No se pudo recuperar la propuesta. Inténtalo más tarde.',
      }))
      .then((next) => {
        if (!cancelled) setLoaded(next);
      });
    return () => {
      cancelled = true;
    };
  }, [code, editToken, repository]);

  if (loaded.state === 'ready') {
    return (
      <SongEditorScreen
        categories={categories}
        onBackToSongbook={onBackToSongbook}
        onCheckStatus={onCheckStatus}
        resubmission={{
          trackingCode: loaded.proposal.trackingCode,
          editToken: loaded.editToken,
          reviewNote: loaded.proposal.reviewNote,
          song: loaded.proposal.song,
        }}
      />
    );
  }

  const message =
    loaded.state === 'no-token'
      ? 'Este navegador no conserva la clave para editar esta propuesta (solo se guarda en el navegador desde el que se envió). Puedes seguir consultando su estado.'
      : loaded.state === 'not-found'
        ? 'No se pudo recuperar esta propuesta desde este navegador.'
        : loaded.state === 'not-editable'
          ? `Esta propuesta ya no admite cambios. Su estado es: ${SUBMISSION_STATUS_LABELS[loaded.status]}.`
          : loaded.state === 'error'
            ? loaded.message
            : '';

  return (
    <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
      <button
        type="button"
        onClick={() => onCheckStatus(code)}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        Consultar propuesta
      </button>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Editar propuesta</h1>
        <p className="mt-1 font-mono text-sm text-slate-500 dark:text-slate-400">{code}</p>
        {loaded.state === 'loading' ? (
          <p role="status" aria-live="polite" className="mt-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
            Recuperando tu propuesta…
          </p>
        ) : (
          <>
            <p role="alert" className="mt-6 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              {message}
            </p>
            <button type="button" onClick={() => onCheckStatus(code)} className={`${secondaryButton} mt-4`}>
              Ver el estado
            </button>
          </>
        )}
      </div>
    </div>
  );
};
