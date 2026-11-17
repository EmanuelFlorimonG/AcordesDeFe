import type {
  Setlist,
  SetlistArrangement,
  SetlistDetails,
  SetlistItem,
  SetlistKind,
  SetlistSongTransition,
} from '../types/setlist';
import type { Song } from '../types/song';
import { MAX_CAPO, MIN_CAPO, moveCapoBy, normalizeKeySettings, transposeBy } from './keySettings';
import { createId, type IdFactory } from './createId';
import { isValidIsoDate, toLocalIsoDate } from './dates';
import { duplicateArrangement, normalizeMemberIds, removeMemberFromArrangement } from './arrangement';

// Re-exported so everything that already builds setlists keeps one import.
export { createId };
export type { IdFactory };

/**
 * Setlist operations as pure functions: every change returns a new setlist
 * and never touches a song. Persistence and interface sit on top of these, so
 * storage can later move to an API without changing any of this.
 */

export const MAX_SETLIST_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_MOMENT_LENGTH = 40;
export const MAX_NOTES_LENGTH = 500;

/** The parts of a Mass, in the order they are sung. */
export const MASS_MOMENTS = [
  'Entrada',
  'Piedad',
  'Gloria',
  'Aclamación',
  'Ofertorio',
  'Santo',
  'Cordero',
  'Comunión',
  'PostComunión',
  'Salida',
];

/**
 * Las partes de una adoración, en el orden en que se viven.
 *
 * No son categorías de canción: una misma canción vale para la alabanza de una
 * adoración y para la comunión de una misa sin tener que llamarse de otra
 * forma. Son los nombres que se ofrecen al escribir el momento de cada entrada.
 */
export const ADORATION_MOMENTS = [
  'Entrada del Señor',
  'Momento de alabanza',
  'Peticiones al Espíritu Santo',
  'Momento de gracia',
  'Procesión',
  'Salida',
];

/** Los ocho momentos del Rosario de la Aurora, en su orden de celebración. */
export const ROSARY_MOMENTS = [
  'Llegada del Señor',
  'Invocación del Espíritu Santo',
  '1er Misterio',
  '2do Misterio',
  '3er Misterio',
  '4to Misterio',
  '5to Misterio',
  'Salida',
];

/**
 * Las partes de una boda celebrada dentro de una misa, en su orden real.
 *
 * No es una misa con dos añadidos: es el orden con el que se prepara una boda,
 * tal como se vivió en la que sirvió de modelo. Por eso el Evangelio aparece
 * aquí y no en MASS_MOMENTS —en una boda hay que cantar antes de los votos, y
 * ese momento tiene nombre—, y por eso la firma y el ramo a la Virgen están
 * entre la comunión y la salida, que es donde ocurren.
 *
 * Es el punto de partida, no una obligación: cada boda puede renombrar, mover,
 * añadir y quitar sus secciones (ver `sectionsOf`).
 */
export const WEDDING_MOMENTS = [
  'Entrada',
  'Piedad',
  'Gloria',
  'Evangelio',
  'Votos',
  'Ofertorio',
  'Santo',
  'Cordero',
  'Comunión',
  'Firmadera',
  'Ofrecer el ramo a la Virgen',
  'Salida',
];

/**
 * Las de una boda sin misa.
 *
 * Son las mismas quitando lo que sólo existe dentro de una misa: el Piedad y
 * el Gloria del ordinario, y el Ofertorio, el Santo, el Cordero y la Comunión,
 * que son la liturgia eucarística. No se inventa nada para rellenar su hueco:
 * lo que queda es la palabra, el consentimiento y lo que lo rodea.
 */
export const WEDDING_NO_MASS_MOMENTS = [
  'Entrada',
  'Evangelio',
  'Votos',
  'Firmadera',
  'Ofrecer el ramo a la Virgen',
  'Salida',
];

/**
 * Las canciones de reserva de una celebración.
 *
 * No es una parte de la misa ni de una adoración: es lo que se tiene a mano
 * por si la comunión se alarga o queda un hueco. Por eso se ofrece en las dos,
 * se apunta donde haga falta buscarla, y el recorrido en vivo no entra en ella
 * sola: se va a buscarla cuando hace falta.
 */
export const BACKUP_MOMENT = 'Backup';

