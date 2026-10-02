import type { Setlist, SetlistPlayback } from '../types/setlist';
import type { Song } from '../types/song';
import { getSetlistPosition } from './setlists';
import { readShareToken } from '../storage/setlistShares';

export type SharedRoute = { token: string; view: 'root' | 'song' | 'rehearsal' | 'live'; itemId?: string };
export function parseSharedRoute(hash: string): SharedRoute | null {
  const match = hash.match(/^#\/shared\/setlist\/([^/]+)(?:\/(song\/([^/]+)|rehearsal|live))?$/);
  if (!match) return null;
  const token = readShareToken(match[1]);
  if (!token) return null;
  let itemId: string | undefined;
  try { itemId = match[3] ? decodeURIComponent(match[3]) : undefined; } catch { return null; }
  return { token, view: match[3] ? 'song' : match[2] === 'live' ? 'live' : match[2] === 'rehearsal' ? 'rehearsal' : 'root', ...(itemId ? { itemId } : {}) };
}
export const sharedRootHash = (token: string) => `#/shared/setlist/${token}`;
export const sharedSongHash = (token: string, itemId: string) => `${sharedRootHash(token)}/song/${encodeURIComponent(itemId)}`;

/** Public playback has navigation capabilities, never persistence capabilities. */
export function sharedPlayback(setlist: Setlist, songs: Map<string, Song>, token: string, itemId: string, navigate: (hash: string) => void): SetlistPlayback | null {
  const position = getSetlistPosition(setlist, itemId, item => songs.has(item.songId));
  if (!position) return null;
  const root = sharedRootHash(token);
  const step = (item: typeof position.item) => ({
    title: songs.get(item.songId)?.title ?? '', moment: item.moment,
    onSelect: () => navigate(sharedSongHash(token, item.id)),
  });
  return {
    shared: true, setlistId: setlist.id, setlistName: setlist.name, item: position.item,
    position: position.index + 1, total: position.total,
    previous: position.previous ? step(position.previous) : null,
    next: position.next ? step(position.next) : null,
    onBackToSetlist: () => navigate(root), onViewOriginal: () => navigate(root),
  };
}
