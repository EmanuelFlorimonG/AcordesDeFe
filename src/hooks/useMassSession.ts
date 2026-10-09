import { useCallback, useMemo, useState } from 'react';
import type { Setlist, SetlistItem } from '../types/setlist';
import {
  createMassSessionRepository,
  type MassSessionRepository,
} from '../storage/massSessionStorage';
import { getMassPosition, resolveMassItemId, runProgressPosition, type MassPosition } from '../utils/massMode';
import { isBackupItem } from '../utils/setlists';

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
  /**
   * Por dónde va la celebración, para la barra de avance. En una canción del
   * recorrido es la suya; en una reserva, la de la última que se cantó, que
   * es lo que hace que ir a buscarla no mueva la barra. Null mientras no se
   * haya abierto ninguna del recorrido.
   */
  runPosition: MassPosition | null;
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
  /**
   * La última canción del recorrido que se abrió, para la barra de avance.
   *
   * Se anota al ir a ella, no al dibujar, y solo cuenta lo que se ha abierto
   * de verdad: en la pantalla de inicio todavía no se ha cantado nada, así
   * que entrar por una reserva no da la celebración por empezada. Vive
   * mientras dura esta pantalla y no se guarda en ninguna parte.
   */
  const [lastRunItemId, setLastRunItemId] = useState<string | null>(
    initial.phase === 'playing' ? initial.itemId : null
  );

  // The setlist can change under us (another tab, an entry removed): the item
  // shown is always re-checked against the setlist as it is now.
  const currentItemId = resolveMassItemId(setlist, requestedItemId, isPlayable);
  const position = setlist && currentItemId ? getMassPosition(setlist, currentItemId, isPlayable) : null;

  const runPosition = setlist ? runProgressPosition(setlist, position, lastRunItemId, isPlayable) : null;

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
      const target = setlist?.items.find((item) => item.id === itemId);
      if (target && !isBackupItem(target)) setLastRunItemId(itemId);
    },
    [remember, setlist]
  );

  return {
    phase,
    currentItemId,
    position,
    runPosition,
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
