/**
 * Qué hacer cuando una pantalla no llega a descargarse.
 *
 * La aplicación se parte en trozos que se piden cuando hacen falta: el Modo
 * Misa, el editor, el panel editorial. Cada despliegue genera trozos con
 * nombres nuevos y el servidor borra los viejos, así que una pestaña que
 * lleve abierta desde antes pide un archivo que ya no existe. El `import()`
 * se rechaza, y como no había ningún límite de error, el `Suspense` se
 * quedaba puesto para siempre: la aplicación «no terminaba de abrir».
 *
 * Esto es lo que se hace en ese caso, y está aquí separado de React para
 * poder probarlo entero sin navegador.
 *
 * ## Recargar, pero con cuidado
 *
 * Recargar arregla el problema: la página vuelve a pedir el HTML, que trae
 * los nombres nuevos. Pero recargar sola tiene dos peligros, y los dos
 * importan más que la comodidad.
 *
 * El primero es el bucle. Si la recarga no arregla nada —el servidor está
 * caído, el archivo de verdad no existe— recargar otra vez deja la
 * aplicación dando vueltas sin que nadie pueda hacer nada. Por eso se
 * permite **un intento por versión**, y la marca se borra en cuanto una
 * carga va bien.
 *
 * El segundo es peor: recargar en mitad de una misa, de un ensayo, o con un
 * editor abierto y cosas escritas sin guardar. Ahí no se recarga nunca sola.
 * Se avisa y decide la persona, que es quien sabe si puede soltar la pantalla
 * ahora mismo.
 *
 * ## Lo que esto todavía no hace
 *
 * Cada pestaña se arregla sola, cuando le toca. No hay mensajería entre
 * pestañas: una que lleve abierta desde antes del despliegue no se entera de
 * nada hasta que intenta abrir una pantalla que no tiene descargada, y
 * entonces es cuando sale el aviso. Es deliberado: avisar a las demás
 * significaría poder recargarlas, y recargar la pestaña donde alguien está
 * dirigiendo una misa es exactamente lo que no puede pasar. Hacerlo bien
 * —avisar sin recargar, y que cada pestaña decida— es trabajo aparte.
 */

import { MASS_SESSION_KEY, parseMassSession } from '../storage/massSessionStorage';

export const RECOVERY_KEY = 'genesaret_chunk_recovery';

/**
 * Cuánto hace falta que una celebración lleve parada para no contarla.
 *
 * La sesión se reescribe cada vez que alguien pasa de canción, así que una
 * de hace horas es una que nadie cerró, no una en marcha. Seis horas dan de
 * sobra para la misa más larga, y evitan que una sesión olvidada en enero
 * impida recuperarse en marzo.
 */
export const SESSION_FRESH_MS = 6 * 60 * 60 * 1000;

/** Lo que hace falta saber para decidir. Se inyecta, para poder probarlo. */
export interface RecoveryEnv {
  /** Dónde se recuerda el intento. `sessionStorage`: una pestaña, una visita. */
  attempts: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
  /** Dónde viven los datos de la persona, para no recargar encima de ellos. */
  data: Pick<Storage, 'getItem'> | null;
  /** Identifica la versión cargada ahora: el nombre del archivo del script principal. */
  buildId: string;
  now: () => number;
}

/**
 * Si el fallo es «no pude descargar un trozo» y no otra cosa.
 *
 * Se mira el mensaje porque no hay nada mejor: ni el navegador ni React dan
 * un tipo propio para esto. Se es estricto a propósito: recargar ante un
 * error cualquiera de React escondería fallos de verdad detrás de una
 * recarga, y nadie los vería nunca.
 */
/**
 * Qué trozo concreto falló, para no confundir dos fallos distintos.
 *
 * Los reintentos se cuentan por trozo y por versión: que el Modo Misa no se
 * descargue no debe gastar el intento del editor, que puede fallar por otro
 * motivo y arreglarse recargando.
 */
export function chunkKeyOf(error: unknown): string {
  const texto = `${(error as { message?: string })?.message ?? error ?? ''}`;
  const url = /https?:\/\/\S+?\/([A-Za-z0-9_.-]+\.js)/.exec(texto)?.[1];
  if (url) return url;
  const chunk = /chunk (\S+) failed/i.exec(texto)?.[1];
  return chunk ?? 'desconocido';
}

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const texto = `${(error as { name?: string }).name ?? ''} ${(error as { message?: string }).message ?? error}`;
  return (
    /Failed to fetch dynamically imported module/i.test(texto) ||
    /error loading dynamically imported module/i.test(texto) ||
    /Importing a module script failed/i.test(texto) ||
    // Chrome, Firefox y Safari dicen esto de tres formas distintas.
    /ChunkLoadError/i.test(texto) ||
    /Loading chunk \S+ failed/i.test(texto)
  );
}

/** Qué trozos ya se intentaron recuperar, y de qué versión. */
interface Attempts {
  buildId: string;
  /** Nombre del trozo -> cuándo se intentó. */
  failures: Record<string, number>;
}

function leerIntentos(env: RecoveryEnv): Attempts | null {
  try {
    const crudo = env.attempts?.getItem(RECOVERY_KEY);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<Attempts>;
    if (typeof datos?.buildId !== 'string') return null;
    const failures = datos.failures;
    return {
      buildId: datos.buildId,
      failures: failures && typeof failures === 'object' ? (failures as Record<string, number>) : {},
    };
  } catch {
    return null;
  }
}

