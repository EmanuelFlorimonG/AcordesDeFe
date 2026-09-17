import React, { useId, useRef, useState } from 'react';
import { BarChart3, Clock3, Heart } from 'lucide-react';
import type { Playlist, Song } from '../../types/song';
import { useNow } from '../../hooks/useNow';
import { formatRelativeTime } from '../../utils/relativeTime';
import { formatSongUsage, type MostUsedSong } from '../../utils/songUsage';
import { CoverTile } from '../Dashboard/CoverTile';
import { SongMetaLine } from '../Dashboard/SongMetaLine';
import { SongRowMenu } from '../Dashboard/SongRowMenu';
import type { SongSetlistActions } from '../Dashboard/songActions';

export type YourSongsTab = 'favoritas' | 'recientes' | 'usadas';

interface YourSongsProps extends SongSetlistActions {
  favoriteSongs: Song[];
  recentSongs: Array<{ song: Song; lastOpenedAt: number }>;
  mostUsedSongs: MostUsedSong[];
  activeTab: YourSongsTab;
  onTabChange: (tab: YourSongsTab) => void;
  favorites: string[];
  playlists: Playlist[];
  onSelectSong: (song: Song) => void;
  onToggleFavorite: (id: string) => void;
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
  onGoToSetlists: () => void;
}

/** Rows shown before "Ver todas". */
const PREVIEW_COUNT = 5;

const TABS: Array<{ id: YourSongsTab; label: string; icon: React.ElementType }> = [
  { id: 'favoritas', label: 'Favoritas', icon: Heart },
  { id: 'recientes', label: 'Recientes', icon: Clock3 },
  { id: 'usadas', label: 'Más usadas', icon: BarChart3 },
];

/**
 * The songs that matter to this browser's user, in one compact block:
 * favourites, recently opened and most used in setlists, one tab at a time.
 */
