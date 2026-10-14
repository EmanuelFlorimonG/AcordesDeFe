import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { findSelectMatch, placeSelectPanel } from './selectLayout';

export interface ListboxOption<T> {
  value: T;
  label: string;
  /** Shown before the label: an icon or a colour dot */
  leading?: React.ReactNode;
  /** Shown after the label: a count, for instance */
  trailing?: React.ReactNode;
  /** Draws a divider above this option */
  separated?: boolean;
  /** Optional group name, also announced with the option */
  group?: string;
}

interface ListboxSelectProps<T> {
  id?: string;
  disabled?: boolean;
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

/**
 * A select that looks like the rest of the app: a button that opens a list of
 * options with a check on the chosen one. Focus stays on the trigger while
 * arrows, Home, End and typing move through options; Enter chooses and Esc closes.
 *
 * The list opens in a layer above everything, placed against the button, so a
 * scrolling container never clips it.
 */
export function ListboxSelect<T>({
  id,
  disabled = false,
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
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLDivElement | null>>([]);
  const listId = useId();
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const selected = options[selectedIndex];

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const obstacle = document.querySelector('[data-select-obstacle]')?.getBoundingClientRect();
    const bottom = obstacle && rect.bottom <= obstacle.top ? Math.min(window.innerHeight, obstacle.top) : window.innerHeight;
    const groupCount = options.filter((option, index) => option.group && option.group !== options[index - 1]?.group).length;
    const desiredHeight = Math.min(360, panelRef.current?.scrollHeight || (options.length * 44 + groupCount * 28 + (hideHeading ? 12 : 44) + (footer ? 60 : 0)));
    setPosition(placeSelectPanel(rect, { width: window.innerWidth, bottom }, panelMinWidth, desiredHeight));
  }, [options, panelMinWidth, hideHeading, footer]);

  const openList = () => {
    if (disabled || options.length === 0) return;
    typed.current = { text: '', at: 0 };
    // Keep options inside a modal's accessibility tree, outside its scrolling body.
    setPortalRoot(triggerRef.current?.closest('[role="dialog"], [role="alertdialog"], dialog') ?? document.body);
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
    if (open) place();
  }, [open, place]);

  useLayoutEffect(() => {
    if (open) optionRefs.current[activeIndex]?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  if (open && (disabled || options.length === 0)) setOpen(false);

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
    const handleFocus = (event: FocusEvent) => {
      const target = event.target;
      if (target instanceof Node && !panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setOpen(false);
    };
    document.addEventListener('focusin', handleFocus);
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('scroll', handleMove, true);
    window.addEventListener('resize', handleMove);
    return () => {
      document.removeEventListener('focusin', handleFocus);
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
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopPropagation();
        if (options[activeIndex]) choose(options[activeIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        // Focus stays on the trigger, so Tab and a surrounding dialog keep their normal order.
        setOpen(false);
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const now = Date.now();
          const text = now - typed.current.at < 700 ? typed.current.text + event.key : event.key;
          const query = [...text].every((letter) => letter === text[0]) ? text[0] : text;
          typed.current = { text, at: now };
          const match = findSelectMatch(options.map((option) => option.label), query, query.length === 1 ? activeIndex + 1 : activeIndex);
          if (match >= 0) setActiveIndex(match);
        }
    }
  };

  const sizeClasses =
    size === 'sm'
      ? 'h-9 [@media(pointer:coarse)]:h-11 pl-3 pr-2.5 gap-2 text-[13px]'
      : 'h-11 pl-3.5 pr-3 gap-2.5 text-[15px] sm:text-sm';

  return (
    <>
      <button
        id={id}
        ref={triggerRef}
        disabled={disabled || options.length === 0}
        role="combobox"
        aria-activedescendant={open && options[activeIndex] ? `${listId}-option-${activeIndex}` : undefined}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={(event) => {
          if (open) {
            handleListKeyDown(event);
          } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`${label}: ${selected?.label ?? ''}`}
        className={`group inline-flex items-center rounded-lg border text-left transition-colors motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/30 ${sizeClasses} ${
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
          className={`w-4 h-4 shrink-0 text-slate-400 transition-transform motion-reduce:transition-none duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            style={position}
            className="fixed z-[80] rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 shadow-[0_18px_48px_-12px_rgba(15,23,42,0.35)] animate-dialog-in overflow-y-auto overscroll-contain"
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
              className={hideHeading ? 'py-1.5' : 'pb-1.5'}
            >
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <React.Fragment key={String(option.value)}>
                    {option.group && option.group !== options[index - 1]?.group && (
                      <div role="presentation" className="px-3.5 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{option.group}</div>
                    )}
                    {option.separated && (
                      <div role="presentation" className="mx-3.5 my-1 h-px bg-slate-100 dark:bg-dark-800" />
                    )}
                    <div
                      ref={(element) => {
                        optionRefs.current[index] = element;
                      }}
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-label={option.group ? `${option.group}: ${option.label}` : undefined}
                      aria-selected={isSelected}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => choose(option)}
                      onKeyDown={handleListKeyDown}
                      onFocus={() => setActiveIndex(index)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`w-full cursor-pointer flex items-center gap-3 h-10 [@media(pointer:coarse)]:h-11 px-3.5 text-left text-sm transition-colors motion-reduce:transition-none hover:bg-slate-50 dark:hover:bg-dark-800 focus:outline-none ${
                        index === activeIndex ? 'ring-2 ring-inset ring-[#2464ED]/40' : ''
                      } ${isSelected ? 'bg-[#EAF1FF] dark:bg-blue-500/10 text-[#2464ED] dark:text-sky-400 font-semibold' : 'text-slate-700 dark:text-slate-200'}`}
                    >
                      {option.leading !== undefined && <span className="w-4 flex justify-center shrink-0">{option.leading}</span>}
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      {option.trailing !== undefined && (
                        <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">{option.trailing}</span>
                      )}
                      <span className="w-4 shrink-0 flex justify-center">{isSelected && <Check aria-hidden="true" className="w-4 h-4" />}</span>
                    </div>
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
          portalRoot ?? document.body
        )}
    </>
  );
}