/** Qué está haciendo la persona ahora mismo, por si no se la puede interrumpir. */
export interface Busy {
  /** Una misa o un ensayo en marcha. */
  session: boolean;
  /** Algo escrito en un editor y todavía no guardado en su Setlist. */
  drafts: boolean;
}

const HAY_ALGO = (crudo: string | null): boolean => {
  if (!crudo) return false;
  try {
    const datos = JSON.parse(crudo) as { drafts?: Record<string, unknown> };
    // Un archivo de borradores vacío no es trabajo pendiente.
    if (datos && typeof datos === 'object' && datos.drafts) return Object.keys(datos.drafts).length > 0;
    return true;
  } catch {
    // Ilegible: se prefiere pecar de prudente y no recargar encima.
    return true;
  }
};

/**
 * Si hay de verdad una celebración en marcha.
 *
 * Que exista la clave no basta: puede llevar texto ilegible, de una versión
 * que ya no se entiende, o sin la canción apuntada, y `parseMassSession` ya
 * devuelve null en los tres casos. Y una sesión que nadie tocó en horas no
 * es una en marcha, es una que nadie cerró.
 *
 * El Ensayo no se guarda en ninguna parte, así que desde aquí no se puede
 * saber si hay uno. En la práctica importa poco: para estar ensayando hay
 * que haber abierto esa pantalla, y entonces su trozo ya se descargó. Lo que
 * falla es ir a una pantalla que todavía no se cargó.
 */
export function whatIsBusy(env: RecoveryEnv): Busy {
  const session = parseMassSession(env.data?.getItem(MASS_SESSION_KEY) ?? null);
  const fresca = Boolean(session) && env.now() - (session?.updatedAt ?? 0) < SESSION_FRESH_MS;
  return {
    session: fresca,
    drafts: HAY_ALGO(env.data?.getItem('genesaret_setlist_item_drafts') ?? null),
  };
}

export type RecoveryPlan =
  /** No es cosa nuestra: que lo cuente el límite de error. */
  | { action: 'show-error' }
  /** Se puede recargar sin pisar nada. */
  | { action: 'reload' }
  /** Hay algo que no se puede interrumpir, o ya se intentó: que decida la persona. */
  | { action: 'ask'; reason: 'busy' | 'already-tried' | 'cannot-remember'; busy: Busy };

/**
 * Qué hacer ante un fallo al cargar una pantalla.
 *
 * El orden importa: primero se descarta lo que no es un fallo de descarga,
 * después se mira si hay trabajo en marcha, y sólo al final se recarga.
 */
export function planRecovery(error: unknown, env: RecoveryEnv): RecoveryPlan {
  if (!isChunkLoadError(error)) return { action: 'show-error' };

  const busy = whatIsBusy(env);
  if (busy.session || busy.drafts) return { action: 'ask', reason: 'busy', busy };

  // Sin dónde anotar el intento no hay forma de evitar el bucle, así que no
  // se recarga sola: se ofrece el botón y decide la persona.
  if (!canRemember(env)) return { action: 'ask', reason: 'cannot-remember', busy };

  const intentos = leerIntentos(env);
  // Un intento por trozo y por versión. Si ya se recargó por este mismo
  // trozo de esta misma versión y vuelve a fallar, recargar otra vez no va a
  // arreglarlo: sólo dejaría la aplicación dando vueltas.
  //
  // Los intentos de otra versión no cuentan: desplegar de nuevo devuelve a
  // todo el mundo su recuperación automática.
  if (intentos && intentos.buildId === env.buildId && chunkKeyOf(error) in intentos.failures) {
    return { action: 'ask', reason: 'already-tried', busy };
  }

  return { action: 'reload' };
}

/**
 * Deja constancia de que se recargó por este trozo, justo antes de hacerlo.
 *
 * Al cambiar de versión se empieza de cero: los intentos de la anterior ya
 * no dicen nada de ésta. Eso, y no borrar la marca al arrancar, es lo que
 * devuelve la recuperación automática tras una actualización.
 */
export function markRecoveryAttempt(env: RecoveryEnv, error: unknown): void {
  try {
    const previos = leerIntentos(env);
    const base: Attempts =
      previos && previos.buildId === env.buildId ? previos : { buildId: env.buildId, failures: {} };
    base.failures[chunkKeyOf(error)] = env.now();
    env.attempts?.setItem(RECOVERY_KEY, JSON.stringify(base));
  } catch {
    // Sin dónde anotarlo no se puede prometer que no haya bucle. Quien llama
    // a esto lo sabe: `canRemember` lo dice antes de decidir.
  }
}

/** Si se puede anotar el intento. Sin esto no hay forma de evitar el bucle. */
export function canRemember(env: RecoveryEnv): boolean {
  if (!env.attempts) return false;
  try {
    env.attempts.setItem(RECOVERY_KEY + '_probe', '1');
    env.attempts.removeItem(RECOVERY_KEY + '_probe');
    return true;
  } catch {
    return false;
  }
}

/**
 * La versión cargada ahora mismo, sacada del nombre del script principal.
 *
 * Vale cualquier cosa que cambie en cada despliegue y no cambie entre
 * recargas de la misma versión; el nombre con hash de Vite lo cumple. Sin
 * ella —otro empaquetado, un entorno raro— se usa una constante, y entonces
 * «un intento por versión» pasa a ser «un intento por pestaña», que sigue
 * impidiendo el bucle.
 */
export function currentBuildId(doc: Pick<Document, 'querySelector'> | null): string {
  const script = doc?.querySelector('script[type="module"][src*="/assets/"]') as { src?: string } | null;
  const src = script?.src;
  if (!src) return 'desconocida';
  return src.split('/').pop() ?? 'desconocida';
}
