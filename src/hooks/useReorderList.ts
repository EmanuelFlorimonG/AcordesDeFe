import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Reordering a list by hand, the way the setlists do it.
 *
 * The same behaviour serves the songs of a setlist and the sections of an
 * arrangement: drag the handle with mouse, pen or finger, or, for anyone not
 * using a pointer, move with the arrow keys on that same handle and from the
 * row's menu. The list scrolls on its own when the finger reaches the edge,
 * the row that moved settles into place instead of jumping, and every move is
 * announced out loud.
 */

interface DragState {
  id: string;
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

export interface ReorderListOptions {
  /** The ids in the order they are shown right now */
  ids: string[];
  /** Drops the row at a position */
  onMove: (id: string, toIndex: number) => void;
  /** Moves the row one place up (-1) or down (+1) */
  onMoveBy: (id: string, delta: number) => void;
  /** What a screen reader says after a move */
  describeMove: (id: string, toIndex: number, total: number) => string;
}

export interface HandleProps {
  ref: (element: HTMLButtonElement | null) => void;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: React.PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  disabled: boolean;
}

export interface ReorderList {
  /** Put it in a visually hidden element with role="status" */
  announcement: string;
  draggingId: string | null;
  recentlyMovedId: string | null;
  attachList: (element: HTMLElement | null) => void;
  attachRow: (id: string) => (element: HTMLElement | null) => void;
  rowStyle: (index: number, id: string) => React.CSSProperties | undefined;
  handleProps: (id: string, index: number) => HandleProps;
  /** Used by a menu entry: moves and announces like the keyboard does */
  moveBy: (id: string, index: number, delta: number) => void;
}

export function useReorderList({ ids, onMove, onMoveBy, describeMove }: ReorderListOptions): ReorderList {
  const order = ids.join('|');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [announcement, setAnnouncement] = useState('');
  const [recentlyMovedId, setRecentlyMovedId] = useState<string | null>(null);

  const listRef = useRef<HTMLElement | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());
  const handleRefs = useRef(new Map<string, HTMLButtonElement>());
  const scrollerRef = useRef<HTMLElement | null>(null);
  const pointerYRef = useRef(0);
  const frameRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  /** Measured once per drag: where every row sits inside the scrolling area. */
  const startRef = useRef<{ clientY: number; scrollTop: number; tops: number[]; heights: number[] } | null>(
    null
  );
  /** Set when a drop or a keyboard move should be animated or re-focused. */
  const flipRef = useRef<{ id: string; top: number } | null>(null);
  const focusHandleRef = useRef<string | null>(null);

  const attachList = useCallback((element: HTMLElement | null) => {
    listRef.current = element;
  }, []);

  // One callback per row, kept between renders: a new function on every render
  // would make React detach and reattach every row for nothing.
  const rowSetters = useRef(new Map<string, (element: HTMLElement | null) => void>());
  const handleSetters = useRef(new Map<string, (element: HTMLButtonElement | null) => void>());

  const attachRow = useCallback((id: string) => {
    const existing = rowSetters.current.get(id);
    if (existing) return existing;
    const setter = (element: HTMLElement | null) => {
      if (element) rowRefs.current.set(id, element);
      else rowRefs.current.delete(id);
    };
    rowSetters.current.set(id, setter);
    return setter;
  }, []);

  const setHandleRef = useCallback((id: string) => {
    const existing = handleSetters.current.get(id);
    if (existing) return existing;
    const setter = (element: HTMLButtonElement | null) => {
      if (element) handleRefs.current.set(id, element);
      else handleRefs.current.delete(id);
    };
    handleSetters.current.set(id, setter);
    return setter;
  }, []);

  const announceMove = (id: string, toIndex: number) => {
    setAnnouncement(describeMove(id, toIndex, ids.length));
    setRecentlyMovedId(id);
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
      const row = rowRefs.current.get(flip.id);
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
    // The order itself, not the array: the caller builds a new one every render.
  }, [order]);

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

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, id: string, index: number) => {
    // Only a primary press starts a drag; a right click opens the browser menu.
    if (event.button !== 0 || ids.length < 2) return;
    const scroller = getScrollParent(listRef.current);
    const rows = ids.map((entry) => rowRefs.current.get(entry));
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
      id,
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
      const row = rowRefs.current.get(current.id);
      if (row) flipRef.current = { id: current.id, top: row.getBoundingClientRect().top };
      focusHandleRef.current = current.id;
      announceMove(current.id, current.overIndex);
      onMove(current.id, current.overIndex);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent, id: string, index: number) => {
    const delta = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
    if (delta === 0) return;
    event.preventDefault();
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    focusHandleRef.current = id;
    announceMove(id, target);
    onMoveBy(id, delta);
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

  return {
    announcement,
    draggingId: drag?.id ?? null,
    recentlyMovedId,
    attachList,
    attachRow,
    rowStyle: (index, id) => ({
      transform: rowTransform(index),
      transition: drag && drag.id !== id ? 'transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1)' : undefined,
    }),
    handleProps: (id, index) => ({
      ref: setHandleRef(id),
      onPointerDown: (event) => handlePointerDown(event, id, index),
      onPointerMove: handlePointerMove,
      onPointerUp: () => finishDrag(true),
      onPointerCancel: () => finishDrag(false),
      onKeyDown: (event) => handleKeyDown(event, id, index),
      disabled: ids.length < 2,
    }),
    moveBy: (id, index, delta) => {
      announceMove(id, index + delta);
      onMoveBy(id, delta);
    },
  };
}
