import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import {
  addDays,
  daysInMonth,
  formatLongDate,
  formatMonthTitle,
  isValidIsoDate,
  monthGrid,
  monthOf,
  shiftMonth,
  toLocalIsoDate,
  weekdayIndex,
  weekdayNames,
  type CalendarMonth,
} from '../../utils/dates';

interface DatePickerProps {
  /** The field's id, for its <label htmlFor> */
  id: string;
  /** "YYYY-MM-DD", or "" when no date is chosen */
  value: string;
  onChange: (value: string) => void;
  /** Earliest and latest dates that can be chosen, "YYYY-MM-DD" */
  min?: string;
  max?: string;
  placeholder?: string;
  /** Offers "Quitar fecha" when a date is chosen */
  clearable?: boolean;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
}

const sameMonth = (a: CalendarMonth, b: CalendarMonth) => a.year === b.year && a.month === b.month;

/**
 * A date field in the app's own style: the chosen date written out in
 * Spanish ("Domingo 20 de septiembre"), and a month calendar that unfolds
 * under it, weeks from Monday. It opens in place rather than floating, so it
 * works the same inside a dialog, on a page and on a phone.
 *
 * Keyboard: arrows move by day and week, Page Up/Down by month, Home/End to
 * the start and end of the week, Enter chooses, Escape closes.
 */
