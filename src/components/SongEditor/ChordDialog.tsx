import React, { useId, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Trash2 } from 'lucide-react';
import { isRecognizedChord } from '../../editor/songEditorModel';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';

interface ChordDialogProps {
  mode: 'add' | 'edit';
  /** The line's words, to show where the chord sits */
  text: string;
  position: number;
  instrumental: boolean;
  initialChord?: string;
  /** Chords already used in the song, to reuse with one tap */
  suggestions: string[];
  onSave: (chord: string) => void;
  onMove?: (delta: 'left' | 'right' | 'word-left' | 'word-right') => void;
  onRemove?: () => void;
  onClose: () => void;
}

/**
 * Writing one chord. What is typed is kept exactly: a chord the app can't
 * read is pointed out, never erased, so the author can fix it.
 */
export const ChordDialog: React.FC<ChordDialogProps> = ({
  mode,
  text,
  position,
  instrumental,
  initialChord = '',
  suggestions,
  onSave,
  onMove,
  onRemove,
  onClose,
}) => {
  const [chord, setChord] = useState(initialChord);
  const inputId = useId();
  const hintId = useId();
  const typed = chord.trim();
  const recognized = typed ? isRecognizedChord(typed) : null;

  return (
    <Dialog
      title={mode === 'add' ? 'Agregar acorde' : 'Editar acorde'}
      size="sm"
      onClose={onClose}
      onSubmit={() => {
        if (typed) onSave(typed);
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={!typed} className={primaryButton}>
            {mode === 'add' ? 'Agregar' : 'Guardar'}
          </button>
        </>
      }
    >
      {!instrumental && (
        <p className="mb-4 rounded-lg bg-slate-50 dark:bg-dark-800 px-3 py-2 font-mono text-sm text-slate-600 dark:text-slate-300 break-words">
          <span className="sr-only">Posición del acorde: </span>
          {text.slice(0, position)}
          <mark className="rounded bg-[#EAF1FF] dark:bg-blue-500/20 px-0.5 text-[#1D56D6] dark:text-sky-300">
            {text.slice(position, position + 1) || ' '}
          </mark>
          {text.slice(position + 1)}
        </p>
      )}

      <label htmlFor={inputId} className={fieldLabel}>
        Acorde
      </label>
      <input
        id={inputId}
        data-autofocus=""
        value={chord}
        onChange={(event) => setChord(event.target.value.replace(/[[\]]/g, ''))}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        maxLength={16}
        placeholder="G, Em, D/F#, Bb, Gsus4…"
        aria-describedby={hintId}
        aria-invalid={recognized === false}
        className={`${textField} font-mono`}
      />
      <p
        id={hintId}
        role="status"
        aria-live="polite"
        className={`mt-1.5 min-h-[1.25rem] text-xs ${
          recognized === false ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'
        }`}
      >
        {recognized === null
          ? 'Escribe el acorde como en el cancionero.'
          : recognized
            ? 'Acorde reconocido.'
            : 'No se reconoce como acorde: se mostrará como texto. Puedes corregirlo.'}
      </p>

      {suggestions.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            Usados en la canción
          </p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => setChord(suggestion)}
                aria-pressed={typed === suggestion}
                className={`h-9 [@media(pointer:coarse)]:h-11 min-w-[2.75rem] px-2.5 rounded-lg border font-mono text-sm font-semibold transition-colors ${
                  typed === suggestion
                    ? 'border-[#2464ED] bg-[#2464ED] text-white'
                    : 'border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:border-[#2464ED]'
                }`}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'edit' && (onMove || onRemove) && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-slate-100 dark:border-dark-800 pt-3">
          {onMove && (
            <>
              <span className="mr-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Mover</span>
              {!instrumental && (
                <button type="button" onClick={() => onMove('word-left')} aria-label="Mover a la palabra anterior" className={moveButton}>
                  <ChevronsLeft className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={() => onMove('left')}
                aria-label={instrumental ? 'Mover un lugar antes' : 'Mover una letra a la izquierda'}
                className={moveButton}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onMove('right')}
                aria-label={instrumental ? 'Mover un lugar después' : 'Mover una letra a la derecha'}
                className={moveButton}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {!instrumental && (
                <button type="button" onClick={() => onMove('word-right')} aria-label="Mover a la palabra siguiente" className={moveButton}>
                  <ChevronsRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="ml-auto inline-flex items-center gap-1.5 h-10 [@media(pointer:coarse)]:h-11 px-3 rounded-lg text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
              Quitar
            </button>
          )}
        </div>
      )}
    </Dialog>
  );
};

const moveButton =
  'w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dark-700 text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';
