import React, { lazy, Suspense, useEffect, useState } from 'react';
import type { Setlist, SetlistItem } from '../../types/setlist';
import type { Song } from '../../types/song';
import { parseSharedRoute, sharedRootHash, sharedSongHash, sharedPlayback } from '../../utils/sharedSetlistRoutes';
import { SharedSetlistView } from './SharedSetlistScreen';
import { secondaryButton } from './ui';

const SongViewer = lazy(() => import('../SongViewer/SongViewer').then(m => ({ default: m.SongViewer })));
const MassMode = lazy(() => import('../Mass/MassMode').then(m => ({ default: m.MassMode })));

/** The public document stays in its parent; only interpretation state lives here. */
export const SharedSetlistPlayer: React.FC<{
  token: string; route: string; setlist: Setlist; songsById: Map<string, Song>;
  onGoToSongbook: () => void; onPerformanceChange?: (active: boolean) => void;
}> = ({ token, route, setlist, songsById, onGoToSongbook, onPerformanceChange }) => {
  const root = sharedRootHash(token);
  const navigate = (hash: string) => { window.location.assign(hash); };
  const parsed = parseSharedRoute(route);
  const [rehearsing, setRehearsing] = useState(parsed?.view === 'rehearsal');
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  const live = parsed?.view === 'live';
  useEffect(() => {
    if (!live) return;
    const element = document.documentElement;
    const previous = element.classList.contains('dark');
    element.classList.toggle('dark', dark);
    return () => { element.classList.toggle('dark', previous); };
  }, [live, dark]);
  const [openedRoute, setOpenedRoute] = useState(route);
  if (openedRoute !== route) {
    setOpenedRoute(route);
    if (parsed?.view !== 'song') setRehearsing(parsed?.view === 'rehearsal');
  }
  useEffect(() => {
    onPerformanceChange?.(live || rehearsing);
    return () => onPerformanceChange?.(false);
  }, [live, rehearsing, onPerformanceChange]);
  const playable = (item: SetlistItem) => songsById.has(item.songId);
  const requested = parsed?.view === 'rehearsal' ? setlist.items.find(playable)?.id : parsed?.itemId;

  const playback = requested ? sharedPlayback(setlist, songsById, token, requested, navigate) : null;
  const song = playback ? songsById.get(playback.item.songId) : null;
  if (!parsed) return <div className="p-6 text-center"><p>Este enlace no está disponible.</p><button className={secondaryButton} onClick={() => navigate(root)}>Volver al Setlist compartido</button></div>;
  if (live) return <Suspense fallback={<p role="status">Abriendo la celebración…</p>}><MassMode
    shared setlist={setlist} songsById={songsById} isPlayable={playable}
    onExit={() => navigate(root)} onSongOpened={() => {}}
    isDarkMode={dark} onToggleDarkMode={() => { setDark(v => !v); }}
  /></Suspense>;
  if (parsed?.view === 'song' || parsed?.view === 'rehearsal') {
    if (!song || !playback) return <div className="p-6 text-center"><p>Esta canción no está disponible.</p><button className={secondaryButton} onClick={() => navigate(root)}>Volver al Setlist compartido</button></div>;
    return <Suspense fallback={<p role="status">Abriendo la canción…</p>}><SongViewer
      key={playback!.item.id} song={song} setlist={playback}
      onBack={() => navigate(root)} isFavorite={false} playlists={[]}
      isRehearsing={rehearsing} onRehearsalChange={setRehearsing} player={null}
    /></Suspense>;
  }
  return <SharedSetlistView setlist={setlist} songsById={songsById} onGoToSongbook={onGoToSongbook}
    onOpenSong={itemId => navigate(sharedSongHash(token, itemId))}
    onRehearsal={() => navigate(`${root}/rehearsal`)} onLive={() => navigate(`${root}/live`)} />;
};