/**
 * Si una entrada del Setlist es de reserva.
 *
 * Lo dice la entrada (`backup`), no cómo se llame su sección hoy. Así,
 * renombrar la sección de reserva, moverla a otro sitio o quitarla no mete sus
 * canciones en el recorrido, ni en la duración, ni en la numeración.
 *
 * El nombre sigue valiendo como segunda vía, y por dos motivos: los Setlists
 * guardados antes de que esto existiera no tienen la marca, y una sección que
 * alguien llama «Backup» es una reserva lo diga quien lo diga.
 */
export const isBackupItem = (item: Pick<SetlistItem, 'moment' | 'backup'>): boolean =>
  item.backup === true || item.moment === BACKUP_MOMENT;

/** Cuál de las secciones de este Setlist es la reserva. */
export const backupMomentOf = (setlist: Pick<Setlist, 'backupMoment'>): string =>
  setlist.backupMoment ?? BACKUP_MOMENT;

/** Lo que una entrada añadida a este momento es: reserva, o no. */
const backupFlagFor = (setlist: Pick<Setlist, 'backupMoment'>, moment: string) =>
  moment === backupMomentOf(setlist) ? ({ backup: true } as const) : {};

/**
 * Cómo se llama el modo en vivo de este Setlist.
 *
 * Es el mismo modo: la misma pantalla, los mismos controles, el mismo camino.
 * Lo único que cambia es la palabra, porque llamarle «Modo Misa» a una
 * adoración es decirle a alguien que está en otra cosa.
 */
export const liveModeName = (kind: SetlistKind | undefined): string =>
  isWeddingKind(kind)
    ? 'Modo Boda'
    : kind === 'rosario-aurora'
      ? 'Modo Rosario'
      : kind === 'adoracion'
        ? 'Modo Adoración'
        : 'Modo Misa';

/** Las dos modalidades de boda, que comparten todo menos qué partes traen. */
export const isWeddingKind = (kind: SetlistKind | undefined): boolean =>
  kind === 'boda' || kind === 'boda-sin-misa';

/**
 * Si esta celebración se prepara por secciones.
 *
 * Las que sí traen un orden propio: las canciones se añaden a una sección y se
 * leen agrupadas bajo ella, y una sección sin canciones se sigue viendo. Las
 * que no —una misa, una adoración— son una lista seguida, como siempre.
 */
export const hasSections = (kind: SetlistKind | undefined): boolean =>
  kind === 'rosario-aurora' || isWeddingKind(kind);

/**
 * Los momentos que trae cada tipo de celebración.
 *
 * La reserva va detrás de todos, porque no es una parte más: es lo que se
 * guarda para cuando la celebración lo pida.
 */
export function momentsFor(kind: SetlistKind | undefined): string[] {
  if (kind === 'rosario-aurora') return [...ROSARY_MOMENTS];
  if (isWeddingKind(kind)) {
    return [...(kind === 'boda-sin-misa' ? WEDDING_NO_MASS_MOMENTS : WEDDING_MOMENTS), BACKUP_MOMENT];
  }
  return [...(kind === 'adoracion' ? ADORATION_MOMENTS : MASS_MOMENTS), BACKUP_MOMENT];
}

/**
 * Las secciones de un Setlist concreto, en orden.
 *
 * Las suyas si alguien las ha tocado, y si no las de su tipo. Todo lo que
 * agrupa, ordena y ofrece momentos pasa por aquí, para que una sección
 * renombrada lo esté en todas partes a la vez.
 */
export const sectionsOf = (setlist: Pick<Setlist, 'kind' | 'moments'>): string[] =>
  setlist.moments ? [...setlist.moments] : momentsFor(setlist.kind);

/**
 * Moments offered as suggestions; any other text can be typed.
 *
 * Los de la celebración que se prepara van primero, y detrás los de siempre,
 * porque un ensayo o un retiro no son ninguna de las dos cosas.
 */
export function suggestedMoments(kind: SetlistKind | undefined): string[] {
  if (hasSections(kind)) return momentsFor(kind);
  return [...new Set([...momentsFor(kind), 'Apertura', 'Adoración', 'Reflexión', 'Dinámica', 'Cierre'])];
}

/** Stable within a moment; Mass and Adoration retain their manually chosen order. */
export function orderSetlistItems(
  setlist: Pick<Setlist, 'kind' | 'moments'> | undefined,
  items: SetlistItem[]
): SetlistItem[] {
  if (!setlist || !hasSections(setlist.kind)) return items;
  const names = [...new Set([...sectionsOf(setlist), ...items.map((item) => item.moment)])];
  const rank = (moment: string) => names.indexOf(moment);
  return [...items].sort((a, b) => rank(a.moment) - rank(b.moment));
}

