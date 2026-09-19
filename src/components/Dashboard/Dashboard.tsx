import React from 'react';
import { ArrowUpDown, LayoutGrid, List, Plus, SearchX } from 'lucide-react';
import type { Playlist, Song } from '../../types/song';
import {
  SORT_OPTIONS,
  hasActiveFilters,
  type FilterGroup,
  type SongFilters,
  type SongSortOption,
} from '../../utils/songSearch';
import type { MostUsedSong } from '../../utils/songUsage';
import { ActiveFilters } from '../Discovery/ActiveFilters';
import { YourSongs, type YourSongsTab } from '../Discovery/YourSongs';
import { ListboxSelect } from '../ui/ListboxSelect';
import { Hero } from './Hero';
import { SongGrid } from './SongGrid';
import { SongList } from './SongList';
import type { SongSetlistActions } from './songActions';

export type ViewMode = 'list' | 'grid';

interface DashboardProps extends SongSetlistActions {
  /** Songs to show, already searched, filtered and sorted */
  results: Song[];
  query: string;
  filters: SongFilters;
  sortBy: SongSortOption;
  viewMode: ViewMode;
  favorites: string[];
  playlists: Playlist[];
  favoriteSongs: Song[];
  recentSongs: Array<{ song: Song; lastOpenedAt: number }>;
  mostUsedSongs: MostUsedSong[];
  yourSongsTab: YourSongsTab;
  onYourSongsTabChange: (tab: YourSongsTab) => void;
  onSetSortBy: (sort: SongSortOption) => void;
  onSetViewMode: (mode: ViewMode) => void;
  onRemoveFilter: (group: FilterGroup, value: string) => void;
  onClearFilters: () => void;
  onClearQuery: () => void;
  onToggleFavorite: (id: string) => void;
  onSelectSong: (song: Song) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
  onFocusSearch: () => void;
  onGoToFavorites: () => void;
  onGoToCategories: () => void;
  onGoToSetlists: () => void;
  /** Opens the public editor to propose a new song */
  onAddSong: () => void;
  /** The ministry's next activities, from the calendar */
  upcomingActivities?: React.ReactNode;
}

/**
 * The songbook's home. With nothing searched it welcomes and shows "Tus
 * canciones" above every song; once there is a query or a filter it steps
 * aside and shows only the results.
 */
