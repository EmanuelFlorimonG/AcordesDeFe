import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Playlist, Song } from './types/song';
import type { Setlist, SetlistDetails, SetlistItem, SetlistPlayback } from './types/setlist';
import { getCatalogStore, refreshCatalog, useCatalog } from './catalog/useCatalog';
import {
  About,
  AuthorsView,
  CalendarView,
  CategoriesView,
  Contact,
  EventDetail,
  EventFormDialog,
  HistoryView,
  MassMode,
  MemberDetail,
  MemberFormDialog,
  MembersView,
  PerformanceDetail,
  PlaylistsView,
  PrivacyPolicy,
  SetlistDetail,
  SetlistsView,
  SongEditorScreen,
  TermsConditions,
  TrackingScreen,
  SongViewer,
  prefetchSongViewer,
  CatalogFallbackNotice,
  SongUnavailableScreen,
  ProposalEditScreen,
} from './app/lazyScreens';
import { FullScreenFallback, ScreenFallback, SongPendingScreen } from './components/Layout/ScreenFallback';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useSetlists } from './hooks/useSetlists';
import { useSongDurations } from './hooks/useSongDurations';
import { countSetlistsWithMember, getFirstPlayableItem, getSetlistPosition } from './utils/setlists';
import { setlistHash, setlistMassHash, setlistSongHash } from './components/Setlists/ui';
import { useMinistry } from './hooks/useMinistry';
import { MinistryContext, type MinistryData } from './hooks/ministryContext';
import { useEvents } from './hooks/useEvents';
import { useNow } from './hooks/useNow';
import { isValidIsoDate, toLocalIsoDate, toLocalTime } from './utils/dates';
import {
  findOccurrence,
  getEventsForMember,
  getEventsForSetlist,
  getUpcomingEvents,
  type CalendarNow,
} from './utils/ministryEvents';
import type { EventOccurrence, MinistryEventDetails } from './types/event';
import type { CalendarViewMode } from './components/Calendar/CalendarView';
import { ActivityList } from './components/Calendar/ActivityList';
import { UpcomingActivities } from './components/Calendar/UpcomingActivities';
import { usePerformanceHistory } from './hooks/usePerformanceHistory';
import {
  EMPTY_PERFORMANCE_FILTERS,
  canFinishCelebration,
  countSoloSongsForMember,
  getPerformancesForEvent,
  getPerformancesForMember,
  getRecentPerformances,
  type PerformanceFilters,
} from './utils/performanceHistory';
import { SongHistoryCard } from './components/History/SongHistoryCard';
import { Sidebar, type SidebarSection } from './components/Layout/Sidebar';
import { Topbar } from './components/Layout/Topbar';
import { Footer } from './components/Layout/Footer';
import { Dashboard, type ViewMode } from './components/Dashboard/Dashboard';
import { SongFiltersControl } from './components/Discovery/SongFiltersControl';
import type { YourSongsTab } from './components/Discovery/YourSongs';
import { useRecentSongs } from './hooks/useRecentSongs';
import {
  EMPTY_FILTERS,
  getFilterOptions,
  removeFilterValue,
  searchSongs,
  sortSongs,
  type SongFilters,
  type SongSortOption,
} from './utils/songSearch';
import { countSongUsage, getMostUsedSongs } from './utils/songUsage';
import { PlayerBar } from './components/Player/PlayerBar';
import { YouTubeAudioPlayer, type YouTubeAudioPlayerHandle } from './components/Player/YouTubeAudioPlayer';
import type { CompactPlayerState } from './components/Player/MiniPlayer';

type AppPage =
  | 'app'
  | 'song'
  | 'songPending'
  | 'songUnavailable'
  | 'privacy'
  | 'terms'
  | 'about'
  | 'contact'
  | 'songEditor'
  | 'tracking'
  | 'proposalEdit';

/** The public editor: #/canciones/nueva */
const NEW_SONG_ROUTE = '#/canciones/nueva';
/** A proposal's status, optionally for one code: #/propuesta or #/propuesta/GS-XXXX-XXXX */
const TRACKING_ROUTE = /^#\/propuesta(?:\/([^/]+))?$/;
/** Correcting one's own proposal. The address carries only the tracking code, never the edit token. */
const PROPOSAL_EDIT_ROUTE = /^#\/propuesta\/([^/]+)\/editar$/;