/** Empty moments stay visible; custom/unassigned entries are never lost. */
export function groupSetlistItems(setlist: Setlist): Array<{ moment: string; items: SetlistItem[] }> {
  const names = [...new Set([...sectionsOf(setlist), ...setlist.items.map(item => item.moment)])];
  return names.map(moment => ({ moment, items: setlist.items.filter(item => item.moment === moment) }));
}

// ---------------------------------------------------------------------------
// Las secciones de un Setlist
// ---------------------------------------------------------------------------

/** Cuántas secciones admite un Setlist. De sobra para una boda larga. */
export const MAX_SECTIONS = 40;

/** Una sección es un texto corto, sin repetirse y sin huecos. */
export function cleanSections(names: unknown): string[] {
  if (!Array.isArray(names)) return [];
  const clean: string[] = [];
  for (const name of names) {
    if (typeof name !== 'string') continue;
    const value = name.trim().slice(0, MAX_MOMENT_LENGTH);
    // Dos secciones con el mismo nombre serían el mismo grupo: agrupar es por
    // el texto. La segunda no se pierde, simplemente ya estaba.
    if (value && !clean.includes(value)) clean.push(value);
    if (clean.length === MAX_SECTIONS) break;
  }
  return clean;
}

/**
 * Deja escritas estas secciones, en este orden.
 *
 * A partir de aquí el Setlist tiene las suyas: lo que diga su tipo deja de
 * importarle. Las canciones no se tocan —una canción de una sección que ya no
 * está sigue en el Setlist, con su momento escrito— y se reordenan para que la
 * lista siga el orden nuevo.
 */
export function setSetlistSections(setlist: Setlist, names: string[], now: number): Setlist {
  const moments = cleanSections(names);
  if (moments.length === 0) throw new Error('Un Setlist necesita al menos una sección.');
  const next = { ...setlist, moments };
  return { ...next, items: orderSetlistItems(next, setlist.items), updatedAt: now };
}

/** Una sección más, al final. Si ya existía, no hay nada que hacer. */
export function addSetlistSection(setlist: Setlist, name: string, now: number): Setlist {
  const sections = sectionsOf(setlist);
  const value = name.trim().slice(0, MAX_MOMENT_LENGTH);
  if (!value || sections.includes(value)) return setlist;
  return setSetlistSections(setlist, [...sections, value], now);
}

/**
 * Cambia el nombre de una sección, y con ella el de las canciones que estaban
 * escritas en ella: son la misma sección, sólo que ahora se llama de otra forma.
 */
export function renameSetlistSection(setlist: Setlist, from: string, to: string, now: number): Setlist {
  const sections = sectionsOf(setlist);
  const value = to.trim().slice(0, MAX_MOMENT_LENGTH);
  if (!value || from === value || !sections.includes(from)) return setlist;
  // Renombrar a una que ya existe uniría dos secciones sin decirlo.
  if (sections.includes(value)) return setlist;
  const renamed = setSetlistSections(setlist, sections.map((name) => (name === from ? value : name)), now);
  // La reserva sigue siendo la reserva aunque pase a llamarse de otra forma.
  // Y si la que se renombra es otra, la reserva tampoco se mueve de sitio.
  const conReserva: Setlist =
    backupMomentOf(setlist) === from ? { ...renamed, backupMoment: value } : renamed;
  return {
    ...conReserva,
    items: orderSetlistItems(
      conReserva,
      conReserva.items.map((item) =>
        item.moment === from
          ? { ...item, moment: value, ...backupFlagFor(conReserva, value) }
          : item
      )
    ),
  };
}

/** Mueve una sección arriba (-1) o abajo (+1), con las canciones que lleve dentro. */
export function moveSetlistSection(setlist: Setlist, name: string, delta: number, now: number): Setlist {
  const sections = sectionsOf(setlist);
  const from = sections.indexOf(name);
  if (from < 0) return setlist;
  const to = from + Math.round(delta);
  if (to < 0 || to >= sections.length || to === from) return setlist;
  const moved = [...sections];
  moved.splice(to, 0, ...moved.splice(from, 1));
  return setSetlistSections(setlist, moved, now);
}