export const Dashboard: React.FC<DashboardProps> = ({
  results,
  query,
  filters,
  sortBy,
  viewMode,
  favorites,
  playlists,
  favoriteSongs,
  recentSongs,
  mostUsedSongs,
  yourSongsTab,
  onYourSongsTabChange,
  onSetSortBy,
  onSetViewMode,
  onRemoveFilter,
  onClearFilters,
  onClearQuery,
  onToggleFavorite,
  onSelectSong,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  onFocusSearch,
  onGoToFavorites,
  onGoToCategories,
  onGoToSetlists,
  onAddSong,
  setlists,
  onAddToSetlist,
  onCreateSetlistWithSong,
  upcomingActivities,
}) => {
  const trimmedQuery = query.trim();
  const filtersActive = hasActiveFilters(filters);
  const isSearching = Boolean(trimmedQuery) || filtersActive;

  const songActions = {
    favorites,
    playlists,
    onToggleFavorite,
    onSelectSong,
    onToggleInPlaylist,
    onCreatePlaylist,
    onShare,
    setlists,
    onAddToSetlist,
    onCreateSetlistWithSong,
  };

  const countLabel = `${results.length} ${results.length === 1 ? 'canción' : 'canciones'}`;

  return (
    <div className="w-full min-w-0 px-5 sm:px-10 py-6 sm:py-8 flex flex-col flex-grow">
      {!isSearching && (
        <>
          <Hero onFocusSearch={onFocusSearch} onGoToFavorites={onGoToFavorites} onGoToCategories={onGoToCategories} />
          {upcomingActivities}
          <YourSongs
            {...songActions}
            favoriteSongs={favoriteSongs}
            recentSongs={recentSongs}
            mostUsedSongs={mostUsedSongs}
            activeTab={yourSongsTab}
            onTabChange={onYourSongsTabChange}
            onGoToSetlists={onGoToSetlists}
          />
        </>
      )}

      <section aria-labelledby="song-results-heading" className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 mb-3 px-1">
          <div className="min-w-0">
            <h2 id="song-results-heading" className="text-lg font-extrabold tracking-tight text-[#10203A] dark:text-white">
              {isSearching ? 'Resultados' : 'Todas las canciones'}
            </h2>
            <p role="status" aria-live="polite" className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {countLabel}
              {trimmedQuery && ` para «${trimmedQuery}»`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onAddSong}
              className="inline-flex h-9 [@media(pointer:coarse)]:h-10 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:border-[#2464ED] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
            >
              <Plus aria-hidden="true" className="w-4 h-4" />
              <span className="sm:hidden">Agregar</span>
              <span className="hidden sm:inline">Agregar canción</span>
            </button>
            <ListboxSelect
              size="sm"
              value={sortBy}
              options={SORT_OPTIONS}
              onChange={onSetSortBy}
              label="Ordenar"
              hideHeading
              panelMinWidth={200}
              renderTrigger={(selected) => (
                <>
                  <ArrowUpDown aria-hidden="true" className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{selected.label}</span>
                </>
              )}
            />
            <div
              role="group"
              aria-label="Vista"
              className="flex items-center gap-0.5 p-0.5 bg-slate-100 dark:bg-dark-900 rounded-lg border border-slate-200 dark:border-dark-700"
            >
              {(
                [
                  { mode: 'list', label: 'Vista en lista', icon: List },
                  { mode: 'grid', label: 'Vista en cuadrícula', icon: LayoutGrid },
                ] as const
              ).map(({ mode, label, icon: Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onSetViewMode(mode)}
                  aria-pressed={viewMode === mode}
                  aria-label={label}
                  title={label}
                  className={`w-8 h-8 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:h-10 flex items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                    viewMode === mode
                      ? 'bg-white dark:bg-dark-800 shadow-sm text-[#2464ED] dark:text-sky-400'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {filtersActive && (
          <div className="mb-4 px-1">
            <ActiveFilters filters={filters} onRemove={onRemoveFilter} onClear={onClearFilters} />
          </div>
        )}

        {results.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
            <SearchX aria-hidden="true" className="w-8 h-8 text-slate-300 dark:text-dark-600 mb-3" />
            <h3 className="text-base font-bold text-[#10203A] dark:text-white break-words max-w-full">
              {trimmedQuery
                ? `No encontramos canciones para «${trimmedQuery}».`
                : 'No encontramos canciones con estos filtros.'}
            </h3>
            <p className="mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">
              {trimmedQuery && filtersActive
                ? 'Prueba con otras palabras o quita algún filtro.'
                : trimmedQuery
                  ? 'Prueba con el título, el artista, el momento o el tiempo litúrgico.'
                  : 'Prueba a quitar alguno de los filtros.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {filtersActive && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="h-10 px-4 rounded-lg bg-[#2464ED] hover:bg-[#1D56D6] text-white text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 focus-visible:ring-offset-2"
                >
                  Limpiar filtros
                </button>
              )}
              {trimmedQuery && (
                <button
                  type="button"
                  onClick={onClearQuery}
                  className="h-10 px-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-700 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  Borrar búsqueda
                </button>
              )}
              {trimmedQuery && (
                <button
                  type="button"
                  onClick={onAddSong}
                  className="inline-flex h-10 items-center gap-1.5 px-4 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  <Plus aria-hidden="true" className="w-4 h-4" />
                  ¿No está? Agrégala
                </button>
              )}
            </div>
          </div>
        ) : viewMode === 'list' ? (
          <SongList {...songActions} songs={results} onResetFilters={onClearFilters} />
        ) : (
          <SongGrid {...songActions} songs={results} />
        )}
      </section>
    </div>
  );
};