/** A song opened as part of a setlist: #/setlist/<setlist>/song/<entry> */
const SETLIST_SONG_ROUTE = /^#\/setlist\/([^/]+)\/song\/([^/]+)$/;
/** A setlist being played live: #/setlist/<setlist>/misa */
const SETLIST_MASS_ROUTE = /^#\/setlist\/([^/]+)\/misa$/;
/** Routes that show the songbook's home, where search and filters live. */
const isSongbookRoute = (hash: string) =>
  hash === '' ||
  hash === '#' ||
  hash === '#/' ||
  hash === '#/favoritas' ||
  hash.startsWith('#/categoria/') ||
  hash.startsWith('#/autor/');
const isSongRoute = (hash: string) => hash.startsWith('#/song/') || SETLIST_SONG_ROUTE.test(hash);
/** The calendar, optionally on one day: #/calendario or #/calendario/2026-09-20 */
const CALENDAR_ROUTE = /^#\/calendario(?:\/(\d{4}-\d{2}-\d{2}))?$/;
/** One activity, optionally one date of a repeating one: #/actividad/<id>[/2026-09-20] */
const EVENT_ROUTE = /^#\/actividad\/([^/]+)(?:\/(\d{4}-\d{2}-\d{2}))?$/;
const calendarHash = (date: string) => `#/calendario/${date}`;
/** The history, optionally filtered by one song or one person: #/historial[/cancion/<id>|/miembro/<id>] */
const HISTORY_ROUTE = /^#\/historial(?:\/(cancion|miembro)\/([^/]+))?$/;
/** One recorded performance: #/interpretacion/<id> */
const PERFORMANCE_ROUTE = /^#\/interpretacion\/([^/]+)$/;
const performanceHash = (recordId: string) => `#/interpretacion/${encodeURIComponent(recordId)}`;
const occurrenceHash = (occurrence: Pick<EventOccurrence, 'event' | 'date'>) =>
  `#/actividad/${encodeURIComponent(occurrence.event.id)}/${occurrence.date}`;

