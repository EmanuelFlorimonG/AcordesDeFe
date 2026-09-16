import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, MoreVertical, Music4, Pencil, Play, StickyNote, Trash2 } from 'lucide-react';
import type { SetlistItem } from '../../types/setlist';
import type { Song } from '../../types/song';
import { describeKey } from '../../utils/keySettings';
import { ActionMenu } from './ActionMenu';
import { iconButton } from './ui';

interface SetlistSongListProps {
  items: SetlistItem[];
  songsById: Map<string, Song>;
  onOpenItem: (item: SetlistItem) => void;
  onEditItem: (item: SetlistItem) => void;
  onRemoveItem: (item: SetlistItem) => void;
  /** Moves an entry to a position (drag and drop) */
  onMoveItem: (itemId: string, toIndex: number) => void;
  /** Moves an entry one place up or down (keyboard and menu) */
  onMoveItemBy: (itemId: string, delta: number) => void;
}

interface DragState {
  itemId: string;
  pointerId: number;
  fromIndex: number;
  overIndex: number;
  /** Pixels the dragged row has travelled */
  offset: number;
  height: number;
}

/** How close to the edge of the scrolling area the finger starts scrolling it. */
const EDGE_SCROLL_ZONE = 72;
const MAX_EDGE_SCROLL = 16;
const MOVE_HIGHLIGHT_MS = 900;

