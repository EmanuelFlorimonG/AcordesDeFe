import { useEffect, useMemo, useRef, useState } from 'react';
import type { Playlist, Song } from './types/song';
import type { Setlist, SetlistDetails, SetlistItem, SetlistPlayback } from './types/setlist';
import { MOCK_SONGS } from './data/mockSongs';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSetlists } from './hooks/useSetlists';
import { useSongDurations } from './hooks/useSongDurations';
import { getFirstPlayableItem, getSetlistPosition } from './utils/setlists';
import { SetlistsView } from './components/Setlists/SetlistsView';
import { SetlistDetail } from './components/Setlists/SetlistDetail';
import { setlistHash, setlistSongHash } from './components/Setlists/ui';
import { Sidebar, type SidebarSection } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Footer } from './components/Layout/Footer';
import { Dashboard, type ViewMode } from './components/Dashboard/Dashboard';
import { SongFiltersControl } from './components/Discovery/SongFiltersControl';
import type { YourSongsTab } from './components/Discovery/YourSongs';
import { useRecentSongs } from './hooks/useRecentSongs';
import {
  EMPTY_FILTERS,
  buildSearchIndex,
  getFilterOptions,
  removeFilterValue,
  searchSongs,
  sortSongs,
  type SongFilters,
  type SongSortOption,
} from './utils/songSearch';
import { countSongUsage, getMostUsedSongs } from './utils/songUsage';
import { CategoriesView } from './components/Dashboard/CategoriesView';
import { AuthorsView } from './components/Dashboard/AuthorsView';
import { PlaylistsView } from './components/Dashboard/PlaylistsView';
import { SongViewer } from './components/SongViewer/SongViewer';
import { PlayerBar } from './components/Player/PlayerBar';
import { YouTubeAudioPlayer, type YouTubeAudioPlayerHandle } from './components/Player/YouTubeAudioPlayer';
import type { CompactPlayerState } from './components/Player/MiniPlayer';
import { PrivacyPolicy } from './components/Legal/PrivacyPolicy';
import { TermsConditions } from './components/Legal/TermsConditions';
import { About } from './components/Pages/About';
import { Contact } from './components/Pages/Contact';

type AppPage = 'app' | 'song' | 'privacy' | 'terms' | 'about' | 'contact';

const SONGS_BY_ID = new Map(MOCK_SONGS.map((song) => [song.id, song]));
/** A song opened as part of a setlist: #/setlist/<setlist>/song/<entry> */
const SETLIST_SONG_ROUTE = /^#\/setlist\/([^/]+)\/song\/([^/]+)$/;
/** An entry can only be opened while its song is still in the songbook. */
const isPlayableItem = (item: SetlistItem) => SONGS_BY_ID.has(item.songId);
/** The songs never change while the app runs, so their search text is prepared once. */
const SEARCH_INDEX = buildSearchIndex(MOCK_SONGS);
/** Routes that show the songbook's home, where search and filters live. */
const isSongbookRoute = (hash: string) =>
  hash === '' ||
  hash === '#' ||
  hash === '#/' ||
  hash === '#/favoritas' ||
  hash.startsWith('#/categoria/') ||
  hash.startsWith('#/autor/');