/**
 * Quita una sección.
 *
 * Sus canciones se quedan en el Setlist, sin sección: quitar una parte de la
 * celebración no es quitar lo que se iba a cantar en ella, y recuperarlas sería
 * imposible. Aparecen agrupadas bajo «Sin momento» hasta que alguien las mueva.
 *
 * Y lo que eran lo siguen siendo: las reservas de una sección de reserva que se
 * quita siguen fuera del recorrido, porque quitar una sección no es decidir que
 * esas canciones ahora se cantan.
 */
export function removeSetlistSection(setlist: Setlist, name: string, now: number): Setlist {
  const sections = sectionsOf(setlist);
  if (!sections.includes(name) || sections.length === 1) return setlist;
  const left = setSetlistSections(setlist, sections.filter((section) => section !== name), now);
  return {
    ...left,
    items: orderSetlistItems(
      left,
      left.items.map((item) => (item.moment === name ? { ...item, moment: '' } : item))
    ),
  };
}

/** Cuántas canciones hay escritas en una sección. */
export const countSectionItems = (setlist: Setlist, name: string): number =>
  setlist.items.filter((item) => item.moment === name).length;

export interface SongCategoryCount {
  name: string;
  count: number;
  /** True for the parts of the Mass, which have an order of their own */
  isMassMoment: boolean;
}

/**
 * The categories the songbook actually uses: the parts of the Mass first, in
 * the order they are sung, then the rest (themes and styles) by how many songs
 * carry them. Nothing is invented: a part with no songs simply isn't offered.
 */
