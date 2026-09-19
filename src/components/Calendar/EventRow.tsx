import React from 'react';
import { MapPin, Repeat } from 'lucide-react';
import type { EventOccurrence } from '../../types/event';
import { formatShortDate, formatTime, formatWeekday } from '../../utils/dates';
import { occurrenceTimeLabel } from '../../utils/ministryEvents';
import { EventStatusBadge } from './EventStatusBadge';
import { EventTypeBadge } from './EventTypeBadge';

interface EventRowProps {
  occurrence: EventOccurrence;
  onOpen: (occurrence: EventOccurrence) => void;
  /** Adds the day ("Dom 20 sep") for lists that span several days */
  showDate?: boolean;
  todayIso?: string;
  /** Dims an activity that already happened */
  isPast?: boolean;
}

export const EventRow: React.FC<EventRowProps> = ({ occurrence, onOpen, showDate = false, todayIso, isPast = false }) => {
  const { event, date } = occurrence;
  const isToday = todayIso === date;
  const isCancelled = occurrence.status === 'cancelled';
  return (
    <button
      type="button"
      onClick={() => onOpen(occurrence)}
      className={`w-full flex items-start gap-3 px-3 py-3 min-h-[44px] text-left rounded-lg transition-colors hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 ${
        isPast || isCancelled ? 'opacity-70' : ''
      }`}
    >
      <span className="w-[5.5rem] shrink-0 pt-0.5">
        {showDate && (
          <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
            {isToday ? 'Hoy' : `${formatWeekday(date).slice(0, 3)} ${formatShortDate(date)}`}
          </span>
        )}
        {/* Start and end on their own lines, so a narrow column never splits "6:00 p. m.". */}
        <span className="block whitespace-nowrap text-sm font-semibold tabular-nums text-slate-700 dark:text-slate-200">
          {event.allDay || !event.startTime ? occurrenceTimeLabel(occurrence) : formatTime(event.startTime)}
        </span>
        {!event.allDay && event.startTime && event.endTime && (
          <span className="block whitespace-nowrap text-xs tabular-nums text-slate-500 dark:text-slate-400">
            a {formatTime(event.endTime)}
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-sm font-bold text-[#10203A] dark:text-white ${isCancelled ? 'line-through decoration-slate-400' : ''}`}
        >
          {event.title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {/* Scheduled is the normal state; only a closed date says so. */}
          {occurrence.status !== 'scheduled' && <EventStatusBadge status={occurrence.status} />}
          <EventTypeBadge type={event.type} />
          {event.location && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin aria-hidden="true" className="w-3 h-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
          {event.recurrence && (
            <span className="inline-flex items-center gap-1" title="Se repite">
              <Repeat aria-hidden="true" className="w-3 h-3" />
              <span className="sr-only">Se repite</span>
            </span>
          )}
        </span>
      </span>
    </button>
  );
};
