import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, Check, ChevronDown } from 'lucide-react';
import type { SpecificSeasonId } from '../../data/liturgicalSeasons';
import { SEASON_FILTER_OPTIONS, getLiturgicalSeason } from '../../utils/liturgicalSeasons';
import { LiturgicalSeasonDot } from './LiturgicalSeasonChips';

interface LiturgicalSeasonSelectProps {
  value: SpecificSeasonId | null;
  onChange: (season: SpecificSeasonId | null) => void;
  /** Songs that fit each season, "Todo el año" included; `all` for no filter */
  counts: Record<SpecificSeasonId | 'all', number>;
  className?: string;
}

interface Option {
  id: SpecificSeasonId | null;
  label: string;
  count: number;
}

const PANEL_GAP = 6;
const PANEL_MIN_WIDTH = 256;

/**
 * Chooses a liturgical season to filter by. Each option carries the season's
 * colour dot and how many songs fit it, so the choice is informed at a glance.
 *
 * The list opens in a layer above everything, placed against the button, so a
 * scrolling container (such as a dialog) never clips it.
 */
export const LiturgicalSeasonSelect: React.FC<LiturgicalSeasonSelectProps> = ({
  value,
  onChange,
  counts,
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listId = useId();

  const options: Option[] = [
    { id: null, label: 'Todos los tiempos', count: counts.all },
    ...SEASON_FILTER_OPTIONS.map((season) => ({
      id: season.id as SpecificSeasonId,
      label: season.label,
      count: counts[season.id as SpecificSeasonId],
    })),
  ];
  const selectedIndex = Math.max(0, options.findIndex((option) => option.id === value));

  const place = () => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.max(rect.width, PANEL_MIN_WIDTH);
    // Aligned to the button's right edge, kept inside the screen.
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    setPosition({ top: rect.bottom + PANEL_GAP, left, width });
  };

  const openList = (index = selectedIndex) => {
    place();
    setActiveIndex(index);
    setOpen(true);
  };

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (option: Option) => {
    onChange(option.id);
    close();
  };

  useLayoutEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus({ preventScroll: true });
  }, [open, activeIndex]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) close(false);
    };
    // The button moves when its container scrolls or the window resizes:
    // closing is clearer than a list drifting away from it.
    const handleMove = (event: Event) => {
      // A resize comes from the window, which is not a node of the page.
      const target = event.target;
      if (target instanceof Node && panelRef.current?.contains(target)) return;
      close(false);
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

  const handleTriggerKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openList(selectedIndex);
    }
  };

  const handleListKeyDown = (event: React.KeyboardEvent) => {
    // Keys handled here must not reach the dialog around this control.
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
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
      case 'Tab':
        event.preventDefault();
        event.stopPropagation();
        close();
        break;
    }
  };

  const selected = options[selectedIndex];
  const isFiltering = value !== null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={handleTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Tiempo litúrgico: ${selected.label}`}
        className={`group inline-flex items-center gap-2.5 h-[42px] pl-3.5 pr-3 rounded-lg border text-left text-[15px] sm:text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/30 ${
          isFiltering
            ? 'border-[#2464ED]/40 bg-[#EAF1FF] dark:bg-blue-500/10 text-[#10203A] dark:text-white'
            : 'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 text-slate-700 dark:text-slate-200 hover:border-slate-300 dark:hover:border-dark-600'
        } ${open ? 'border-[#2464ED] ring-2 ring-[#2464ED]/15' : ''} ${className}`}
      >
        {value ? (
          <LiturgicalSeasonDot id={value} className="w-2.5 h-2.5" />
        ) : (
          <CalendarRange className="w-4 h-4 shrink-0 text-slate-400" />
        )}
        <span className="min-w-0 flex-1 truncate">
          <span className="sr-only">Tiempo litúrgico: </span>
          <span className={isFiltering ? 'font-semibold' : ''}>{selected.label}</span>
        </span>
        <ChevronDown
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
            <p className="px-3.5 pt-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Tiempo litúrgico
            </p>
            <div id={listId} role="listbox" aria-label="Tiempo litúrgico" onKeyDown={handleListKeyDown} className="pb-1.5">
              {options.map((option, index) => {
                const isSelected = index === selectedIndex;
                return (
                  <React.Fragment key={option.id ?? 'all'}>
                    {index === 1 && <div role="presentation" className="mx-3.5 my-1 h-px bg-slate-100 dark:bg-dark-800" />}
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
                      <span className="w-4 flex justify-center shrink-0">
                        {option.id ? (
                          <LiturgicalSeasonDot id={option.id} className="w-2.5 h-2.5" />
                        ) : (
                          <CalendarRange className="w-4 h-4 text-slate-400" />
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                        {option.count}
                      </span>
                      <span className="w-4 shrink-0 flex justify-center">
                        {isSelected && <Check className="w-4 h-4" />}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </div>
            <p className="border-t border-slate-100 dark:border-dark-800 px-3.5 py-2.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
              Cada tiempo incluye también las canciones de {getLiturgicalSeason('todo-el-ano').label}.
            </p>
          </div>,
          document.body
        )}
    </>
  );
};
