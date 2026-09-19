import React, { useRef, useState } from 'react';
import { MoreHorizontal, Music2, Plus, Rows3, Trash2 } from 'lucide-react';
import {
  changeChord,
  isRecognizedChord,
  moveChord,
  placeChord,
  removeChord,
  setInstrumental,
  setLineText,
  wordBoundary,
  type ChordAnchor,
  type EditorLine,
} from '../../editor/songEditorModel';
import { ActionMenu } from '../Setlists/ActionMenu';
import { iconButton } from '../Setlists/ui';
import { ChordDialog } from './ChordDialog';

interface LineEditorProps {
  line: EditorLine;
  /** "Verso 1, línea 2": the accessible name of the text field */
  name: string;
  suggestions: string[];
  canRemove: boolean;
  registerInput: (lineId: string, element: HTMLInputElement | null) => void;
  onChange: (line: EditorLine) => void;
  onSplit: (lineId: string, caret: number) => void;
  onMergeWithPrevious: (lineId: string) => void;
  onFocusSibling: (lineId: string, direction: -1 | 1, caret: number) => void;
  onPaste: (lineId: string, start: number, end: number, lines: string[]) => void;
  onRemove: (lineId: string) => void;
}

type ChordRequest = { mode: 'add'; position: number } | { mode: 'edit'; anchorId: string };

/** Padding of the text field, in the same units the chord lane uses (px-3). */
const FIELD_PADDING = '0.75rem';

/**
 * One line: its words in a real text field, and above them the chords, each
 * placed on the character it sounds at. The editor uses a fixed-width font
 * so a chord sits exactly over its letter on any screen; the preview shows
 * the real songbook rendering.
 */