const isSongRoute = (hash: string) => hash.startsWith('#/song/') || SETLIST_SONG_ROUTE.test(hash);

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

  // Search, filters and "Tus canciones" live here, above the pages, so opening
  // a song and coming back finds them exactly as they were.
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<SongFilters>(EMPTY_FILTERS);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [sortBy, setSortBy] = useState<SongSortOption>('az');
  const [yourSongsTab, setYourSongsTab] = useState<YourSongsTab>('favoritas');
  const [isFavoritesRoute, setIsFavoritesRoute] = useState(false);
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
  // The element that actually scrolls. The app shell is a fixed-height flex
  // layout, so the window itself never scrolls.
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Lives here rather than in the song viewer so rehearsal mode can stay open
  // while moving from one song to the next (setlists).
  const [isRehearsing, setIsRehearsing] = useState(false);

  const setlists = useSetlists();
  // Song lengths, as reported by the player while actually playing.
  const { durations, recordDuration } = useSongDurations();
  // Songs whose page was opened, newest first.
  const { recents, lastOpenedAt, recordOpened } = useRecentSongs();
  const recordOpenedRef = useRef(recordOpened);
  useEffect(() => {
    recordOpenedRef.current = recordOpened;
  }, [recordOpened]);
  // Where the songbook was scrolled when a song was opened, to return there.
  const songbookScrollRef = useRef<number | null>(null);
  const currentHashRef = useRef<string | null>(null);
  const pendingScrollRef = useRef<number | 'tus-canciones' | null>(null);
  /** Null on the list of setlists, an id on one setlist's page. */
  const [openSetlistId, setOpenSetlistId] = useState<string | null>(null);
  /** Set while a song is open as part of a setlist, instead of on its own. */
  const [setlistSongRoute, setSetlistSongRoute] = useState<{ setlistId: string; itemId: string } | null>(null);

  // Like lastOpenedSongIdRef: the routing listener is registered once and
  // reads the setlists from here rather than closing over a stale copy.
  const setlistsRef = useRef(setlists.setlists);
  useEffect(() => {
    setlistsRef.current = setlists.setlists;
  }, [setlists.setlists]);

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
      const previousHash = currentHashRef.current;
      currentHashRef.current = hash;
      const container = scrollContainerRef.current;
      // Opening a song from the songbook remembers how far down the list was;
      // coming back from the song returns there instead of to the top.
      if (previousHash !== null && isSongbookRoute(previousHash) && isSongRoute(hash) && container) {
        songbookScrollRef.current = container.scrollTop;
      }
      pendingScrollRef.current =
        previousHash !== null && isSongRoute(previousHash) && isSongbookRoute(hash) && hash !== '#/favoritas'
          ? songbookScrollRef.current
          : null;
      // Every other page starts at the top. window.scrollTo would do nothing here.
      container?.scrollTo({ top: 0 });
      setIsFavoritesRoute(hash === '#/favoritas');
      const setlistSongMatch = hash.match(SETLIST_SONG_ROUTE);
      // Rehearsal mode survives moving between songs, including along a setlist.
      if (!hash.startsWith('#/song/') && !setlistSongMatch) setIsRehearsing(false);
      setSetlistSongRoute(null);

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
          // Opening a song's page is what makes it "recent"; being listed is not.
          recordOpenedRef.current(found.id);
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
      if (setlistSongMatch) {
        const [, setlistId, itemId] = setlistSongMatch;
        const setlist = setlistsRef.current.find((candidate) => candidate.id === setlistId);
        const item = setlist?.items.find((candidate) => candidate.id === itemId);
        const itemSong = item && SONGS_BY_ID.get(item.songId);
        setOpenSetlistId(setlistId);
        if (itemSong) {
          setActiveSong(itemSong);
          setSetlistSongRoute({ setlistId, itemId });
          // Includes moving from song to song inside rehearsal mode.
          recordOpenedRef.current(itemSong.id);
          if (itemSong.id !== lastOpenedSongIdRef.current) {
            resetPlaybackProgress();
            setLastOpenedSongId(itemSong.id);
            setIsPlayerPlaying(false);
          }
          setPage('song');
          return;
        }
        // The setlist, the entry or the song is gone: show the setlist itself
        // rather than an empty song page.
        setIsRehearsing(false);
        setPage('app');
        setSection('setlists');
        return;
      }
      if (hash === '#/setlists') {
        setPage('app');
        setSection('setlists');
        setOpenSetlistId(null);
        return;
      }
      if (hash.startsWith('#/setlist/')) {
        setPage('app');
        setSection('setlists');
        setOpenSetlistId(hash.replace('#/setlist/', ''));
        return;
      }
      if (hash === '#/favoritas') {
        // Favourites live in "Tus canciones", which shows while nothing is searched.
        setPage('app');
        setSection('cancionero');
        setSearchQuery('');
        setFilters(EMPTY_FILTERS);
        setYourSongsTab('favoritas');
        pendingScrollRef.current = 'tus-canciones';
        return;
      }
      if (hash.startsWith('#/categoria/')) {
        setPage('app');
        setSection('cancionero');
        setSearchQuery('');
        setFilters({ ...EMPTY_FILTERS, categories: [hash.replace('#/categoria/', '')] });
        return;
      }
      if (hash.startsWith('#/autor/')) {
        setPage('app');
        setSection('cancionero');
        setSearchQuery('');
        setFilters({ ...EMPTY_FILTERS, artists: [hash.replace('#/autor/', '')] });
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
    section === 'cancionero' && isFavoritesRoute ? 'favoritas' : section;

  // After the page for a route has rendered: return to where the songbook was,
  // or bring "Tus canciones" into view.
  useEffect(() => {
    const pending = pendingScrollRef.current;
    if (pending === null) return;
    pendingScrollRef.current = null;
    if (pending === 'tus-canciones') {
      document.getElementById('tus-canciones')?.scrollIntoView({ block: 'start' });
    } else {
      scrollContainerRef.current?.scrollTo({ top: pending });
    }
  });

  const isOnSongbook = page === 'app' && section === 'cancionero';

  /** Typing a search anywhere shows the songbook, where the results are. */
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    if (!isOnSongbook) {
      songbookScrollRef.current = null;
      navigateTo('#/');
    }
  };

  const handleAddToSetlist = (setlistId: string, song: Song) => {
    const setlist = setlists.getSetlist(setlistId);
    setlists.addSongs(setlistId, [song]);
    if (setlist) showToast(`«${song.title}» añadida a ${setlist.name}`);
  };

  const handleCreateSetlistWithSong = (name: string, song: Song) => {
    const created = setlists.create({ name });
    setlists.addSongs(created.id, [song]);
    showToast(`Setlist «${created.name}» creado con «${song.title}»`);
  };

  const setlistActions = {
    setlists: setlists.setlists,
    onAddToSetlist: handleAddToSetlist,
    onCreateSetlistWithSong: handleCreateSetlistWithSong,
  };

  // --- Finding songs -------------------------------------------------------
  const usage = useMemo(() => countSongUsage(setlists.setlists), [setlists.setlists]);
  const usesBySong = useMemo(
    () => new Map([...usage.values()].map((entry) => [entry.songId, entry.uses])),
    [usage]
  );

  const searchResults = useMemo(() => {
    const matches = searchSongs(SEARCH_INDEX, searchQuery, filters);
    const sorted = sortSongs(
      matches.map((match) => match.song),
      sortBy,
      { lastOpenedAt, uses: usesBySong }
    );
    // Songs found only by a phrase in their lyrics go after those whose title
    // or details match, whatever the chosen order.
    const weak = new Set(matches.filter((match) => match.score < 50).map((match) => match.song.id));
    return [...sorted.filter((song) => !weak.has(song.id)), ...sorted.filter((song) => weak.has(song.id))];
  }, [searchQuery, filters, sortBy, lastOpenedAt, usesBySong]);

  const filterOptions = useMemo(
    () => (isOnSongbook ? getFilterOptions(SEARCH_INDEX, searchQuery, filters) : null),
    [isOnSongbook, searchQuery, filters]
  );

  const favoriteSongs = useMemo(
    // Most recently marked first.
    () => [...favorites].reverse().flatMap((id) => SONGS_BY_ID.get(id) ?? []),
    [favorites]
  );
  const recentSongs = useMemo(
    () => recents.flatMap(({ songId, lastOpenedAt: openedAt }) => {
      const song = SONGS_BY_ID.get(songId);
      return song ? [{ song, lastOpenedAt: openedAt }] : [];
    }),
    [recents]
  );
  const mostUsedSongs = useMemo(() => getMostUsedSongs(MOCK_SONGS, usage, lastOpenedAt), [usage, lastOpenedAt]);

  const openSetlist = openSetlistId ? setlists.getSetlist(openSetlistId) : null;
  const activeSetlist = setlistSongRoute ? setlists.getSetlist(setlistSongRoute.setlistId) : null;

  /**
   * Everything the song viewer and rehearsal mode need to show a song as part
   * of a setlist: its settings for that day, and how to move along the list.
   */
  const setlistPlayback: SetlistPlayback | null = (() => {
    if (!setlistSongRoute || !activeSetlist) return null;
    const position = getSetlistPosition(activeSetlist, setlistSongRoute.itemId, isPlayableItem);
    if (!position) return null;
    const stepTo = (item: SetlistItem) => ({
      title: SONGS_BY_ID.get(item.songId)?.title ?? '',
      moment: item.moment,
      onSelect: () => navigateTo(setlistSongHash(activeSetlist.id, item.id)),
    });
    return {
      setlistId: activeSetlist.id,
      setlistName: activeSetlist.name,
      item: position.item,
      position: position.index + 1,
      total: position.total,
      previous: position.previous ? stepTo(position.previous) : null,
      next: position.next ? stepTo(position.next) : null,
      onBackToSetlist: () => {
        setIsRehearsing(false);
        navigateTo(setlistHash(activeSetlist.id));
      },
      onViewOriginal: () => {
        setIsRehearsing(false);
        navigateTo(`#/song/${position.item.songId}`);
      },
      onKeySettingsChange: (keySettings) =>
        setlists.updateItem(activeSetlist.id, position.item.id, keySettings),
    };
  })();

  /** The song on screen: from the setlist when there is one, else the plain route. */
  const viewerSong = setlistPlayback ? SONGS_BY_ID.get(setlistPlayback.item.songId) ?? null : activeSong;

  const handleCreateSetlist = (details: SetlistDetails) => {
    const created = setlists.create(details);
    navigateTo(setlistHash(created.id));
  };

  const handleStartRehearsal = (setlist: Setlist) => {
    const first = getFirstPlayableItem(setlist, isPlayableItem);
    if (!first) return;
    setIsRehearsing(true);
    navigateTo(setlistSongHash(setlist.id, first.id));
  };

  // While a song of a setlist is open, the player follows the setlist and
  // stops at its end; everywhere else it cycles through the songbook.
  const setlistQueue: Song[] | null = setlistPlayback && activeSetlist
    ? activeSetlist.items
        .map((item) => SONGS_BY_ID.get(item.songId))
        .filter((song): song is Song => Boolean(song))
    : null;

  const queueIndex = (): number => {
    if (!lastOpenedSong) return -1;
    // The song being read is the reliable position, since a setlist may hold
    // the same song twice.
    if (setlistQueue && setlistPlayback && viewerSong?.id === lastOpenedSong.id) {
      return setlistPlayback.position - 1;
    }
    return (setlistQueue ?? MOCK_SONGS).findIndex((song) => song.id === lastOpenedSong.id);
  };

  const handlePlayerNext = () => {
    if (!lastOpenedSong) return;
    const queue = setlistQueue ?? MOCK_SONGS;
    const index = queueIndex();
    const next = setlistQueue ? queue[index + 1] : queue[(index + 1) % queue.length];
    if (!next || next.id === lastOpenedSong.id) return;
    resetPlaybackProgress();
    setLastOpenedSongId(next.id);
    // Playing/paused intent carries over to the next song rather than
    // resetting — matches how a real player behaves when you skip tracks.
  };

  const handlePlayerPrev = () => {
    if (!lastOpenedSong) return;
    const queue = setlistQueue ?? MOCK_SONGS;
    const index = queueIndex();
    const previous = setlistQueue ? queue[index - 1] : queue[(index - 1 + queue.length) % queue.length];
    if (!previous || previous.id === lastOpenedSong.id) return;
    resetPlaybackProgress();
    setLastOpenedSongId(previous.id);
  };

  const handleSongEnded = () => {
    // Auto-advance to the next song that actually has audio, skipping over
    // any without a youtubeId, and keep playing — the song that just
    // finished was playing, so the next one should start right away.
    // isPlayerPlaying is intentionally left untouched (still true).
    if (!lastOpenedSong) return;
    const queue = setlistQueue ?? MOCK_SONGS;
    const startIdx = queueIndex();

    for (let step = 1; step <= queue.length; step++) {
      const position = startIdx + step;
      // A setlist ends rather than starting over.
      if (setlistQueue && position >= queue.length) break;
      const candidate = queue[setlistQueue ? position : position % queue.length];
      if (candidate?.youtubeId && candidate.id !== lastOpenedSong.id) {
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

  // Compact controls for rehearsal mode. They drive the same single player as
  // the PlayerBar; no second player exists.
  const compactPlayer: CompactPlayerState | null = lastOpenedSong
    ? {
        song: lastOpenedSong,
        isPlaying: isPlayerPlaying,
        hasVideo: Boolean(lastOpenedSong.youtubeId),
        isReady: isPlayerReady,
        error: playerError,
        onTogglePlay: () => setIsPlayerPlaying((v) => !v),
        onNext: handlePlayerNext,
        onPrev: handlePlayerPrev,
      }
    : null;

  const renderSongViewer = (song: Song, viewerKey: string, playback: SetlistPlayback | null) => (
    <SongViewer
      // Remount per song: the viewer holds the tone, capo and font
      // settings, which belong to the song being read. Without this,
      // opening a second song inherits the first one's transposition.
      key={viewerKey}
      song={song}
      onBack={handleBackToDashboard}
      isFavorite={favorites.includes(song.id)}
      onToggleFavorite={handleToggleFavorite}
      playlists={playlists}
      onToggleInPlaylist={handleToggleInPlaylist}
      onCreatePlaylist={handleCreatePlaylist}
      onShare={handleShareSong}
      isRehearsing={isRehearsing}
      onRehearsalChange={setIsRehearsing}
      player={compactPlayer}
      setlist={playback}
      {...setlistActions}
    />
  );

  const renderSetlists = () => {
    if (!openSetlistId) {
      return (
        <SetlistsView
          setlists={setlists.setlists}
          durations={durations}
          recoveredFromUnreadableData={setlists.recoveredFromUnreadableData}
          onOpen={(setlistId) => navigateTo(setlistHash(setlistId))}
          onCreate={handleCreateSetlist}
        />
      );
    }
    const setlistId = openSetlistId;
    return (
      <SetlistDetail
        setlist={openSetlist}
        songs={MOCK_SONGS}
        songsById={SONGS_BY_ID}
        durations={durations}
        onBack={() => navigateTo('#/setlists')}
        onOpenItem={(item) => navigateTo(setlistSongHash(setlistId, item.id))}
        onStartRehearsal={() => {
          if (openSetlist) handleStartRehearsal(openSetlist);
        }}
        onUpdateDetails={(details) => setlists.updateDetails(setlistId, details)}
        onDuplicate={(details) => {
          const copy = setlists.duplicate(setlistId, details);
          if (copy) {
            showToast(`Setlist «${copy.name}» creado`);
            navigateTo(setlistHash(copy.id));
          }
        }}
        onDelete={() => {
          const name = openSetlist?.name;
          setlists.remove(setlistId);
          if (name) showToast(`Setlist «${name}» eliminado`);
          navigateTo('#/setlists');
        }}
        onAddSong={(song, moment) => setlists.addSongs(setlistId, [song], moment)}
        onRemoveItem={(itemId) => setlists.removeItem(setlistId, itemId)}
        onMoveItem={(itemId, toIndex) => setlists.moveItem(setlistId, itemId, toIndex)}
        onMoveItemBy={(itemId, delta) => setlists.moveItemBy(setlistId, itemId, delta)}
        onUpdateItem={(itemId, changes) => setlists.updateItem(setlistId, itemId, changes)}
      />
    );
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
        if (setlistSongRoute) {
          // The entry (or its song) can disappear while it is open, for
          // instance edited in another tab: fall back to the setlist itself.
          return setlistPlayback && viewerSong
            ? renderSongViewer(
                viewerSong,
                `setlist:${setlistSongRoute.setlistId}:${setlistSongRoute.itemId}`,
                setlistPlayback
              )
            : renderSetlists();
        }
        return activeSong ? renderSongViewer(activeSong, activeSong.id, null) : null;
      default:
        switch (section) {
          case 'setlists':
            return renderSetlists();
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
                {...setlistActions}
                results={searchResults}
                query={searchQuery}
                filters={filters}
                sortBy={sortBy}
                viewMode={viewMode}
                favorites={favorites}
                playlists={playlists}
                favoriteSongs={favoriteSongs}
                recentSongs={recentSongs}
                mostUsedSongs={mostUsedSongs}
                yourSongsTab={yourSongsTab}
                onYourSongsTabChange={setYourSongsTab}
                onSetSortBy={setSortBy}
                onSetViewMode={setViewMode}
                onRemoveFilter={(group, value) => setFilters((current) => removeFilterValue(current, group, value))}
                onClearFilters={() => setFilters(EMPTY_FILTERS)}
                onClearQuery={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                onToggleFavorite={handleToggleFavorite}
                onSelectSong={handleSelectSong}
                onToggleInPlaylist={handleToggleInPlaylist}
                onCreatePlaylist={handleCreatePlaylist}
                onShare={handleShareSong}
                onFocusSearch={() => searchInputRef.current?.focus()}
                onGoToFavorites={() => navigateTo('#/favoritas')}
                onGoToCategories={() => navigateTo('#/categorias')}
                onGoToSetlists={() => navigateTo('#/setlists')}
              />
            );
        }
    }
  };

  const showPlayerBar = Boolean(lastOpenedSong);
  const rehearsalActive = isRehearsing && page === 'song' && Boolean(viewerSong);

  return (
    <div
      // While rehearsing, the app underneath can't be reached by keyboard or
      // screen reader; rehearsal mode itself is portalled outside this element.
      inert={rehearsalActive}
      className="h-screen flex bg-white dark:bg-dark-950 text-[#10203A] dark:text-slate-100 font-sans overflow-hidden"
    >
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
          onSearchChange={handleSearchChange}
          searchAccessory={
            isOnSongbook && filterOptions ? (
              <SongFiltersControl
                filters={filters}
                options={filterOptions}
                resultCount={searchResults.length}
                onChange={setFilters}
              />
            ) : null
          }
          onOpenSidebar={() => setIsMobileSidebarOpen(true)}
          onGoToCancionero={() => navigateTo('#/')}
          onGoToAbout={() => navigateTo('#/nosotros')}
          onGoToContact={() => navigateTo('#/contacto')}
          activePage={page === 'about' ? 'about' : page === 'contact' ? 'contact' : 'app'}
          inputRef={searchInputRef}
        />

        <div ref={scrollContainerRef} className="flex-grow min-h-0 overflow-y-auto flex flex-col">
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
              // The only reliable source of how long a song lasts, used to
              // estimate how long a setlist will take.
              onDurationKnown={(playingVideoId, seconds) => {
                for (const song of MOCK_SONGS) {
                  if (song.youtubeId === playingVideoId) recordDuration(song.id, seconds);
                }
              }}
              onEnded={handleSongEnded}
              onError={(message) => {
                setPlayerError(message);
                setIsPlayerPlaying(false);
              }}
            />
            {/* Rehearsal mode shows its own compact controls for this player. */}
            {!rehearsalActive && (
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
            )}
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
