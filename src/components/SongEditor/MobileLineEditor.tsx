import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';
import { changeChord, isRecognizedChord, moveChord, placeChord, placeChordAt, removeChord, setLineText } from '../../editor/songEditorModel';
import type { LineEditorProps } from './LineEditor';
import type { EditorViewport } from './useEditorViewport';
import { mobileChordLanes } from '../../editor/mobileChordLayout';

type Props = LineEditorProps & { viewport: EditorViewport; active: boolean; onActivate: () => void; onFinish: () => void; menu: React.ReactNode };
type Request = { mode: 'add'; position: number } | { mode: 'edit'; id: string };
const toolButton = 'flex h-11 min-w-11 shrink-0 items-center justify-center gap-1 rounded-lg px-2 text-blue-700 dark:text-sky-300 hover:bg-blue-50 dark:hover:bg-blue-400/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 touch-manipulation';

/** A soft-wrapped view of ONE model line: wrapping never changes its character offsets. */
export function MobileLineEditor({ line, name, suggestions, registerInput, onChange, onSplit, onMergeWithPrevious, onFocusSibling, onPaste, viewport, active, onActivate, onFinish, menu }: Props) {
  const field = useRef<HTMLTextAreaElement | null>(null);
  const mirror = useRef<HTMLDivElement | null>(null);
  const toolbar = useRef<HTMLDivElement | null>(null);
  const chordInput = useRef<HTMLInputElement | null>(null);
  const selection = useRef({ start: 0, end: 0 });
  const [request, setRequest] = useState<Request | null>(null);
  const [typed, setTyped] = useState('');
  const [caretPosition, setCaretPosition] = useState(0);
  const [moving, setMoving] = useState<string | null>(null);
  const [positions, setPositions] = useState<{ id: string; left: number; top: number }[]>([]);
  const editing = request?.mode === 'edit' ? line.chords.find(c => c.id === request.id) : undefined;
  const spaced = line.chords.length > 0;
  const lanes = useMemo(() => mobileChordLanes(line.chords), [line.chords]);
  const extraLanes = Math.max(0, ...lanes.values());
  const typography: React.CSSProperties = { fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)', fontSize: 16, lineHeight: spaced ? `${40 + extraLanes * 24}px` : '1.625rem', paddingTop: spaced ? `${16 + extraLanes * 24}px` : '0.5rem', paddingBottom: spaced ? 0 : '0.5rem', paddingLeft: '0.5rem', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', wordBreak: 'normal', tabSize: 4, paddingRight: '3rem' };

  useLayoutEffect(() => {
    const input = field.current;
    const measure = mirror.current;
    if (!input || !measure) return;
    const update = () => {
      input.style.height = `${measure.getBoundingClientRect().height}px`;
      const text = measure.firstChild;
      if (!text) return;
      const bounds = measure.getBoundingClientRect();
      setPositions(line.chords.map(c => {
        const range = document.createRange();
        range.setStart(text, Math.min(c.position, line.text.length));
        range.setEnd(text, Math.min(c.position + 1, line.text.length + 1));
        const box = range.getBoundingClientRect();
        return { id: c.id, left: Math.max(0, box.left - bounds.left), top: Math.max(0, box.top - bounds.top - 20 - (lanes.get(c.id) ?? 0) * 24) };
      }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [line.text, line.chords, spaced, lanes]);

  useLayoutEffect(() => {
    if (!active) return;
    const element = toolbar.current;
    if (!element) return;
    const update = () => document.documentElement.style.setProperty('--song-toolbar-height', `${element.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty('--song-toolbar-height'); };
  }, [active]);

  useLayoutEffect(() => {
    if (!active || request) return;
    const input = field.current;
    if (!input || document.activeElement !== input) return;
    const measure = mirror.current;
    if (!measure?.firstChild) return;
    const range = document.createRange();
    const position = Math.min(selection.current.start, line.text.length);
    range.setStart(measure.firstChild, position);
    range.setEnd(measure.firstChild, Math.min(position + 1, line.text.length + 1));
    const caret = range.getBoundingClientRect();
    const visible = window.visualViewport;
    const top = visible?.offsetTop ?? 0;
    const bottom = top + viewport.height - (toolbar.current?.getBoundingClientRect().height ?? 0);
    const delta = caret.bottom > bottom - 12 ? caret.bottom - bottom + 12 : caret.top < top + 12 ? caret.top - top - 12 : 0;
    if (!delta) return;
    let scroller = input.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (scroller) scroller.scrollBy({ top: delta });
    else window.scrollBy({ top: delta });
    // A viewport pan must not pull the user back while they scroll the song.
  }, [active, viewport.height, request, line.text, caretPosition]);

  useLayoutEffect(() => { if (request) chordInput.current?.focus({ preventScroll: true }); }, [request]);
  const remember = (input: HTMLTextAreaElement) => { selection.current = { start: input.selectionStart, end: input.selectionEnd }; setCaretPosition(input.selectionStart); };
  const restore = (position = selection.current.start) => {
    field.current?.focus({ preventScroll: true });
    field.current?.setSelectionRange(position, position);
    selection.current = { start: position, end: position };
  };
  const open = (next: Request) => {
    onActivate(); setTyped(next.mode === 'edit' ? line.chords.find(c => c.id === next.id)?.chord ?? '' : ''); setRequest(next);
  };
  const save = () => {
    const chord = typed.trim();
    if (!chord || !request) return;
    const position = editing?.position ?? (request.mode === 'add' ? request.position : selection.current.start);
    onChange(editing ? changeChord(line, editing.id, chord) : placeChord(line, position, chord));
    setRequest(null); restore(position);
  };
  const finish = () => { setMoving(null); setRequest(null); field.current?.blur(); chordInput.current?.blur(); onFinish(); };
  const move = (direction: -1 | 1) => { if (editing) onChange(moveChord(line, editing.id, direction)); };

  return <div className="relative min-h-11 border-b border-slate-100 dark:border-dark-800" data-mobile-lyric-line="">
    <div className="relative min-w-0">
      <div ref={mirror} aria-hidden="true" className="pointer-events-none invisible absolute left-0 right-0 top-0" style={typography}>{line.text + '\u200b'}</div>
      <textarea ref={element => { field.current = element; registerInput(line.id, element); }} rows={1} wrap="soft"
        value={line.text} aria-label={name} placeholder="Escribe la letra" spellCheck autoCapitalize="sentences"
        style={{ ...typography, scrollMarginBlockEnd: 'calc(var(--song-toolbar-height, 0px) + 1rem)' }}
        className={`block w-full resize-none overflow-hidden rounded-md border-0 bg-transparent text-slate-900 placeholder:text-slate-400 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500/30 ${active ? 'bg-blue-50/40 dark:bg-blue-500/5' : ''}`}
        onFocus={onActivate} onSelect={event => remember(event.currentTarget)}
        onBlur={event => { remember(event.currentTarget); if (!toolbar.current?.contains(event.relatedTarget as Node) && !(event.relatedTarget as Element | null)?.closest('[data-mobile-chord], [role="menu"], [role="menuitem"]')) { setMoving(null); onFinish(); } }}
        onChange={event => { remember(event.currentTarget); setMoving(null); onChange(setLineText(line, event.target.value, event.target.selectionEnd)); }}
        onClick={event => { remember(event.currentTarget); if (moving) { onChange(placeChordAt(line, moving, event.currentTarget.selectionStart)); setMoving(null); } }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          const start = event.currentTarget.selectionStart;
          if (moving && (event.key === 'Enter' || event.key === 'Escape')) { event.preventDefault(); if (event.key === 'Enter') onChange(placeChordAt(line, moving, start)); setMoving(null); }
          else if (event.key === 'Enter') { event.preventDefault(); onSplit(line.id, start); }
          else if (event.key === 'Backspace' && start === 0 && event.currentTarget.selectionEnd === 0) { event.preventDefault(); onMergeWithPrevious(line.id); }
          else if (event.key === 'Escape') finish();
        }}
        onPaste={event => { const text = event.clipboardData.getData('text/plain'); if (!/\r|\n|\[[A-G]/.test(text)) return; event.preventDefault(); onPaste(line.id, event.currentTarget.selectionStart, event.currentTarget.selectionEnd, text.split(/\r?\n/)); }} />
      {positions.map(pos => {
        const anchor = line.chords.find(c => c.id === pos.id);
        if (!anchor) return null;
        return <button key={anchor.id} type="button" data-mobile-chord="" aria-label={`Acorde ${anchor.chord}. Editar en ${name}`} title={`Posición ${anchor.position}`}
          onPointerDown={event => event.preventDefault()} onClick={() => open({ mode: 'edit', id: anchor.id })}
          style={{ left: pos.left, top: pos.top }}
          className="absolute z-10 inline-flex min-h-5 items-center rounded bg-blue-50 px-1 font-mono text-xs font-bold text-blue-700 before:absolute before:-inset-y-3 before:inset-x-0 dark:bg-blue-500/20 dark:text-sky-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{anchor.chord}</button>;
      })}
    </div>
    {!active && <div className="absolute right-0 top-0">{menu}</div>}
    {active && createPortal(<div ref={toolbar} role="toolbar" aria-label={`Edición de ${name}`}
      className="fixed inset-x-0 z-40 border-t border-slate-200 bg-white px-2 pt-1 shadow-[0_-4px_16px_rgba(15,23,42,0.08)] dark:border-dark-700 dark:bg-dark-900"
      style={{ bottom: viewport.bottom, paddingBottom: viewport.bottom > 0 ? '0.25rem' : 'max(0.25rem, env(safe-area-inset-bottom, 0px))', maxHeight: `calc(${viewport.height}px - env(safe-area-inset-top, 0px) - 1rem)`, overflowY: 'auto' }}
      onBlurCapture={event => { const next = event.relatedTarget as Element | null; if (next !== field.current && !event.currentTarget.contains(next) && !next?.closest('[data-mobile-chord], [role="menu"], [role="menuitem"]')) { setRequest(null); onFinish(); } }}
      onPointerDown={event => { if ((event.target as Element).closest('button')) event.preventDefault(); }}>
      {request ? <>
        <div className="flex items-center gap-1">
          <input ref={chordInput} aria-label="Acorde" value={typed} onChange={e => setTyped(e.target.value.replace(/[[\]]/g, ''))} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            className="h-11 min-w-0 flex-1 rounded-lg border border-slate-200 bg-transparent px-3 font-mono text-base text-slate-900 dark:border-dark-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); save(); } else if (event.key === 'Escape') { setRequest(null); restore(); } }} />
          <button type="button" className={toolButton} aria-label="Guardar acorde" disabled={!typed.trim()} onClick={save}><Check className="h-5 w-5" /></button>
          <button type="button" className={toolButton} aria-label="Cancelar acorde" onClick={() => { setRequest(null); restore(); }}><X className="h-5 w-5" /></button>
        </div>
        {typed.trim() && !isRecognizedChord(typed.trim()) && <p role="status" className="px-2 text-xs text-amber-800 dark:text-amber-300">Acorde no reconocido. Se conservará tal como lo escribas.</p>}
        <div className="flex items-center gap-1 overflow-x-auto">
          {editing ? <>
            <button type="button" className={toolButton} aria-label="Mover acorde una letra a la izquierda" onClick={() => move(-1)}><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" className={toolButton} aria-label="Mover acorde una letra a la derecha" onClick={() => move(1)}><ChevronRight className="h-5 w-5" /></button>
            <button type="button" className={toolButton} onClick={() => { setMoving(editing.id); setRequest(null); restore(editing.position); }}>Al cursor</button>
            <button type="button" className={toolButton} aria-label="Quitar acorde" onClick={() => { onChange(removeChord(line, editing.id)); setRequest(null); restore(editing.position); }}><Trash2 className="h-4 w-4" /></button>
          </> : suggestions.map(chord => <button type="button" key={chord} className={toolButton + ' font-mono'} onClick={() => setTyped(chord)}>{chord}</button>)}
        </div>
      </> : <div className="flex items-center gap-1">
        <button type="button" className={toolButton} aria-label="Línea anterior" onClick={() => onFocusSibling(line.id, -1, selection.current.start)}><ArrowUp className="h-5 w-5" /></button>
        <button type="button" className={toolButton} aria-label="Línea siguiente" onClick={() => onFocusSibling(line.id, 1, selection.current.start)}><ArrowDown className="h-5 w-5" /></button>
        <button type="button" className={toolButton + ' flex-1 font-semibold'} onClick={() => open({ mode: 'add', position: selection.current.start })}><Plus className="h-4 w-4" /> Acorde</button>
        {menu}
        <button type="button" className={toolButton} aria-label="Terminar edición de línea" onClick={finish}><Check className="h-5 w-5" /></button>
      </div>}
      {moving && <p role="status" className="px-2 py-1 text-xs text-blue-700 dark:text-sky-300">Toca la letra donde empieza el acorde.</p>}
    </div>, document.body)}
  </div>;
}