export function App() {
  const [page, setPage] = useState<AppPage>('app');
  /** The code in #/propuesta/<code>, if any */
  const [trackingCode, setTrackingCode] = useState<string | null>(null);
  const [section, setSection] = useState<SidebarSection>('cancionero');
  const [activeSong, setActiveSong] = useState<Song | null>(null);
  /** A song the address asks for that the catalog shown doesn't have (yet): waiting for Supabase, or offline */
  const [pendingSongId, setPendingSongId] = useState<string | null>(null);
  /**
   * The official catalog: ONE complete source at a time (Supabase, its last
   * valid copy in this browser, or the bundled songs), see catalogStore.ts.
   * The map by id, the search index and the categories come with it, built
   * once per catalog, so every screen reads the same songs.
   */
  const catalog = useCatalog();
  const catalogSongs = catalog.songs as Song[];
  const songsById = catalog.byId as Map<string, Song>;
  const searchIndex = catalog.searchIndex;
  /** The catalog's own categories, offered by the song editor (no second list). */
  const catalogCategories = catalog.categories;
  /** An entry can only be opened while its song is in the catalog. */
  const isPlayableItem = useCallback((item: SetlistItem) => songsById.has(item.songId), [songsById]);
  // The hash-change listener is registered once: it reads the current catalog through this ref.
  const catalogRef = useRef(catalog);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);

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
  // The people of the ministry and the keys they usually sing in.
  const ministry = useMinistry();
  const ministryData = useMemo<MinistryData>(
    () => ({ members: ministry.members, membersById: ministry.membersById, keyPreferences: ministry.keyPreferences }),
    [ministry.members, ministry.membersById, ministry.keyPreferences]
  );
  // The ministry's activities, and "now" as the calendar reads it (local day and time).
  const events = useEvents();
  const nowMs = useNow(30_000);
  const calendarNow = useMemo<CalendarNow>(() => {
    const current = new Date(nowMs);
    return { date: toLocalIsoDate(current), time: toLocalTime(current) };
  }, [nowMs]);
  /** The day the calendar is on; null means today. */
  const [calendarDate, setCalendarDate] = useState<string | null>(null);
  const [calendarView, setCalendarView] = useState<CalendarViewMode>('month');
  /** Set on an activity's page: its id, and the date of the occurrence when it repeats. */
  const [openEventRoute, setOpenEventRoute] = useState<{ eventId: string; date: string | null } | null>(null);
  /** The date a new activity starts on while its form is open. */
  const [newEventDate, setNewEventDate] = useState<string | null>(null);
  /**
   * The activity date mass mode was opened from, when it was: leaving returns
   * there, and its end can close that date. Mass mode itself only knows the setlist.
   */
  const [massOrigin, setMassOrigin] = useState<{ eventId: string; date: string } | null>(null);
  /** Set by "Finalizar celebración": the activity page opens with its closing dialog. */
  const [closingKey, setClosingKey] = useState<string | null>(null);
  // What was actually sung, recorded on purpose; separate from everything above.
  const history = usePerformanceHistory();
  const [historyFilters, setHistoryFilters] = useState<PerformanceFilters>(EMPTY_PERFORMANCE_FILTERS);
  /** Null on the history list, an id on one record's page. */
  const [openRecordId, setOpenRecordId] = useState<string | null>(null);
  /** Null on the list of members, an id on one member's page. */
  const [openMemberId, setOpenMemberId] = useState<string | null>(null);
  const [isCreatingMember, setIsCreatingMember] = useState(false);
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
  /** Set while a setlist is being played live, in mass mode. */
  const [massSetlistId, setMassSetlistId] = useState<string | null>(null);

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

  const lastOpenedSong = catalogSongs.find((s) => s.id === lastOpenedSongId) || null;

  // The song page loads on demand; fetch it while the browser is idle so opening a song never waits.
  useEffect(() => {
    prefetchSongViewer();
  }, []);

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
      setMassSetlistId(null);
      setOpenEventRoute(null);
      if (!SETLIST_MASS_ROUTE.test(hash)) setMassOrigin(null);
      if (!EVENT_ROUTE.test(hash)) setClosingKey(null);
      setOpenRecordId(null);

      if (hash === '#/privacidad') {
        setPage('privacy');
        return;
      }
      if (hash === NEW_SONG_ROUTE) {
        setPage('songEditor');
        setSection('cancionero');
        return;
      }
      const proposalEditMatch = hash.match(PROPOSAL_EDIT_ROUTE);
      if (proposalEditMatch) {
        setPage('proposalEdit');
        setSection('cancionero');
        setTrackingCode(proposalEditMatch[1]);
        return;
      }
      const trackingMatch = hash.match(TRACKING_ROUTE);
      if (trackingMatch) {
        setPage('tracking');
        setSection('cancionero');
        setTrackingCode(trackingMatch[1] ?? null);
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
        const found = catalogRef.current.byId.get(songId);
        if (!found) {
          // Not in what is shown: maybe a song newer than this device's catalog.
          // While Supabase answers, wait; without it, say so instead of showing the songbook.
          const availability = getCatalogStore().availability(songId);
          if (availability === 'checking' || availability === 'unverified') {
            setPendingSongId(songId);
            setPage(availability === 'checking' ? 'songPending' : 'songUnavailable');
            return;
          }
        }
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
        const itemSong = item && catalogRef.current.byId.get(item.songId);
        if (item && !itemSong && getCatalogStore().availability(item.songId) === 'checking') {
          setPendingSongId(item.songId);
          setPage('songPending');
          return;
        }
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
      const massMatch = hash.match(SETLIST_MASS_ROUTE);
      if (massMatch) {
        // Mass mode opens over the setlist's own page, so leaving it lands
        // exactly where it started.
        setPage('app');
        setSection('setlists');
        setOpenSetlistId(massMatch[1]);
        setMassSetlistId(massMatch[1]);
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
      const calendarMatch = hash.match(CALENDAR_ROUTE);
      if (calendarMatch) {
        setPage('app');
        setSection('calendario');
        setCalendarDate(calendarMatch[1] && isValidIsoDate(calendarMatch[1]) ? calendarMatch[1] : null);
        return;
      }
      const historyMatch = hash.match(HISTORY_ROUTE);
      if (historyMatch) {
        setPage('app');
        setSection('historial');
        // A link from a song or a member asks one question; the plain list keeps the filters as they were.
        if (historyMatch[1] === 'cancion') setHistoryFilters({ ...EMPTY_PERFORMANCE_FILTERS, songId: historyMatch[2] });
        if (historyMatch[1] === 'miembro') setHistoryFilters({ ...EMPTY_PERFORMANCE_FILTERS, memberId: historyMatch[2] });
        return;
      }
      const performanceMatch = hash.match(PERFORMANCE_ROUTE);
      if (performanceMatch) {
        setPage('app');
        setSection('historial');
        setOpenRecordId(performanceMatch[1]);
        return;
      }
      const eventMatch = hash.match(EVENT_ROUTE);
      if (eventMatch) {
        setPage('app');
        setSection('calendario');
        setOpenEventRoute({ eventId: eventMatch[1], date: eventMatch[2] ?? null });
        return;
      }
      if (hash === '#/miembros') {
        setPage('app');
        setSection('miembros');
        setOpenMemberId(null);
        return;
      }
      if (hash.startsWith('#/miembro/')) {
        setPage('app');
        setSection('miembros');
        setOpenMemberId(hash.replace('#/miembro/', ''));
        return;
      }

      setPage('app');
      setSection('cancionero');
    };

    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [setLastOpenedSongId]);

  // A song the address asked for before the catalog had it: once Supabase answers
  // (or fails), the same address is read again, with the catalog it has now.
  const waitingForCatalog = page === 'songPending' || page === 'songUnavailable';
  useEffect(() => {
    if (waitingForCatalog && catalog.remote !== 'loading') window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, [waitingForCatalog, catalog.byId, catalog.remote]);

  const navigateTo = (hash: string) => {
    if (window.location.hash === hash) {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } else {
      // A fragment navigation, exactly like setting location.hash: new history
      // entry and a hashchange event.
      window.location.assign(hash);
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
    const matches = searchSongs(searchIndex, searchQuery, filters);
    const sorted = sortSongs(
      matches.map((match) => match.song),
      sortBy,
      { lastOpenedAt, uses: usesBySong }
    );
    // Songs found only by a phrase in their lyrics go after those whose title
    // or details match, whatever the chosen order.
    const weak = new Set(matches.filter((match) => match.score < 50).map((match) => match.song.id));
    return [...sorted.filter((song) => !weak.has(song.id)), ...sorted.filter((song) => weak.has(song.id))];
  }, [searchIndex, searchQuery, filters, sortBy, lastOpenedAt, usesBySong]);

  const filterOptions = useMemo(
    () => (isOnSongbook ? getFilterOptions(searchIndex, searchQuery, filters) : null),
    [isOnSongbook, searchIndex, searchQuery, filters]
  );

  const favoriteSongs = useMemo(
    // Most recently marked first.
    () => [...favorites].reverse().flatMap((id) => songsById.get(id) ?? []),
    [favorites, songsById]
  );
  const recentSongs = useMemo(
    () => recents.flatMap(({ songId, lastOpenedAt: openedAt }) => {
      const song = songsById.get(songId);
      return song ? [{ song, lastOpenedAt: openedAt }] : [];
    }),
    [recents, songsById]
  );
  const mostUsedSongs = useMemo(() => getMostUsedSongs(catalogSongs, usage, lastOpenedAt), [catalogSongs, usage, lastOpenedAt]);

  const openSetlist = openSetlistId ? setlists.getSetlist(openSetlistId) : null;
  /** The setlist being played live, when mass mode is open over it. */
  const massSetlist = massSetlistId ? setlists.getSetlist(massSetlistId) : null;
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
      title: songsById.get(item.songId)?.title ?? '',
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

  /** The open song as the current catalog has it (a newer remote version replaces the one opened). */
  const currentSong = activeSong ? songsById.get(activeSong.id) ?? activeSong : null;
  /** The song on screen: from the setlist when there is one, else the plain route. */
  const viewerSong = setlistPlayback ? songsById.get(setlistPlayback.item.songId) ?? null : currentSong;

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
        .map((item) => songsById.get(item.songId))
        .filter((song): song is Song => Boolean(song))
    : null;

  const queueIndex = (): number => {
    if (!lastOpenedSong) return -1;
    // The song being read is the reliable position, since a setlist may hold
    // the same song twice.
    if (setlistQueue && setlistPlayback && viewerSong?.id === lastOpenedSong.id) {
      return setlistPlayback.position - 1;
    }
    return (setlistQueue ?? catalogSongs).findIndex((song) => song.id === lastOpenedSong.id);
  };

  const handlePlayerNext = () => {
    if (!lastOpenedSong) return;
    const queue = setlistQueue ?? catalogSongs;
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
    const queue = setlistQueue ?? catalogSongs;
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
    const queue = setlistQueue ?? catalogSongs;
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
      history={
        <SongHistoryCard
          songId={song.id}
          records={history.records}
          onOpenHistory={() => navigateTo(`#/historial/cancion/${encodeURIComponent(song.id)}`)}
        />
      }
    />
  );

  const openOccurrence = (occurrence: EventOccurrence) => navigateTo(occurrenceHash(occurrence));
  const upcomingActivities = useMemo(() => getUpcomingEvents(events.events, calendarNow, 4), [events.events, calendarNow]);
  const lastRecord = useMemo(() => getRecentPerformances(history.records, 1)[0] ?? null, [history.records]);
  /** The activity date mass mode was opened from, as it is now (null from a setlist, or once it's gone). */
  const massOccurrence = massOrigin ? findOccurrence(events.events, massOrigin.eventId, massOrigin.date) : null;
  const massOriginOccurrence = massOccurrence && massOccurrence.date === massOrigin?.date ? massOccurrence : null;

  /** Exact counts from the records, never a ranking: what they took part in, and where they sang solo. */
  const renderMemberHistory = (memberId: string) => {
    const taken = getPerformancesForMember(history.records, memberId).length;
    if (taken === 0) return null;
    const solo = countSoloSongsForMember(history.records, memberId);
    return (
      <div>
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          Interpretaciones
        </h2>
        <p className="text-sm text-slate-700 dark:text-slate-200">
          {taken === 1 ? '1 actividad registrada' : `${taken} actividades registradas`}
          {solo > 0 ? ` · solista en ${solo === 1 ? '1 canción' : `${solo} canciones`}` : ''}
        </p>
        <button
          type="button"
          onClick={() => navigateTo(`#/historial/miembro/${encodeURIComponent(memberId)}`)}
          className="mt-1 h-10 -ml-2 px-2 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
        >
          Ver historial
        </button>
      </div>
    );
  };

  const renderHistory = () => {
    if (openRecordId) {
      const record = history.getRecord(openRecordId);
      const recordId = openRecordId;
      const origin = record ? findOccurrence(events.events, record.eventId, record.occurrenceDate) : null;
      return (
        <PerformanceDetail
          record={record}
          // The activity must still exist and still have that date.
          eventExists={Boolean(origin && origin.date === record?.occurrenceDate)}
          todayIso={calendarNow.date}
          members={ministry.members}
          onBack={() => navigateTo('#/historial')}
          onOpenEvent={() => {
            if (origin) navigateTo(occurrenceHash(origin));
          }}
          onUpdate={(changes) => {
            history.update(recordId, changes);
            showToast('Registro actualizado');
          }}
          onDelete={() => {
            history.remove(recordId);
            showToast('Registro de interpretación eliminado');
            navigateTo(origin && origin.date === record?.occurrenceDate ? occurrenceHash(origin) : '#/historial');
          }}
        />
      );
    }
    return (
      <HistoryView
        records={history.records}
        filters={historyFilters}
        onChangeFilters={setHistoryFilters}
        onOpenRecord={(recordId) => navigateTo(performanceHash(recordId))}
        onGoToCalendar={() => navigateTo('#/calendario')}
        recoveredFromUnreadableData={history.recoveredFromUnreadableData}
      />
    );
  };

  const renderMembers = () => {
    if (openMemberId) {
      const member = ministry.membersById.get(openMemberId) ?? null;
      const memberId = openMemberId;
      return (
        <MemberDetail
          member={member}
          songs={catalogSongs}
          songsById={songsById}
          keyPreferences={ministry.keyPreferences}
          setlistCount={countSetlistsWithMember(setlists.setlists, memberId)}
          onBack={() => navigateTo('#/miembros')}
          onUpdate={(details) => ministry.updateMember(memberId, details)}
          onSetActive={(isActive) => ministry.setMemberActive(memberId, isActive)}
          onDelete={() => {
            const name = member?.name;
            // One clear operation: the member, their keys, and every place that pointed at them.
            ministry.deleteMember(memberId);
            setlists.removeMemberEverywhere(memberId);
            events.removeMemberEverywhere(memberId);
            if (name) showToast(`${name} eliminado del ministerio`);
            navigateTo('#/miembros');
          }}
          onSetKeyPreference={(songId, key) => ministry.setKeyPreference(memberId, songId, key)}
          onRemoveKeyPreference={(songId) => ministry.removeKeyPreference(memberId, songId)}
          activities={
            <ActivityList
              title="Próximas actividades"
              headingId="miembro-actividades"
              occurrences={getEventsForMember(events.events, memberId, calendarNow)}
              now={calendarNow}
              onOpen={openOccurrence}
              emptyText="No está en el equipo de ninguna actividad próxima."
            />
          }
          history={renderMemberHistory(memberId)}
        />
      );
    }
    return (
      <>
        <MembersView
          members={ministry.members}
          onOpen={(memberId) => navigateTo(`#/miembro/${encodeURIComponent(memberId)}`)}
          onCreate={() => setIsCreatingMember(true)}
        />
        {isCreatingMember && (
          <MemberFormDialog
            mode="create"
            onSubmit={(details) => {
              const created = ministry.createMember(details);
              setIsCreatingMember(false);
              navigateTo(`#/miembro/${encodeURIComponent(created.id)}`);
            }}
            onClose={() => setIsCreatingMember(false)}
          />
        )}
      </>
    );
  };

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
        songs={catalogSongs}
        songsById={songsById}
        durations={durations}
        onBack={() => navigateTo('#/setlists')}
        onOpenItem={(item) => navigateTo(setlistSongHash(setlistId, item.id))}
        onStartRehearsal={() => {
          if (openSetlist) handleStartRehearsal(openSetlist);
        }}
        onStartMass={() => navigateTo(setlistMassHash(setlistId))}
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
          events.clearSetlistEverywhere(setlistId);
          if (name) showToast(`Setlist «${name}» eliminado`);
          navigateTo('#/setlists');
        }}
        onAddSong={(song, moment) => setlists.addSongs(setlistId, [song], moment)}
        onRemoveItem={(itemId) => setlists.removeItem(setlistId, itemId)}
        onMoveItem={(itemId, toIndex) => setlists.moveItem(setlistId, itemId, toIndex)}
        onMoveItemBy={(itemId, delta) => setlists.moveItemBy(setlistId, itemId, delta)}
        onUpdateItem={(itemId, changes) => setlists.updateItem(setlistId, itemId, changes)}
        members={ministry.members}
        membersById={ministry.membersById}
        onSetParticipants={(memberIds) => setlists.setParticipants(setlistId, memberIds)}
        onAddParticipants={(memberIds) => setlists.addParticipants(setlistId, memberIds)}
        onGoToMembers={() => navigateTo('#/miembros')}
        activities={renderSetlistActivities(setlistId)}
      />
    );
  };

  const renderSetlistActivities = (setlistId: string) => {
    const { upcoming, past } = getEventsForSetlist(events.events, setlistId, calendarNow);
    if (upcoming.length === 0 && past.length === 0) return null;
    return (
      <div className="space-y-5">
        <ActivityList
          title="Actividades"
          headingId="setlist-actividades"
          occurrences={upcoming}
          now={calendarNow}
          onOpen={openOccurrence}
          emptyText="No hay actividades próximas con este Setlist."
        />
        <ActivityList
          title="Anteriores"
          headingId="setlist-actividades-pasadas"
          occurrences={past}
          now={calendarNow}
          onOpen={openOccurrence}
        />
      </div>
    );
  };

  const handleCreateEvent = (details: MinistryEventDetails) => {
    const created = events.create(details);
    setNewEventDate(null);
    navigateTo(occurrenceHash({ event: created, date: created.date }));
  };

  const renderCalendar = () => {
    if (openEventRoute) {
      const occurrence = findOccurrence(events.events, openEventRoute.eventId, openEventRoute.date);
      const eventId = openEventRoute.eventId;
      const backDate = occurrence?.date ?? openEventRoute.date ?? calendarNow.date;
      const performance = occurrence ? history.getForOccurrence(eventId, occurrence.date) : null;
      const recordPerformance = (performedItemIds: string[], notes: string) => {
        const setlist = occurrence?.event.setlistId ? setlists.getSetlist(occurrence.event.setlistId) : null;
        if (!occurrence || !setlist || performedItemIds.length === 0) return null;
        return history.record({
          event: occurrence.event,
          occurrenceDate: occurrence.date,
          setlist,
          songsById: songsById,
          membersById: ministry.membersById,
          performedItemIds,
          notes,
        });
      };
      return (
        <EventDetail
          // Another activity, or another date of the same one, starts clean.
          key={occurrence?.key ?? eventId}
          occurrence={occurrence}
          setlists={setlists.setlists}
          members={ministry.members}
          membersById={ministry.membersById}
          now={calendarNow}
          onBack={() => navigateTo(calendarHash(backDate))}
          onUpdate={(details) => {
            events.update(eventId, details);
            // The date may have moved: follow the activity there.
            if (details.date !== occurrence?.event.date) navigateTo(`#/actividad/${encodeURIComponent(eventId)}`);
          }}
          onDelete={() => {
            const title = occurrence?.event.title;
            events.remove(eventId);
            if (title) showToast(`Actividad «${title}» eliminada`);
            navigateTo(calendarHash(backDate));
          }}
          onDuplicate={(details) => {
            const copy = events.create(details);
            showToast(`Actividad «${copy.title}» creada`);
            navigateTo(occurrenceHash({ event: copy, date: copy.date }));
          }}
          onSetSetlist={(setlistId) => events.setSetlist(eventId, setlistId)}
          onSetParticipants={(memberIds) => events.setParticipants(eventId, memberIds)}
          onCopyTeamToSetlist={() => {
            const setlistId = occurrence?.event.setlistId;
            if (!occurrence || !setlistId || !setlists.getSetlist(setlistId)) return;
            setlists.setParticipants(setlistId, occurrence.event.participantIds);
            showToast('Equipo copiado al Setlist');
          }}
          onOpenSetlist={(setlistId) => navigateTo(setlistHash(setlistId))}
          onStartRehearsal={(setlistId) => {
            const setlist = setlists.getSetlist(setlistId);
            if (setlist) handleStartRehearsal(setlist);
          }}
          onStartMass={(setlistId) => {
            // Leaving mass mode comes back to this activity, not to the setlist.
            setMassOrigin(occurrence ? { eventId, date: occurrence.date } : null);
            navigateTo(setlistMassHash(setlistId));
          }}
          songsById={songsById}
          performance={performance}
          performanceCount={getPerformancesForEvent(history.records, eventId).length}
          onSetStatus={(status) => {
            if (!occurrence) return;
            events.setStatus(eventId, occurrence.date, status);
            showToast(
              status === 'cancelled' ? 'Actividad cancelada' : status === 'completed' ? 'Actividad realizada' : 'Actividad programada de nuevo'
            );
          }}
          onComplete={(performedItemIds, notes) => {
            if (!occurrence) return;
            // The record first, then the status: both belong to this date only.
            const record = recordPerformance(performedItemIds, notes);
            events.setStatus(eventId, occurrence.date, 'completed');
            showToast(record ? 'Actividad realizada e interpretación registrada' : 'Actividad realizada');
          }}
          onRecordPerformance={(performedItemIds, notes) => {
            if (recordPerformance(performedItemIds, notes)) showToast('Interpretación registrada');
          }}
          onViewPerformance={(recordId) => navigateTo(performanceHash(recordId))}
          startClosing={Boolean(occurrence && closingKey === occurrence.key && occurrence.status === 'scheduled')}
        />
      );
    }
    const selectedDate = calendarDate ?? calendarNow.date;
    return (
      <>
        <CalendarView
          events={events.events}
          now={calendarNow}
          selectedDate={selectedDate}
          view={calendarView}
          onChangeView={setCalendarView}
          onSelectDate={(date) => {
            // Choosing a day is not a new page: the address follows without
            // filling the history, so Back still leaves the calendar.
            setCalendarDate(date);
            window.history.replaceState(null, '', calendarHash(date));
            currentHashRef.current = calendarHash(date);
          }}
          onOpenOccurrence={openOccurrence}
          onCreate={setNewEventDate}
          recoveredFromUnreadableData={events.recoveredFromUnreadableData}
        />
        {newEventDate && (
          <EventFormDialog
            mode="create"
            initialDetails={{ date: newEventDate }}
            setlists={setlists.setlists}
            members={ministry.members}
            todayIso={calendarNow.date}
            onSubmit={handleCreateEvent}
            onClose={() => setNewEventDate(null)}
          />
        )}
      </>
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
      case 'songEditor':
        return (
          <SongEditorScreen
            categories={catalogCategories}
            onBackToSongbook={handleBackToDashboard}
            onCheckStatus={(code) => navigateTo(`#/propuesta/${code}`)}
          />
        );
      case 'proposalEdit':
        return (
          <ProposalEditScreen
            key={trackingCode ?? ''}
            code={trackingCode ?? ''}
            categories={catalogCategories}
            onCheckStatus={(code) => navigateTo(`#/propuesta/${code}`)}
            onBackToSongbook={handleBackToDashboard}
          />
        );
      case 'tracking':
        return (
          <TrackingScreen
            initialCode={trackingCode}
            onCheckCode={(code) => navigateTo(`#/propuesta/${code}`)}
            onEditProposal={(code) => navigateTo(`#/propuesta/${code}/editar`)}
            onAddSong={() => navigateTo(NEW_SONG_ROUTE)}
            onBackToSongbook={handleBackToDashboard}
          />
        );
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
        return currentSong ? renderSongViewer(currentSong, currentSong.id, null) : null;
      case 'songPending':
        return <SongPendingScreen />;
      case 'songUnavailable':
        return <SongUnavailableScreen songId={pendingSongId} onRetry={refreshCatalog} onBack={handleBackToDashboard} />;
      default:
        switch (section) {
          case 'setlists':
            return renderSetlists();
          case 'miembros':
            return renderMembers();
          case 'calendario':
            return renderCalendar();
          case 'historial':
            return renderHistory();
          case 'categorias':
            return (
              <CategoriesView
                songs={catalogSongs}
                onSelectCategory={(cat) => navigateTo(`#/categoria/${cat}`)}
              />
            );
          case 'autores':
            return (
              <AuthorsView
                songs={catalogSongs}
                onSelectAuthor={(author) => navigateTo(`#/autor/${author}`)}
              />
            );
          case 'listas':
            return (
              <PlaylistsView
                playlists={playlists}
                songs={catalogSongs}
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
              <>
              {catalog.remote === 'failed' && catalog.source !== 'remote' && (
                <Suspense fallback={null}>
                  <CatalogFallbackNotice catalog={catalog} onRetry={refreshCatalog} />
                </Suspense>
              )}
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
                onAddSong={() => navigateTo(NEW_SONG_ROUTE)}
                upcomingActivities={
                  <UpcomingActivities
                    occurrences={upcomingActivities}
                    now={calendarNow}
                    onOpen={openOccurrence}
                    onGoToCalendar={() => navigateTo('#/calendario')}
                    lastRecord={lastRecord}
                    onOpenRecord={(recordId) => navigateTo(performanceHash(recordId))}
                  />
                }
              />
              </>
            );
        }
    }
  };

  const showPlayerBar = Boolean(lastOpenedSong);
  const rehearsalActive = isRehearsing && page === 'song' && Boolean(viewerSong);
  const massActive = Boolean(massSetlist);

  return (
    <MinistryContext.Provider value={ministryData}>
    <div
      // While rehearsing, the app underneath can't be reached by keyboard or
      // screen reader; rehearsal mode itself is portalled outside this element.
      inert={rehearsalActive || massActive}
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
          <main className="flex-grow flex flex-col">
            {/* A screen loaded on demand shows its outline meanwhile; the key restarts it per page. */}
            <Suspense fallback={<ScreenFallback />}>{renderContent()}</Suspense>
          </main>
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
                for (const song of catalogSongs) {
                  if (song.youtubeId === playingVideoId) recordDuration(song.id, seconds);
                }
              }}
              onEnded={handleSongEnded}
              onError={(message) => {
                setPlayerError(message);
                setIsPlayerPlaying(false);
              }}
            />
            {/* Rehearsal mode shows its own compact controls for this player;
                mass mode leaves the player out entirely. */}
            {!rehearsalActive && !massActive && (
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

      {massSetlist && (
        <Suspense fallback={<FullScreenFallback />}>
          <MassMode
            // A different setlist is a different celebration.
            key={massSetlist.id}
            setlist={massSetlist}
            songsById={songsById}
            isPlayable={isPlayableItem}
            onExit={() => navigateTo(massOriginOccurrence ? occurrenceHash(massOriginOccurrence) : setlistHash(massSetlist.id))}
            returnsTo={massOriginOccurrence ? 'activity' : 'setlist'}
            onFinishCelebration={
              massOriginOccurrence && canFinishCelebration(massOriginOccurrence)
                ? () => {
                    // Finishing opens the closing of this date; nothing is closed until it is confirmed there.
                    setClosingKey(massOriginOccurrence.key);
                    navigateTo(occurrenceHash(massOriginOccurrence));
                  }
                : undefined
            }
            onSongOpened={(songId) => recordOpenedRef.current(songId)}
            isDarkMode={isDarkMode}
            onToggleDarkMode={() => setIsDarkMode((value) => !value)}
          />
        </Suspense>
      )}

      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-[#10203A] text-white text-xs font-medium shadow-lg">
          {toast}
        </div>
      )}
    </div>
    </MinistryContext.Provider>
  );
}

export default App;
