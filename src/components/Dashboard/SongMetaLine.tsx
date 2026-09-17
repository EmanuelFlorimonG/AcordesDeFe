import React from 'react';
import type { Song } from '../../types/song';
import { LiturgicalSeasonChips } from '../Liturgy/LiturgicalSeasonChips';

interface SongMetaLineProps {
  song: Song;
  /** How many categories to name; the rest stay on the song page */
  maxCategories?: number;
  className?: string;
}

/**
 * The secondary details of a song in a list, after its title and artist:
 * key, main categories and liturgical seasons. Wraps on narrow screens.
 */
export const SongMetaLine: React.FC<SongMetaLineProps> = ({ song, maxCategories = 2, className = '' }) => {
  const categories = song.categories.slice(0, maxCategories);
  const parts: React.ReactNode[] = [];
  if (song.originalKey) {
    parts.push(
      <span key="key" className="font-mono font-bold text-[#2464ED] dark:text-sky-400" title="Tonalidad">
        {song.originalKey}
      </span>
    );
  }
  for (const category of categories) parts.push(<span key={category}>{category}</span>);

  return (
    <div className={`flex flex-wrap items-center gap-x-1.5 gap-y-1 min-w-0 text-[11px] text-slate-500 dark:text-slate-400 ${className}`}>
      {parts.map((part, index) => (
        <React.Fragment key={index}>
          {index > 0 && (
            <span aria-hidden="true" className="text-slate-300 dark:text-dark-600">
              ·
            </span>
          )}
          {part}
        </React.Fragment>
      ))}
      <LiturgicalSeasonChips song={song} size="xs" compact className={parts.length > 0 ? 'ml-0.5' : ''} />
    </div>
  );
};
