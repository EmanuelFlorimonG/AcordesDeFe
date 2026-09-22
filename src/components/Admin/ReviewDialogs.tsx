import React, { useId, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { MAX_SONG_ID_LENGTH } from '../../catalog/songId';
import { MAX_REVIEW_NOTE_LENGTH, songIdProblem } from '../../admin/review';
import { Dialog } from '../Setlists/Dialog';
import { dangerButton, fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

const noteHint = 'La persona que envió la propuesta verá este mensaje al consultar su código.';

interface ApproveDialogProps {
  kind: 'create' | 'update';
  songTitle: string;
  /** For a new song: the id proposed, free against the catalog and the bundled songs */
  suggestedId: string;
  takenIds: ReadonlySet<string>;
  reservedIds: ReadonlySet<string>;
  /** For an edit: the version that will be published */
  nextVersion: number | null;
  busy: boolean;
  error: string;
  onConfirm: (options: { songId?: string; reviewNote?: string }) => void;
  onClose: () => void;
}

export const ApproveDialog: React.FC<ApproveDialogProps> = ({
  kind,
  songTitle,
  suggestedId,
  takenIds,
  reservedIds,
  nextVersion,
  busy,
  error,
  onConfirm,
  onClose,
}) => {
  const ids = { songId: useId(), songIdHint: useId(), note: useId(), noteHint: useId() };
  const [songId, setSongId] = useState(suggestedId);
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);
  const idProblem = kind === 'create' ? songIdProblem(songId, takenIds, reservedIds) : null;

  return (
    <Dialog
      role="alertdialog"
      title={kind === 'create' ? '¿Publicar esta canción?' : '¿Publicar esta edición?'}
      description={
        kind === 'create'
          ? `Se creará una canción oficial en el catálogo: «${songTitle}».`
          : `Se publicará la versión ${nextVersion ?? ''} de «${songTitle}». La versión anterior queda guardada en el historial.`
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => {
        setTouched(true);
        if (busy || idProblem) return;
        onConfirm({ songId: kind === 'create' ? songId.trim() : undefined, reviewNote: note.trim() || undefined });
      }}
      footer={
        <>
          <button type="button" data-autofocus="" onClick={onClose} disabled={busy} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={primaryButton}>
            {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
            {busy ? 'Publicando…' : kind === 'create' ? 'Publicar canción' : 'Publicar edición'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {kind === 'create' && (
          <div>
            <label htmlFor={ids.songId} className={fieldLabel}>
              Identificador de la canción
            </label>
            <input
              id={ids.songId}
              value={songId}
              maxLength={MAX_SONG_ID_LENGTH}
              spellCheck={false}
              autoCapitalize="none"
              onChange={(event) => setSongId(event.target.value)}
              onBlur={() => setTouched(true)}
              disabled={busy}
              aria-invalid={touched && Boolean(idProblem)}
              aria-describedby={ids.songIdHint}
              className={`${textField} font-mono`}
            />
            <p id={ids.songIdHint} className={`mt-1.5 text-xs ${touched && idProblem ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
              {touched && idProblem
                ? idProblem
                : 'Es permanente: favoritos, setlists e historial guardan este identificador. Aparece en la dirección de la canción.'}
            </p>
          </div>
        )}
        <div>
          <label htmlFor={ids.note} className={fieldLabel}>
            Mensaje para el colaborador <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id={ids.note}
            value={note}
            rows={3}
            maxLength={MAX_REVIEW_NOTE_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            aria-describedby={ids.noteHint}
            className={textField}
          />
          <p id={ids.noteHint} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            {noteHint}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};

interface NoteDialogProps {
  kind: 'changes' | 'reject';
  /** A starting text the reviewer can change or delete (an outdated edit suggests one) */
  suggestedNote?: string;
  busy: boolean;
  error: string;
  onConfirm: (note: string) => void;
  onClose: () => void;
}

/** Asking for changes, or rejecting: both need a message, and both keep the proposal (nothing is deleted). */
export const NoteDialog: React.FC<NoteDialogProps> = ({ kind, suggestedNote = '', busy, error, onConfirm, onClose }) => {
  const ids = { note: useId(), hint: useId() };
  const [note, setNote] = useState(suggestedNote);
  const [touched, setTouched] = useState(false);
  const empty = note.trim().length === 0;
  const changes = kind === 'changes';

  return (
    <Dialog
      role={changes ? 'dialog' : 'alertdialog'}
      title={changes ? 'Solicitar cambios' : '¿Rechazar esta propuesta?'}
      description={
        changes
          ? 'La propuesta queda en "Cambios solicitados" hasta que se revise de nuevo.'
          : 'La propuesta queda como "No aprobada". No se borra y no se publica nada.'
      }
      onClose={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => {
        setTouched(true);
        if (busy || empty) return;
        onConfirm(note.trim());
      }}
      footer={
        <>
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={busy} className={changes ? primaryButton : dangerButton}>
            {busy && <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />}
            {busy ? 'Guardando…' : changes ? 'Solicitar cambios' : 'Rechazar propuesta'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor={ids.note} className={fieldLabel}>
            {changes ? 'Mensaje para el colaborador' : 'Motivo'} <span aria-hidden="true">*</span>
            <span className="sr-only">(obligatorio)</span>
          </label>
          <textarea
            id={ids.note}
            data-autofocus=""
            value={note}
            rows={4}
            maxLength={MAX_REVIEW_NOTE_LENGTH}
            placeholder={changes ? 'Revisa la tonalidad y los acordes del segundo verso.' : 'Ya existe en el catálogo con otro título.'}
            onChange={(event) => setNote(event.target.value)}
            disabled={busy}
            required
            aria-invalid={touched && empty}
            aria-describedby={ids.hint}
            className={textField}
          />
          <p id={ids.hint} className={`mt-1.5 text-xs ${touched && empty ? 'font-semibold text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}`}>
            {touched && empty ? 'Escribe un mensaje: es obligatorio.' : noteHint}
          </p>
        </div>
        {error && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
};
