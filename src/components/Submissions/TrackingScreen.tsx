import React, { useEffect, useId, useMemo, useState } from 'react';
import { ArrowLeft, CircleCheck, CircleDashed, CircleX, Clock, LoaderCircle, PencilLine, Plus, Search } from 'lucide-react';
import { getSubmissionRepository } from '../../catalog/services';
import { SUBMISSION_STATUS_LABELS, type PublicSubmissionStatus, type SongSubmissionStatus } from '../../catalog/submission';
import { SubmissionError } from '../../catalog/submissionRepository';
import { normalizeTrackingCode } from '../../catalog/trackingCode';
import { createMySubmissionsStore } from '../../editor/mySubmissions';
import { fieldLabel, primaryButton, secondaryButton, sectionHeading, textField } from '../Setlists/ui';

interface TrackingScreenProps {
  /** A code from the address (#/propuesta/GS-XXXX-XXXX), checked on arrival */
  initialCode: string | null;
  onCheckCode: (trackingCode: string) => void;
  /** Opens the editor for a proposal this browser sent (it holds its edit token) */
  onEditProposal: (trackingCode: string) => void;
  onAddSong: () => void;
  onBackToSongbook: () => void;
}

type Lookup =
  | { state: 'idle' }
  | { state: 'invalid' }
  | { state: 'loading'; code: string }
  | { state: 'found'; status: PublicSubmissionStatus }
  | { state: 'not-found'; code: string }
  | { state: 'error'; message: string };

const STATUS_STYLE: Record<SongSubmissionStatus, { icon: React.ElementType; className: string; explanation: string }> = {
  pending: {
    icon: Clock,
    className: 'bg-[#EAF1FF] text-[#1D56D6] dark:bg-blue-500/15 dark:text-sky-300',
    explanation: 'La propuesta está esperando revisión. No hace falta que hagas nada.',
  },
  changes_requested: {
    icon: PencilLine,
    className: 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300',
    explanation: 'La revisión pidió algunos cambios antes de publicarla.',
  },
  rejected: {
    icon: CircleX,
    className: 'bg-slate-100 text-slate-700 dark:bg-dark-800 dark:text-slate-300',
    explanation: 'La propuesta no se publicará.',
  },
  approved: {
    icon: CircleCheck,
    className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
    explanation: 'La propuesta fue aprobada.',
  },
};

const formatDate = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('es', { dateStyle: 'long' }).format(date);
};

/**
 * "Consultar propuesta": the state of a proposal from its tracking code, and
 * nothing else. It shows only what the public status check returns: never
 * who sent it, their email, the proposal's lyrics or any secret.
 */
