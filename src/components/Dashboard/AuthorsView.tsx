import React, { useMemo } from 'react';
import type { Song } from '../../types/song';
import { Music2, ChevronRight } from 'lucide-react';

interface AuthorsViewProps {
  songs: Song[];
  onSelectAuthor: (author: string) => void;
}

export const AuthorsView: React.FC<AuthorsViewProps> = ({ songs, onSelectAuthor }) => {
  const authors = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((song) => {
      const artist = song.artist || 'Sin autor';
      counts[artist] = (counts[artist] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  }, [songs]);

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      <h1 className="text-2xl font-extrabold text-[#10203A] dark:text-white tracking-tight mb-1">
        Autores
      </h1>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        {authors.length} {authors.length === 1 ? 'autor' : 'autores'} en el repertorio.
      </p>

      <div className="border-t border-slate-100 dark:border-dark-800">
        {authors.map(([author, count]) => {
          const isUnknown = author === 'Sin autor';
          const content = (
            <>
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-dark-800 flex items-center justify-center flex-shrink-0">
                <Music2 className="w-4 h-4 text-slate-400" />
              </div>
              <div className="flex-grow min-w-0">
                <h3 className={`text-sm font-bold truncate ${isUnknown ? 'text-slate-400 dark:text-slate-500 italic' : 'text-[#10203A] dark:text-white'}`}>
                  {author}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {count} {count === 1 ? 'canción' : 'canciones'}
                </p>
              </div>
              {!isUnknown && <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />}
            </>
          );

          if (isUnknown) {
            return (
              <div
                key={author}
                title="Estas canciones aún no tienen autor registrado"
                className="w-full flex items-center gap-4 py-3.5 px-2 border-b border-slate-100 dark:border-dark-800"
              >
                {content}
              </div>
            );
          }

          return (
            <button
              key={author}
              onClick={() => onSelectAuthor(author)}
              className="w-full flex items-center gap-4 py-3.5 px-2 border-b border-slate-100 dark:border-dark-800 hover:bg-[#EAF1FF]/40 dark:hover:bg-dark-900 transition-colors text-left"
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
};
