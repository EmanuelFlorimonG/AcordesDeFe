import { CalendarDays, Church, Flame, HeartHandshake, Mountain, Music, Star, Users } from 'lucide-react';
import type React from 'react';
import type { MinistryEventType } from '../../types/event';

/**
 * How each kind of activity looks: an icon always, and one of four quiet
 * tones. The tone only helps the eye; the icon and the name are what say
 * what it is, so nothing depends on telling colours apart.
 */
export const EVENT_TYPE_ICONS: Record<MinistryEventType, React.ElementType> = {
  mass: Church,
  rehearsal: Music,
  adoration: Flame,
  retreat: Mountain,
  meeting: Users,
  community: HeartHandshake,
  special: Star,
  other: CalendarDays,
};

type Tone = 'blue' | 'sky' | 'emerald' | 'slate';

const TYPE_TONES: Record<MinistryEventType, Tone> = {
  mass: 'blue',
  adoration: 'blue',
  rehearsal: 'sky',
  retreat: 'emerald',
  community: 'emerald',
  meeting: 'slate',
  special: 'slate',
  other: 'slate',
};

const TONE_DOT: Record<Tone, string> = {
  blue: 'bg-[#2464ED] dark:bg-sky-400',
  sky: 'bg-sky-500 dark:bg-sky-300',
  emerald: 'bg-emerald-500 dark:bg-emerald-400',
  slate: 'bg-slate-400 dark:bg-slate-500',
};

const TONE_TEXT: Record<Tone, string> = {
  blue: 'text-[#2464ED] dark:text-sky-400',
  sky: 'text-sky-700 dark:text-sky-300',
  emerald: 'text-emerald-700 dark:text-emerald-400',
  slate: 'text-slate-600 dark:text-slate-300',
};

const TONE_SOFT: Record<Tone, string> = {
  blue: 'bg-[#EAF1FF] dark:bg-blue-500/15',
  sky: 'bg-sky-50 dark:bg-sky-500/10',
  emerald: 'bg-emerald-50 dark:bg-emerald-500/10',
  slate: 'bg-slate-100 dark:bg-dark-800',
};

export const eventDotClass = (type: MinistryEventType) => TONE_DOT[TYPE_TONES[type]];
export const eventTextClass = (type: MinistryEventType) => TONE_TEXT[TYPE_TONES[type]];
export const eventSoftClass = (type: MinistryEventType) => TONE_SOFT[TYPE_TONES[type]];
