import { useCallback, useMemo, useState } from 'react';
import type { Setlist, SetlistItem } from '../types/setlist';
import {
  createMassSessionRepository,
  type MassSessionRepository,
} from '../storage/massSessionStorage';
import { getMassPosition, resolveMassItemId, type MassPosition } from '../utils/massMode';

/**
 * Where we are inside a celebration.
 *
 * "start" is the short screen before the first song, "playing" is the
 * celebration itself and "finished" is the end of the setlist. Reloading the
 * page during a celebration comes back to the song that was being played;
 * leaving mass mode on purpose forgets it.
 */
export type MassPhase = 'start' | 'playing' | 'finished';

export interface MassSessionState {
  phase: MassPhase;
  /** The entry being played, already checked against the setlist */
  currentItemId: string | null;
  position: MassPosition | null;
  start: (itemId?: string) => void;
  goTo: (itemId: string) => void;
  goNext: () => void;
  goPrevious: () => void;
  finish: () => void;
  /** Forgets the session: mass mode was left on purpose */
  clear: () => void;
}

interface UseMassSessionOptions {
  setlist: Setlist | null;
  isPlayable: (item: SetlistItem) => boolean;
  /** Injectable for tests; the browser's sessionStorage by default */
  repository?: MassSessionRepository;
}

export function useMassSession({
  setlist,
  isPlayable,
  repository,
}: UseMassSessionOptions): MassSessionState {
  const repo = useMemo(() => repository ?? createMassSessionRepository(), [repository]);
  // Read once, when mass mode opens: a session for this setlist means the page
  // was reloaded in the middle of a celebration, so it goes straight back to
  // the song instead of asking again.
  const [initial] = useState(() => {
    const stored = repo.read();
    const storedItemId = stored && setlist && stored.setlistId === setlist.id ? stored.itemId : null;
    const resolved = resolveMassItemId(setlist, storedItemId, isPlayable);
    return {
      phase: (storedItemId && resolved === storedItemId ? 'playing' : 'start') as MassPhase,
      itemId: resolved,
    };
  });

  const [phase, setPhase] = useState<MassPhase>(initial.phase);
  const [requestedItemId, setRequestedItemId] = useState<string | null>(initial.itemId);

  // The setlist can change under us (another tab, an entry removed): the item
  // shown is always re-checked against the setlist as it is now.
  const currentItemId = resolveMassItemId(setlist, requestedItemId, isPlayable);
  const position = setlist && currentItemId ? getMassPosition(setlist, currentItemId, isPlayable) : null;

  const remember = useCallback(
    (itemId: string | null) => {
      if (setlist && itemId) repo.write({ setlistId: setlist.id, itemId });
    },
    [repo, setlist]
  );

  const goTo = useCallback(
    (itemId: string) => {
      setRequestedItemId(itemId);
      setPhase('playing');
      remember(itemId);
    },
    [remember]
  );

  return {
    phase,
    currentItemId,
    position,
    start: (itemId) => goTo(itemId ?? currentItemId ?? ''),
    goTo,
    goNext: () => {
      if (position?.next) goTo(position.next.id);
    },
    goPrevious: () => {
      if (position?.previous) goTo(position.previous.id);
    },
    finish: () => {
      setPhase('finished');
      repo.clear();
    },
    clear: () => repo.clear(),
  };
}
