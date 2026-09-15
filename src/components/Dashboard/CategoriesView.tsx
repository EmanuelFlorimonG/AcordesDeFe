import React, { useMemo } from 'react';
import type { Song } from '../../types/song';
import { CoverTile } from './CoverTile';
import { ChevronRight } from 'lucide-react';

interface CategoriesViewProps {
  songs: Song[];
  onSelectCategory: (category: string) => void;
}

export const CategoriesView: React.FC<CategoriesViewProps> = ({ songs, onSelectCategory }) => {
  const categories = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((song) => {
      song.categories.forEach((cat) => {
        counts[cat] = (counts[cat] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [songs]);

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-[#10203A] dark:text-white tracking-tight mb-1">
        Categorías
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        Explora el repertorio agrupado por momento y estilo.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories.map(([category, count]) => (
          <button
            key={category}
            onClick={() => onSelectCategory(category)}
            className="flex items-center gap-4 p-4 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors text-left"
          >
            <CoverTile category={category} size="md" />
            <div className="flex-grow min-w-0">
              <h3 className="text-sm font-bold text-[#10203A] dark:text-white">{category}</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {count} {count === 1 ? 'canción' : 'canciones'}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};
