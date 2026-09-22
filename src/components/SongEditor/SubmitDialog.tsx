import React, { useId, useMemo, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { SongDraft } from '../../catalog/songDraft';
import {
  MAX_CONTRIBUTOR_EMAIL_LENGTH,
  MAX_CONTRIBUTOR_NAME_LENGTH,
  buildSubmissionPayload,
  createSubmissionAttempt,
  validateSubmissionPayload,
  type SubmissionReceipt,
} from '../../catalog/submission';
import type { SongSubmissionRepository } from '../../catalog/submissionRepository';
import type { SongDraftStore } from '../../editor/draftStorage';
import type { MySubmissionsStore } from '../../editor/mySubmissions';
import { createSubmitter, sendDraft } from '../../editor/submitter';
import { HumanCheck } from './HumanCheck';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

interface SubmitDialogProps {
  draft: SongDraft;
  /** Null when this build has no backend or no Turnstile key: the dialog says so instead of failing */
  sender: { repository: SongSubmissionRepository; turnstileSiteKey: string } | null;
  drafts: SongDraftStore;
  draftKey: string;
  mine: MySubmissionsStore;
  /** A suggested edit of a published song: sent as a correction on this version */
  edit?: { songId: string; baseVersion: number; published: SongDraft };
  /** After "the song changed": opens the current version (the draft is kept) */
  onReloadPublished?: () => void;
  onSent: (receipt: SubmissionReceipt) => void;
  onClose: () => void;
}

/** Trimmed title and author: the only tidying done, and only at the moment of sending. */
function finalDraft(draft: SongDraft): SongDraft {
  const artist = draft.artist?.trim() ?? '';
  return { ...draft, title: draft.title.trim(), artist: artist || null, rhythmPattern: draft.rhythmPattern?.trim() || null };
}

/** Must match TURNSTILE_ACTION in the Edge Function (supabase/functions/submit-song). */
const HUMAN_CHECK_ACTION = 'submit-song';

/**
 * The last step: who is sending it (optional), the human check and the send
 * itself. One send at a time; on a failure the draft stays exactly as it was and trying again
 * is safe: the backend recognises the retry and never stores the proposal
 * twice.
 */
export const SubmitDialog: React.FC<SubmitDialogProps> = ({ draft, sender, drafts, draftKey, mine, edit, onReloadPublished, onSent, onClose }) => {
  const ids = { name: useId(), email: useId(), emailHint: useId(), error: useId() };
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [emailError, setEmailError] = useState('');
  const [humanCheck, setHumanCheck] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [stale, setStale] = useState(false);
  const repository = sender?.repository ?? null;
  const submitter = useMemo(() => (repository ? createSubmitter(repository) : null), [repository]);

  const send = async () => {
    if (!submitter || sending) return;
    if (!humanCheck) {
      setError('Espera a que termine la verificación de seguridad.');
      return;
    }
    setError('');
    const song = finalDraft(draft);
    const kind = edit
      ? { type: 'update' as const, targetSongId: edit.songId, baseVersion: edit.baseVersion }
      : { type: 'create' as const };
    const check = validateSubmissionPayload(buildSubmissionPayload(song, { ...kind, contributor: { name, email } }), {
      publishedSong: edit?.published,
    });
    if (check.errors.some((issue) => issue.code === 'contributor-email-invalid')) {
      setEmailError('Revisa el correo, o déjalo vacío.');
      return;
    }
    if (check.errors.some((issue) => issue.code === 'no-changes')) {
      setError('Todavía no cambiaste nada de la canción publicada.');
      return;
    }
    if (!check.ok) {
      setError('La canción tiene errores. Revísalos antes de enviar.');
      return;
    }
    // The retry identity is stored with the draft before the first attempt, so it survives a reload.
    const attempt = drafts.load(draftKey)?.attempt ?? createSubmissionAttempt();
    drafts.setAttempt(draftKey, attempt);
    setSending(true);
    const outcome = await sendDraft({
      submitter,
      payload: buildSubmissionPayload(song, { ...kind, contributor: { name, email }, attempt }),
      drafts,
      draftKey,
      mine,
      title: song.title,
      humanCheck,
    });
    setSending(false);
    if (outcome.ok) return onSent(outcome.receipt);
    // The token was spent on this attempt: a retry needs a new one.
    setResetSignal((value) => value + 1);
    setStale(outcome.error.reason === 'stale');
    setError(
      outcome.error.reason === 'stale'
        ? `${outcome.error.message} Tus cambios siguen guardados en este navegador: abre la versión actual para volver a hacerlos sobre ella.`
        : `${outcome.error.message} ${edit ? 'Tus cambios siguen guardados' : 'Tu canción sigue guardada'} en este navegador.`
    );
  };

  return (
    <Dialog
      title="Enviar para revisión"
      description={edit ? 'Un último paso. La canción no cambia todavía: primero se revisan tus cambios.' : 'Un último paso. La canción no se publica todavía: primero se revisa.'}
      onClose={() => {
        if (!sending) onClose();
      }}
      onSubmit={send}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={sending} className={secondaryButton}>
            Volver al editor
          </button>
          {stale && onReloadPublished ? (
            <button type="button" onClick={onReloadPublished} className={primaryButton}>
              Abrir la versión actual
            </button>
          ) : (
            <button type="submit" disabled={!sender || sending || !humanCheck} aria-describedby={error ? ids.error : undefined} className={primaryButton}>
              {sending && <LoaderCircle aria-hidden="true" className="w-4 h-4 motion-safe:animate-spin" />}
              {sending ? 'Enviando…' : error ? 'Reintentar' : 'Enviar para revisión'}
            </button>
          )}
        </>
      }
    >
      {!sender ? (
        <p role="alert" className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          El envío de canciones no está disponible en este momento. Tu borrador sigue guardado en este navegador.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label htmlFor={ids.name} className={fieldLabel}>
              Nombre <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id={ids.name}
              data-autofocus=""
              value={name}
              maxLength={MAX_CONTRIBUTOR_NAME_LENGTH}
              autoComplete="name"
              onChange={(event) => setName(event.target.value)}
              disabled={sending}
              className={textField}
            />
          </div>
          <div>
            <label htmlFor={ids.email} className={fieldLabel}>
              Correo electrónico <span className="font-normal text-slate-400">(opcional)</span>
            </label>
            <input
              id={ids.email}
              type="email"
              value={email}
              maxLength={MAX_CONTRIBUTOR_EMAIL_LENGTH}
              autoComplete="email"
              inputMode="email"
              onChange={(event) => {
                setEmail(event.target.value);
                setEmailError('');
              }}
              disabled={sending}
              aria-invalid={Boolean(emailError)}
              aria-describedby={ids.emailHint}
              className={textField}
            />
            <p id={ids.emailHint} className={`mt-1.5 text-xs ${emailError ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {emailError || 'Solo para escribirte si hace falta algún cambio en tu propuesta.'}
            </p>
          </div>
          <p className="rounded-lg bg-slate-50 dark:bg-dark-800 px-3 py-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            Tu nombre y tu correo se usan para gestionar esta propuesta. No forman parte de la canción publicada ni se muestran
            al consultar su estado.
          </p>
          <HumanCheck
            siteKey={sender.turnstileSiteKey}
            action={HUMAN_CHECK_ACTION}
            onToken={setHumanCheck}
            resetSignal={resetSignal}
          />
          {error && (
            <p id={ids.error} role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
};
