import React from 'react';
import { CalendarDays, ChevronRight, Hash, Music2, Tag, UserRound, UserX } from 'lucide-react';
import type { SubmissionListItem as Item } from '../../admin/editorialRepository';
import { formatDateTime } from '../../admin/format';
import { TYPE_SHORT_LABELS } from '../../admin/labels';
import { adminHash } from '../../admin/routes';
import { adminCardLink } from './AdminNotice';
import { SubmissionStatusBadge } from './SubmissionStatusBadge';

/**
 * One proposal in a list. The whole card is the link. It says whether there
 * is contact data, never what it is.
 */
export const SubmissionListItem: React.FC<{ item: Item }> = ({ item }) => {
  const contact = item.hasContact ? (
    <span className="inline-flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
      <UserRound aria-hidden="true" className="h-3.5 w-3.5" />
      Con contacto
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-slate-400 dark:text-slate-500">
      <UserX aria-hidden="true" className="h-3.5 w-3.5" />
      Sin contacto
    </span>
  );

  return (
    <li>
      <a href={adminHash.submission(item.id)} className={`${adminCardLink} group flex items-center gap-4 px-4 py-4 sm:px-5`}>
        <span aria-hidden="true" className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-dark-800 dark:text-slate-400 sm:flex">
          <Music2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <span className="min-w-0 truncate text-[15px] font-bold text-[#10203A] dark:text-white">{item.title}</span>
            <SubmissionStatusBadge status={item.status} />
          </div>
          <p className={`mt-0.5 truncate text-sm ${item.artist ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500'}`}>
            {item.artist ?? 'Artista sin indicar'}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays aria-hidden="true" className="h-3.5 w-3.5" />
              {formatDateTime(item.submittedAt)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tag aria-hidden="true" className="h-3.5 w-3.5" />
              {TYPE_SHORT_LABELS[item.type]}
            </span>
            <span className="inline-flex items-center gap-1.5 font-mono">
              <Hash aria-hidden="true" className="h-3.5 w-3.5" />
              {item.trackingCode}
            </span>
            <span className="md:hidden">{contact}</span>
          </p>
        </div>
        <span className="hidden shrink-0 text-xs md:block">{contact}</span>
        <ChevronRight
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#2464ED] dark:text-slate-600 dark:group-hover:text-sky-400"
        />
      </a>
    </li>
  );
};
