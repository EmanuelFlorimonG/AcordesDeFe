import type { Setlist, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { describeKey } from './keySettings';
import { getFirstPlayableItem, getSetlistPosition, type SetlistPosition } from './setlists';

/**
 * Moving through a setlist while it is being played.
 *
 * Mass mode never builds its own idea of the order: it asks the setlist, with
 * the same rules the rest of the app already uses, so an entry whose song is
 * no longer in the songbook is skipped instead of breaking the celebration.
 */

export type MassPosition = SetlistPosition;

export function getMassPosition(
  setlist: Setlist,
  itemId: string,
  isPlayable: (item: SetlistItem) => boolean
): MassPosition | null {
  return getSetlistPosition(setlist, itemId, isPlayable);
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
  return getFirstPlayableItem(setlist, isPlayable)?.id ?? null;
}

export interface MassStop {
  item: SetlistItem;
  /** 1-based among the songs that can be played, or null when this one can't */
  position: number | null;
  isPlayable: boolean;
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
  let position = 0;
  return setlist.items.map((item) => {
    const playable = isPlayable(item);
    if (playable) position++;
    return { item, position: playable ? position : null, isPlayable: playable };
  });
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
