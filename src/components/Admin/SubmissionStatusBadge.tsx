import React from 'react';
import type { SongSubmissionStatus } from '../../catalog/submission';
import { ADMIN_STATUS_LABELS } from '../../admin/labels';
import { STATUS_TONE } from '../../admin/statusTone';

/** The status of a proposal: an icon and its name, never colour alone. */
export const SubmissionStatusBadge: React.FC<{ status: SongSubmissionStatus; size?: 'sm' | 'md' }> = ({ status, size = 'sm' }) => {
  const { icon: Icon, badge } = STATUS_TONE[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border font-semibold ${badge} ${
        size === 'md' ? 'px-2.5 py-1 text-[13px]' : 'px-2 py-0.5 text-xs'
      }`}
    >
      <Icon aria-hidden="true" className={size === 'md' ? 'h-4 w-4' : 'h-3.5 w-3.5'} />
      {ADMIN_STATUS_LABELS[status]}
    </span>
  );
};