export const YourSongs: React.FC<YourSongsProps> = ({
  favoriteSongs,
  recentSongs,
  mostUsedSongs,
  activeTab,
  onTabChange,
  favorites,
  playlists,
  onSelectSong,
  onToggleFavorite,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  onGoToSetlists,
  setlists,
  onAddToSetlist,
  onCreateSetlistWithSong,
}) => {
  const [expanded, setExpanded] = useState<Record<YourSongsTab, boolean>>({
    favoritas: false,
    recientes: false,
    usadas: false,
  });
  const now = useNow();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const baseId = useId();
  const headingId = `${baseId}-heading`;

  const counts: Record<YourSongsTab, number> = {
    favoritas: favoriteSongs.length,
    recientes: recentSongs.length,
    usadas: mostUsedSongs.length,
  };

  const rows: Array<{ song: Song; detail?: string }> =
    activeTab === 'favoritas'
      ? favoriteSongs.map((song) => ({ song }))
      : activeTab === 'recientes'
        ? recentSongs.map(({ song, lastOpenedAt }) => ({ song, detail: formatRelativeTime(lastOpenedAt, now) }))
        : mostUsedSongs.map((entry) => ({ song: entry.song, detail: formatSongUsage(entry) }));

  const isExpanded = expanded[activeTab];
  const visibleRows = isExpanded ? rows : rows.slice(0, PREVIEW_COUNT);

  const handleTabKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TABS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TABS.length) % TABS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TABS.length - 1;
    else return;
    event.preventDefault();
    onTabChange(TABS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <section id="tus-canciones" aria-labelledby={headingId} className="mb-10 scroll-mt-4">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3 px-1">
        <h2 id={headingId} className="text-lg font-extrabold tracking-tight text-[#10203A] dark:text-white">
          Tus canciones
        </h2>
      </div>

      <div
        role="tablist"
        aria-labelledby={headingId}
        className="grid grid-cols-3 gap-1 p-1 mb-2 rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-100/70 dark:bg-dark-900 sm:inline-grid sm:w-auto"
      >
        {TABS.map((tab, index) => {
          const isActive = tab.id === activeTab;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              ref={(element) => {
                tabRefs.current[index] = element;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`${baseId}-panel`}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onTabChange(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, index)}
              className={`flex items-center justify-center gap-1 sm:gap-1.5 h-9 [@media(pointer:coarse)]:h-10 px-1 sm:px-3.5 rounded-lg text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                isActive
                  ? 'bg-white dark:bg-dark-800 text-[#10203A] dark:text-white font-bold shadow-sm'
                  : 'text-slate-500 dark:text-slate-400 font-medium hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Icon
                aria-hidden="true"
                className={`hidden sm:block w-3.5 h-3.5 shrink-0 ${isActive ? 'text-[#2464ED] dark:text-sky-400' : ''} ${
                  tab.id === 'favoritas' && isActive ? 'fill-current' : ''
                }`}
              />
              <span className="whitespace-nowrap">{tab.label}</span>
              <span
                className={`text-[11px] tabular-nums ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}
              >
                {counts[tab.id]}
              </span>
            </button>
          );
        })}
      </div>

      <div
        id={`${baseId}-panel`}
        role="tabpanel"
        aria-labelledby={`${baseId}-tab-${activeTab}`}
        className="rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950"
      >
        {rows.length === 0 ? (
          <EmptyTab tab={activeTab} onGoToSetlists={onGoToSetlists} />
        ) : (
          <>
            <ul className="divide-y divide-slate-100 dark:divide-dark-800">
              {visibleRows.map(({ song, detail }) => {
                const isFavorite = favorites.includes(song.id);
                return (
                  <li key={song.id} className="flex items-center gap-3 py-2.5 pl-3 pr-1 sm:pl-4 sm:pr-2">
                    <CoverTile category={song.categories[0]} size="sm" />
                    <button
                      type="button"
                      onClick={() => onSelectSong(song)}
                      className="min-w-0 flex-1 text-left rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                    >
                      <span className="block truncate text-sm font-bold text-[#10203A] dark:text-white">{song.title}</span>
                      {song.artist && (
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{song.artist}</span>
                      )}
                      <SongMetaLine song={song} maxCategories={1} className="mt-1" />
                      {detail && (
                        <span className="sm:hidden mt-1 block text-[11px] text-slate-400 dark:text-slate-500">{detail}</span>
                      )}
                    </button>
                    {detail && (
                      <span className="hidden sm:block shrink-0 w-44 text-right text-xs text-slate-400 dark:text-slate-500">
                        {detail}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => onToggleFavorite(song.id)}
                      aria-pressed={isFavorite}
                      aria-label={isFavorite ? `Quitar ${song.title} de favoritas` : `Añadir ${song.title} a favoritas`}
                      title={isFavorite ? 'Quitar de favoritas' : 'Añadir a favoritas'}
                      className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                    >
                      <Heart
                        className={`w-[18px] h-[18px] ${
                          isFavorite ? 'fill-[#2464ED] text-[#2464ED]' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                    <SongRowMenu
                      song={song}
                      playlists={playlists}
                      onToggleInPlaylist={onToggleInPlaylist}
                      onCreatePlaylist={onCreatePlaylist}
                      onShare={onShare}
                      setlists={setlists}
                      onAddToSetlist={onAddToSetlist}
                      onCreateSetlistWithSong={onCreateSetlistWithSong}
                    />
                  </li>
                );
              })}
            </ul>
            {rows.length > PREVIEW_COUNT && (
              <div className="border-t border-slate-100 dark:border-dark-800 px-4 py-2">
                <button
                  type="button"
                  onClick={() => setExpanded((current) => ({ ...current, [activeTab]: !isExpanded }))}
                  aria-expanded={isExpanded}
                  className="h-9 px-2 -mx-2 rounded-lg text-[13px] font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  {isExpanded ? 'Ver menos' : `Ver todas (${rows.length})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </section>
  );
};

const EmptyTab: React.FC<{ tab: YourSongsTab; onGoToSetlists: () => void }> = ({ tab, onGoToSetlists }) => {
  const content = {
    favoritas: {
      icon: Heart,
      text: 'Aún no tienes canciones favoritas.',
      hint: 'Toca el corazón de una canción para guardarla aquí.',
    },
    recientes: {
      icon: Clock3,
      text: 'Aún no has abierto ninguna canción.',
      hint: 'Las canciones que abras aparecerán aquí, la última primero.',
    },
    usadas: {
      icon: BarChart3,
      text: 'Todavía no hay canciones en tus Setlists.',
      hint: 'Cuenta cuántas veces aparece cada canción en los Setlists de este navegador.',
    },
  }[tab];
  const Icon = content.icon;

  return (
    <div className="flex items-start gap-3 px-4 py-4">
      <Icon aria-hidden="true" className="w-4 h-4 mt-0.5 shrink-0 text-slate-300 dark:text-dark-600" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{content.text}</p>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
          {content.hint}
          {tab === 'usadas' && (
            <>
              {' '}
              <button
                type="button"
                onClick={onGoToSetlists}
                className="font-semibold text-[#2464ED] dark:text-sky-400 hover:underline"
              >
                Ir a Setlists
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};
