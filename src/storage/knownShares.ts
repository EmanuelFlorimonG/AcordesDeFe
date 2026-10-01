import { SupabaseRequestError } from '../lib/supabase';
import { getBrowserStorage, type KeyValueStorage } from './localRepository';
import type { SetlistShareRecord } from './setlistShares';
import type { SetlistScope } from './setlistStorage';

/**
 * Los enlaces que este dispositivo ya ha visto.
 *
 * El enlace de verdad vive en Supabase y allí se queda: esto no es una
 * segunda fuente de verdad, es memoria. Sirve para una cosa concreta — que
 * alguien sin cobertura, diez minutos antes de una misa, pueda enseñar el
 * enlace que ya había creado y su código QR en vez de encontrarse una
 * ventana vacía.
 *
 * Por eso lo que guarda es lo mínimo con lo que se reconstruye un enlace:
 * de qué Setlist es, cuál es su token y cuándo se creó. Ni el dueño —que lo
 * decide `auth.uid()` en la base de datos y no hace falta aquí— ni nada del
 * contenido del Setlist, que ya está guardado en su sitio.
 *
 * Y es memoria que puede estar equivocada: alguien pudo desactivar el enlace
 * desde otro teléfono. Sin conexión no hay forma de saberlo, así que quien lo
 * enseñe tiene que decir que es lo último que sabe, no que siga funcionando.
 * En cuanto hay conexión, Supabase manda: si dice que no hay enlace, esta
 * copia se borra.
 */

export const KNOWN_SHARES_KEY = 'genesaret_setlist_shares';
/** Sube cuando cambie la forma de lo guardado, para no leer mal lo viejo. */
export const KNOWN_SHARES_VERSION = 1;

export interface KnownShare {
  setlistId: string;
  /** Los 32 hexadecimales que abren el enlace. */
  token: string;
  /** Cuándo se creó, en ISO, tal como lo dijo el servidor. */
  createdAt: string;
}

interface StoredShares {
  version: typeof KNOWN_SHARES_VERSION;
  shares: KnownShare[];
}

export interface KnownShareStore {
  /** Dónde escribe, o null cuando no tiene dónde (un invitado no comparte). */
  readonly key: string | null;
  get(setlistId: string): KnownShare | null;
  /** Apunta lo que Supabase acaba de confirmar. */
  remember(share: KnownShare): void;
  /** Olvida el de un Setlist: se desactivó, o allí ya no existe. */
  forget(setlistId: string): void;
}

const TOKEN = /^[0-9a-f]{32}$/;

/** Una entrada legible, o null. Media entrada no es una entrada. */
function shareOf(value: unknown): KnownShare | null {
  if (typeof value !== 'object' || value === null) return null;
  const entry = value as Partial<KnownShare>;
  const setlistId = typeof entry.setlistId === 'string' ? entry.setlistId.trim() : '';
  const token = typeof entry.token === 'string' ? entry.token.trim().toLowerCase() : '';
  const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
  if (!setlistId || !TOKEN.test(token) || !createdAt) return null;
  return { setlistId, token, createdAt };
}

/**
 * Dónde guarda cada cuenta lo suyo.
 *
 * La misma regla que los Setlists: la clave lleva el id de la cuenta, y un
 * invitado no tiene ninguna. Dos personas en el mismo navegador no se ven los
 * enlaces, y quien no ha iniciado sesión no tiene enlaces que ver — no puede
 * crearlos, porque crearlos exige una sesión.
 */
export function knownSharesKey(scope: SetlistScope): string | null {
  if (scope.kind === 'guest') return null;
  const id = scope.userId.trim();
  return id ? `${KNOWN_SHARES_KEY}:u:${encodeURIComponent(id)}` : null;
}

export function createKnownShareStore(
  scope: SetlistScope,
  storage: KeyValueStorage | null = getBrowserStorage()
): KnownShareStore {
  const key = knownSharesKey(scope);

  const read = (): KnownShare[] => {
    if (!storage || !key) return [];
    try {
      const raw = storage.getItem(key);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Partial<StoredShares> | null;
      if (!parsed || parsed.version !== KNOWN_SHARES_VERSION || !Array.isArray(parsed.shares)) return [];
      // Lo que no se entiende se descarta entrada a entrada: un enlace roto
      // no es motivo para perder los demás.
      return parsed.shares.map(shareOf).filter((share): share is KnownShare => share !== null);
    } catch {
      return [];
    }
  };

  const write = (shares: KnownShare[]): void => {
    if (!storage || !key) return;
    try {
      storage.setItem(key, JSON.stringify({ version: KNOWN_SHARES_VERSION, shares } satisfies StoredShares));
    } catch {
      // El dispositivo no lo acepta. Es memoria, no datos: se sigue sin ella.
    }
  };

  return {
    key,
    get(setlistId) {
      return read().find((share) => share.setlistId === setlistId) ?? null;
    },
    remember(share) {
      const clean = shareOf(share);
      if (!clean) return;
      write([...read().filter((entry) => entry.setlistId !== clean.setlistId), clean]);
    },
    forget(setlistId) {
      const shares = read();
      const next = shares.filter((share) => share.setlistId !== setlistId);
      if (next.length !== shares.length) write(next);
    },
  };
}

