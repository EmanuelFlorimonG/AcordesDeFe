import type { SetlistItem } from '../types/setlist';
import type { KeyValueStorage } from './localRepository';

/**
 * Lo que alguien lleva editado de una canción de un Setlist y todavía no ha
 * guardado.
 *
 * Hasta ahora eso vivía sólo en la memoria de React: siete campos del editor
 * —momento, notas, tono, capotraste, arreglo, transición y a quién se asigna—
 * que desaparecían al cerrar el diálogo. Y cerrar es fácil: la X, Escape, un
 * toque fuera, recargar, cerrar la pestaña. Alguien podía dejar un arreglo
 * entero repartido por bloques y perderlo con una tecla.
 *
 * El Setlist no se toca mientras se edita: para eso están Guardar y Cancelar,
 * y esa es la decisión del ministerio. Lo que cambia es que el trabajo a
 * medias deja de vivir sólo en la pantalla.
 *
 * Esto no cambia el modelo de los Setlists ni su clave de almacenamiento. Es
 * una clave aparte, con sus propios borradores, que no existe hasta que
 * alguien edita algo. Un Setlist guardado antes de todo esto se lee igual.
 *
 * ## Por qué hay una huella y no una fecha
 *
 * Para no pisar lo que otro cambió haría falta saber cuándo se tocó el ítem
 * por última vez, y `SetlistItem` no guarda esa fecha: sólo el Setlist entero
 * tiene `updatedAt`, que se mueve por cualquier cambio en cualquier canción.
 * Serviría de poco.
 *
 * Así que el borrador guarda la huella del ítem tal como estaba al abrir el
 * editor. Al volver, si el ítem de verdad ya no coincide con esa huella, es
 * que alguien lo cambió por otro camino —otra pestaña, una sincronización— y
 * el borrador no se aplica a ciegas. Comparar el contenido es además más
 * fiable que una fecha: dos escrituras en el mismo milisegundo son
 * indistinguibles por reloj y no por contenido.
 */

export const SETLIST_DRAFTS_KEY = 'genesaret_setlist_item_drafts';
export const SETLIST_DRAFTS_VERSION = 1;

/** Lo que el editor lleva escrito, con la misma forma que entrega al guardar. */
export interface DraftChanges {
  moment: string;
  notes: string;
  transposeSteps: number;
  capoFret: number;
  arrangement: SetlistItem['arrangement'] | null;
  transitionToNext: SetlistItem['transitionToNext'] | null | undefined;
  newParticipantIds: string[];
}

export interface StoredItemDraft {
  setlistId: string;
  itemId: string;
  changes: DraftChanges;
  /** La huella del ítem cuando se abrió el editor. */
  base: string;
  savedAt: number;
}

/** Un borrador por canción y por Setlist: descartar uno no toca los demás. */
const draftKey = (setlistId: string, itemId: string) => `${setlistId}::${itemId}`;

/**
 * La huella de lo que el editor puede cambiar. Determinista: los mismos
 * valores dan la misma cadena, pasen por donde pasen.
 */
export function itemFingerprint(item: Pick<SetlistItem, 'moment' | 'notes' | 'transposeSteps' | 'capoFret' | 'arrangement' | 'transitionToNext'>): string {
  return JSON.stringify([
    item.moment ?? '',
    item.notes ?? '',
    item.transposeSteps ?? 0,
    item.capoFret ?? 0,
    item.arrangement ?? null,
    item.transitionToNext ?? null,
  ]);
}

interface StoredFile {
  version: number;
  drafts: Record<string, StoredItemDraft>;
}

const vacio = (): StoredFile => ({ version: SETLIST_DRAFTS_VERSION, drafts: {} });

/** Un borrador que de verdad lo es, venga como venga del almacenamiento. */
function sanitize(value: unknown): StoredItemDraft | null {
  if (!value || typeof value !== 'object') return null;
  const d = value as Partial<StoredItemDraft>;
  if (typeof d.setlistId !== 'string' || !d.setlistId) return null;
  if (typeof d.itemId !== 'string' || !d.itemId) return null;
  if (typeof d.base !== 'string') return null;
  if (typeof d.savedAt !== 'number' || !Number.isFinite(d.savedAt)) return null;
  const c = d.changes as Partial<DraftChanges> | undefined;
  if (!c || typeof c !== 'object') return null;
  if (typeof c.moment !== 'string' || typeof c.notes !== 'string') return null;
  if (typeof c.transposeSteps !== 'number' || typeof c.capoFret !== 'number') return null;
  return {
    setlistId: d.setlistId,
    itemId: d.itemId,
    base: d.base,
    savedAt: d.savedAt,
    changes: {
      moment: c.moment,
      notes: c.notes,
      transposeSteps: c.transposeSteps,
      capoFret: c.capoFret,
      arrangement: c.arrangement ?? null,
      transitionToNext: c.transitionToNext,
      newParticipantIds: Array.isArray(c.newParticipantIds) ? c.newParticipantIds.filter((id) => typeof id === 'string') : [],
    },
  };
}

