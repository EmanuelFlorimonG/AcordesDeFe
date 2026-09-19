import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Setlist, SetlistDetails } from '../types/setlist';
import type { Song } from '../types/song';
import {
  SETLIST_STORAGE_KEY,
  createLocalSetlistRepository,
  type SetlistRepository,
} from '../storage/setlistStorage';
import {
  addSetlistParticipants,
  addSongsToSetlist,
  createSetlist,
  duplicateSetlist,
  moveSetlistItem,
  moveSetlistItemBy,
  moveSetlistItemCapo,
  removeMemberFromSetlist,
  removeSetlistItem,
  setSetlistParticipants,
  transposeSetlistItem,
  updateSetlistDetails,
  updateSetlistItem,
  type SetlistItemChanges,
} from '../utils/setlists';

export interface SetlistsStore {
  setlists: Setlist[];
  /** Stored setlists couldn't be read and were backed up */
  recoveredFromUnreadableData: boolean;
  getSetlist: (id: string) => Setlist | null;
  create: (details: Partial<SetlistDetails>) => Setlist;
  updateDetails: (id: string, details: Partial<SetlistDetails>) => void;
  remove: (id: string) => void;
  duplicate: (id: string, details: Partial<SetlistDetails>) => Setlist | null;
  /** `moment` marks the songs as added for a part of the Mass. */
  addSongs: (id: string, songs: Array<Pick<Song, 'id' | 'recommendedCapo'>>, moment?: string) => void;
  removeItem: (id: string, itemId: string) => void;
  moveItem: (id: string, itemId: string, toIndex: number) => void;
  moveItemBy: (id: string, itemId: string, delta: number) => void;
  updateItem: (id: string, itemId: string, changes: SetlistItemChanges) => void;
  transposeItem: (id: string, itemId: string, delta: number) => void;
  moveItemCapo: (id: string, itemId: string, delta: number) => void;
  /** Replaces the team of a setlist */
  setParticipants: (id: string, memberIds: string[]) => void;
  /** Adds people to the team, keeping who was there */
  addParticipants: (id: string, memberIds: string[]) => void;
  /** A member was deleted: out of every team and every arrangement */
  removeMemberEverywhere: (memberId: string) => void;
}

/**
 * The app's setlists: state plus actions. Every change goes through the pure
 * functions in utils/setlists and is saved through a repository, which is the
 * only place that knows where setlists are stored.
 */
export function useSetlists(repository?: SetlistRepository): SetlistsStore {
  const repo = useMemo(() => repository ?? createLocalSetlistRepository(), [repository]);
  const [initial] = useState(() => repo.load());
  const [setlists, setSetlists] = useState<Setlist[]>(initial.setlists);

  // Save after changes, never on first load: unreadable data stays untouched
  // (and backed up) until the user actually changes something.
  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    repo.save(setlists);
  }, [repo, setlists]);

  // Another tab changed the setlists: show the same data here.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SETLIST_STORAGE_KEY) setSetlists(repo.load().setlists);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [repo]);

  const change = useCallback((id: string, update: (setlist: Setlist, now: number) => Setlist) => {
    setSetlists((current) => {
      const now = Date.now();
      let changed = false;
      const next = current.map((setlist) => {
        if (setlist.id !== id) return setlist;
        const updated = update(setlist, now);
        changed = changed || updated !== setlist;
        return updated;
      });
      return changed ? next : current;
    });
  }, []);

  const getSetlist = useCallback((id: string) => setlists.find((setlist) => setlist.id === id) ?? null, [setlists]);

  const create = useCallback((details: Partial<SetlistDetails>) => {
    const setlist = createSetlist(details, { now: Date.now() });
    setSetlists((current) => [...current, setlist]);
    return setlist;
  }, []);

  const duplicate = useCallback(
    (id: string, details: Partial<SetlistDetails>) => {
      const source = setlists.find((setlist) => setlist.id === id);
      if (!source) return null;
      const copy = duplicateSetlist(source, details, { now: Date.now() });
      setSetlists((current) => [...current, copy]);
      return copy;
    },
    [setlists]
  );

  return {
    setlists,
    recoveredFromUnreadableData: initial.recoveredFromUnreadableData,
    getSetlist,
    create,
    duplicate,
    updateDetails: (id, details) => change(id, (setlist, now) => updateSetlistDetails(setlist, details, now)),
    remove: (id) => setSetlists((current) => current.filter((setlist) => setlist.id !== id)),
    addSongs: (id, songs, moment) =>
      change(id, (setlist, now) => addSongsToSetlist(setlist, songs, { now, moment })),
    removeItem: (id, itemId) => change(id, (setlist, now) => removeSetlistItem(setlist, itemId, now)),
    moveItem: (id, itemId, toIndex) => change(id, (setlist, now) => moveSetlistItem(setlist, itemId, toIndex, now)),
    moveItemBy: (id, itemId, delta) => change(id, (setlist, now) => moveSetlistItemBy(setlist, itemId, delta, now)),
    updateItem: (id, itemId, changes) =>
      change(id, (setlist, now) => updateSetlistItem(setlist, itemId, changes, now)),
    transposeItem: (id, itemId, delta) =>
      change(id, (setlist, now) => transposeSetlistItem(setlist, itemId, delta, now)),
    moveItemCapo: (id, itemId, delta) =>
      change(id, (setlist, now) => moveSetlistItemCapo(setlist, itemId, delta, now)),
    setParticipants: (id, memberIds) =>
      change(id, (setlist, now) => setSetlistParticipants(setlist, memberIds, now)),
    addParticipants: (id, memberIds) =>
      change(id, (setlist, now) => addSetlistParticipants(setlist, memberIds, now)),
    removeMemberEverywhere: (memberId) =>
      setSetlists((current) => {
        const now = Date.now();
        let changed = false;
        const next = current.map((setlist) => {
          const cleaned = removeMemberFromSetlist(setlist, memberId, now);
          changed = changed || cleaned !== setlist;
          return cleaned;
        });
        return changed ? next : current;
      }),
  };
}
