import {
  HandHeart,
  Flame,
  Mountain,
  Crown,
  Bird,
  Cross,
  Music,
  DoorOpen,
  HeartHandshake,
  Sparkles,
  Megaphone,
  Gift,
  Star,
  Feather,
  PawPrint,
  LogOut,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react';

export interface CategoryStyle {
  icon: LucideIcon;
  from: string;
  to: string;
}

export const CATEGORY_STYLE: Record<string, CategoryStyle> = {
  'Adoración': { icon: HandHeart, from: 'from-blue-500', to: 'to-blue-700' },
  'Hakuna': { icon: Flame, from: 'from-amber-400', to: 'to-amber-600' },
  'Jornadas': { icon: Mountain, from: 'from-teal-500', to: 'to-teal-700' },
  'María': { icon: Crown, from: 'from-rose-400', to: 'to-rose-600' },
  'Alabanza': { icon: Bird, from: 'from-sky-400', to: 'to-sky-600' },
  'Comunión': { icon: Cross, from: 'from-slate-500', to: 'to-slate-700' },
  'Entrada': { icon: DoorOpen, from: 'from-emerald-400', to: 'to-emerald-600' },
  'Piedad': { icon: HeartHandshake, from: 'from-orange-400', to: 'to-orange-600' },
  'Gloria': { icon: Sparkles, from: 'from-yellow-400', to: 'to-yellow-600' },
  'Aclamación': { icon: Megaphone, from: 'from-red-400', to: 'to-red-600' },
  'Ofertorio': { icon: Gift, from: 'from-lime-500', to: 'to-lime-700' },
  'Santo': { icon: Star, from: 'from-green-400', to: 'to-green-600' },
  'Paz': { icon: Feather, from: 'from-cyan-400', to: 'to-cyan-600' },
  'Cordero': { icon: PawPrint, from: 'from-amber-500', to: 'to-amber-700' },
  'Salida': { icon: LogOut, from: 'from-rose-500', to: 'to-rose-700' },
  'Otros': { icon: MoreHorizontal, from: 'from-slate-400', to: 'to-slate-600' },
};

export const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  icon: Music,
  from: 'from-slate-400',
  to: 'to-slate-600',
};

export function getCategoryStyle(category?: string): CategoryStyle {
  return (category && CATEGORY_STYLE[category]) || DEFAULT_CATEGORY_STYLE;
}
