import { useEffect } from 'react';

/**
 * Si alguien está ahora mismo delante del Modo Misa o del Modo Ensayo.
 *
 * Existe por una razón concreta y estrecha: cuando una pantalla no se puede
 * descargar tras un despliegue, la recuperación recarga la página sola. Eso
 * está bien a media tarde y está muy mal a mitad de una celebración.
 *
 * La sesión de Misa sí se guarda, así que esa se puede mirar en el
 * almacenamiento. El Ensayo no se guarda en ninguna parte, y es igual de
 * interrumpible: quien está ensayando con el metrónomo en marcha y la
 * pantalla despierta no quiere que se le recargue debajo.
 *
 * Así que esto vive en memoria y nada más. No se guarda, no viaja, no tiene
 * modelo de datos y desaparece al cerrar la pestaña, que es exactamente lo
 * que debe pasar: una sesión abierta en otra pestaña no es asunto de ésta, y
 * una sesión de ayer no existe.
 *
 * Lo único que hace falta que sea cierto es que refleje el ciclo de vida de
 * verdad de esas pantallas. De eso se encarga `useSessionActivity`, cuya
 * limpieza corre al desmontar y al cambiar de ruta.
 */

export type SessionKind = 'misa' | 'ensayo';

const activas = new Set<SessionKind>();

/** Entrar o salir de una de las dos pantallas. */
export function setSessionActive(kind: SessionKind, active: boolean): void {
  if (active) activas.add(kind);
  else activas.delete(kind);
}

/** Cuál está abierta, si alguna. La Misa manda cuando están las dos. */
export function activeSession(): SessionKind | null {
  if (activas.has('misa')) return 'misa';
  if (activas.has('ensayo')) return 'ensayo';
  return null;
}

export function isSessionActive(): boolean {
  return activas.size > 0;
}

/** Sólo para las pruebas: deja la señal como estaba al principio. */
export function resetSessionActivity(): void {
  activas.clear();
}

/**
 * Mantiene la señal al día mientras la pantalla esté montada.
 *
 * La limpieza del efecto es la pieza importante: corre al desmontar y cada
 * vez que `active` cambia, así que salir de la pantalla, cambiar de ruta o
 * cerrar la celebración apagan la señal sin que nadie tenga que acordarse.
 */
export function useSessionActivity(kind: SessionKind, active: boolean): void {
  useEffect(() => {
    setSessionActive(kind, active);
    return () => setSessionActive(kind, false);
  }, [kind, active]);
}
