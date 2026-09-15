import { useEffect, useRef, useState } from 'react';
import type { Playlist, Song, SongCategory } from './types/song';
import { MOCK_SONGS } from './data/mockSongs';
import { useLocalStorage } from './hooks/useLocalStorage';
import { Sidebar, type SidebarSection } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Footer } from './components/Layout/Footer';
import { Dashboard, type SortOption, type ViewMode } from './components/Dashboard/Dashboard';
import { CategoriesView } from './components/Dashboard/CategoriesView';
import { AuthorsView } from './components/Dashboard/AuthorsView';
import { PlaylistsView } from './components/Dashboard/PlaylistsView';
import { SongViewer } from './components/SongViewer/SongViewer';
import { PlayerBar } from './components/Player/PlayerBar';
import { YouTubeAudioPlayer, type YouTubeAudioPlayerHandle } from './components/Player/YouTubeAudioPlayer';
import { PrivacyPolicy } from './components/Legal/PrivacyPolicy';
import { TermsConditions } from './components/Legal/TermsConditions';
import { About } from './components/Pages/About';
import { Contact } from './components/Pages/Contact';

type AppPage = 'app' | 'song' | 'privacy' | 'terms' | 'about' | 'contact';

export function App() {
  const [page, setPage] = useState<AppPage>('app');
  const [section, setSection] = useState<SidebarSection>('cancionero');
  const [activeSong, setActiveSong] = useState<Song | null>(null);

  const [favorites, setFavorites] = useLocalStorage<string[]>('genesaret_favorites', [
    'huracan-hakuna',
    'nadie-te-ama-como-yo',
    'contigo-maria',
  ]);
  const [playlists, setPlaylists] = useLocalStorage<Playlist[]>('genesaret_playlists', []);
  const [isDarkMode, setIsDarkMode] = useLocalStorage<boolean>('genesaret_dark_mode', false);
  const [lastOpenedSongId, setLastOpenedSongId] = useLocalStorage<string | null>(
    'genesaret_last_song',
    null
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<SongCategory>('Todas');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SortOption>('az');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isPlayerPlaying, setIsPlayerPlaying] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [volume, setVolume] = useLocalStorage<number>('genesaret_volume', 70);
  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playerError, setPlayerError] = useState<string | null>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const youtubePlayerRef = useRef<YouTubeAudioPlayerHandle>(null);

  // The hash-change listener below is registered once; it reads this ref
  // instead of `lastOpenedSongId` directly to avoid acting on a stale value.
  const lastOpenedSongIdRef = useRef(lastOpenedSongId);
  useEffect(() => {
    lastOpenedSongIdRef.current = lastOpenedSongId;
  }, [lastOpenedSongId]);

  const lastOpenedSong = MOCK_SONGS.find((s) => s.id === lastOpenedSongId) || null;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode);
  }, [isDarkMode]);

  // Reset playback progress display when switching songs — called at every
  // call site that changes lastOpenedSongId, so the previous song's
  // time/duration never flashes on the new one.
  const resetPlaybackProgress = () => {
    setCurrentTime(0);
    setDuration(0);
    setPlayerError(null);
  };

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 2500);
  };

  // Hash-based routing
  useEffect(() => {
    const handleHashChange = () => {
      const hash = decodeURIComponent(window.location.hash);
      window.scrollTo({ top: 0 });

      if (hash === '#/privacidad') {
        setPage('privacy');
        return;
      }
      if (hash === '#/terminos') {
        setPage('terms');
        return;
      }
      if (hash === '#/nosotros') {
        setPage('about');
        return;
      }
      if (hash === '#/contacto') {
        setPage('contact');
        return;
      }
      if (hash.startsWith('#/song/')) {
        const songId = hash.replace('#/song/', '');
        const found = MOCK_SONGS.find((s) => s.id === songId);
        if (found) {
          setActiveSong(found);
          if (found.id !== lastOpenedSongIdRef.current) {
            resetPlaybackProgress();
            setLastOpenedSongId(found.id);
            // Opening a different song's detail page loads it into the
            // player but never auto-starts it — only an explicit Play
            // press should begin playback (see YouTubeAudioPlayer).
            setIsPlayerPlaying(false);
          }
          setPage('song');
          return;
        }
      }
      if (hash === '#/favoritas') {
        setPage('app');
        setSection('cancionero');
        setSelectedCategory('Favoritas');
        return;
      }
      if (hash.startsWith('#/categoria/')) {
        const category = hash.replace('#/categoria/', '') as SongCategory;
        setPage('app');
        setSection('cancionero');
        setSelectedCategory(category);
        return;
      }
      if (hash.startsWith('#/autor/')) {
        const author = hash.replace('#/autor/', '');
        setPage('app');
        setSection('cancionero');
        setSelectedCategory('Todas');
        setSearchQuery(author);
        return;
      }
      if (hash === '#/categorias') {
        setPage('app');
        setSection('categorias');
        return;
      }
      if (hash === '#/autores') {
        setPage('app');
        setSection('autores');
        return;
      }
      if (hash === '#/listas') {
        setPage('app');
        setSection('listas');
        return;
      }

      setPage('app');
      setSection('cancionero');
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setLastOpenedSongId]);

  const navigateTo = (hash: string) => {
    if (window.location.hash === hash) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      window.location.hash = hash;
    }
  };

  const handleSelectSong = (song: Song) => {
    navigateTo(`#/song/${song.id}`);
  };

  const handleBackToDashboard = () => {
    navigateTo('#/');
  };

  const handleToggleFavorite = (id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const handleCreatePlaylist = (name: string, songId?: string) => {
    const newPlaylist: Playlist = {
      id: `pl-${Date.now()}`,
      name,
      songIds: songId ? [songId] : [],
      createdAt: Date.now(),
    };
    setPlaylists((prev) => [...prev, newPlaylist]);
    showToast(`Lista "${name}" creada`);
  };

  const handleToggleInPlaylist = (playlistId: string, songId: string) => {
    setPlaylists((prev) =>
      prev.map((pl) =>
        pl.id === playlistId
          ? {
              ...pl,
              songIds: pl.songIds.includes(songId)
                ? pl.songIds.filter((id) => id !== songId)
                : [...pl.songIds, songId],
            }
          : pl
      )
    );
  };

  const handleDeletePlaylist = (playlistId: string) => {
    setPlaylists((prev) => prev.filter((pl) => pl.id !== playlistId));
  };

  const handleShareSong = async (song: Song) => {
    const url = `${window.location.origin}${window.location.pathname}#/song/${song.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${song.title} · Acordes de Fe`, url });
        return;
      }
    } catch {
      // cancelled or unsupported — fall through to clipboard
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('Enlace copiado al portapapeles');
    } catch {
      // clipboard unavailable
    }
  };

  const handleSidebarNavigate = (target: SidebarSection) => {
    setIsMobileSidebarOpen(false);
    if (target === 'cancionero') navigateTo('#/');
    else if (target === 'favoritas') navigateTo('#/favoritas');
    else navigateTo(`#/${target}`);
  };

  const sidebarActiveSection: SidebarSection =
    section === 'cancionero' && selectedCategory === 'Favoritas' ? 'favoritas' : section;

  const handlePlayerNext = () => {
    if (!lastOpenedSong) return;
    const idx = MOCK_SONGS.findIndex((s) => s.id === lastOpenedSong.id);
    const next = MOCK_SONGS[(idx + 1) % MOCK_SONGS.length];
    resetPlaybackProgress();
    setLastOpenedSongId(next.id);
    // Playing/paused intent carries over to the next song rather than
    // resetting — matches how a real player behaves when you skip tracks.
  };

  const handlePlayerPrev = () => {
    if (!lastOpenedSong) return;
    const idx = MOCK_SONGS.findIndex((s) => s.id === lastOpenedSong.id);
    const prev = MOCK_SONGS[(idx - 1 + MOCK_SONGS.length) % MOCK_SONGS.length];
    resetPlaybackProgress();
    setLastOpenedSongId(prev.id);
  };

  const handleSongEnded = () => {
    // Auto-advance to the next song that actually has audio, skipping over
    // any without a youtubeId, and keep playing — the song that just
    // finished was playing, so the next one should start right away.
    // isPlayerPlaying is intentionally left untouched (still true).
    if (!lastOpenedSong) return;
    const startIdx = MOCK_SONGS.findIndex((s) => s.id === lastOpenedSong.id);

    for (let step = 1; step <= MOCK_SONGS.length; step++) {
      const candidate = MOCK_SONGS[(startIdx + step) % MOCK_SONGS.length];
      if (candidate.youtubeId) {
        resetPlaybackProgress();
        setLastOpenedSongId(candidate.id);
        return;
      }
    }

    // No other song has audio available — nothing left to play.
    setIsPlayerPlaying(false);
  };

  const handleSeek = (seconds: number) => {
    youtubePlayerRef.current?.seekTo(seconds);
    setCurrentTime(seconds);
  };

  const renderContent = () => {
    switch (page) {
      case 'privacy':
        return <PrivacyPolicy onBack={handleBackToDashboard} />;
      case 'terms':
        return <TermsConditions onBack={handleBackToDashboard} />;
      case 'about':
        return <About onBack={handleBackToDashboard} />;
      case 'contact':
        return <Contact onBack={handleBackToDashboard} />;
      case 'song':
        return activeSong ? (
          <SongViewer
            // Remount per song: the viewer holds the tone, capo and font
            // settings, which belong to the song being read. Without this,
            // opening a second song inherits the first one's transposition.
            key={activeSong.id}
            song={activeSong}
            onBack={handleBackToDashboard}
            isFavorite={favorites.includes(activeSong.id)}
            onToggleFavorite={handleToggleFavorite}
            playlists={playlists}
            onToggleInPlaylist={handleToggleInPlaylist}
            onCreatePlaylist={handleCreatePlaylist}
            onShare={handleShareSong}
          />
        ) : null;
      default:
        switch (section) {
          case 'categorias':
            return (
              <CategoriesView
                songs={MOCK_SONGS}
                onSelectCategory={(cat) => navigateTo(`#/categoria/${cat}`)}
              />
            );
          case 'autores':
            return (
              <AuthorsView
                songs={MOCK_SONGS}
                onSelectAuthor={(author) => navigateTo(`#/autor/${author}`)}
              />
            );
          case 'listas':
            return (
              <PlaylistsView
                playlists={playlists}
                songs={MOCK_SONGS}
                favorites={favorites}
                onToggleFavorite={handleToggleFavorite}
                onSelectSong={handleSelectSong}
                onToggleInPlaylist={handleToggleInPlaylist}
                onCreatePlaylist={handleCreatePlaylist}
                onDeletePlaylist={handleDeletePlaylist}
                onShare={handleShareSong}
              />
            );
          default:
            return (
              <Dashboard
                songs={MOCK_SONGS}
                favorites={favorites}
                playlists={playlists}
                lastOpenedSong={lastOpenedSong}
                searchQuery={searchQuery}
                selectedCategory={selectedCategory}
                viewMode={viewMode}
                sortBy={sortBy}
                onSelectCategory={setSelectedCategory}
                onSetViewMode={setViewMode}
                onSetSortBy={setSortBy}
                onToggleFavorite={handleToggleFavorite}
                onSelectSong={handleSelectSong}
                onToggleInPlaylist={handleToggleInPlaylist}
                onCreatePlaylist={handleCreatePlaylist}
                onShare={handleShareSong}
                onFocusSearch={() => searchInputRef.current?.focus()}
                onGoToFavorites={() => navigateTo('#/favoritas')}
                onGoToCategories={() => navigateTo('#/categorias')}
                onResetFilters={() => {
                  setSearchQuery('');
                  setSelectedCategory('Todas');
                }}
              />
            );
        }
    }
  };

  const showPlayerBar = Boolean(lastOpenedSong);

  return (
    <div className="h-screen flex bg-white dark:bg-dark-950 text-[#10203A] dark:text-slate-100 font-sans overflow-hidden">
      <Sidebar
        activeSection={sidebarActiveSection}
        onNavigate={handleSidebarNavigate}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode((v) => !v)}
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
      />

      <div className="flex flex-col flex-grow min-w-0">
        <Topbar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
          onGoToCancionero={() => navigateTo('#/')}
          onGoToAbout={() => navigateTo('#/nosotros')}
          onGoToContact={() => navigateTo('#/contacto')}
          activePage={page === 'about' ? 'about' : page === 'contact' ? 'contact' : 'app'}
          inputRef={searchInputRef}
        />

        <div className="flex-grow min-h-0 overflow-y-auto flex flex-col">
          <main className="flex-grow flex flex-col">{renderContent()}</main>
          <Footer
            onNavigate={(hash) => {
              navigateTo(hash);
            }}
          />
        </div>

        {showPlayerBar && lastOpenedSong && (
          <>
            <YouTubeAudioPlayer
              ref={youtubePlayerRef}
              videoId={lastOpenedSong.youtubeId}
              isPlaying={isPlayerPlaying && Boolean(lastOpenedSong.youtubeId)}
              volume={volume}
              onReady={() => setIsPlayerReady(true)}
              onTimeUpdate={(current, total) => {
                setCurrentTime(current);
                setDuration(total);
              }}
              onEnded={handleSongEnded}
              onError={(message) => {
                setPlayerError(message);
                setIsPlayerPlaying(false);
              }}
            />
            <PlayerBar
              song={lastOpenedSong}
              isPlaying={isPlayerPlaying}
              onTogglePlay={() => setIsPlayerPlaying((v) => !v)}
              onNext={handlePlayerNext}
              onPrev={handlePlayerPrev}
              onOpenSong={() => handleSelectSong(lastOpenedSong)}
              isFavorite={favorites.includes(lastOpenedSong.id)}
              onToggleFavorite={() => handleToggleFavorite(lastOpenedSong.id)}
              onGoToPlaylists={() => navigateTo('#/listas')}
              hasVideo={Boolean(lastOpenedSong.youtubeId)}
              isPlayerReady={isPlayerReady}
              playerError={playerError}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              volume={volume}
              onVolumeChange={setVolume}
            />
          </>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#10203A] text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}

export default App;
