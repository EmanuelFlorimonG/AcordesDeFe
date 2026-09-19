import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CloudOff, FileClock, HardDriveDownload, Send } from 'lucide-react';
import { getSubmissionSender } from '../../catalog/services';
import type { SongDraft } from '../../catalog/songDraft';
import type { SubmissionReceipt } from '../../catalog/submission';
import { validateSongDraft } from '../../catalog/validateSongDraft';
import { NEW_SONG_DRAFT_KEY, createSongDraftStore, type StoredSongDraft } from '../../editor/draftStorage';
import { createMySubmissionsStore } from '../../editor/mySubmissions';
import {
  contentToEditor,
  createEditorDocument,
  editorToSongDraft,
  hasEditorContent,
  isRecognizedChord,
  validateEditorDocument,
  type EditorDocument,
} from '../../editor/songEditorModel';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { ResubmitDialog } from './ResubmitDialog';
import { primaryButton, secondaryButton, sectionHeading } from '../Setlists/ui';
import { SectionsEditor } from './SectionsEditor';
import { SongMetaForm } from './SongMetaForm';
import { SongPreviewPanel } from './SongPreviewPanel';
import { SubmissionSuccess } from './SubmissionSuccess';
import { SubmitDialog } from './SubmitDialog';
import { ValidationPanel } from './ValidationPanel';

/** Correcting one's own proposal after the team asked for changes. */
export interface ResubmissionContext {
  trackingCode: string;
  /** Kept in memory only while editing; never shown, never in the address */
  editToken: string;
  reviewNote: string | null;
  song: SongDraft;
}

interface SongEditorScreenProps {
  /** The catalog's categories, offered as choices */
  categories: string[];
  onBackToSongbook: () => void;
  onCheckStatus: (trackingCode: string) => void;
  /** Present when editing a proposal to send it back: same editor, its own draft */
  resubmission?: ResubmissionContext;
}

/** The proposal as the editor's document: its text read by the parser, its metadata as sent. */
function documentFor(song: SongDraft): EditorDocument {
  const { content, chordsUsed: _derived, ...meta } = song;
  void _derived;
  return contentToEditor(content, meta);
}

type Phase =
  | { kind: 'recover'; stored: StoredSongDraft }
  | { kind: 'editing' }
  | { kind: 'sent'; receipt: SubmissionReceipt; title: string };

type SaveState = 'idle' | 'pending' | 'saved' | 'failed';

/** How long typing has to pause before the draft is written to this browser. */
const AUTOSAVE_DELAY_MS = 800;

/**
 * "Agregar canción": write a song, see it as it will be published, and send
 * it for review. The draft lives in this browser until it is sent; nothing
 * reaches the backend before "Enviar para revisión".
 */
