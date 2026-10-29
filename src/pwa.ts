import { isSessionActive } from './pwa/sessionActivity';
import { shouldReloadNow } from './pwa/updatePolicy';

/**
 * El service worker: registrarlo, y saber en qué estado está.
 *
 * Lo que hace por nosotros es una cosa concreta: guardar la aplicación entera
 * —su HTML, su JavaScript, sus estilos, sus tipografías, sus iconos y cada
 * uno de los trozos que se cargan bajo demanda— para que abra sin conexión.
 * No guarda datos. El cancionero ya tiene su copia local y los Setlists la
 * suya; meterlos también aquí sería tener dos verdades sobre lo mismo.
 *
 * Lo que NO hace, y es igual de importante: no toma el control por su cuenta.
 * Una versión nueva se queda esperando, porque tomar el mando y recargar en
 * mitad de una misa es exactamente lo que no puede pasar. Se avisa, y quien
 * decide es la persona — cuando haya una pantalla desde la que decidirlo.
 */

/** En qué situación está la aplicación respecto a funcionar sin conexión. */
export type PwaState =
  /** Todavía no se sabe: se está registrando, o el navegador no tiene. */
  | { kind: 'idle' }
  /** Ya está guardada: abre sin conexión. */
  | { kind: 'ready' }
  /** Hay una versión nueva esperando. No se aplica sola. */
  | { kind: 'update-available' }
  /** No se pudo registrar. La aplicación sigue funcionando con red. */
  | { kind: 'error'; error: unknown };

type Listener = (state: PwaState) => void;

let state: PwaState = { kind: 'idle' };
/**
 * Si fue esta pestaña la que pidió actualizar.
 *
 * Importa porque `controlling` llega a todas: cuando alguien actualiza en una
 * pestaña, el service worker nuevo toma el control de todas las demás a la
 * vez. Sin esto, todas recargaban, incluida la que tuviera una misa abierta.
 */
let requestedHere = false;
/** El service worker nuevo ya manda, pero esta pestaña sigue con el código viejo. */
let stale = false;
const listeners = new Set<Listener>();
/** Lo que aplicará la versión nueva cuando alguien lo pida. */
let applyUpdate: (() => Promise<void>) | null = null;

function publish(next: PwaState): void {
  state = next;
  for (const listener of listeners) listener(state);
}

export function getPwaState(): PwaState {
  return state;
}

export function subscribeToPwa(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Si hay una versión nueva esperando a que alguien diga que sí. */
export function hasPendingUpdate(): boolean {
  return state.kind === 'update-available';
}

/**
 * Aplica la versión que está esperando y recarga.
 *
 * No se llama sola. Existe para que una pantalla pueda ofrecerlo cuando
 * ofrecerlo no interrumpa nada — y eso es una decisión de la pantalla, no de
 * este archivo.
 */
export async function applyPendingUpdate(): Promise<void> {
  requestedHere = true;
  // Si el service worker nuevo ya tomó el control —porque otra pestaña
  // actualizó— no queda nada que activar: lo único que hace falta aquí es
  // recargar para dejar de usar el código viejo.
  if (stale) {
    window.location.reload();
    return;
  }
  await applyUpdate?.();
}

/** Sólo para las pruebas: deja el módulo como estaba al empezar. */
export function resetPwaForTests(): void {
  requestedHere = false;
  stale = false;
  state = { kind: 'idle' };
}

/**
 * Registra el service worker. Se llama una vez, al arrancar.
 *
 * Se carga en diferido porque el ayudante del registro sólo hace falta en la
 * primera visita real, y nunca durante el desarrollo.
 */
export function registerPwa(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

  void import('virtual:pwa-register')
    .then(({ registerSW }) => {
      const update = registerSW({
        immediate: true,
        onNeedRefresh() {
          publish({ kind: 'update-available' });
        },
        /**
         * Sin esto, la biblioteca recarga la página ella sola en cuanto el
         * service worker nuevo toma el control. Y lo hace en TODAS las
         * pestañas, porque registra ese oyente en cuanto hay una versión
         * esperando, no cuando alguien pulsa Actualizar: una misa abierta en
         * otra pestaña se recargaba sin que nadie lo pidiera.
         *
         * Dándole esta función, la recarga la decidimos nosotros.
         */
        onNeedReload() {
          stale = true;
          if (shouldReloadNow({ requestedHere, sessionActive: isSessionActive() })) {
            window.location.reload();
            return;
          }
          // No se recarga: o no fue esta pestaña quien lo pidió, o hay algo
          // en marcha. Se vuelve a ofrecer y decide la persona. Mientras
          // tanto, si una pantalla no se descarga, la recuperación de trozos
          // ya sabe qué hacer.
          publish({ kind: 'update-available' });
        },
        onOfflineReady() {
          publish({ kind: 'ready' });
        },
        onRegisterError(error: unknown) {
          publish({ kind: 'error', error });
        },
      });
      // `registerSW` devuelve la función que aplica la actualización; se
      // guarda, no se llama.
      applyUpdate = () => update(true);
    })
    .catch((error: unknown) => {
      // Sin service worker la aplicación funciona igual, sólo que necesita
      // red para abrir. No es motivo para romper nada.
      publish({ kind: 'error', error });
    });
}
