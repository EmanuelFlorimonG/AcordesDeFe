import React from 'react';
import type { MinistryEventType } from '../../types/event';
import { EVENT_TYPE_LABELS } from '../../utils/ministryEvents';
import { EVENT_TYPE_ICONS, eventSoftClass, eventTextClass } from './eventTypeStyle';

/** The kind of activity, with its icon and its name. */
export const EventTypeBadge: React.FC<{ type: MinistryEventType; size?: 'sm' | 'md' }> = ({ type, size = 'sm' }) => {
  const Icon = EVENT_TYPE_ICONS[type];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md font-semibold uppercase tracking-[0.1em] ${eventSoftClass(type)} ${eventTextClass(type)} ${
        size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-1 text-[11px]'
      }`}
    >
      <Icon aria-hidden="true" className={size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {EVENT_TYPE_LABELS[type]}
    </span>
  );
};