function getScrollParent(element: HTMLElement | null): HTMLElement {
  let current = element?.parentElement ?? null;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/**
 * The songs of a setlist, in playing order.
 *
 * They can be reordered by dragging the handle (mouse, pen or finger) or, for
 * anyone not using a pointer, with the arrow keys on that same handle and from
 * each row's menu. Reordering is announced out loud for screen readers.
 */
export const SetlistSongList: React.FC<SetlistSongListProps> = ({
  items,
  songsById,
  onOpenItem,
  onEditItem,
  onRemoveItem,
  onMoveItem,
  onMoveItemBy,
}) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);

  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pointerYRef = useRef(0);
  const frameRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  /** Measured once per drag: where every row sits inside the scrolling area. */
  const startRef = useRef<{ clientY: number; scrollTop: number; tops: number[]; heights: number[] } | null>(null);
  /** Set when a drop or a keyboard move should be animated or re-focused. */
  const flipRef = useRef<{ itemId: string; top: number } | null>(null);
  const focusHandleRef = useRef<string | null>(null);

  const setRowRef = (itemId: string) => (element: HTMLLIElement | null) => {
    if (element) rowRefs.current.set(itemId, element);
    else rowRefs.current.delete(itemId);
  };

  const setHandleRef = (itemId: string) => (element: HTMLButtonElement | null) => {
    if (element) handleRefs.current.set(itemId, element);
    else handleRefs.current.delete(itemId);
  };

  const announceMove = (item: SetlistItem, toIndex: number) => {
    const song = songsById.get(item.songId);
    setAnnouncement(`${song?.title ?? 'Canción'} en la posición ${toIndex + 1} de ${items.length}`);
    setRecentlyMovedId(item.id);
  };

  useEffect(() => {
    if (!recentlyMovedId) return;
    const timer = window.setTimeout(() => setRecentlyMovedId(null), MOVE_HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [recentlyMovedId]);

  // After a drop the rows are already where the eye expects them, so the only
  // thing left to settle is the row that was under the finger.
  useLayoutEffect(() => {
    const flip = flipRef.current;
    flipRef.current = null;
    if (flip) {
      const row = rowRefs.current.get(flip.itemId);
      if (row) {
        const delta = flip.top - row.getBoundingClientRect().top;
        if (Math.abs(delta) > 1) {
          row.style.transition = 'none';
          row.style.transform = `translateY(${delta}px)`;
          requestAnimationFrame(() => {
            row.style.transition = 'transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)';
            row.style.transform = '';
          });
        }
      }
    }
    const focusId = focusHandleRef.current;
    focusHandleRef.current = null;
    if (focusId) handleRefs.current.get(focusId)?.focus({ preventScroll: true });
  }, [items]);

  const stopEdgeScroll = () => {
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
  };

  useEffect(() => stopEdgeScroll, []);

  const updateFromPointer = (clientY: number) => {
    const start = startRef.current;
    const current = dragRef.current;
    const scroller = scrollerRef.current;
    if (!start || !current || !scroller) return;

    const travelled = clientY + scroller.scrollTop - (start.clientY + start.scrollTop);
    const center = start.tops[current.fromIndex] + start.heights[current.fromIndex] / 2 + travelled;

    let overIndex = current.fromIndex;
    for (let index = current.fromIndex + 1; index < start.tops.length; index++) {
      if (center > start.tops[index] + start.heights[index] / 2) overIndex = index;
    }
    for (let index = current.fromIndex - 1; index >= 0; index--) {
      if (center < start.tops[index] + start.heights[index] / 2) overIndex = index;
    }

    const next = { ...current, offset: travelled, overIndex };
    dragRef.current = next;
    setDrag(next);
  };

  const runEdgeScroll = () => {
    frameRef.current = requestAnimationFrame(runEdgeScroll);
    const scroller = scrollerRef.current;
    if (!scroller || !dragRef.current) return;
    const bounds = scroller.getBoundingClientRect();
    const y = pointerYRef.current;
    let step = 0;
    if (y < bounds.top + EDGE_SCROLL_ZONE) {
      step = -Math.ceil((MAX_EDGE_SCROLL * (bounds.top + EDGE_SCROLL_ZONE - y)) / EDGE_SCROLL_ZONE);
    } else if (y > bounds.bottom - EDGE_SCROLL_ZONE) {
      step = Math.ceil((MAX_EDGE_SCROLL * (y - (bounds.bottom - EDGE_SCROLL_ZONE))) / EDGE_SCROLL_ZONE);
    }
    if (step === 0) return;
    const before = scroller.scrollTop;
    scroller.scrollTop += step;
    if (scroller.scrollTop !== before) updateFromPointer(y);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, item: SetlistItem, index: number) => {
    // Only a primary press starts a drag; a right click opens the browser menu.
    if (event.button !== 0 || items.length < 2) return;
    const scroller = getScrollParent(listRef.current);
    const rows = items.map((entry) => rowRefs.current.get(entry.id));
    if (rows.some((row) => !row)) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    scrollerRef.current = scroller;
    pointerYRef.current = event.clientY;
    startRef.current = {
      clientY: event.clientY,
      scrollTop: scroller.scrollTop,
      tops: rows.map((row) => row!.getBoundingClientRect().top + scroller.scrollTop),
      heights: rows.map((row) => row!.getBoundingClientRect().height),
    };
    const state: DragState = {
      itemId: item.id,
      pointerId: event.pointerId,
      fromIndex: index,
      overIndex: index,
      offset: 0,
      height: startRef.current.heights[index],
    };
    dragRef.current = state;
    setDrag(state);
    stopEdgeScroll();
    frameRef.current = requestAnimationFrame(runEdgeScroll);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    pointerYRef.current = event.clientY;
    updateFromPointer(event.clientY);
  };

  const finishDrag = (commit: boolean) => {
    const current = dragRef.current;
    stopEdgeScroll();
    dragRef.current = null;
    startRef.current = null;
    setDrag(null);
    if (!current) return;

    if (commit && current.overIndex !== current.fromIndex) {
      const row = rowRefs.current.get(current.itemId);
      if (row) flipRef.current = { itemId: current.itemId, top: row.getBoundingClientRect().top };
      focusHandleRef.current = current.itemId;
      const item = items[current.fromIndex];
      announceMove(item, current.overIndex);
      onMoveItem(current.itemId, current.overIndex);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, item: SetlistItem, index: number) => {
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    focusHandleRef.current = item.id;
    announceMove(item, target);
    onMoveItemBy(item.id, delta);
  };

  const moveFromMenu = (item: SetlistItem, index: number, delta: number) => {
    announceMove(item, index + delta);
    onMoveItemBy(item.id, delta);
  };

  const rowTransform = (index: number): string | undefined => {
    if (!drag) return undefined;
    if (index === drag.fromIndex) return `translateY(${drag.offset}px)`;
    if (drag.fromIndex < drag.overIndex && index > drag.fromIndex && index <= drag.overIndex) {
      return `translateY(-${drag.height}px)`;
    }
    if (drag.overIndex < drag.fromIndex && index >= drag.overIndex && index < drag.fromIndex) {
      return `translateY(${drag.height}px)`;
    }
    return undefined;
  };

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol
        ref={listRef}
        className={`border-y border-slate-100 dark:border-dark-800 ${drag ? 'select-none' : ''}`}
      >
        {items.map((item, index) => {
          const song = songsById.get(item.songId);
          const isDragged = drag?.itemId === item.id;
          const keyDescription = song ? describeKey(song.originalKey, item, song.recommendedCapo ?? 0) : null;
          const position = String(index + 1).padStart(2, '0');

          return (
            <li
              key={item.id}
              ref={setRowRef(item.id)}
              style={{
                transform: rowTransform(index),
                transition: drag && !isDragged ? 'transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
              }}
              className={`relative flex items-center gap-1 sm:gap-2 pl-2 pr-1 sm:pr-2 border-b border-slate-100 dark:border-dark-800 last:border-b-0 ${
                isDragged
                  ? 'z-10 rounded-lg bg-white dark:bg-dark-900 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#2464ED]/30'
                  : recentlyMovedId === item.id
                    ? 'bg-[#EAF1FF] dark:bg-blue-500/10 transition-colors duration-500'
                    : 'transition-colors hover:bg-[#EAF1FF]/40 dark:hover:bg-dark-900/60'
              }`}
            >
              <span
                aria-hidden="true"
                className="w-7 sm:w-9 shrink-0 text-center font-mono text-xs sm:text-sm font-bold tabular-nums text-slate-300 dark:text-dark-600"
              >
                {position}
              </span>

              <span className="hidden md:block w-28 shrink-0 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                {item.moment}
              </span>

              {song ? (
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="min-w-0 flex-1 py-2.5 sm:py-3 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 rounded-lg"
                >
                  <span className="sr-only">{`Canción ${index + 1} de ${items.length}: `}</span>
                  {item.moment && (
                    <span className="md:hidden block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                      {item.moment}
                    </span>
                  )}
                  <span className="block truncate text-sm font-semibold text-[#10203A] dark:text-white">
                    {song.title}
                  </span>
                  {song.artist && (
                    <span className="hidden sm:block truncate text-xs text-slate-500 dark:text-slate-400">
                      {song.artist}
                    </span>
                  )}
                  <span className="sm:hidden mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {keyDescription && (
                      <span
                        className={`font-mono font-bold ${
                          keyDescription.isModified ? 'text-[#2464ED] dark:text-sky-400' : ''
                        }`}
                      >
                        {keyDescription.shape ?? keyDescription.sounding}
                      </span>
                    )}
                    {item.capoFret > 0 && <span>Cej. {item.capoFret}</span>}
                    {song.tempo && <span>{song.tempo} BPM</span>}
                    {item.notes && <StickyNote className="w-3 h-3 text-slate-400" />}
                  </span>
                </button>
              ) : (
                <span className="min-w-0 flex-1 py-3 pr-1">
                  <span className="block text-sm font-semibold text-slate-400 dark:text-slate-500">
                    Canción no disponible
                  </span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-600">{item.songId}</span>
                </span>
              )}

              {keyDescription && (
                <span
                  title={`Original: ${song?.originalKey}`}
                  className={`hidden sm:block w-12 shrink-0 text-right font-mono text-sm font-bold ${
                    keyDescription.isModified ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {keyDescription.shape ?? keyDescription.sounding}
                </span>
              )}
              {item.capoFret > 0 && (
                <span className="hidden lg:block w-14 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                  Cej. {item.capoFret}
                </span>
              )}
              <span className="hidden lg:block w-16 shrink-0 text-right text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {song?.tempo ? `${song.tempo} BPM` : ''}
              </span>
              <span className="hidden xl:flex min-w-0 max-w-[13rem] shrink-0 items-center gap-1.5 pl-2 text-xs italic text-slate-500 dark:text-slate-400">
                {item.notes && (
                  <>
                    <StickyNote className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-dark-600" />
                    <span className="truncate" title={item.notes}>
                      {item.notes}
                    </span>
                  </>
                )}
              </span>

              <ActionMenu
                label={`Opciones de ${song?.title ?? 'la canción'}`}
                icon={MoreVertical}
                triggerClassName={iconButton}
                items={[
                  ...(song
                    ? [
                        { label: 'Abrir canción', icon: Play, onSelect: () => onOpenItem(item) },
                        { label: 'Tono, momento y nota', icon: Pencil, onSelect: () => onEditItem(item) },
                      ]
                    : []),
                  {
                    label: 'Mover arriba',
                    icon: ArrowUp,
                    disabled: index === 0,
                    separated: Boolean(song),
                    onSelect: () => moveFromMenu(item, index, -1),
                  },
                  {
                    label: 'Mover abajo',
                    icon: ArrowDown,
                    disabled: index === items.length - 1,
                    onSelect: () => moveFromMenu(item, index, 1),
                  },
                  {
                    label: 'Quitar del Setlist',
                    icon: Trash2,
                    danger: true,
                    separated: true,
                    onSelect: () => onRemoveItem(item),
                  },
                ]}
              />

              <button
                ref={setHandleRef(item.id)}
                type="button"
                onPointerDown={(event) => handlePointerDown(event, item, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={() => finishDrag(true)}
                onPointerCancel={() => finishDrag(false)}
                onKeyDown={(event) => handleKeyDown(event, item, index)}
                aria-label={`Reordenar ${song?.title ?? 'la canción'}, posición ${index + 1} de ${items.length}. Usa las flechas arriba y abajo.`}
                title="Arrastra para reordenar, o usa las flechas"
                className={`${iconButton} touch-none cursor-grab active:cursor-grabbing ${
                  isDragged ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-300 dark:text-dark-600'
                } disabled:cursor-default`}
                disabled={items.length < 2}
              >
                <GripVertical className="w-[18px] h-[18px]" />
              </button>
            </li>
          );
        })}
      </ol>

      {items.every((item) => !songsById.has(item.songId)) && items.length > 0 && (
        <p className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
          <Music4 className="w-4 h-4 text-slate-300" />
          Ninguna de estas canciones está en el cancionero ahora mismo.
        </p>
      )}
    </>
  );
};