export const TrackingScreen: React.FC<TrackingScreenProps> = ({ initialCode, onCheckCode, onEditProposal, onAddSong, onBackToSongbook }) => {
  const repository = useMemo(() => getSubmissionRepository(), []);
  const myStore = useMemo(() => createMySubmissionsStore(), []);
  const mine = useMemo(() => myStore.list(), [myStore]);
  const inputId = useId();
  const hintId = useId();
  const [input, setInput] = useState(initialCode ?? '');
  const [lookup, setLookup] = useState<Lookup>({ state: 'idle' });

  // A code in the address is checked once, when the page opens with it.
  useEffect(() => {
    const code = initialCode ? normalizeTrackingCode(initialCode) : null;
    if (!code || !repository) return;
    let cancelled = false;
    Promise.resolve()
      .then(() => {
        if (!cancelled) setLookup({ state: 'loading', code });
        return repository.getPublicStatus(code);
      })
      .then((status) => {
        if (!cancelled) setLookup(status ? { state: 'found', status } : { state: 'not-found', code });
      })
      .catch((error: unknown) => {
        if (!cancelled) setLookup({ state: 'error', message: error instanceof SubmissionError ? error.message : 'No se pudo consultar ahora. Inténtalo más tarde.' });
      });
    return () => {
      cancelled = true;
    };
  }, [initialCode, repository]);

  const submit = () => {
    const code = normalizeTrackingCode(input);
    if (!code) {
      setLookup({ state: 'invalid' });
      return;
    }
    setInput(code);
    // Through the address, so the result can be reloaded or shared with whoever sent it.
    onCheckCode(code);
  };

  return (
    <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
      <button
        type="button"
        onClick={onBackToSongbook}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        Cancionero
      </button>

      <div className="mx-auto max-w-xl space-y-6">
        <header>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Consultar propuesta</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Escribe el código que recibiste al enviar la canción.</p>
        </header>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-4 shadow-sm sm:p-5"
        >
          <label htmlFor={inputId} className={fieldLabel}>
            Código de seguimiento
          </label>
          <div className="flex gap-2">
            <input
              id={inputId}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="GS-XXXX-XXXX"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={20}
              aria-invalid={lookup.state === 'invalid'}
              aria-describedby={hintId}
              className={`${textField} font-mono uppercase`}
            />
            <button type="submit" disabled={!repository} className={`${primaryButton} shrink-0`}>
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Consultar</span>
              <span className="sr-only sm:hidden">Consultar</span>
            </button>
          </div>
          <p id={hintId} className={`mt-1.5 text-xs ${lookup.state === 'invalid' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {lookup.state === 'invalid'
              ? 'Ese código no tiene el formato GS-XXXX-XXXX. Revísalo.'
              : !repository
                ? 'La consulta no está disponible en este momento.'
                : 'Mayúsculas, minúsculas y espacios dan igual.'}
          </p>
        </form>

        <div role="status" aria-live="polite">
          {lookup.state === 'loading' && (
            <p className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400">
              <LoaderCircle aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin" />
              Consultando {lookup.code}…
            </p>
          )}
          {lookup.state === 'not-found' && (
            <p className="rounded-2xl border border-dashed border-slate-200 dark:border-dark-700 px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-300">
              No hay ninguna propuesta con el código <span className="font-mono font-semibold">{lookup.code}</span>. Revisa que esté bien escrito.
            </p>
          )}
          {lookup.state === 'error' && (
            <p className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-4 text-sm text-amber-900 dark:text-amber-200">
              {lookup.message}
            </p>
          )}
          {lookup.state === 'found' && (
            <StatusCard
              status={lookup.status}
              // Only with this browser's edit token, and only while changes are requested.
              canEdit={lookup.status.status === 'changes_requested' && myStore.editTokenFor(lookup.status.trackingCode) !== null}
              onEdit={() => onEditProposal(lookup.status.trackingCode)}
            />
          )}
        </div>

        {mine.length > 0 && (
          <section aria-labelledby="mis-propuestas">
            <h2 id="mis-propuestas" className={`${sectionHeading} mb-2`}>
              Enviadas desde este navegador
            </h2>
            <ul className="rounded-2xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800 bg-white dark:bg-dark-900">
              {mine.map((entry) => (
                <li key={entry.trackingCode}>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(entry.trackingCode);
                      onCheckCode(entry.trackingCode);
                    }}
                    className="flex min-h-[48px] w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-dark-800"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.title || 'Sin título'}</span>
                      <span className="block font-mono text-xs text-slate-500 dark:text-slate-400">{entry.trackingCode}</span>
                    </span>
                    <Search aria-hidden="true" className="w-4 h-4 shrink-0 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <button type="button" onClick={onAddSong} className={secondaryButton}>
          <Plus className="w-4 h-4" />
          Agregar una canción
        </button>
      </div>
    </div>
  );
};

const StatusCard: React.FC<{ status: PublicSubmissionStatus; canEdit: boolean; onEdit: () => void }> = ({ status, canEdit, onEdit }) => {
  const style = STATUS_STYLE[status.status] ?? { icon: CircleDashed, className: '', explanation: '' };
  const Icon = style.icon;
  const submitted = formatDate(status.submittedAt);
  const reviewed = formatDate(status.reviewedAt);
  return (
    <article className="rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-5 shadow-sm">
      <p className="font-mono text-xs text-slate-500 dark:text-slate-400">{status.trackingCode}</p>
      <h2 className="mt-1 text-lg font-bold text-[#10203A] dark:text-white break-words">{status.title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{status.type === 'create' ? 'Canción nueva' : 'Corrección de una canción'}</p>
      <p className={`mt-3 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm font-semibold ${style.className}`}>
        <Icon aria-hidden="true" className="w-4 h-4" />
        {SUBMISSION_STATUS_LABELS[status.status] ?? status.status}
      </p>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{style.explanation}</p>
      {status.reviewNote && (
        <div className="mt-3 rounded-lg bg-slate-50 dark:bg-dark-800 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">Nota de la revisión</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-slate-700 dark:text-slate-200">{status.reviewNote}</p>
        </div>
      )}
      {status.status === 'changes_requested' &&
        (canEdit ? (
          <button type="button" onClick={onEdit} className={`${primaryButton} mt-4 w-full sm:w-auto`}>
            <PencilLine aria-hidden="true" className="w-4 h-4" />
            Editar propuesta
          </button>
        ) : (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Solo se puede editar desde el navegador con el que se envió.
          </p>
        ))}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-500 dark:text-slate-400">
        {submitted && (
          <div>
            <dt className="font-semibold">Enviada</dt>
            <dd>{submitted}</dd>
          </div>
        )}
        {reviewed && (
          <div>
            <dt className="font-semibold">Revisada</dt>
            <dd>{reviewed}</dd>
          </div>
        )}
      </dl>
    </article>
  );
};
