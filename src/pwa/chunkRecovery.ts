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
 */

export const RECOVERY_KEY = 'genesaret_chunk_recovery';

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

interface Attempt {
  buildId: string;
  at: number;
}

function leerIntento(env: RecoveryEnv): Attempt | null {
  try {
    const crudo = env.attempts?.getItem(RECOVERY_KEY);
    if (!crudo) return null;
    const datos = JSON.parse(crudo) as Partial<Attempt>;
    if (typeof datos?.buildId !== 'string' || typeof datos?.at !== 'number') return null;
    return { buildId: datos.buildId, at: datos.at };
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

export function whatIsBusy(env: RecoveryEnv): Busy {
  return {
    session: Boolean(env.data?.getItem('genesaret_mass_session')),
    drafts: HAY_ALGO(env.data?.getItem('genesaret_setlist_item_drafts') ?? null),
  };
}

export type RecoveryPlan =
  /** No es cosa nuestra: que lo cuente el límite de error. */
  | { action: 'show-error' }
  /** Se puede recargar sin pisar nada. */
  | { action: 'reload' }
  /** Hay algo que no se puede interrumpir, o ya se intentó: que decida la persona. */
  | { action: 'ask'; reason: 'busy' | 'already-tried'; busy: Busy };

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

  const intento = leerIntento(env);
  // Un intento por versión. Si ya se recargó por esta misma versión y vuelve
  // a fallar, recargar otra vez no va a arreglarlo.
  if (intento && intento.buildId === env.buildId) return { action: 'ask', reason: 'already-tried', busy };

  return { action: 'reload' };
}

/** Deja constancia de que se recargó por esta versión, justo antes de hacerlo. */
export function markRecoveryAttempt(env: RecoveryEnv): void {
  try {
    env.attempts?.setItem(RECOVERY_KEY, JSON.stringify({ buildId: env.buildId, at: env.now() }));
  } catch {
    // Sin dónde anotarlo no se puede garantizar que no haya bucle, así que
    // quien llame a esto debe tratarlo como «ya se intentó».
  }
}

/**
 * Borra la marca porque la aplicación cargó bien.
 *
 * Es lo que permite que la próxima vez vuelva a haber un intento: sin esto,
 * una recarga de hace semanas dejaría a la persona sin recuperación
 * automática para siempre.
 */
export function clearRecoveryMark(env: RecoveryEnv): void {
  try {
    env.attempts?.removeItem(RECOVERY_KEY);
  } catch {
    // Nada que hacer, y nada que romper.
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
