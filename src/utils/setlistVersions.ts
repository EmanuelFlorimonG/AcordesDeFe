import type { Setlist, SetlistItem, SetlistSongTransition } from '../types/setlist';
import { formatSetlistDate, formatSongCount } from './setlists';

/**
 * Two versions of one setlist, side by side, in the words somebody uses about
 * their own music.
 *
 * When the same setlist changed here and in the account, nobody can choose
 * between them without seeing what actually differs — and what differs is
 * never "a payload": it is the name, the day, which songs, in what order, in
 * what key, with which arrangement. So this reads both versions and says that
 * much, in plain Spanish, marking the lines that are not the same.
 *
 * It is a pure description. It compares nothing but what is portable — what
 * genuinely travels between devices — so the people assigned to sing on this
 * phone never show up as a difference with the account, because they are not
 * one.
 */

export interface VersionField {
  label: string;
  /** What this version says, already written out for reading. */
  mine: string;
  theirs: string;
  differs: boolean;
}

export interface VersionSong {
  /** Playing order, 1-based, which is the only thing that lines the two up. */
  position: number;
  /** The song's title, or null where that version has no song in this place. */
  mine: string | null;
  theirs: string | null;
  /** How it is played, on each side, for the lines that are not the same. */
  details: VersionField[];
  differs: boolean;
}

export interface SetlistVersionComparison {
  fields: VersionField[];
  songs: VersionSong[];
  /** True when the two versions read exactly the same, differing only inside. */
  identical: boolean;
}

const EMPTY = '—';

const field = (label: string, mine: string, theirs: string): VersionField => ({
  label,
  mine: mine || EMPTY,
  theirs: theirs || EMPTY,
  differs: mine !== theirs,
});

/** "Tono original", "2 semitonos más alto", "1 semitono más bajo". */
export function describeTranspose(steps: number): string {
  if (steps === 0) return 'Tono original';
  const amount = Math.abs(steps) === 1 ? '1 semitono' : `${Math.abs(steps)} semitonos`;
  return `${amount} más ${steps > 0 ? 'alto' : 'bajo'}`;
}

const describeCapo = (fret: number): string => (fret > 0 ? `Cejilla en el traste ${fret}` : 'Sin cejilla');

const TRANSITIONS: Record<SetlistSongTransition['type'], string> = {
  stop: 'termina y hay pausa',
  direct: 'entra directa en la siguiente',
  instrumental: 'sigue la música entre las dos',
  custom: 'como diga la indicación',
};

const describeTransition = (transition: SetlistSongTransition | undefined): string => {
  if (!transition) return 'Sin indicar';
  const how = TRANSITIONS[transition.type] ?? 'Sin indicar';
  return transition.instruction.trim() ? `${how} — ${transition.instruction.trim()}` : how;
};

/**
 * What the arrangement of one song amounts to, counted rather than listed: a
 * person choosing between two versions needs to know that the arrangement is
 * not the same, not to audit thirty blocks in a dialog.
 */
const describeArrangement = (item: SetlistItem): string => {
  const sections = item.arrangement?.sections ?? [];
  if (sections.length === 0) return 'Se toca como está escrita';
  const blocks = sections.length === 1 ? '1 bloque' : `${sections.length} bloques`;
  const named = sections.map((section) => section.label.trim()).filter(Boolean);
  return named.length ? `${blocks}: ${named.join(' · ')}` : blocks;
};

const describeRepeats = (item: SetlistItem): string => {
  const sections = item.arrangement?.sections ?? [];
  const jumps = sections.filter((section) => section.transition.type === 'jump').length;
  const repeats = sections.filter((section) => section.repeatCount > 1).length;
  const parts: string[] = [];
  if (repeats) parts.push(repeats === 1 ? '1 bloque repetido' : `${repeats} bloques repetidos`);
  if (jumps) parts.push(jumps === 1 ? '1 salto' : `${jumps} saltos`);
  return parts.join(', ');
};

/**
 * Both versions written out for reading, aligned by playing order.
 *
 * Position is what lines them up, because position is what somebody sees: the
 * third song of this version against the third song of that one. Where one
 * version is longer, the missing side is simply empty.
 */
export function compareSetlistVersions(
  mine: Setlist,
  theirs: Setlist,
  songTitle: (songId: string) => string
): SetlistVersionComparison {
  const fields = [
    field('Nombre', mine.name.trim(), theirs.name.trim()),
    field('Fecha', formatSetlistDate(mine.date, 'long'), formatSetlistDate(theirs.date, 'long')),
    field('Descripción', mine.description.trim(), theirs.description.trim()),
    field('Canciones', formatSongCount(mine.items.length), formatSongCount(theirs.items.length)),
  ];

  const songs: VersionSong[] = [];
  const total = Math.max(mine.items.length, theirs.items.length);
  for (let at = 0; at < total; at += 1) {
    const here = mine.items[at];
    const there = theirs.items[at];
    const details: VersionField[] = [];
    if (here && there) {
      const lines = [
        field('Momento', here.moment.trim(), there.moment.trim()),
        field('Tono', describeTranspose(here.transposeSteps), describeTranspose(there.transposeSteps)),
        field('Cejilla', describeCapo(here.capoFret), describeCapo(there.capoFret)),
        field('Arreglo', describeArrangement(here), describeArrangement(there)),
        field('Repeticiones y saltos', describeRepeats(here), describeRepeats(there)),
        field('Al terminar', describeTransition(here.transitionToNext), describeTransition(there.transitionToNext)),
        field('Notas', here.notes.trim(), there.notes.trim()),
      ];
      // Only what is not the same: a dialog that repeats the identical lines
      // of every song hides the one line somebody has to look at.
      details.push(...lines.filter((line) => line.differs));
    }
    const mineTitle = here ? songTitle(here.songId) : null;
    const theirsTitle = there ? songTitle(there.songId) : null;
    songs.push({
      position: at + 1,
      mine: mineTitle,
      theirs: theirsTitle,
      details,
      differs: mineTitle !== theirsTitle || details.length > 0,
    });
  }

  return {
    fields,
    songs,
    identical: !fields.some((entry) => entry.differs) && !songs.some((song) => song.differs),
  };
}
