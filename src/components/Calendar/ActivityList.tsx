import React from 'react';
import type { EventOccurrence } from '../../types/event';
import { isOccurrencePast, type CalendarNow } from '../../utils/ministryEvents';
import { sectionHeading } from '../Setlists/ui';
import { EventRow } from './EventRow';

interface ActivityListProps {
  title: string;
  occurrences: EventOccurrence[];
  now: CalendarNow;
  onOpen: (occurrence: EventOccurrence) => void;
  /** Shown instead of the list when it is empty; nothing is shown when omitted */
  emptyText?: string;
  headingId: string;
}

/**
 * Activities derived from the calendar, for other pages (a member, a
 * setlist). Nothing is stored twice: the list is computed from the events.
 */
export const ActivityList: React.FC<ActivityListProps> = ({ title, occurrences, now, onOpen, emptyText, headingId }) => {
  if (occurrences.length === 0 && !emptyText) return null;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className={`${sectionHeading} mb-2`}>
        {title}
      </h2>
      {occurrences.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
      ) : (
        <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
          {occurrences.map((occurrence) => (
            <li key={occurrence.key}>
              <EventRow
                occurrence={occurrence}
                onOpen={onOpen}
                showDate
                todayIso={now.date}
                isPast={isOccurrencePast(occurrence, now)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