export const DatePicker: React.FC<DatePickerProps> = ({
  id,
  value,
  onChange,
  min,
  max,
  placeholder = 'Elegir fecha',
  clearable = false,
  invalid = false,
  describedBy,
  disabled = false,
}) => {
  const [today] = useState(() => toLocalIsoDate(new Date()));
  const selected = isValidIsoDate(value) ? value : '';
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(selected || today);
  const [month, setMonth] = useState<CalendarMonth>(() => monthOf(selected || today));
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dayRefs = useRef(new Map<string, HTMLButtonElement>());
  const moveFocusRef = useRef(false);
  const panelId = useId();
  const titleId = useId();
  const weeks = useMemo(() => monthGrid(month), [month]);
  const names = useMemo(() => weekdayNames('narrow'), []);

  const allowed = (date: string) => (!min || date >= min) && (!max || date <= max);

  const openPanel = () => {
    const start = selected || (allowed(today) ? today : min ?? today);
    setFocused(start);
    setMonth(monthOf(start));
    setOpen(true);
    moveFocusRef.current = true;
  };

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const choose = (date: string) => {
    if (!allowed(date)) return;
    onChange(date);
    close(true);
  };

  const focusDate = (date: string) => {
    setFocused(date);
    const target = monthOf(date);
    setMonth((current) => (sameMonth(current, target) ? current : target));
    moveFocusRef.current = true;
  };

  // Keyboard moves (and opening) put focus on the day that is now current.
  useEffect(() => {
    if (!open || !moveFocusRef.current) return;
    moveFocusRef.current = false;
    dayRefs.current.get(focused)?.focus();
  }, [open, focused, month]);

  // Opened near the bottom of a dialog or page: bring the whole calendar into view.
  useEffect(() => {
    if (open) panelRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open]);

  // A click anywhere else folds the calendar away.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(focused, -1),
      ArrowRight: () => addDays(focused, 1),
      ArrowUp: () => addDays(focused, -7),
      ArrowDown: () => addDays(focused, 7),
      Home: () => addDays(focused, -weekdayIndex(focused)),
      End: () => addDays(focused, 6 - weekdayIndex(focused)),
      PageUp: () => shiftDay(focused, -1),
      PageDown: () => shiftDay(focused, 1),
    };
    const move = moves[event.key];
    if (move) {
      event.preventDefault();
      focusDate(move());
    }
  };

  const label = selected ? formatLongDate(selected, today) : placeholder;

  return (
    <div
      ref={rootRef}
      onKeyDown={(event) => {
        // Escape folds the calendar without closing the dialog it may be in.
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <div className="relative">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => (open ? close(false) : openPanel())}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`flex h-11 w-full items-center gap-2.5 rounded-lg border bg-white dark:bg-dark-950 px-3.5 text-left text-[15px] sm:text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[#2464ED]/15 disabled:opacity-60 ${
            open
              ? 'border-[#2464ED]'
              : invalid
                ? 'border-red-400 dark:border-red-500/60'
                : 'border-slate-200 dark:border-dark-700 hover:border-slate-300 dark:hover:border-dark-600'
          } ${clearable && selected ? 'pr-11' : ''}`}
        >
          <CalendarDays aria-hidden="true" className={`h-4 w-4 shrink-0 ${selected ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-400'}`} />
          <span className={`min-w-0 flex-1 truncate ${selected ? 'font-medium text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500'}`}>
            {label}
          </span>
        </button>
        {clearable && selected && !disabled && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              setOpen(false);
              triggerRef.current?.focus();
            }}
            aria-label="Quitar fecha"
            className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-dark-800 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          className="mt-2 w-full max-w-[22rem] rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-3 shadow-lg shadow-slate-900/5 animate-fade-in"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => focusDate(shiftDay(focused, -1))}
              aria-label="Mes anterior"
              className={navButton}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p id={titleId} aria-live="polite" className="text-sm font-bold text-[#10203A] dark:text-white">
              {formatMonthTitle(month)}
            </p>
            <button
              type="button"
              onClick={() => focusDate(shiftDay(focused, 1))}
              aria-label="Mes siguiente"
              className={navButton}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <div role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown}>
            <div role="row" className="grid grid-cols-7">
              {names.map((name, index) => (
                <span
                  key={index}
                  role="columnheader"
                  className="flex h-8 items-center justify-center text-[11px] font-semibold uppercase text-slate-400 dark:text-slate-500"
                >
                  {name}
                </span>
              ))}
            </div>
            {weeks.map((week) => (
              <div key={week[0]} role="row" className="grid grid-cols-7 gap-y-0.5">
                {week.map((date) => {
                  const inMonth = sameMonth(monthOf(date), month);
                  const isSelected = date === selected;
                  const isToday = date === today;
                  const isAllowed = allowed(date);
                  return (
                    <div key={date} role="gridcell" aria-selected={isSelected} className="flex justify-center px-0.5">
                      <button
                        ref={(element) => {
                          if (element) dayRefs.current.set(date, element);
                          else dayRefs.current.delete(date);
                        }}
                        type="button"
                        tabIndex={date === focused ? 0 : -1}
                        disabled={!isAllowed}
                        onClick={() => choose(date)}
                        onFocus={() => setFocused(date)}
                        aria-label={`${formatLongDate(date)}${isToday ? ', hoy' : ''}`}
                        aria-current={isToday ? 'date' : undefined}
                        className={`relative flex h-10 w-full max-w-[2.75rem] [@media(pointer:coarse)]:h-11 items-center justify-center rounded-xl text-sm tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/50 disabled:cursor-not-allowed disabled:opacity-30 ${
                          isSelected
                            ? 'bg-[#2464ED] font-bold text-white shadow-sm hover:bg-[#1D56D6]'
                            : isToday
                              ? 'font-bold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10'
                              : inMonth
                                ? 'font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800'
                                : 'text-slate-300 dark:text-dark-600 hover:bg-slate-50 dark:hover:bg-dark-800'
                        }`}
                      >
                        {Number(date.slice(8, 10))}
                        {isToday && !isSelected && (
                          <span aria-hidden="true" className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[#2464ED] dark:bg-sky-400" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 dark:border-dark-800 pt-2">
            <button
              type="button"
              onClick={() => choose(today)}
              disabled={!allowed(today)}
              className="h-9 rounded-lg px-2.5 text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 disabled:opacity-40"
            >
              Hoy
            </button>
            {clearable && selected && (
              <button
                type="button"
                onClick={() => {
                  onChange('');
                  close(true);
                }}
                className="h-9 rounded-lg px-2.5 text-sm font-semibold text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800"
              >
                Quitar fecha
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/** The same day one month later or earlier, kept inside the target month (31 Jan -> 28 Feb). */
function shiftDay(date: string, delta: number): string {
  const target = shiftMonth(monthOf(date), delta);
  const day = Number(date.slice(8, 10));
  const last = daysInMonth(target.year, target.month);
  return `${target.year}-${String(target.month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}

const navButton =
  'flex h-9 w-9 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-800 dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';
