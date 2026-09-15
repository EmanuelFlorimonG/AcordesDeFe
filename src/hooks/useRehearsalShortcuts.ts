import { useEffect, useRef } from 'react';

export interface RehearsalShortcutHandlers {
  onToggleAutoScroll: () => void;
  onSpeedUp: () => void;
  onSpeedDown: () => void;
  onTransposeUp: () => void;
  onTransposeDown: () => void;
  onToggleMetronome: () => void;
  onGuitar: () => void;
  onPiano: () => void;
  onEscape: () => void;
}

/** Typing in a field must never trigger a shortcut. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  if (target instanceof HTMLElement && target.isContentEditable) return true;
  return Boolean(
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')
  );
}

/**
 * Keyboard shortcuts for rehearsal mode:
 *   Space        play / pause auto-scroll
 *   ↑ / ↓        auto-scroll speed
 *   + / -        transpose
 *   M            metronome
 *   G / P        guitar / piano
 *   Esc          step back (the caller decides what that means)
 *
 * Combinations with Ctrl, Cmd or Alt are left alone, so browser shortcuts like
 * zoom (Ctrl +) keep working.
 */
export function useRehearsalShortcuts(handlers: RehearsalShortcutHandlers, enabled: boolean): void {
  // The listener is registered once; it reads the latest handlers from here.
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;

      const current = handlersRef.current;
      const run = (action: () => void, allowRepeat = false) => {
        // Also stops Space from pressing whichever button has focus.
        event.preventDefault();
        if (event.repeat && !allowRepeat) return;
        action();
      };

      switch (event.key) {
        case ' ':
          return run(current.onToggleAutoScroll);
        case 'ArrowUp':
          return run(current.onSpeedUp, true);
        case 'ArrowDown':
          return run(current.onSpeedDown, true);
        case '+':
        case '=':
          return run(current.onTransposeUp);
        case '-':
        case '_':
          return run(current.onTransposeDown);
        case 'm':
        case 'M':
          return run(current.onToggleMetronome);
        case 'g':
        case 'G':
          return run(current.onGuitar);
        case 'p':
        case 'P':
          return run(current.onPiano);
        case 'Escape':
          return run(current.onEscape);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
