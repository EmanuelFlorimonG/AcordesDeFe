import type { Setlist, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { resolveArrangement, type ResolvedArrangementSection } from './arrangement';
import { parseSongSections, transposeSongContent } from './chordParser';
import { describeKey, type KeyDescription } from './keySettings';
import { formatSetlistDate } from './setlists';
import { songHasChords } from './songSections';
import { describeTransition } from './setlistVersions';

/**
 * Un Setlist puesto en papel.
 *
 * Esto es lo que el ministerio reparte antes de una celebración: los momentos
 * en orden, qué se canta en cada uno y en qué tono. La plantilla de siempre.
 *
 * Aquí sólo se arma el documento; quién lo pinta y para quién es otra cosa.
 * Esa separación es a propósito: el mismo Setlist se reparte a dos personas
 * muy distintas. El músico necesita los acordes encima de la letra, la
 * cejilla y lo que diga el arreglo; quien canta necesita el momento, el
 * título, el tono y la letra, y nada más. Son dos hojas distintas del mismo
 * documento, no dos documentos, así que lo que las dos comparten —qué
 * canciones, en qué orden, en qué momento, en qué tono— se decide una sola
 * vez y aquí.
 *
 * Hoy sólo existe la hoja del músico. La de quien canta se añadirá pintando
 * este mismo documento de otra manera, sin volver a resolver nada.
 *
 * Nada de esto toca la canción: el cancionero se lee, jamás se modifica. El
 * tono y la cejilla son de esta ocasión y de nadie más.
 */

export const MINISTRY_NAME = 'Ministerio Acordes de Fe';

export interface SetlistDocumentEntry {
  /** Identidad de esta aparición: la misma canción puede ir dos veces. */
  itemId: string;
  /** El momento de la celebración: "Entrada", "Comunión"… Vacío si no se puso. */
  moment: string;
  title: string;
  artist: string;
  /**
   * La letra con sus acordes, ya transportada a lo que se va a tocar. Vacía
   * cuando este dispositivo no tiene la canción.
   */
  content: string;
  /** Qué tono suena, qué forma se toca con cejilla, y el original si cambió. */
  key: KeyDescription | null;
  transposeSteps: number;
  capoFret: number;
  tempo: number | null;
  timeSignature: string | null;
  /** Lo que alguien escribió para esta ocasión. */
  notes: string;
  /**
   * El arreglo de esta ocasión, resuelto y en el orden en que se toca, o null
   * cuando la canción se toca como está escrita.
   */
  arrangement: ResolvedArrangementSection[] | null;
  /** Qué hace la banda al terminar, ya en palabras. Null en la última. */
  transitionToNext: string | null;
  /** La canción no está en el cancionero de este dispositivo. */
  missing: boolean;
  /**
   * Si la letra trae acordes. Hay canciones del cancionero que todavía no los
   * tienen, y en una hoja para músicos eso hay que decirlo: si no, parece que
   * la impresión salió a medias.
   */
  hasChords: boolean;
}

export interface SetlistDocument {
  ministry: string;
  title: string;
  /** La fecha ya escrita para leer, o vacía si la celebración no tiene. */
  date: string;
  description: string;
  entries: SetlistDocumentEntry[];
}

/**
 * Una entrada del Setlist, con su canción tal como se va a tocar.
 *
 * El transporte se aplica al texto una sola vez y con la tonalidad original
 * como referencia, que es lo que hace que los acordes salgan escritos como
 * los espera un músico (Lab y no Sol#). La cejilla no cambia la letra: cambia
 * qué suena, y eso se dice en la cabecera.
 */
function entryOf(item: SetlistItem, song: Song | undefined, isLast: boolean): SetlistDocumentEntry {
  const content = song ? transposeSongContent(song.content, item.transposeSteps, song.originalKey) : '';
  const settings = { transposeSteps: item.transposeSteps, capoFret: item.capoFret };
  const sections = parseSongSections(content);

  return {
    itemId: item.id,
    moment: item.moment.trim(),
    title: song?.title ?? 'Canción no disponible',
    artist: song?.artist?.trim() ?? '',
    content,
    key: song ? describeKey(song.originalKey, settings, song.recommendedCapo ?? 0) : null,
    transposeSteps: item.transposeSteps,
    capoFret: item.capoFret,
    tempo: typeof song?.tempo === 'number' ? song.tempo : null,
    timeSignature: song?.timeSignature?.trim() || null,
    notes: item.notes.trim(),
    // El arreglo se resuelve contra la letra ya transportada, que tiene las
    // mismas secciones: transportar cambia los acordes, nunca la estructura.
    arrangement: item.arrangement ? resolveArrangement(sections, item.arrangement) : null,
    // Lo que pasa al terminar sólo significa algo mientras haya una siguiente.
    transitionToNext: isLast || !item.transitionToNext ? null : describeTransition(item.transitionToNext),
    missing: !song,
    hasChords: songHasChords(sections),
  };
}

/** El Setlist entero, listo para pintar en una hoja o en otra. */
export function buildSetlistDocument(setlist: Setlist, songsById: Map<string, Song>): SetlistDocument {
  return {
    ministry: MINISTRY_NAME,
    title: setlist.name.trim(),
    date: formatSetlistDate(setlist.date, 'long'),
    description: setlist.description.trim(),
    entries: setlist.items.map((item, at) =>
      entryOf(item, songsById.get(item.songId), at === setlist.items.length - 1)
    ),
  };
}
