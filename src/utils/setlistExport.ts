import type { Setlist, SetlistItem } from '../types/setlist';
import type { Song } from '../types/song';
import { resolveArrangement, type ResolvedArrangementSection } from './arrangement';
import { parseSongSections, transposeSongContent } from './chordParser';
import { parseKey } from './chordTransposer';
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

/**
 * El tono como lo escribe el ministerio: Do, Re, Mi… y un guion para el
 * menor, igual que en las hojas que ya reparte («María mírame (Do)»,
 * «Oh Cordero (Mi-)»).
 *
 * Es sólo para el título de la canción. Los acordes encima de la letra
 * siguen en cifrado americano, que es como los lee un músico y como los
 * enseña la aplicación entera: C, G, Am. Las dos cosas conviven en la misma
 * hoja porque cada una se lee de una manera distinta.
 */
const LATIN = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'];
const LETTERS = 'CDEFGAB';

export function latinKeyName(key: string | undefined): string | null {
  const parsed = key ? parseKey(key) : null;
  if (!parsed) return null;
  const letter = LETTERS.indexOf(parsed.tonic[0].toUpperCase());
  if (letter === -1) return null;
  const accidental = parsed.tonic.slice(1).replace(/x/g, '##');
  return `${LATIN[letter]}${accidental}${parsed.isMinor ? '-' : ''}`;
}

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
  /** El tono que suena, escrito como en las hojas: "Do", "Mi-". */
  latinKey: string | null;
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

/**
 * Un momento de la celebración con lo que se canta en él.
 *
 * Van agrupadas a propósito: en las hojas del ministerio el momento se
 * escribe una vez y debajo pueden ir dos o tres canciones. Sólo se agrupan
 * las seguidas, porque el orden del Setlist es el orden en que se canta y
 * juntar dos «Comunión» separadas por una «Paz» cambiaría la celebración.
 */
export interface SetlistDocumentMoment {
  /** "ENTRADA", "COMUNIÓN"… Vacío para lo que nadie situó en un momento. */
  moment: string;
  entries: SetlistDocumentEntry[];
}

export interface SetlistDocument {
  ministry: string;
  title: string;
  /** La fecha ya escrita para leer, o vacía si la celebración no tiene. */
  date: string;
  description: string;
  /** Todo lo que se canta, en orden, agrupado por momento. */
  moments: SetlistDocumentMoment[];
  /** Lo mismo sin agrupar, para quien sólo necesite la lista. */
  entries: SetlistDocumentEntry[];
}

/** Las canciones seguidas que comparten momento van bajo una sola cabecera. */
function groupByMoment(entries: SetlistDocumentEntry[]): SetlistDocumentMoment[] {
  const moments: SetlistDocumentMoment[] = [];
  for (const entry of entries) {
    const last = moments[moments.length - 1];
    if (last && last.moment === entry.moment) last.entries.push(entry);
    else moments.push({ moment: entry.moment, entries: [entry] });
  }
  return moments;
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
  const key = song ? describeKey(song.originalKey, settings, song.recommendedCapo ?? 0) : null;

  return {
    itemId: item.id,
    moment: item.moment.trim().toLocaleUpperCase('es'),
    title: song?.title ?? 'Canción no disponible',
    artist: song?.artist?.trim() ?? '',
    content,
    key,
    latinKey: latinKeyName(key?.sounding),
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
  const entries = setlist.items.map((item, at) =>
    entryOf(item, songsById.get(item.songId), at === setlist.items.length - 1)
  );
  return {
    ministry: MINISTRY_NAME,
    title: setlist.name.trim(),
    date: formatSetlistDate(setlist.date, 'long'),
    description: setlist.description.trim(),
    moments: groupByMoment(entries),
    entries,
  };
}
