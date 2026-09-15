import React, { useMemo } from 'react';
import type { Playlist, Song, SongCategory } from '../../types/song';
import { SearchAndFilter } from './SearchAndFilter';
import { SongList } from './SongList';
import { SongGrid } from './SongGrid';
import { Hero } from './Hero';
import { Play, ChevronRight, List, LayoutGrid, ArrowUpDown } from 'lucide-react';
import { normalizeText } from '../../utils/normalizeText';

export type SortOption = 'az' | 'za' | 'key' | 'artist';
export type ViewMode = 'list' | 'grid';

interface DashboardProps {
  songs: Song[];
  favorites: string[];
  playlists: Playlist[];
  lastOpenedSong: Song | null;
  searchQuery: string;
  selectedCategory: SongCategory;
  viewMode: ViewMode;
  sortBy: SortOption;
  onSelectCategory: (cat: SongCategory) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onSetSortBy: (sort: SortOption) => void;
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
  onFocusSearch: () => void;
  onGoToFavorites: () => void;
  onGoToCategories: () => void;
  onResetFilters: () => void;
}

const SORT_LABELS: Record<SortOption, string> = {
  az: 'Título A-Z',
  za: 'Título Z-A',
  key: 'Tono',
  artist: 'Autor A-Z',
};

export const Dashboard: React.FC<DashboardProps> = ({
  songs,
  favorites,
  playlists,
  lastOpenedSong,
  searchQuery,
  selectedCategory,
  viewMode,
  sortBy,
  onSelectCategory,
  onSetViewMode,
  onSetSortBy,
  onToggleFavorite,
  onSelectSong,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  onFocusSearch,
  onGoToFavorites,
  onGoToCategories,
  onResetFilters,
}) => {
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    songs.forEach((song) => {
      song.categories.forEach((cat) => {
        counts[cat] = (counts[cat] || 0) + 1;
      });
    });
    return counts;
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const filtered = songs.filter((song) => {
      if (selectedCategory === 'Favoritas') {
        if (!favorites.includes(song.id)) return false;
      } else if (selectedCategory !== 'Todas') {
        if (!song.categories.includes(selectedCategory)) return false;
      }

      if (searchQuery.trim()) {
        const query = normalizeText(searchQuery.trim());
        const matchesTitle = normalizeText(song.title).includes(query);
        const matchesArtist = normalizeText(song.artist ?? '').includes(query);
        const matchesTags = song.tags.some((t) => normalizeText(t).includes(query));
        const matchesContent = normalizeText(song.content).includes(query);

        return matchesTitle || matchesArtist || matchesTags || matchesContent;
      }

      return true;
    });

    const sorted = [...filtered];
    switch (sortBy) {
      case 'za':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'key':
        sorted.sort((a, b) => {
          if (!a.originalKey && !b.originalKey) return 0;
          if (!a.originalKey) return 1;
          if (!b.originalKey) return -1;
          return a.originalKey.localeCompare(b.originalKey);
        });
        break;
      case 'artist':
        sorted.sort((a, b) => {
          if (!a.artist && !b.artist) return 0;
          if (!a.artist) return 1;
          if (!b.artist) return -1;
          return a.artist.localeCompare(b.artist);
        });
        break;
      default:
        sorted.sort((a, b) => a.title.localeCompare(b.title));
    }
    return sorted;
  }, [songs, selectedCategory, searchQuery, favorites, sortBy]);

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8 flex flex-col flex-grow">
      <Hero
        onFocusSearch={onFocusSearch}
        onGoToFavorites={onGoToFavorites}
        onGoToCategories={onGoToCategories}
      />

      {lastOpenedSong && (
        <div
          onClick={() => onSelectSong(lastOpenedSong)}
          className="bg-[#EAF1FF] dark:bg-blue-500/10 rounded-xl p-3.5 pr-4 flex items-center gap-4 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-500/15 transition-colors border border-blue-100/50 dark:border-blue-500/20 self-start mb-6"
        >
          <div className="w-10 h-10 bg-white dark:bg-dark-900 rounded-full flex items-center justify-center shadow-sm flex-shrink-0">
            <Play className="w-4 h-4 text-[#2464ED] ml-0.5" />
          </div>
          <div className="pr-2 sm:pr-6">
            <p className="text-[11px] font-bold text-[#10203A] dark:text-white mb-0.5 uppercase tracking-wide">
              Continuar leyendo
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
              {lastOpenedSong.title}
              {lastOpenedSong.artist ? ` · ${lastOpenedSong.artist}` : ''}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-[#2464ED] ml-auto" />
        </div>
      )}

      <SearchAndFilter
        selectedCategory={selectedCategory}
        onSelectCategory={onSelectCategory}
        categoryCounts={categoryCounts}
        favoritesCount={favorites.length}
        totalSongs={songs.length}
      />

      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-xs font-bold text-[#10203A] dark:text-white">
          Canciones{' '}
          <span className="font-medium text-slate-400">· {filteredSongs.length} disponibles</span>
        </span>

        <div className="flex items-center gap-3">
          <div className="relative">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={sortBy}
              onChange={(e) => onSetSortBy(e.target.value as SortOption)}
              className="appearance-none pl-8 pr-3 py-1.5 rounded-md text-[11px] font-medium bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-600 dark:text-slate-300 focus:outline-none focus:border-[#2464ED] cursor-pointer"
            >
              {Object.entries(SORT_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-dark-900 rounded-md border border-slate-200 dark:border-dark-700">
            <button
              onClick={() => onSetViewMode('list')}
              className={`p-1.5 rounded ${
                viewMode === 'list' ? 'bg-white dark:bg-dark-800 shadow-sm text-[#2464ED]' : 'text-slate-400'
              }`}
              title="Vista en lista"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onSetViewMode('grid')}
              className={`p-1.5 rounded ${
                viewMode === 'grid' ? 'bg-white dark:bg-dark-800 shadow-sm text-[#2464ED]' : 'text-slate-400'
              }`}
              title="Vista en cuadrícula"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <SongList
          songs={filteredSongs}
          favorites={favorites}
          playlists={playlists}
          onToggleFavorite={onToggleFavorite}
          onSelectSong={onSelectSong}
          onResetFilters={onResetFilters}
          onToggleInPlaylist={onToggleInPlaylist}
          onCreatePlaylist={onCreatePlaylist}
          onShare={onShare}
        />
      ) : (
        <SongGrid
          songs={filteredSongs}
          favorites={favorites}
          playlists={playlists}
          onToggleFavorite={onToggleFavorite}
          onSelectSong={onSelectSong}
          onResetFilters={onResetFilters}
          onToggleInPlaylist={onToggleInPlaylist}
          onCreatePlaylist={onCreatePlaylist}
          onShare={onShare}
        />
      )}
    </div>
  );
};
