import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Auto-scroll for a specific scrolling element.
 *
 * It always works on the element it is given, never on `window`: in this app
 * the window doesn't scroll, an inner container does.
 *
 * Movement is driven by requestAnimationFrame and measured in pixels per
 * second times the real time elapsed between frames, so the pace is the same
 * on a 60 Hz laptop, a 120 Hz phone, or a device dropping frames.
 */

/** Speeds shown to the user as multipliers; the pixel values stay internal. */
export const AUTO_SCROLL_SPEEDS = [
  { pixelsPerSecond: 10, label: '0.5x' },
  { pixelsPerSecond: 15, label: '0.75x' },
  { pixelsPerSecond: 20, label: '1x' },
  { pixelsPerSecond: 30, label: '1.25x' },
  { pixelsPerSecond: 40, label: '1.5x' },
] as const;

export const DEFAULT_AUTO_SCROLL_SPEED = 2;

/**
 * "interrupted" is a pause caused by the reader scrolling by hand, as opposed
 * to pressing Pause; the UI offers to resume it.
 */
export type AutoScrollStatus = 'idle' | 'running' | 'interrupted';

/** A frame longer than this (a hidden tab, a stall) never becomes one big jump. */
const MAX_FRAME_SECONDS = 0.1;
const SMOOTH_SCROLL_MS = 450;
const END_TOLERANCE_PX = 1;
/** Beyond this, the position was changed by something else; continue from there. */
const EXTERNAL_MOVE_TOLERANCE_PX = 2;
const MANUAL_SCROLL_KEYS = new Set(['PageUp', 'PageDown', 'Home', 'End']);

interface AutoScrollOptions {
  speedIndex: number;
  /** Multiplier applied to the speed, e.g. to keep the pace in lines with bigger text. */
  speedScale?: number;
}

export interface AutoScrollControls {
  status: AutoScrollStatus;
  isRunning: boolean;
  isInterrupted: boolean;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  /** Smoothly scrolls to a position without fighting an active auto-scroll. */
  scrollTo: (top: number) => void;
  scrollToTop: () => void;
}

function maxScrollTop(element: HTMLElement): number {
  return Math.max(0, element.scrollHeight - element.clientHeight);
}

export function useAutoScroll(
  containerRef: RefObject<HTMLElement | null>,
  { speedIndex, speedScale = 1 }: AutoScrollOptions
): AutoScrollControls {
  const [status, setStatus] = useState<AutoScrollStatus>('idle');
  // Read by event listeners, which must see the status immediately rather
  // than after the next render.
  const statusRef = useRef<AutoScrollStatus>('idle');
  const pixelsPerSecondRef = useRef(0);
  const isAnimatingRef = useRef(false);
  const animationFrameRef = useRef<number | null>(null);

  const changeStatus = useCallback((next: AutoScrollStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  useEffect(() => {
    const index = Math.min(Math.max(speedIndex, 0), AUTO_SCROLL_SPEEDS.length - 1);
    pixelsPerSecondRef.current = AUTO_SCROLL_SPEEDS[index].pixelsPerSecond * speedScale;
  }, [speedIndex, speedScale]);

  const cancelSmoothScroll = useCallback(() => {
    if (animationFrameRef.current !== null) cancelAnimationFrame(animationFrameRef.current);
    animationFrameRef.current = null;
    isAnimatingRef.current = false;
  }, []);

  // The scrolling loop. Runs only while status is "running"; any status change
  // cancels the pending frame, so pausing never produces a final jump.
  useEffect(() => {
    if (status !== 'running') return;
    const container = containerRef.current;
    if (!container) return;

    let frameId = 0;
    let previousTime: number | null = null;
    // Kept as a float: at slow speeds a single frame moves less than a pixel,
    // and rounding every frame would stall the scroll completely.
    let position = container.scrollTop;

    const step = (now: number) => {
      const elapsedSeconds =
        previousTime === null ? 0 : Math.min((now - previousTime) / 1000, MAX_FRAME_SECONDS);
      previousTime = now;

      // A smooth jump (section navigation, back to top) is in progress.
      if (isAnimatingRef.current) {
        position = container.scrollTop;
        frameId = requestAnimationFrame(step);
        return;
      }

      if (Math.abs(container.scrollTop - position) > EXTERNAL_MOVE_TOLERANCE_PX) {
        position = container.scrollTop;
      }

      const limit = maxScrollTop(container);
      position = Math.min(position + pixelsPerSecondRef.current * elapsedSeconds, limit);
      container.scrollTop = position;

      if (position >= limit - END_TOLERANCE_PX) {
        changeStatus('idle');
        return;
      }
      frameId = requestAnimationFrame(step);
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [status, containerRef, changeStatus]);

  // Manual interaction wins: the reader's own scroll pauses auto-scroll where
  // it is, without snapping back anywhere.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const interrupt = () => {
      cancelSmoothScroll();
      if (statusRef.current === 'running') changeStatus('interrupted');
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (MANUAL_SCROLL_KEYS.has(event.key)) interrupt();
    };

    container.addEventListener('wheel', interrupt, { passive: true });
    container.addEventListener('touchstart', interrupt, { passive: true });
    container.addEventListener('pointerdown', interrupt);
    container.addEventListener('keydown', handleKeyDown);
    return () => {
      container.removeEventListener('wheel', interrupt);
      container.removeEventListener('touchstart', interrupt);
      container.removeEventListener('pointerdown', interrupt);
      container.removeEventListener('keydown', handleKeyDown);
    };
  }, [containerRef, cancelSmoothScroll, changeStatus]);

  useEffect(() => cancelSmoothScroll, [cancelSmoothScroll]);

  const scrollTo = useCallback(
    (top: number) => {
      const container = containerRef.current;
      if (!container) return;
      cancelSmoothScroll();

      const target = Math.min(Math.max(top, 0), maxScrollTop(container));
      const start = container.scrollTop;
      const distance = target - start;
      const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

      if (prefersReducedMotion || Math.abs(distance) < 1) {
        container.scrollTop = target;
        return;
      }

      isAnimatingRef.current = true;
      const startedAt = performance.now();
      const tick = (now: number) => {
        const progress = Math.min((now - startedAt) / SMOOTH_SCROLL_MS, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        container.scrollTop = start + distance * eased;
        if (progress < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = null;
          isAnimatingRef.current = false;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    },
    [containerRef, cancelSmoothScroll]
  );

  const play = useCallback(() => {
    const container = containerRef.current;
    // Pressing play at the end of the song starts it again from the top.
    if (container) {
      const limit = maxScrollTop(container);
      if (limit > 0 && container.scrollTop >= limit - END_TOLERANCE_PX) scrollTo(0);
    }
    changeStatus('running');
  }, [containerRef, scrollTo, changeStatus]);

  const pause = useCallback(() => changeStatus('idle'), [changeStatus]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'running') pause();
    else play();
  }, [pause, play]);

  const scrollToTop = useCallback(() => scrollTo(0), [scrollTo]);

  return {
    status,
    isRunning: status === 'running',
    isInterrupted: status === 'interrupted',
    play,
    pause,
    toggle,
    scrollTo,
    scrollToTop,
  };
}
