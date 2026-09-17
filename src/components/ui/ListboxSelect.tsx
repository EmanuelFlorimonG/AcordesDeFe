import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export interface ListboxOption<T> {
  value: T;
  label: string;
  /** Shown before the label: an icon or a colour dot */
  leading?: React.ReactNode;
  /** Shown after the label: a count, for instance */
  trailing?: React.ReactNode;
  /** Draws a divider above this option */
  separated?: boolean;
}

interface ListboxSelectProps<T> {
  value: T;
  options: ReadonlyArray<ListboxOption<T>>;
  onChange: (value: T) => void;
  /** Accessible name, also shown as the list's heading */
  label: string;
  /** Hides the heading inside the open list */
  hideHeading?: boolean;
  /** Content of the button; defaults to the selected option */
  renderTrigger?: (selected: ListboxOption<T>) => React.ReactNode;
  /** Tints the button, e.g. when the choice filters something */
  highlighted?: boolean;
  footer?: React.ReactNode;
  className?: string;
  size?: 'md' | 'sm';
  panelMinWidth?: number;
}

const PANEL_GAP = 6;

/**
 * A select that looks like the rest of the app: a button that opens a list of
 * options with a check on the chosen one. Arrow keys, Home and End move, Enter
 * or Space choose, Esc closes and returns focus to the button.
 *
 * The list opens in a layer above everything, placed against the button, so a
 * scrolling container never clips it.
 */
export function ListboxSelect<T>({
  value,
  options,
  onChange,
  label,
  hideHeading = false,
  renderTrigger,
  highlighted = false,
  footer,
  className = '',
  size = 'md',
  panelMinWidth = 240,
}: ListboxSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, panelMinWidth), window.innerWidth - 16);
    // Aligned to the button's right edge, kept inside the screen.
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPosition({ top: rect.bottom + PANEL_GAP, left, width });
  };

  const openList = () => {
    place();
    setActiveIndex(selectedIndex);
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (option: ListboxOption<T>) => {
    onChange(option.value);
    close();
  };

  useLayoutEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    // The button moves when its container scrolls or the window resizes:
    // closing is clearer than a list drifting away from it.
    const handleMove = (event: Event) => {
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('scroll', handleMove, true);
      window.removeEventListener('resize', handleMove);
    };
  }, [open]);

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    // Keys handled here must not reach a dialog around this control.
    const last = options.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => (index === last ? 0 : index + 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => (index === 0 ? last : index - 1));
        break;
      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;
      case 'End':
        event.preventDefault();
        setActiveIndex(last);
        break;
      case 'Escape':
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-9 [@media(pointer:coarse)]:h-11 pl-3 pr-2.5 gap-2 text-[13px]'
      : 'h-[42px] pl-3.5 pr-3 gap-2.5 text-[15px] sm:text-sm';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        className={`group inline-flex items-center rounded-lg border text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/30 ${sizeClasses} ${
          highlighted
            ? 'border-[#2464ED]/40 bg-[#EAF1FF] dark:bg-blue-500/10 text-[#10203A] dark:text-white'
            : 'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-dark-600'
        } ${open ? 'border-[#2464ED] ring-2 ring-[#2464ED]/15' : ''} ${className}`}
      >
        {selected && (renderTrigger ? renderTrigger(selected) : (
          <>
            {selected.leading}
            <span className="min-w-0 flex-1 truncate">{selected.label}</span>
          </>
        ))}
        <ChevronDown
          aria-hidden="true"
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={{ top: position.top, left: position.left, width: position.width }}
            className="fixed z-[80] rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 shadow-[0_18px_48px_-12px_rgba(15,23,42,0.35)] animate-dialog-in overflow-hidden"
          >
            {!hideHeading && (
              <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                {label}
              </p>
            )}
            <div
              id={listId}
              role="listbox"
              aria-label={label}
              onKeyDown={handleListKeyDown}
              className={hideHeading ? 'py-1.5' : 'pb-1.5'}
            >
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <React.Fragment key={String(option.value)}>
                    {option.separated && (
                      <div role="presentation" className="mx-3.5 my-1 h-px bg-slate-100 dark:bg-dark-800" />
                    )}
                    <button
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      tabIndex={index === activeIndex ? 0 : -1}
                      onClick={() => choose(option)}
                      onMouseEnter={() => setActiveIndex(index)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          event.stopPropagation();
                          choose(option);
                        }
                      }}
                      className={`w-full flex items-center gap-3 h-10 [@media(pointer:coarse)]:h-11 px-3.5 text-left text-sm transition-colors focus:outline-none ${
                        index === activeIndex ? 'bg-slate-50 dark:bg-dark-800' : ''
                      } ${isSelected ? 'text-[#2464ED] dark:text-sky-400 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      {option.leading !== undefined && <span className="w-4 flex justify-center shrink-0">{option.leading}</span>}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.trailing !== undefined && (
                        <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{option.trailing}</span>
                      )}
                      <span className="w-4 shrink-0 flex justify-center">{isSelected && <Check className="w-4 h-4" />}</span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            {footer && (
              <div className="border-t border-slate-100 dark:border-dark-800 px-3.5 py-2.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                {footer}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
