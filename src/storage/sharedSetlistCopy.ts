import type { Setlist } from '../types/setlist';
import { copySharedSetlist, sharedCopyId } from '../utils/setlists';
import type { IdFactory } from '../utils/createId';

/**
 * Guardar en la cuenta propia la copia de un Setlist que llegó por enlace.
 *
 * Vive aquí, fuera de la pantalla, porque es una coordinación con varias
 * salidas y cada una importa: sin cuenta, ya copiado, ocupado, guardado, o
 * guardado a medias. Dentro de un componente eso solo se puede comprobar
 * moviendo media aplicación; aquí se comprueba llamándolo.
 *
 * El orden es el que la capa de sincronización impone, no el que se preferiría.
 * `sync()` hace una pasada sobre los Setlists del dispositivo, así que un
 * Setlist que no esté ahí no sube: hay que adoptarlo antes de ofrecerlo. Lo
 * contrario —subir primero y adoptar después— exigiría hablar con la nube por
 * fuera de esa capa, que es justo lo que el proyecto no hace.
 *
 * Por eso una subida fallida no se deshace. Borrar la copia local dejaría una
 * lápida, y una lápida sobre una subida que sí llegó pero cuya respuesta se
 * perdió borraría la copia buena en la siguiente pasada. Perder lo que se
 * acaba de guardar es peor que enseñarlo como pendiente, que es lo que la
 * aplicación ya sabe decir de cualquier Setlist que todavía no subió.
 *
 * Y se puede reintentar sin miedo: el id de la copia sale del id del Setlist
 * original, así que el segundo intento escribe exactamente el mismo id. Si el
 * primero llegó, choca con la clave primaria y vuelve como conflicto; si no
 * llegó, sube. En ningún caso aparecen dos copias.
 */

export type SaveSharedCopyResult =
  /** No hay cuenta donde guardarla: hay que pedir sesión y volver. */
  | { state: 'needs-account' }
  /**
   * Ya hay una copia de este mismo enlace. `pending` dice si está en la
   * cuenta o solo en este dispositivo, que es lo que decide qué ofrecerle a
   * quien mira: abrirla, reintentar su subida, o guardar otra aparte.
   */
  | { state: 'exists'; existing: Setlist; pending: boolean }
  /** Había otra copia en el aire. No se manda lo mismo dos veces. */
  | { state: 'busy' }
  /** El id del original no deja sitio para una copia. */
  | { state: 'cannot-copy' }
  /** En la cuenta, confirmada por la nube. */
  | { state: 'saved'; setlist: Setlist }
  /** En este dispositivo, pero la nube no lo confirmó. Se puede reintentar. */
  | { state: 'local-only'; setlist: Setlist; message: string };

export interface SaveSharedCopyDeps {
  /** Si hay sesión. Sin ella no se guarda nada ni se intenta. */
  signedIn: boolean;
  /** Un Setlist de la cuenta por su id, para saber si ya se copió. */
  find: (id: string) => Setlist | null;
  /**
   * Si un Setlist de este dispositivo está ya en la cuenta. «new» es el único
   * estado que significa que la nube no sabe nada de él.
   */
  cloudStateOf: (setlist: Setlist) => 'guest' | 'new' | 'changed' | 'synced';
  /** Mete la copia en los Setlists del dispositivo. */
  adopt: (setlist: Setlist) => void;
  /** Ofrece la copia a la cuenta. Null cuando ya había una pasada en el aire. */
  sync: (setlist: Setlist) => Promise<{ ok: boolean; message: string } | null>;
  now: () => number;
  createId?: IdFactory;
  /**
   * El cerrojo de quien llama, leído y escrito de forma síncrona: entre dos
   * pulsaciones seguidas no hay render, así que un estado de React no llega a
   * tiempo de impedir la segunda.
   */
  lock: { current: boolean };
}

const SIN_CONFIRMAR =
  'La copia está en tus Setlists, pero todavía no en tu cuenta. Puedes reintentar el guardado.';

/** Lo que diga la nube de una subida, traducido a una de las dos salidas. */
async function ofrecer(copia: Setlist, deps: SaveSharedCopyDeps): Promise<SaveSharedCopyResult> {
  const answer = await deps.sync(copia);
  // Null es «ya había una pasada en el aire»: la primera dirá cómo fue.
  if (!answer) return { state: 'local-only', setlist: copia, message: SIN_CONFIRMAR };
  if (!answer.ok) return { state: 'local-only', setlist: copia, message: `${answer.message} ${SIN_CONFIRMAR}` };
  return { state: 'saved', setlist: copia };
}

export async function saveSharedCopy(
  shared: Setlist,
  deps: SaveSharedCopyDeps,
  attempt = 1
): Promise<SaveSharedCopyResult> {
  if (deps.lock.current) return { state: 'busy' };
  if (!deps.signedIn) return { state: 'needs-account' };

  const id = sharedCopyId(shared.id, attempt);
  if (!id) return { state: 'cannot-copy' };

  // La copia anterior se reconoce por el Setlist del que salió, que viaja
  // dentro del id. Por eso el aviso sigue valiendo en otro dispositivo.
  const ya = deps.find(id);
  if (ya && attempt === 1) {
    return { state: 'exists', existing: ya, pending: deps.cloudStateOf(ya) === 'new' };
  }

  deps.lock.current = true;
  try {
    const copia = copySharedSetlist(shared, {
      now: deps.now(),
      ...(deps.createId ? { createId: deps.createId } : {}),
      attempt,
    });
    deps.adopt(copia);
    return await ofrecer(copia, deps);
  } finally {
    deps.lock.current = false;
  }
}

/**
 * Vuelve a ofrecer a la cuenta una copia que ya está en el dispositivo.
 *
 * No crea nada: la misma copia, el mismo id, los mismos ids de dentro. Es lo
 * que hace que reintentar no deje dos Setlists donde debería haber uno, y lo
 * que permite recuperar una subida que se quedó a medias.
 */
export async function retrySharedCopy(
  existing: Setlist,
  deps: SaveSharedCopyDeps
): Promise<SaveSharedCopyResult> {
  if (deps.lock.current) return { state: 'busy' };
  if (!deps.signedIn) return { state: 'needs-account' };

  deps.lock.current = true;
  try {
    return await ofrecer(existing, deps);
  } finally {
    deps.lock.current = false;
  }
}
