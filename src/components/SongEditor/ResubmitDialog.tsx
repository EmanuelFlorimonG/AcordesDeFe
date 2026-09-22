import React, { useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { SongDraft } from '../../catalog/songDraft';
import type { ResubmitReceipt } from '../../catalog/submission';
import { songDraftChanges } from '../../catalog/submission';
import { SubmissionError, type SongSubmissionRepository } from '../../catalog/submissionRepository';
import { validateSongDraft } from '../../catalog/validateSongDraft';
import type { SongDraftStore } from '../../editor/draftStorage';
import { Dialog } from '../Setlists/Dialog';
import { primaryButton, secondaryButton } from '../Setlists/ui';
import { HumanCheck } from './HumanCheck';

interface ResubmitDialogProps {
  draft: SongDraft;
  sender: { repository: SongSubmissionRepository; turnstileSiteKey: string } | null;
  trackingCode: string;
  /** Proof of authorship; travels only in the request body, never shown */
  editToken: string;
  drafts: SongDraftStore;
  draftKey: string;
  /** An edit of a published song: the version it is sent as made on */
  target?: { songId: string; published: SongDraft; version: number };
  /** After "the song changed again": opens the version published now */
  onReloadPublished?: () => void;
  onSent: (receipt: ResubmitReceipt) => void;
  onClose: () => void;
}

/** Must match TURNSTILE_ACTION in the Edge Function (supabase/functions/submit-song). */
const HUMAN_CHECK_ACTION = 'submit-song';

function finalDraft(draft: SongDraft): SongDraft {
  const artist = draft.artist?.trim() ?? '';
  return { ...draft, title: draft.title.trim(), artist: artist || null, rhythmPattern: draft.rhythmPattern?.trim() || null };
}

/**
 * Sending a corrected proposal back to review: the same human check as a new
 * one, and the same tracking code afterwards. Name and email don't change.
 * On a failure the corrected draft stays in this browser.
 */
export const ResubmitDialog: React.FC<ResubmitDialogProps> = ({
  draft,
  sender,
  trackingCode,
  editToken,
  drafts,
  draftKey,
  target,
  onReloadPublished,
  onSent,
  onClose,
}) => {
  const [humanCheck, setHumanCheck] = useState<string | null>(null);
  const [resetSignal, setResetSignal] = useState(0);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [stale, setStale] = useState(false);
  const inFlight = useRef(false);

  const send = async () => {
    if (!sender || inFlight.current) return;
    const song = finalDraft(draft);
    if (!validateSongDraft(song).ok) {
      setError('La canción tiene errores. Revísalos antes de reenviar.');
      return;
    }
    if (target && !songDraftChanges(target.published, song)) {
      setError('Todavía no cambiaste nada de la canción publicada.');
      return;
    }
    if (!humanCheck) {
      setError('Espera a que termine la verificación de seguridad.');
      return;
    }
    inFlight.current = true;
    setSending(true);
    setError('');
    try {
      const receipt = await sender.repository.resubmit(
        { trackingCode, editToken, song, ...(target ? { baseVersion: target.version } : {}) },
        { humanCheck }
      );
      drafts.remove(draftKey);
      onSent(receipt);
    } catch (failure) {
      // The token was spent on this attempt: a retry needs a new one.
      setResetSignal((value) => value + 1);
      const message = failure instanceof SubmissionError ? failure.message : 'No se pudo reenviar la propuesta. Inténtalo más tarde.';
      const isStale = failure instanceof SubmissionError && failure.reason === 'stale';
      setStale(isStale);
      setError(
        isStale
          ? `${message} Tus cambios siguen guardados en este navegador: abre la versión actual para volver a hacerlos sobre ella.`
          : `${message} Tus cambios siguen guardados en este navegador.`
      );
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  return (
    <Dialog
      title="Reenviar para revisión"
      description="Tus cambios vuelven a revisión con el mismo código de seguimiento."
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
            <button type="submit" disabled={!sender || sending || !humanCheck} className={primaryButton}>
              {sending && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
              {sending ? 'Enviando…' : error ? 'Reintentar' : 'Reenviar para revisión'}
            </button>
          )}
        </>
      }
    >
      {!sender ? (
        <p role="alert" className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          El envío no está disponible en este momento. Tus cambios siguen guardados en este navegador.
        </p>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Propuesta <span className="font-mono font-semibold">{trackingCode}</span>. El nombre y el correo que dejaste al enviarla no cambian.
            {target && ` Se envía como cambios sobre la versión ${target.version} de «${target.published.title}».`}
          </p>
          <HumanCheck siteKey={sender.turnstileSiteKey} action={HUMAN_CHECK_ACTION} onToken={setHumanCheck} resetSignal={resetSignal} />
          {error && (
            <p role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-800 dark:text-red-200">
              {error}
            </p>
          )}
        </div>
      )}
    </Dialog>
  );
};