export const SongEditorScreen: React.FC<SongEditorScreenProps> = ({ categories, onBackToSongbook, onCheckStatus, resubmission }) => {
  const store = useMemo(() => createSongDraftStore(), []);
  const mine = useMemo(() => createMySubmissionsStore(), []);
  const sender = useMemo(() => getSubmissionSender(), []);
  // A new song and each proposal being corrected keep separate drafts.
  const draftKey = resubmission ? `edit:${resubmission.trackingCode}` : NEW_SONG_DRAFT_KEY;
  const [startingDocument] = useState<EditorDocument>(() => (resubmission ? documentFor(resubmission.song) : createEditorDocument()));

  const [phase, setPhase] = useState<Phase>(() => {
    const stored = store.load(draftKey);
    return stored && hasEditorContent(stored.document) ? { kind: 'recover', stored } : { kind: 'editing' };
  });
  const [doc, setDoc] = useState<EditorDocument>(startingDocument);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dialog, setDialog] = useState<'submit' | 'discard' | null>(null);
  const validationRef = useRef<HTMLDivElement>(null);

  // --- Autosave: after a pause, and at once before leaving -----------------------
  const latest = useRef({ doc, pending: false, failed: false });
  useEffect(() => {
    latest.current.doc = doc;
  }, [doc]);

  /** Every change of the song goes through here: it is what "Guardando…" follows. */
  const edit = useCallback((update: (current: EditorDocument) => EditorDocument) => {
    setDoc(update);
    setSaveState('pending');
  }, []);

  const saveNow = useCallback((): boolean => {
    const current = latest.current;
    if (!current.pending) return !current.failed;
    const ok = store.save(draftKey, current.doc);
    current.pending = false;
    current.failed = !ok;
    setSaveState(ok ? 'saved' : 'failed');
    return ok;
  }, [store, draftKey]);

  const editing = phase.kind === 'editing';
  useEffect(() => {
    if (!editing) return;
    // An untouched song isn't worth a draft (nor a recovery prompt next time).
    if ((!hasEditorContent(doc) || doc === startingDocument) && !store.load(draftKey)) {
      latest.current.pending = false;
      const timer = window.setTimeout(() => setSaveState('idle'), AUTOSAVE_DELAY_MS);
      return () => window.clearTimeout(timer);
    }
    latest.current.pending = true;
    const timer = window.setTimeout(saveNow, AUTOSAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [doc, editing, saveNow, store, draftKey, startingDocument]);

  useEffect(() => {
    // Leaving the page: write what's pending right away. Only if the browser
    // refuses to store it is there anything to lose, and then it asks.
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!saveNow()) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      // Leaving the editor inside the app (another page): same flush.
      saveNow();
    };
  }, [saveNow]);

  // --- Checks, with the same engines the app reads songs with ---------------------
  const draft = useMemo(() => editorToSongDraft(doc), [doc]);
  const songCheck = useMemo(() => validateSongDraft(draft, { knownCategories: categories }), [draft, categories]);
  const editorIssues = useMemo(() => validateEditorDocument(doc), [doc]);
  const canSend = songCheck.ok && !editorIssues.some((issue) => issue.severity === 'error');
  const suggestions = useMemo(() => draft.chordsUsed.filter(isRecognizedChord).slice(0, 16), [draft.chordsUsed]);

  const goToSection = (sectionId: string) => {
    const element = document.getElementById(`seccion-${sectionId}`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    element?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
  };

  const requestSend = () => {
    if (!canSend) {
      validationRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      validationRef.current?.focus({ preventScroll: true });
      return;
    }
    latest.current.pending = true;
    saveNow();
    setDialog('submit');
  };

  // --- Screens ----------------------------------------------------------------------
  const backButton = (
    <button
      type="button"
      onClick={onBackToSongbook}
      className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
    >
      <ArrowLeft className="w-4 h-4 text-blue-600" />
      Cancionero
    </button>
  );

  if (phase.kind === 'sent') {
    return (
      <div className="w-full px-5 py-6 sm:px-10 sm:py-10">
        <SubmissionSuccess
          trackingCode={phase.receipt.trackingCode}
          title={phase.title}
          resubmitted={Boolean(resubmission)}
          onCheckStatus={() => onCheckStatus(phase.receipt.trackingCode)}
          onBackToSongbook={onBackToSongbook}
          onAddAnother={
            resubmission
              ? undefined
              : () => {
                  setDoc(createEditorDocument());
                  setSaveState('idle');
                  setPhase({ kind: 'editing' });
                }
          }
        />
      </div>
    );
  }

  if (phase.kind === 'recover') {
    const { stored } = phase;
    const when = stored.updatedAt > 0 ? new Intl.DateTimeFormat('es', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(stored.updatedAt)) : null;
    return (
      <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
        {backButton}
        <div role="region" aria-labelledby="borrador-pendiente" className="mx-auto max-w-xl rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-6 shadow-sm">
          <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10">
            <FileClock aria-hidden="true" className="h-5 w-5 text-[#2464ED] dark:text-sky-400" />
          </div>
          <h1 id="borrador-pendiente" className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white">
            {resubmission ? 'Encontramos cambios sin enviar' : 'Encontramos un borrador sin terminar'}
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {stored.document.meta.title.trim() ? `«${stored.document.meta.title.trim()}»` : 'Una canción sin título'}, guardada en este navegador
            {when ? ` el ${when}` : ''}.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              autoFocus
              onClick={() => {
                setDoc(stored.document);
                setPhase({ kind: 'editing' });
                setSaveState('saved');
              }}
              className={primaryButton}
            >
              Continuar
            </button>
            <button type="button" onClick={() => setDialog('discard')} className={secondaryButton}>
              Descartar
            </button>
          </div>
        </div>
        {dialog === 'discard' && (
          <ConfirmDialog
            title="¿Descartar el borrador?"
            message="Se borra la canción guardada en este navegador. No se puede deshacer."
            confirmLabel="Descartar borrador"
            cancelLabel="Conservar"
            onConfirm={() => {
              store.remove(draftKey);
              setDoc(startingDocument);
              setSaveState('idle');
              setPhase({ kind: 'editing' });
            }}
            onClose={() => setDialog(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
      {backButton}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white">
            {resubmission ? 'Editar propuesta' : 'Agregar canción'}
          </h1>
          {resubmission ? (
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
              Corrige tu propuesta <span className="font-mono">{resubmission.trackingCode}</span> y reenvíala a revisión.
            </p>
          ) : (
            <>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Comparte una canción con la comunidad.</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">Las canciones enviadas se revisan antes de publicarse.</p>
            </>
          )}
        </div>
        <p role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          {saveState === 'failed' ? (
            <>
              <CloudOff aria-hidden="true" className="w-3.5 h-3.5 text-amber-600" />
              <span className="font-semibold text-amber-700 dark:text-amber-400">No se pudo guardar en este navegador</span>
            </>
          ) : saveState === 'saved' ? (
            <>
              <HardDriveDownload aria-hidden="true" className="w-3.5 h-3.5" />
              Guardado localmente
            </>
          ) : saveState === 'pending' ? (
            'Guardando…'
          ) : (
            ''
          )}
        </p>
      </header>

      {resubmission?.reviewNote && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800 dark:text-amber-300">Cambios que pidió la revisión</p>
          <p className="mt-1 whitespace-pre-line text-sm text-amber-950 dark:text-amber-100">{resubmission.reviewNote}</p>
        </div>
      )}

      {store.recoveredFromUnreadableData && (
        <p role="status" className="mb-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
          No se pudieron leer los borradores guardados en este navegador. Se apartó una copia y empiezas con uno nuevo.
        </p>
      )}

      <div className="grid gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <section aria-labelledby="informacion-cancion" className="rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-4 shadow-sm sm:p-5">
            <h2 id="informacion-cancion" className={`${sectionHeading} mb-4`}>
              Información
            </h2>
            <SongMetaForm meta={doc.meta} categories={categories} onChange={(meta) => edit((current) => ({ ...current, meta }))} />
          </section>

          <section aria-labelledby="letra-acordes">
            <div className="mb-3">
              <h2 id="letra-acordes" className={sectionHeading}>
                Letra y acordes
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Escribe la letra línea a línea. Para poner un acorde, coloca el cursor sobre la letra y pulsa «Acorde». Toca un
                acorde para cambiarlo, moverlo o quitarlo.
              </p>
            </div>
            <SectionsEditor doc={doc} issues={editorIssues} suggestions={suggestions} onChange={edit} />
          </section>
        </div>

        <div className="min-w-0 space-y-6 2xl:sticky 2xl:top-4 2xl:self-start">
          <SongPreviewPanel doc={doc} />
        </div>
      </div>

      <div ref={validationRef} tabIndex={-1} className="mt-6 space-y-4 focus:outline-none">
        <ValidationPanel meta={doc.meta} song={songCheck} editor={editorIssues} onGoToSection={goToSection} />
        <div className="flex flex-wrap items-center justify-end gap-3">
          {!canSend && <p className="text-sm text-slate-500 dark:text-slate-400">Corrige lo marcado para poder enviar.</p>}
          <button type="button" onClick={requestSend} aria-disabled={!canSend} className={`${primaryButton} ${canSend ? '' : 'opacity-60'}`}>
            <Send className="w-4 h-4" />
            {resubmission ? 'Reenviar para revisión' : 'Enviar para revisión'}
          </button>
        </div>
      </div>

      {dialog === 'submit' && resubmission && (
        <ResubmitDialog
          draft={draft}
          sender={sender}
          trackingCode={resubmission.trackingCode}
          editToken={resubmission.editToken}
          drafts={store}
          draftKey={draftKey}
          onSent={(receipt) => {
            latest.current.pending = false;
            setDialog(null);
            setPhase({ kind: 'sent', receipt: { trackingCode: receipt.trackingCode, editToken: '' }, title: draft.title.trim() });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'submit' && !resubmission && (
        <SubmitDialog
          draft={draft}
          sender={sender}
          drafts={store}
          draftKey={NEW_SONG_DRAFT_KEY}
          mine={mine}
          onSent={(receipt) => {
            latest.current.pending = false;
            setDialog(null);
            setPhase({ kind: 'sent', receipt, title: draft.title.trim() });
          }}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
};