// ---------------------------------------------------------------------------
// Por qué falló una petición
// ---------------------------------------------------------------------------

/**
 * Qué clase de fallo fue, que es lo que decide si se puede tirar de memoria.
 *
 * La distinción importa: no llegar al servidor y que el servidor diga que no
 * son cosas distintas. Sin red, lo último que se supo es la mejor respuesta
 * posible. Pero si la sesión caducó o faltan permisos, enseñar el enlace
 * guardado sería decirle a alguien que todo está bien cuando no lo está.
 */
export type ShareFailure =
  /** El navegador dice que no hay red: ni se intentó. */
  | 'offline'
  /** Se intentó y no se llegó: la petición murió por el camino. */
  | 'network'
  /** El servidor contestó que no: sesión caducada o sin permiso. */
  | 'auth'
  /** El servidor contestó, y contestó mal. */
  | 'server';

/** Si se puede enseñar lo guardado, o hay que decir lo que pasa. */
export const canFallBackToMemory = (failure: ShareFailure): boolean =>
  failure === 'offline' || failure === 'network';

export function classifyShareFailure(error: unknown): ShareFailure {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  // Un fetch que no llega lanza un TypeError, no una respuesta.
  if (!(error instanceof SupabaseRequestError)) return 'network';
  if (error.status === 401 || error.status === 403) return 'auth';
  // Lo que dice Postgres cuando una política no deja pasar, y lo que dice
  // PostgREST cuando el JWT no vale.
  if (error.code === '42501' || error.code?.startsWith('PGRST3')) return 'auth';
  return 'server';
}

// ---------------------------------------------------------------------------
// En qué estado está el enlace de un Setlist
// ---------------------------------------------------------------------------

export type ShareLookup =
  /** Hay enlace. `fromMemory` dice si se pudo confirmar o es lo último que se supo. */
  | { state: 'on'; share: KnownShare; fromMemory: boolean }
  /** No hay enlace, y eso se sabe. */
  | { state: 'off' }
  /** No se pudo saber, y no se va a fingir que sí. */
  | { state: 'error'; failure: ShareFailure };

/**
 * Si este Setlist está compartido.
 *
 * Aquí está toda la decisión, y es corta a propósito, porque lo que importa
 * son los tres casos que no se parecen:
 *
 *   * sin red no se manda una petición que no va a llegar: se responde con lo
 *     que este dispositivo recuerda, diciendo que es memoria;
 *   * con red manda Supabase, siempre: si dice que no hay enlace, la copia
 *     local se borra, porque alguien pudo desactivarlo desde otro teléfono;
 *   * si falló, depende de por qué. No llegar al servidor deja usar la
 *     memoria. Que el servidor conteste que no —sesión caducada, sin
 *     permiso— no: enseñar el enlace guardado ahí sería decirle a alguien que
 *     todo está bien mientras su sesión está muerta.
 */
export async function lookupShare(
  setlistId: string,
  find: () => Promise<SetlistShareRecord | null>,
  memory: KnownShareStore | null,
  online: boolean
): Promise<ShareLookup> {
  const remembered = (): KnownShare | null => memory?.get(setlistId) ?? null;

  if (!online) {
    const known = remembered();
    return known ? { state: 'on', share: known, fromMemory: true } : { state: 'off' };
  }

  try {
    const found = await find();
    if (!found) {
      memory?.forget(setlistId);
      return { state: 'off' };
    }
    memory?.remember(found);
    return { state: 'on', share: found, fromMemory: false };
  } catch (error) {
    const failure = classifyShareFailure(error);
    const known = canFallBackToMemory(failure) ? remembered() : null;
    return known ? { state: 'on', share: known, fromMemory: true } : { state: 'error', failure };
  }
}
