import React from 'react';
import type { SongCategory } from '../../types/song';
import { Heart, HandHeart, Flame, Crown, Bird, LayoutGrid } from 'lucide-react';

interface SearchAndFilterProps {
  selectedCategory: SongCategory;
  onSelectCategory: (cat: SongCategory) => void;
  categoryCounts: Record<string, number>;
  favoritesCount: number;
  totalSongs: number;
}

const CATEGORIES: Array<{ id: SongCategory; icon?: React.ElementType }> = [
  { id: 'Todas', icon: LayoutGrid },
  { id: 'Favoritas', icon: Heart },
  { id: 'Adoración', icon: HandHeart },
  { id: 'Hakuna', icon: Flame },
  { id: 'María', icon: Crown },
  { id: 'Alabanza', icon: Bird },
];

export const SearchAndFilter: React.FC<SearchAndFilterProps> = ({
  selectedCategory,
  onSelectCategory,
  categoryCounts,
  favoritesCount,
  totalSongs,
}) => {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-8 scrollbar-none">
      {CATEGORIES.map(({ id: cat, icon: Icon }) => {
        const isSelected = selectedCategory === cat;
        const isFav = cat === 'Favoritas';
        const isAll = cat === 'Todas';
        let count = 0;

        if (isAll) count = totalSongs;
        else if (isFav) count = favoritesCount;
        else count = categoryCounts[cat] || 0;

        return (
          <button
            key={cat}
            onClick={() => onSelectCategory(cat)}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors border ${
              isSelected
                ? 'bg-[#2464ED] text-white border-[#2464ED]'
                : 'bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-dark-700 hover:bg-slate-50 dark:hover:bg-dark-800'
            }`}
          >
            {Icon && <Icon className="w-3.5 h-3.5" />}
            <span>{cat}</span>
            {count > 0 && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono ${
                  isSelected
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-100 dark:bg-dark-800 text-slate-400'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};
