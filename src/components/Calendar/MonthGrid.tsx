import React, { useEffect, useMemo, useRef } from 'react';
import type { EventOccurrence } from '../../types/event';
import {
  addDays,
  formatLongDate,
  formatTime,
  monthGrid,
  monthOf,
  weekdayNames,
  type CalendarMonth,
} from '../../utils/dates';
import { eventDotClass } from './eventTypeStyle';

interface MonthGridProps {
  month: CalendarMonth;
  /** The month's activities, grouped by day once by the caller */
  eventsByDay: Map<string, EventOccurrence[]>;
  selectedDate: string;
  todayIso: string;
  onSelectDate: (date: string) => void;
}

/** Activities written in a cell before "+2 más" takes over. */
const VISIBLE_PER_DAY = 3;

/**
 * A real month, Monday to Sunday. On a phone each day shows only dots, and
 * the day's activities are listed below the grid; from tablets up, the first
 * few are written in the cell.
 *
 * The grid is one stop for the keyboard: the selected day can be focused, and
 * the arrows move day by day (up and down by weeks), as calendar widgets do,
 * instead of tabbing through forty-two buttons.
 */
export const MonthGrid: React.FC<MonthGridProps> = ({ month, eventsByDay, selectedDate, todayIso, onSelectDate }) => {
  const weeks = useMemo(() => monthGrid(month), [month]);
  const dayNames = useMemo(() => weekdayNames('short'), []);
  const cellRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterMoveRef = useRef(false);

  // Moving with the keyboard keeps the focus on the day that is now selected.
  useEffect(() => {
    if (!focusAfterMoveRef.current) return;
    focusAfterMoveRef.current = false;
    cellRefs.current.get(selectedDate)?.focus();
  }, [selectedDate]);

  const handleKeyDown = (event: React.KeyboardEvent, date: string) => {
    const moves: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    const delta = moves[event.key];
    if (delta === undefined) return;
    event.preventDefault();
    focusAfterMoveRef.current = true;
    onSelectDate(addDays(date, delta));
  };

  return (
    <div role="grid" aria-label="Días del mes" className="select-none">
      <div role="row" className="grid grid-cols-7 border-b border-slate-100 dark:border-dark-800">
        {dayNames.map((name) => (
          <div
            key={name}
            role="columnheader"
            aria-label={name}
            className="py-2 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500"
          >
            <span className="sm:hidden">{name.charAt(0)}</span>
            <span className="hidden sm:inline">{name}</span>
          </div>
        ))}
      </div>

      {weeks.map((week) => (
        <div key={week[0]} role="row" className="grid grid-cols-7">
          {week.map((date) => {
            const occurrences = eventsByDay.get(date) ?? [];
            const inMonth = monthOf(date).month === month.month;
            const isToday = date === todayIso;
            const isSelected = date === selectedDate;
            const day = Number(date.slice(8, 10));
            const count = occurrences.length;
            const cancelled = occurrences.filter((occurrence) => occurrence.status === 'cancelled').length;
            const completed = occurrences.filter((occurrence) => occurrence.status === 'completed').length;
            const label = `${formatLongDate(date)}${
              count === 0 ? ', sin actividades' : count === 1 ? ', 1 actividad' : `, ${count} actividades`
            }${completed ? `, ${completed} realizada${completed === 1 ? '' : 's'}` : ''}${
              cancelled ? `, ${cancelled} cancelada${cancelled === 1 ? '' : 's'}` : ''
            }${isToday ? ', hoy' : ''}`;

            return (
              <div key={date} role="gridcell" aria-selected={isSelected} className="min-w-0 border-b border-r border-slate-100 dark:border-dark-800 [&:nth-child(7n)]:border-r-0">
                <button
                  ref={(element) => {
                    if (element) cellRefs.current.set(date, element);
                    else cellRefs.current.delete(date);
                  }}
                  type="button"
                  tabIndex={isSelected ? 0 : -1}
                  onClick={() => onSelectDate(date)}
                  onKeyDown={(event) => handleKeyDown(event, date)}
                  aria-label={label}
                  aria-current={isToday ? 'date' : undefined}
                  className={`group w-full h-14 sm:h-24 lg:h-28 flex flex-col items-center sm:items-stretch gap-1 p-1 sm:p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/50 ${
                    isSelected
                      ? 'bg-[#EAF1FF] dark:bg-blue-500/10'
                      : 'hover:bg-slate-50 dark:hover:bg-dark-900'
                  }`}
                >
                  <span
                    className={`w-7 h-7 shrink-0 flex items-center justify-center rounded-lg text-sm tabular-nums ${
                      isToday
                        ? 'bg-[#2464ED] text-white font-bold'
                        : inMonth
                          ? isSelected
                            ? 'font-bold text-[#10203A] dark:text-white'
                            : 'font-semibold text-slate-700 dark:text-slate-200'
                          : 'text-slate-300 dark:text-dark-600'
                    }`}
                  >
                    {day}
                  </span>

                  {/* Phones: one dot per activity (three at most). */}
                  {count > 0 && (
                    <span aria-hidden="true" className="flex gap-0.5 sm:hidden">
                      {occurrences.slice(0, 3).map((occurrence) => (
                        <span
                          key={occurrence.key}
                          className={`w-1.5 h-1.5 rounded-full ${
                            // A cancelled date keeps its place, as an empty ring.
                            occurrence.status === 'cancelled'
                              ? 'border border-slate-400 dark:border-slate-500'
                              : eventDotClass(occurrence.event.type)
                          }`}
                        />
                      ))}
                    </span>
                  )}

                  {/* Tablets and up: the first activities, written. */}
                  <span aria-hidden="true" className="hidden sm:flex min-w-0 flex-col gap-0.5">
                    {occurrences.slice(0, VISIBLE_PER_DAY).map((occurrence) => (
                      <span
                        key={occurrence.key}
                        className={`flex min-w-0 items-center gap-1 text-[11px] leading-tight ${
                          inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400 dark:text-slate-500'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 shrink-0 rounded-full ${eventDotClass(occurrence.event.type)}`} />
                        {/* The title comes first; the time only where the cell has room for both. */}
                        {occurrence.event.startTime && !occurrence.event.allDay && (
                          <span className="hidden xl:inline shrink-0 tabular-nums text-slate-400 dark:text-slate-500">
                            {formatTime(occurrence.event.startTime)}
                          </span>
                        )}
                        <span
                          className={`truncate font-semibold ${
                            occurrence.status === 'cancelled' ? 'line-through text-slate-400 dark:text-slate-500' : ''
                          }`}
                        >
                          {occurrence.event.title}
                        </span>
                      </span>
                    ))}
                    {count > VISIBLE_PER_DAY && (
                      <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
                        +{count - VISIBLE_PER_DAY} más
                      </span>
                    )}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};
