import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Setlist, SetlistDetails } from '../types/setlist';
import type { Song } from '../types/song';
import {
  GUEST_SETLISTS,
  createLocalSetlistRepository,
  scopeId,
  type SetlistRepository,
  type SetlistScope,
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

/** The same empty list every time: a scope being read is not new data each render. */
const NONE: Setlist[] = [];

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
 *
 * `scope` says whose setlists these are. Signing in or out changes it, and
 * the new ones are read in that very render, before anything is painted: no
 * frame ever shows one account what belongs to another. Nothing is copied
 * from one scope to another, and leaving one behind does not erase it.
 */
export function useSetlists(scope: SetlistScope = GUEST_SETLISTS, repository?: SetlistRepository): SetlistsStore {
  // The scope is the caller's: it changes when the person signing in changes,
  // and not on every render (see App).
  const scopeName = scopeId(scope);
  const repo = useMemo(() => repository ?? createLocalSetlistRepository(undefined, scope), [repository, scope]);

  // `justRead` marks a store that came straight from storage, so a read is
  // never written back: unreadable data stays untouched (and backed up) until
  // somebody actually changes something.
  const read = useCallback(() => ({ scope: scopeId(scope), justRead: true, ...repo.load() }), [repo, scope]);
  const [store, setStore] = useState(read);

  // The account changed: its setlists are read now, during this render, so
  // nothing of the previous one is ever painted.
  if (store.scope !== scopeName) setStore(read());
  const setlists = useMemo(() => (store.scope === scopeName ? store.setlists : NONE), [store, scopeName]);

  const setSetlists = useCallback(
    (update: (current: Setlist[]) => Setlist[]) =>
      setStore((current) => ({ ...current, justRead: false, setlists: update(current.setlists) })),
    []
  );

  // Save after changes, never after a read.
  useEffect(() => {
    if (store.justRead) return;
    repo.save(store.setlists);
  }, [repo, store]);

  // Another tab changed these setlists: show the same data here. Only these:
  // what another account wrote in its own key is none of this tab's business.
  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (repo.key && event.key === repo.key) setStore(read());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [repo, read]);

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
  }, [setSetlists]);

  const getSetlist = useCallback((id: string) => setlists.find((setlist) => setlist.id === id) ?? null, [setlists]);

  const create = useCallback((details: Partial<SetlistDetails>) => {
    const setlist = createSetlist(details, { now: Date.now() });
    setSetlists((current) => [...current, setlist]);
    return setlist;
  }, [setSetlists]);

  const duplicate = useCallback(
    (id: string, details: Partial<SetlistDetails>) => {
      const source = setlists.find((setlist) => setlist.id === id);
      if (!source) return null;
      const copy = duplicateSetlist(source, details, { now: Date.now() });
      setSetlists((current) => [...current, copy]);
      return copy;
    },
    [setlists, setSetlists]
  );

  return {
    setlists,
    recoveredFromUnreadableData: store.recoveredFromUnreadableData,
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
