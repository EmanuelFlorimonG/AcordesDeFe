import React, { useEffect, useId, useRef, useState } from 'react';
import { clampEditorSplit, DEFAULT_EDITOR_SPLIT, MAX_EDITOR_SPLIT, MIN_EDITOR_SPLIT, readEditorSplit, saveEditorSplit } from '../../editor/splitPreference';

/** Layout preferences belong to the browser, independently of the song and its draft. */
export const SongEditorSplit: React.FC<{ editor: React.ReactNode; preview: React.ReactNode }> = ({ editor, preview }) => {
  const [ratio, setRatio] = useState(readEditorSplit);
  const [dragging, setDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startRatio: number; latestRatio: number; width: number } | null>(null);
  const editorId = useId();
  const previewId = useId();
  const hintId = useId();

  useEffect(() => {
    if (!dragging) return;
    const body = document.body;
    const { userSelect, cursor } = body.style;
    body.style.userSelect = 'none';
    body.style.cursor = 'col-resize';
    return () => {
      if (dragRef.current) saveEditorSplit(dragRef.current.latestRatio);
      body.style.userSelect = userSelect;
      body.style.cursor = cursor;
    };
  }, [dragging]);

  const change = (value: number) => {
    const next = clampEditorSplit(value);
    setRatio(next);
    saveEditorSplit(next);
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !event.isPrimary || dragRef.current || !containerRef.current) return;
    const width = containerRef.current.getBoundingClientRect().width - event.currentTarget.getBoundingClientRect().width;
    if (width <= 0) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startRatio: ratio, latestRatio: ratio, width };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.latestRatio = clampEditorSplit(drag.startRatio + ((event.clientX - drag.startX) / drag.width) * 100);
    setRatio(drag.latestRatio);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    saveEditorSplit(drag.latestRatio);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div ref={containerRef} className={`grid min-w-0 gap-6 xl:flex xl:h-[min(70dvh,56rem)] xl:gap-0 ${dragging ? 'select-none cursor-col-resize' : ''}`}>
      <div id={editorId} role="region" aria-label="Editor de canciones" style={{ flexGrow: ratio }} className="min-w-0 xl:min-h-0 xl:basis-0 xl:overflow-y-auto">
        {editor}
      </div>
      <div
        role="separator"
        tabIndex={0}
        aria-label="Ancho del editor de canciones"
        aria-orientation="vertical"
        aria-controls={editorId}
        aria-describedby={hintId}
        aria-valuemin={MIN_EDITOR_SPLIT}
        aria-valuemax={MAX_EDITOR_SPLIT}
        aria-valuenow={ratio}
        aria-valuetext={`Editor ${ratio} %, vista previa ${100 - ratio} %`}
        title="Arrastra para ajustar. Doble clic para restaurar 50/50."
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onDoubleClick={() => change(DEFAULT_EDITOR_SPLIT)}
        onKeyDown={(event) => {
          if (dragRef.current) return;
          const next = event.key === 'ArrowLeft' ? ratio - 1
            : event.key === 'ArrowRight' ? ratio + 1
            : event.key === 'Home' ? MIN_EDITOR_SPLIT
            : event.key === 'End' ? MAX_EDITOR_SPLIT
            : event.key === 'Enter' ? DEFAULT_EDITOR_SPLIT : null;
          if (next === null) return;
          event.preventDefault();
          event.stopPropagation();
          change(next);
        }}
        className="group hidden w-4 [@media(pointer:coarse)]:w-11 shrink-0 cursor-col-resize touch-none select-none items-center justify-center rounded-lg transition-colors motion-reduce:transition-none hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/50 xl:flex"
      >
        <span aria-hidden="true" className={`h-10 w-1 rounded-full transition-colors motion-reduce:transition-none group-hover:bg-[#2464ED] group-focus-visible:bg-[#2464ED] ${dragging ? 'bg-[#2464ED]' : 'bg-slate-300 dark:bg-dark-600'}`} />
      </div>
      <div id={previewId} role="region" aria-label="Vista previa de canciones" style={{ flexGrow: 100 - ratio }} className="min-w-0 xl:min-h-0 xl:basis-0 xl:overflow-y-auto">
        {preview}
      </div>
      <p id={hintId} className="sr-only">Usa las flechas izquierda y derecha para ajustar el ancho. Home y End fijan los límites. Enter restaura 50/50.</p>
    </div>
  );
};
