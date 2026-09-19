import type React from 'react';
import { CheckCircle2, Clock3, PencilLine, XCircle } from 'lucide-react';
import type { SongSubmissionStatus } from '../catalog/submission';

/** One look per status, used everywhere in the panel: an icon and the word, never colour alone. */
export const STATUS_TONE: Record<SongSubmissionStatus, { icon: React.ElementType; badge: string; soft: string }> = {
  pending: {
    icon: Clock3,
    badge: 'border-[#2464ED]/20 bg-[#EAF1FF] text-[#1D56D6] dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300',
    soft: 'bg-[#EAF1FF] text-[#2464ED] dark:bg-sky-400/10 dark:text-sky-300',
  },
  changes_requested: {
    icon: PencilLine,
    badge: 'border-amber-300/60 bg-amber-50 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300',
    soft: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300',
  },
  approved: {
    icon: CheckCircle2,
    badge: 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-300',
    soft: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
  rejected: {
    icon: XCircle,
    badge: 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-300',
    soft: 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-300',
  },
};
