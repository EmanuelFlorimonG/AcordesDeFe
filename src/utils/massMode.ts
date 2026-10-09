import type { Setlist, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { describeKey } from './keySettings';
import { getFirstRunItem, getSetlistRunPosition, isBackupItem, type SetlistPosition } from './setlists';

/**
 * Moving through a setlist while it is being played.
 *
 * Mass mode never builds its own idea of the order: it asks the setlist, with
 * the same rules the rest of the app already uses, so an entry whose song is
 * no longer in the songbook is skipped instead of breaking the celebration.
 */

export type MassPosition = SetlistPosition;

/**
 * Dentro de su recorrido: el de la celebración, o el de la propia reserva
 * cuando se ha ido a buscar una, que es de una sola canción. Por eso la
 * celebración pasa de largo por las reservas y se acaba en su última canción.
 */
export function getMassPosition(
  setlist: Setlist,
  itemId: string,
  isPlayable: (item: SetlistItem) => boolean
): MassPosition | null {
  return getSetlistRunPosition(setlist, itemId, isPlayable);
}

/**
 * The entry mass mode should be showing: the one asked for when it can still
 * be played, and otherwise the first one that can. Null means there is nothing
 * to play at all, which is the only case the caller has to handle.
 */
export function resolveMassItemId(
  setlist: Setlist | null,
  itemId: string | null | undefined,
  isPlayable: (item: SetlistItem) => boolean
): string | null {
  if (!setlist) return null;
  if (itemId) {
    const wanted = setlist.items.find((item) => item.id === itemId);
    if (wanted && isPlayable(wanted)) return wanted.id;
  }
  return getFirstRunItem(setlist, isPlayable)?.id ?? null;
}

export interface MassStop {
  item: SetlistItem;
  /** 1-based within its own run, or null when this one can't be played */
  position: number | null;
  isPlayable: boolean;
  /** De reserva: se abre a mano, y la celebración no cae en ella sola */
  isBackup: boolean;
}

/**
 * Every entry of the setlist for the quick navigator: the ones that can be
 * played carry their number, and the ones that can't are still listed so
 * nobody wonders where a song went.
 */
export function listMassStops(
  setlist: Setlist,
  isPlayable: (item: SetlistItem) => boolean
): MassStop[] {
  // Cada recorrido cuenta desde uno: la reserva no continúa la numeración de
  // la celebración, porque no es su continuación.
  const counted = { run: 0, backup: 0 };
  return setlist.items.map((item) => {
    const playable = isPlayable(item);
    const backup = isBackupItem(item);
    if (playable) counted[backup ? 'backup' : 'run']++;
    return {
      item,
      position: playable ? counted[backup ? 'backup' : 'run'] : null,
      isPlayable: playable,
      isBackup: backup,
    };
  });
}

/**
 * Dónde va la celebración, que no es dónde está la canción abierta.
 *
 * Ir a buscar una reserva no adelanta la misa ni la empieza de nuevo: la
 * barra se queda donde estaba, en la última canción del recorrido que se
 * abrió. `lastRunItemId` es esa canción, y mientras no haya ninguna —una
 * reserva abierta antes de empezar— no hay avance que enseñar.
 */
export function runProgressPosition(
  setlist: Setlist,
  current: MassPosition | null,
  lastRunItemId: string | null,
  isPlayable: (item: SetlistItem) => boolean
): MassPosition | null {
  if (current && !isBackupItem(current.item)) return current;
  // Lo recordado también se comprueba: una sesión retomada puede venir de una
  // reserva, y una reserva nunca dice por dónde va la celebración.
  const remembered = lastRunItemId ? setlist.items.find((item) => item.id === lastRunItemId) : null;
  if (!remembered || isBackupItem(remembered)) return null;
  return getMassPosition(setlist, remembered.id, isPlayable);
}

/** How far along the setlist we are, as a fraction between 0 and 1. */
export function getMassProgress(position: MassPosition | null): number {
  if (!position || position.total === 0) return 0;
  return (position.index + 1) / position.total;
}

export interface MassKeyInfo {
  /** The key the chords on screen are written in */
  displayed: string;
  /** What the guitar actually sounds like, when the capo makes it differ */
  sounding: string | null;
  /** 0 when there is no capo, or when the chords are read on a piano */
  capoFret: number;
}

/**
 * The key of one entry, named exactly as the setlist and rehearsal mode name
 * it: the same calculator, so nothing ever disagrees about what is being sung.
 * On a piano the written chords already sound where they are read, so there is
 * no capo and no second key to show.
 */
export function getMassKey(
  song: Pick<Song, 'originalKey' | 'recommendedCapo'> | undefined,
  item: SetlistItem,
  isPiano = false
): MassKeyInfo | null {
  const description = song ? describeKey(song.originalKey, item, song.recommendedCapo ?? 0) : null;
  if (!description) return null;
  return {
    displayed: isPiano ? description.sounding : description.shape ?? description.sounding,
    sounding: !isPiano && description.shape ? description.sounding : null,
    capoFret: isPiano ? 0 : item.capoFret,
  };
}