export interface SetlistDraftStore {
  read(setlistId: string, itemId: string): StoredItemDraft | null;
  /** Falso cuando el almacenamiento no quiso: cuota llena, modo privado, bloqueado. */
  write(draft: StoredItemDraft): boolean;
  /** Borra sólo ése. Devuelve falso si el almacenamiento falló. */
  discard(setlistId: string, itemId: string): boolean;
  all(): StoredItemDraft[];
}

export function createSetlistDraftStore(storage: KeyValueStorage | null): SetlistDraftStore {
  const leer = (): StoredFile => {
    try {
      const crudo = storage?.getItem(SETLIST_DRAFTS_KEY);
      if (!crudo) return vacio();
      const datos = JSON.parse(crudo) as Partial<StoredFile>;
      if (!datos || typeof datos !== 'object' || !datos.drafts) return vacio();
      const drafts: Record<string, StoredItemDraft> = {};
      for (const [clave, valor] of Object.entries(datos.drafts)) {
        const limpio = sanitize(valor);
        if (limpio) drafts[clave] = limpio;
      }
      return { version: SETLIST_DRAFTS_VERSION, drafts };
    } catch {
      // Ilegible: se parte de cero en vez de reventar el editor.
      return vacio();
    }
  };

  const escribir = (datos: StoredFile): boolean => {
    try {
      storage?.setItem(SETLIST_DRAFTS_KEY, JSON.stringify(datos));
      return Boolean(storage);
    } catch {
      return false;
    }
  };

  return {
    read(setlistId, itemId) {
      return leer().drafts[draftKey(setlistId, itemId)] ?? null;
    },
    write(draft) {
      const datos = leer();
      datos.drafts[draftKey(draft.setlistId, draft.itemId)] = draft;
      return escribir(datos);
    },
    discard(setlistId, itemId) {
      const datos = leer();
      const clave = draftKey(setlistId, itemId);
      if (!(clave in datos.drafts)) return true;
      delete datos.drafts[clave];
      return escribir(datos);
    },
    all() {
      return Object.values(leer().drafts);
    },
  };
}

/** Si lo editado difiere de lo guardado. Un borrador igual al ítem no es un cambio. */
export function draftDiffers(changes: DraftChanges, item: Pick<SetlistItem, 'moment' | 'notes' | 'transposeSteps' | 'capoFret' | 'arrangement' | 'transitionToNext'>): boolean {
  return (
    itemFingerprint({
      moment: changes.moment,
      notes: changes.notes,
      transposeSteps: changes.transposeSteps,
      capoFret: changes.capoFret,
      arrangement: changes.arrangement ?? undefined,
      transitionToNext: changes.transitionToNext === undefined ? item.transitionToNext : changes.transitionToNext ?? undefined,
    }) !== itemFingerprint(item) || changes.newParticipantIds.length > 0
  );
}

/**
 * Qué hacer con un borrador al reabrir el editor.
 *
 * - `ninguno`: no hay nada guardado, o lo guardado ya no cambia nada.
 * - `recuperable`: el ítem sigue como estaba y el borrador se puede ofrecer.
 * - `en-conflicto`: el ítem cambió por otro camino desde que se empezó a
 *   editar. El borrador no se aplica solo; decide quien lo escribió.
 */
export type DraftStatus = 'ninguno' | 'recuperable' | 'en-conflicto';

export function draftStatus(draft: StoredItemDraft | null, item: Pick<SetlistItem, 'moment' | 'notes' | 'transposeSteps' | 'capoFret' | 'arrangement' | 'transitionToNext'>): DraftStatus {
  if (!draft) return 'ninguno';
  if (!draftDiffers(draft.changes, item)) return 'ninguno';
  return draft.base === itemFingerprint(item) ? 'recuperable' : 'en-conflicto';
}
