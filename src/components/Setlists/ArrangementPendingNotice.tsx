import React from 'react';
import { TriangleAlert } from 'lucide-react';

/** What a musician needs to know when an arrangement is on hold: the song is played as written. */
export const ARRANGEMENT_PENDING_TEXT = 'Esta canción cambió; revisa el arreglo';

/**
 * Said wherever the song is played or listed while its arrangement waits for
 * someone to review it (see bindArrangement): the song is shown as it is
 * written, never with blocks that might point at the wrong section.
 */
export const ArrangementPendingNotice: React.FC<{ where?: 'stage' | 'inline'; detail?: string }> = ({
  where = 'inline',
  detail = 'Se muestra la canción tal como está escrita.',
}) => (
  <p
    role="status"
    className={`flex items-start gap-2 text-amber-800 dark:text-amber-300 ${
      where === 'stage'
        ? 'mb-5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-sm dark:border-amber-500/30 dark:bg-amber-500/10'
        : 'text-xs font-semibold'
    }`}
  >
    <TriangleAlert aria-hidden="true" className={`${where === 'stage' ? 'mt-0.5 h-4 w-4' : 'mt-px h-3.5 w-3.5'} shrink-0`} />
    <span>
      {ARRANGEMENT_PENDING_TEXT}
      {detail ? `. ${detail}` : '.'}
    </span>
  </p>
);