export function listSongCategories(songs: Array<Pick<Song, 'categories'>>): SongCategoryCount[] {
  const counts = new Map<string, number>();
  for (const song of songs) {
    for (const category of song.categories) {
      const name = category.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  const massMoments = MASS_MOMENTS.filter((name) => counts.has(name)).map((name) => ({
    name,
    count: counts.get(name) ?? 0,
    isMassMoment: true,
  }));

  const others = [...counts.entries()]
    .filter(([name]) => !MASS_MOMENTS.includes(name))
    .map(([name, count]) => ({ name, count, isMassMoment: false }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

  return [...massMoments, ...others];
}


interface ChangeOptions {
  now: number;
  createId?: IdFactory;
}

type SongForSetlist = Pick<Song, 'id' | 'recommendedCapo'>;

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// isValidIsoDate and toLocalIsoDate live with the other date helpers; they
// are re-exported here because setlists have always offered them.
export { isValidIsoDate, toLocalIsoDate };

/** "20 sep 2026" */
export function formatSetlistDate(isoDate: string, style: 'short' | 'long' = 'short'): string {
  if (!isValidIsoDate(isoDate)) return '';
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: style === 'long' ? 'long' : 'short',
    year: 'numeric',
    ...(style === 'long' ? { weekday: 'long' } : {}),
  })
    .format(new Date(year, month - 1, day))
    .replace('.', '');
}

// ---------------------------------------------------------------------------
// Setlists
// ---------------------------------------------------------------------------

export function cleanSetlistDetails(details: Partial<SetlistDetails>): SetlistDetails {
  const date = (details.date ?? '').trim();
  return {
    name: (details.name ?? '').trim().slice(0, MAX_SETLIST_NAME_LENGTH),
    date: isValidIsoDate(date) ? date : '',
    description: (details.description ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH),
  };
}

/** Los tipos conocidos se conservan; misa y valores desconocidos mantienen el formato histórico. */
export const readSetlistKind = (value: unknown): SetlistKind | undefined =>
  value === 'adoracion' || value === 'rosario-aurora' || value === 'boda' || value === 'boda-sin-misa'
    ? value
    : undefined;

export function createSetlist(details: Partial<SetlistDetails>, { now, createId: makeId = createId }: ChangeOptions): Setlist {
  const clean = cleanSetlistDetails(details);
  if (!clean.name) throw new Error('Un setlist necesita un nombre.');
  const kind = readSetlistKind(details.kind);
  return {
    id: makeId(),
    ...clean,
    // Una misa no lo dice: es lo que siempre fue, y así un Setlist nuevo se
    // guarda y viaja exactamente igual que los que ya existían.
    ...(kind ? { kind } : {}),
    participantIds: [],
    items: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function updateSetlistDetails(setlist: Setlist, details: Partial<SetlistDetails>, now: number): Setlist {
  const clean = cleanSetlistDetails({
    name: details.name ?? setlist.name,
    date: details.date ?? setlist.date,
    description: details.description ?? setlist.description,
  });
  if (!clean.name) throw new Error('Un setlist necesita un nombre.');
  // El tipo no se edita aquí: cambiarlo renombraría momentos ya escritos, y
  // eso lo decide una persona, no un formulario de nombre y fecha.
  return { ...setlist, ...clean, updatedAt: now };
}

/**
 * El id que tendrá la copia de un Setlist que llegó por un enlace.
 *
 * No es azar: sale del id del Setlist original, así que dos copias del mismo
 * enlace chocan entre sí y una sola de ellas puede existir con ese id. Eso es
 * lo que permite avisar «ya guardaste este» en cualquier dispositivo y en
 * cualquier sesión, sin columnas nuevas y sin guardar nada aparte: la pista
 * va dentro de la clave primaria, que es lo único que viaja seguro.
 *
 * Y es lo que hace seguro reintentar. Si una subida llegó a Supabase pero la
 * respuesta se perdió, el segundo intento escribe el mismo id, choca con la
 * clave primaria y vuelve como conflicto en vez de dejar dos copias.
 *
 * El id del original no es un secreto: viaja en el enlace y no abre nada por
 * sí mismo —leer una fila ajena exige el token, y editarla exige ser su
 * dueño—. El token, que sí es el secreto, no se escribe en ninguna parte.
 *
 * `attempt` es para cuando alguien quiere una segunda copia a sabiendas.
 *
 * Devuelve null cuando el id del original es tan largo que no deja sitio: un
 * Setlist hecho por esta aplicación nunca llega ahí —un UUID son 36 letras—,
 * pero la columna admite hasta 64 y más vale no poder copiar uno que copiarlo
 * encima de otro.
 */
export const SHARED_COPY_PREFIX = 'copia-';
/** Lo que admite la columna `id` de `setlists`: de 8 a 64, sin espacios. */
const MAX_SETLIST_ID = 64;
/** Lo que puede ocupar el «-99» de una copia voluntaria. */
const MAX_COPY_SUFFIX = 3;
const MAX_COPIES = 99;

export function sharedCopyId(originalId: string, attempt = 1): string | null {
  if (!Number.isInteger(attempt) || attempt < 1 || attempt > MAX_COPIES) return null;
  const base = `${SHARED_COPY_PREFIX}${originalId}`;
  // Nada se recorta. Recortar haría que dos originales que empiezan igual
  // acabaran con el mismo id, y dos Setlists distintos compartiendo id es
  // peor que no poder copiar uno: el segundo pisaría al primero y nadie se
  // enteraría. Si no cabe entero, no hay copia, y se dice.
  if (base.length + MAX_COPY_SUFFIX > MAX_SETLIST_ID) return null;
  return attempt > 1 ? `${base}-${attempt}` : base;
}

/**
 * La copia de un Setlist que llegó por un enlace, para la cuenta de quien la
 * guarda.
 *
 * Lo que se canta viaja entero: canciones, orden, momentos, reservas, tonos,
 * cejillas, notas, arreglos con sus saltos ya reescritos, y las transiciones.
 * Lo que es de otros no viaja: ni el equipo del coro original ni quién cantaba
 * cada bloque. El enlace tampoco los enseña, así que esto no quita nada que se
 * pudiera ver; lo deja dicho en el código para que siga siendo verdad aunque
 * algún día el enlace enseñe más.
 *
 * El original no se toca: lo que entra se lee y no se escribe.
 */
export function copySharedSetlist(
  shared: Setlist,
  { now, createId: makeId = createId, attempt = 1 }: ChangeOptions & { attempt?: number }
): Setlist {
  const id = sharedCopyId(shared.id, attempt);
  if (!id) throw new Error('El id de este Setlist no deja sitio para una copia.');
  const copy = duplicateSetlist(shared, {}, { now, createId: makeId });
  return {
    ...copy,
    id,
    // De quien la guarda, no del coro de quien la compartió.
    participantIds: [],
    items: copy.items.map((item) =>
      item.arrangement
        ? {
            ...item,
            arrangement: {
              ...item.arrangement,
              sections: item.arrangement.sections.map((section) => {
                const suya = { ...section };
                delete suya.assignedMemberIds;
                return suya;
              }),
            },
          }
        : item
    ),
  };
}

/**
 * A copy with the same songs, order, keys, capos, moments and notes, but new
 * ids everywhere, so editing the copy never affects the original.
 */
export function duplicateSetlist(
  setlist: Setlist,
  details: Partial<SetlistDetails>,
  { now, createId: makeId = createId }: ChangeOptions
): Setlist {
  const copy = createSetlist(
    {
      name: details.name ?? setlist.name,
      date: details.date ?? setlist.date,
      description: details.description ?? setlist.description,
    },
    { now, createId: makeId }
  );
  return {
    ...copy,
    // La copia de una adoración sigue siendo una adoración, y la de una boda
    // conserva las secciones que alguien preparó para ella: duplicar un Setlist
    // es sobre todo reaprovechar su orden.
    ...(setlist.kind ? { kind: setlist.kind } : {}),
    ...(setlist.moments ? { moments: [...setlist.moments] } : {}),
    ...(setlist.backupMoment ? { backupMoment: setlist.backupMoment } : {}),
    // Same ministry, same people: the team is kept (as a list of its own).
    participantIds: [...setlist.participantIds],
    items: setlist.items.map((item) => ({
      ...item,
      id: makeId(),
      // The arrangement is copied whole, with ids of its own, so the two
      // setlists can be changed apart and the jumps of the copy point at the
      // copy's own sections.
      ...(item.arrangement ? { arrangement: duplicateArrangement(item.arrangement, makeId) } : {}),
      // A copy of its own, so editing one setlist never reaches the other.
      ...(item.transitionToNext ? { transitionToNext: { ...item.transitionToNext } } : {}),
    })),
  };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** A song as it enters a setlist: its own key and recommended capo. */
export function createSetlistItem(
  song: SongForSetlist,
  makeId: IdFactory = createId,
  moment = '',
  // Qué Setlist la recibe, que es lo que dice si ese momento es la reserva.
  setlist: Pick<Setlist, 'backupMoment'> = {}
): SetlistItem {
  const clean = moment.trim().slice(0, MAX_MOMENT_LENGTH);
  return {
    id: makeId(),
    songId: song.id,
    moment: clean,
    ...backupFlagFor(setlist, clean),
    ...normalizeKeySettings({ transposeSteps: 0, capoFret: song.recommendedCapo ?? 0 }),
    notes: '',
  };
}

export function addSongsToSetlist(
  setlist: Setlist,
  songs: SongForSetlist[],
  // `moment` marks the songs as they are added, for when they are chosen by
  // the part of the Mass they are for.
  { now, createId: makeId = createId, moment = '' }: ChangeOptions & { moment?: string }
): Setlist {
  if (songs.length === 0) return setlist;
  return {
    ...setlist,
    items: orderSetlistItems(setlist, [...setlist.items, ...songs.map((song) => createSetlistItem(song, makeId, moment, setlist))]),
    updatedAt: now,
  };
}

export function removeSetlistItem(setlist: Setlist, itemId: string, now: number): Setlist {
  if (!setlist.items.some((item) => item.id === itemId)) return setlist;
  return { ...setlist, items: setlist.items.filter((item) => item.id !== itemId), updatedAt: now };
}

/**
 * Moves an entry to a position in the list (clamped to the list).
 *
 * La reserva no tiene sitio fijo: se coloca donde quien prepara la quiera, y
 * se mueve como cualquier otra. Lo que la distingue es que la celebración no
 * entra en ella sola, no dónde está escrita.
 */
export function moveSetlistItem(setlist: Setlist, itemId: string, toIndex: number, now: number): Setlist {
  const from = setlist.items.findIndex((item) => item.id === itemId);
  if (from < 0) return setlist;
  const target = Math.max(0, Math.min(setlist.items.length - 1, Math.round(toIndex)));
  if (target === from) return setlist;
  const items = [...setlist.items];
  const [moved] = items.splice(from, 1);
  items.splice(target, 0, moved);
  return { ...setlist, items: orderSetlistItems(setlist, items), updatedAt: now };
}

/** Moves an entry up (-1) or down (+1). */
export function moveSetlistItemBy(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const from = setlist.items.findIndex((item) => item.id === itemId);
  return from < 0 ? setlist : moveSetlistItem(setlist, itemId, from + delta, now);
}

export interface SetlistItemChanges {
  moment?: string;
  notes?: string;
  transposeSteps?: number;
  capoFret?: number;
  /** An arrangement to store, or null to go back to the song as it is written. */
  arrangement?: SetlistArrangement | null;
  /** How this song goes into the next one, or null to leave it unsaid. */
  transitionToNext?: SetlistSongTransition | null;
}

export function updateSetlistItem(
  setlist: Setlist,
  itemId: string,
  changes: SetlistItemChanges,
  now: number
): Setlist {
  if (!setlist.items.some((item) => item.id === itemId)) return setlist;
  return {
    ...setlist,
    items: orderSetlistItems(setlist, setlist.items.map((item) => {
      if (item.id !== itemId) return item;
      const keySettings = normalizeKeySettings({
        transposeSteps: changes.transposeSteps ?? item.transposeSteps,
        capoFret: changes.capoFret ?? item.capoFret,
      });
      const { arrangement: current, transitionToNext: currentTransition, backup: _era, ...rest } = item;
      const arrangement = changes.arrangement === undefined ? current : changes.arrangement;
      const transitionToNext =
        changes.transitionToNext === undefined ? currentTransition : changes.transitionToNext;
      const moment = (changes.moment ?? item.moment).trim().slice(0, MAX_MOMENT_LENGTH);
      return {
        ...rest,
        ...keySettings,
        moment,
        // Cambiar de sección es lo único que cambia si una canción es reserva
        // o no. Sacarla de la reserva la devuelve al recorrido, y meterla la
        // saca, diga lo que diga lo que estaba escrito antes.
        ...backupFlagFor(setlist, moment),
        notes: (changes.notes ?? item.notes).trim().slice(0, MAX_NOTES_LENGTH),
        // Absent, not empty: an entry with no arrangement is played as written.
        ...(arrangement ? { arrangement } : {}),
        ...(transitionToNext ? { transitionToNext } : {}),
      };
    })),
    updatedAt: now,
  };
}

/** Raises or lowers the sound of one entry by semitones; the song is untouched. */
export function transposeSetlistItem(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const item = setlist.items.find((candidate) => candidate.id === itemId);
  if (!item) return setlist;
  const next = transposeBy(item, delta);
  return next === item ? setlist : updateSetlistItem(setlist, itemId, next, now);
}

/** Moves the capo of one entry, keeping what sounds (reactive capo). */
export function moveSetlistItemCapo(setlist: Setlist, itemId: string, delta: number, now: number): Setlist {
  const item = setlist.items.find((candidate) => candidate.id === itemId);
  if (!item) return setlist;
  const next = moveCapoBy(item, delta);
  return next === item ? setlist : updateSetlistItem(setlist, itemId, next, now);
}

export { MAX_CAPO, MIN_CAPO };

// ---------------------------------------------------------------------------
// Playing through a setlist
// ---------------------------------------------------------------------------

export interface SetlistPosition {
  item: SetlistItem;
  /** 0-based among playable entries */
  index: number;
  total: number;
  previous: SetlistItem | null;
  next: SetlistItem | null;
  isFirst: boolean;
  isLast: boolean;
}

/**
 * Where an entry sits in the setlist. Entries whose song can't be opened (for
 * example a song removed from the songbook) are skipped, so previous and next
 * always lead to something playable. The last entry has no next: a setlist
 * ends, it doesn't loop.
 */
export function getSetlistPosition(
  setlist: Setlist,
  itemId: string,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistPosition | null {
  const playable = setlist.items.filter(isPlayable);
  const index = playable.findIndex((item) => item.id === itemId);
  if (index < 0) return null;
  return {
    item: playable[index],
    index,
    total: playable.length,
    previous: playable[index - 1] ?? null,
    next: playable[index + 1] ?? null,
    isFirst: index === 0,
    isLast: index === playable.length - 1,
  };
}

export function getFirstPlayableItem(
  setlist: Setlist,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistItem | null {
  return setlist.items.find(isPlayable) ?? null;
}

/**
 * Las entradas que se recorren junto a ésta.
 *
 * El recorrido de una celebración son sus canciones, y ninguna de reserva,
 * estén donde estén escritas: después de la Comunión viene la PostComunión
 * aunque en medio haya una reserva apuntada.
 *
 * Y una reserva es un recorrido de una sola canción: se abre a mano desde el
 * navegador y no lleva a ninguna parte, ni de vuelta a la celebración ni a
 * otra reserva. Lo siguiente lo decide quien canta, no el programa.
 */
export function sameRun(
  item: SetlistItem,
  isPlayable: (entry: SetlistItem) => boolean = () => true
): (entry: SetlistItem) => boolean {
  if (isBackupItem(item)) return (entry) => entry.id === item.id;
  return (entry) => isPlayable(entry) && !isBackupItem(entry);
}

/** Dónde está una entrada dentro de su propio recorrido. */
export function getSetlistRunPosition(
  setlist: Setlist,
  itemId: string,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistPosition | null {
  const item = setlist.items.find((entry) => entry.id === itemId);
  return item ? getSetlistPosition(setlist, itemId, sameRun(item, isPlayable)) : null;
}

/** Por dónde se empieza: la primera del recorrido, nunca una de reserva. */
export function getFirstRunItem(
  setlist: Setlist,
  isPlayable: (item: SetlistItem) => boolean = () => true
): SetlistItem | null {
  return (
    setlist.items.find((item) => isPlayable(item) && !isBackupItem(item)) ??
    getFirstPlayableItem(setlist, isPlayable)
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export interface DurationSummary {
  songCount: number;
  /** Sum of the durations that are actually known */
  knownSeconds: number;
  /** Entries whose duration isn't known */
  unknownCount: number;
}

/**
 * Cuánto dura la celebración. La reserva no cuenta: son las que quizá no se
 * canten, y sumarlas daría una misa más larga de la que se ha preparado.
 */
export function summarizeSetlistDuration(setlist: Setlist, durations: Record<string, number>): DurationSummary {
  const items = setlist.items.filter((item) => !isBackupItem(item));
  let knownSeconds = 0;
  let unknownCount = 0;
  for (const item of items) {
    const seconds = durations[item.songId];
    if (typeof seconds === 'number' && seconds > 0) knownSeconds += seconds;
    else unknownCount++;
  }
  return { songCount: items.length, knownSeconds, unknownCount };
}

/** "~24 min", "~24 min + 2 sin duración", or "Duración desconocida". Never a guess. */
export function formatDurationSummary(summary: DurationSummary): string {
  if (summary.songCount === 0) return '';
  if (summary.knownSeconds === 0) return 'Duración desconocida';
  const minutes = Math.max(1, Math.round(summary.knownSeconds / 60));
  const missing =
    summary.unknownCount > 0
      ? ` + ${summary.unknownCount} ${summary.unknownCount === 1 ? 'canción' : 'canciones'} sin duración`
      : '';
  return `~${minutes} min${missing}`;
}

export function formatSongCount(count: number): string {
  return `${count} ${count === 1 ? 'canción' : 'canciones'}`;
}

/**
 * Upcoming: dated today or later, soonest first. Recent: everything else,
 * newest date first, and setlists without a date by last change.
 */
export function groupSetlistsByDate(setlists: Setlist[], todayIso: string): { upcoming: Setlist[]; recent: Setlist[] } {
  const upcoming = setlists
    .filter((setlist) => setlist.date && setlist.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date) || b.updatedAt - a.updatedAt);
  const recent = setlists
    .filter((setlist) => !setlist.date || setlist.date < todayIso)
    .sort((a, b) => {
      if (a.date && b.date) return b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt;
      if (a.date !== b.date) return a.date ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });
  return { upcoming, recent };
}

// ---------------------------------------------------------------------------
// The team of a setlist
// ---------------------------------------------------------------------------

/** Replaces who takes part in this celebration. */
export function setSetlistParticipants(setlist: Setlist, memberIds: string[], now: number): Setlist {
  const participantIds = normalizeMemberIds(memberIds);
  const unchanged =
    participantIds.length === setlist.participantIds.length &&
    participantIds.every((id, index) => id === setlist.participantIds[index]);
  return unchanged ? setlist : { ...setlist, participantIds, updatedAt: now };
}

/** Adds people to the team, keeping who was already there. */
export function addSetlistParticipants(setlist: Setlist, memberIds: string[], now: number): Setlist {
  return setSetlistParticipants(setlist, [...setlist.participantIds, ...memberIds], now);
}

/**
 * What deleting a member means for a setlist: out of the team and out of
 * every block of every arrangement. Nothing else changes.
 */
export function removeMemberFromSetlist(setlist: Setlist, memberId: string, now: number): Setlist {
  let changed = false;
  const items = setlist.items.map((item) => {
    if (!item.arrangement) return item;
    const arrangement = removeMemberFromArrangement(item.arrangement, memberId);
    if (arrangement === item.arrangement) return item;
    changed = true;
    return { ...item, arrangement };
  });
  const participantIds = setlist.participantIds.filter((id) => id !== memberId);
  if (participantIds.length !== setlist.participantIds.length) changed = true;
  return changed ? { ...setlist, participantIds, items, updatedAt: now } : setlist;
}

/** How many setlists someone is on, counting only what is stored. */
export function countSetlistsWithMember(setlists: Setlist[], memberId: string): number {
  return setlists.filter((setlist) => setlist.participantIds.includes(memberId)).length;
}
