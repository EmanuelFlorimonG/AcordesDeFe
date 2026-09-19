import React from 'react';
import { memberInitials } from '../../utils/ministryMembers';

/** Quiet tones that read in both themes; the id picks one so it never changes. */
const TONES = [
  'bg-[#EAF1FF] text-[#2464ED] dark:bg-blue-500/15 dark:text-sky-300',
  'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
  'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
  'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
  'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  'bg-slate-100 text-slate-600 dark:bg-dark-800 dark:text-slate-300',
];

function toneFor(id: string): string {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return TONES[hash % TONES.length];
}

const SIZES = {
  sm: 'w-8 h-8 text-[11px] rounded-lg',
  md: 'w-10 h-10 text-sm rounded-xl',
  lg: 'w-14 h-14 text-lg rounded-2xl',
};

interface MemberAvatarProps {
  id: string;
  name: string;
  isActive?: boolean;
  size?: keyof typeof SIZES;
}

/** Initials instead of a photo: nothing to upload, nothing to store. */
export const MemberAvatar: React.FC<MemberAvatarProps> = ({ id, name, isActive = true, size = 'md' }) => (
  <span
    aria-hidden="true"
    className={`shrink-0 inline-flex items-center justify-center font-bold tracking-wide ${SIZES[size]} ${toneFor(id)} ${
      isActive ? '' : 'opacity-50 grayscale'
    }`}
  >
    {memberInitials(name)}
  </span>
);