export const LineEditor: React.FC<LineEditorProps> = ({
  line,
  name,
  suggestions,
  canRemove,
  registerInput,
  onChange,
  onSplit,
  onMergeWithPrevious,
  onFocusSibling,
  onPaste,
  onRemove,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [scrollLeft, setScrollLeft] = useState(0);
  const [request, setRequest] = useState<ChordRequest | null>(null);

  const syncScroll = () => setScrollLeft(inputRef.current?.scrollLeft ?? 0);
  const caret = () => inputRef.current?.selectionStart ?? line.text.length;

  const editing = request?.mode === 'edit' ? line.chords.find((anchor) => anchor.id === request.anchorId) ?? null : null;

  const moveBy = (anchor: ChordAnchor, how: 'left' | 'right' | 'word-left' | 'word-right') => {
    if (how === 'left') return onChange(moveChord(line, anchor.id, -1));
    if (how === 'right') return onChange(moveChord(line, anchor.id, 1));
    const target = wordBoundary(line.text, anchor.position, how === 'word-right' ? 1 : -1);
    const occupied = line.chords.filter((entry) => entry.id !== anchor.id && entry.position === target).length > 0;
    if (target === anchor.position || occupied) return;
    onChange({ ...line, chords: line.chords.map((entry) => (entry.id === anchor.id ? { ...entry, position: target } : entry)).sort((a, b) => a.position - b.position) });
  };

  const chip = (anchor: ChordAnchor) => {
    const recognized = isRecognizedChord(anchor.chord);
    return (
      <button
        type="button"
        onClick={() => setRequest({ mode: 'edit', anchorId: anchor.id })}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const right = event.key === 'ArrowRight';
            moveBy(anchor, event.shiftKey ? (right ? 'word-right' : 'word-left') : right ? 'right' : 'left');
          } else if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            onChange(removeChord(line, anchor.id));
            inputRef.current?.focus();
          }
        }}
        aria-label={`Acorde ${anchor.chord}${recognized ? '' : ', no reconocido'}. Flechas para moverlo, Suprimir para quitarlo.`}
        title={recognized ? undefined : 'No se reconoce como acorde'}
        className={`relative whitespace-nowrap rounded-md px-1.5 py-0.5 [@media(pointer:coarse)]:px-2.5 [@media(pointer:coarse)]:py-2 font-mono text-[13px] font-bold leading-none shadow-sm transition-colors before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] [@media(pointer:coarse)]:before:-inset-y-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/50 ${
          recognized
            ? 'bg-[#EAF1FF] text-[#1D56D6] hover:bg-[#DCE8FF] dark:bg-blue-500/15 dark:text-sky-300 dark:hover:bg-blue-500/25'
            : 'bg-amber-50 text-amber-800 ring-1 ring-amber-300 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/40'
        }`}
      >
        {anchor.chord}
      </button>
    );
  };

  const menu = (
    <ActionMenu
      label={`Opciones de ${name}`}
      icon={MoreHorizontal}
      triggerClassName={`${iconButton} w-9 h-9`}
      items={[
        line.instrumental
          ? { label: 'Convertir en línea con letra', icon: Rows3, onSelect: () => onChange(setInstrumental(line, false)) }
          : { label: 'Convertir en línea instrumental', icon: Music2, onSelect: () => onChange(setInstrumental(line, true)) },
        { label: 'Eliminar línea', icon: Trash2, danger: true, separated: true, disabled: !canRemove, onSelect: () => onRemove(line.id) },
      ]}
    />
  );

  return (
    <div className="group/line">
      {line.instrumental ? (
        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={`${name}, instrumental`}
            className="flex min-h-[44px] min-w-0 flex-1 flex-wrap items-center gap-1.5 rounded-lg border border-dashed border-slate-200 dark:border-dark-700 px-3 py-1.5"
          >
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">Instrumental</span>
            {line.chords.map((anchor) => (
              <React.Fragment key={anchor.id}>{chip(anchor)}</React.Fragment>
            ))}
            <button
              type="button"
              onClick={() => setRequest({ mode: 'add', position: 0 })}
              className="inline-flex h-8 [@media(pointer:coarse)]:h-11 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
            >
              <Plus className="w-3.5 h-3.5" />
              Acorde
            </button>
          </div>
          {menu}
        </div>
      ) : (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {/* Chords sit in this lane, in the field's own font so 1ch is one letter. */}
            <div aria-hidden={line.chords.length === 0} className="relative h-7 [@media(pointer:coarse)]:h-11 overflow-hidden font-mono text-base sm:text-[15px]">
              {line.chords.map((anchor) => (
                <span
                  key={anchor.id}
                  className="absolute bottom-1"
                  style={{ left: `calc(${FIELD_PADDING} + ${anchor.position}ch - ${scrollLeft}px)` }}
                >
                  {chip(anchor)}
                </span>
              ))}
            </div>
            <input
              ref={(element) => {
                inputRef.current = element;
                registerInput(line.id, element);
              }}
              type="text"
              value={line.text}
              aria-label={name}
              spellCheck
              autoCapitalize="sentences"
              onChange={(event) => {
                onChange(setLineText(line, event.target.value, event.target.selectionEnd ?? undefined));
                syncScroll();
              }}
              onScroll={syncScroll}
              onSelect={syncScroll}
              onKeyDown={(event) => {
                const target = event.currentTarget;
                const start = target.selectionStart ?? 0;
                const collapsed = start === (target.selectionEnd ?? 0);
                if (event.key === 'Enter') {
                  event.preventDefault();
                  onSplit(line.id, start);
                } else if (event.key === 'Backspace' && collapsed && start === 0) {
                  event.preventDefault();
                  onMergeWithPrevious(line.id);
                } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
                  event.preventDefault();
                  onFocusSibling(line.id, event.key === 'ArrowUp' ? -1 : 1, start);
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData('text/plain');
                if (!/\r|\n/.test(pasted) && !/\[[A-G]/.test(pasted)) return;
                event.preventDefault();
                const target = event.currentTarget;
                onPaste(line.id, target.selectionStart ?? line.text.length, target.selectionEnd ?? line.text.length, pasted.split(/\r?\n/));
              }}
              placeholder="Escribe la letra"
              className="w-full rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-3 py-2 font-mono text-base sm:text-[15px] text-slate-900 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600 focus:outline-none focus:border-[#2464ED] focus:ring-2 focus:ring-[#2464ED]/15 dark:[color-scheme:dark]"
            />
          </div>
          <button
            type="button"
            onClick={() => setRequest({ mode: 'add', position: caret() })}
            aria-label={`Agregar acorde en ${name}, en la posición del cursor`}
            className="mb-0.5 inline-flex h-10 [@media(pointer:coarse)]:h-11 shrink-0 items-center gap-1 rounded-lg border border-slate-200 dark:border-dark-700 px-2.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Acorde</span>
          </button>
          <div className="mb-0.5">{menu}</div>
        </div>
      )}

      {request && (request.mode === 'add' || editing) && (
        <ChordDialog
          mode={request.mode}
          text={line.text}
          position={request.mode === 'add' ? request.position : editing?.position ?? 0}
          instrumental={line.instrumental}
          initialChord={editing?.chord}
          suggestions={suggestions}
          onSave={(chord) => {
            onChange(editing ? changeChord(line, editing.id, chord) : placeChord(line, request.mode === 'add' ? request.position : 0, chord));
            setRequest(null);
          }}
          onMove={editing ? (how) => moveBy(editing, how) : undefined}
          onRemove={
            editing
              ? () => {
                  onChange(removeChord(line, editing.id));
                  setRequest(null);
                }
              : undefined
          }
          onClose={() => setRequest(null)}
        />
      )}
    </div>
  );
};
