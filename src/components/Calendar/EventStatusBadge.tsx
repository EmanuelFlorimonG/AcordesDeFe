import React from 'react';
import { Ban, CalendarClock, CheckCircle2 } from 'lucide-react';
import type { EventStatus } from '../../types/event';
import { EVENT_STATUS_LABELS } from '../../utils/ministryEvents';

const STATUS_STYLE: Record<EventStatus, { icon: React.ElementType; className: string }> = {
  scheduled: {
    icon: CalendarClock,
    className: 'bg-slate-100 dark:bg-dark-800 text-slate-600 dark:text-slate-300',
  },
  completed: {
    icon: CheckCircle2,
    className: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  cancelled: {
    icon: Ban,
    className: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300',
  },
};

/** The status of one date, always written out: the colour only helps. */
export const EventStatusBadge: React.FC<{ status: EventStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const { icon: Icon, className } = STATUS_STYLE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-semibold uppercase ${className} ${
        size === 'md' ? 'px-2 py-1 text-[11px] tracking-[0.1em]' : 'px-1.5 py-0.5 text-[10px] tracking-[0.08em]'
      }`}
    >
      <Icon aria-hidden="true" className={size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'} />
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
};
