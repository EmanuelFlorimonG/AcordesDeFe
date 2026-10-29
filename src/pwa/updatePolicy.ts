/**
 * Quién se recarga cuando llega una versión nueva, y cuándo.
 *
 * Vive aparte del registro del service worker por dos razones. La primera es
 * que se pueda probar de verdad: `src/pwa.ts` importa el módulo virtual del
 * plugin, que sólo existe dentro de una compilación de la aplicación, así que
 * desde una prueba no se puede ni cargar. La segunda es que esto es lo único
 * que de verdad hay que entender del asunto, y merece leerse solo.
 *
 * El problema que resuelve: `vite-plugin-pwa`, en modo «prompt», registra un
 * oyente de `controlling` en cuanto hay una versión esperando —no cuando
 * alguien pulsa Actualizar— y ese oyente recarga la página. Como `controlling`
 * llega a todas las pestañas del origen a la vez, actualizar en una las
 * recargaba todas, incluida la que tuviera una misa abierta.
 */

/** Lo que hay que saber para decidir si esta pestaña puede recargarse. */
export interface ReloadState {
  /** Si fue esta pestaña la que pidió actualizar. */
  requestedHere: boolean;
  /** Una misa o un ensayo abiertos ahora mismo. */
  sessionActive: boolean;
  /** Algo escrito en un editor y todavía sin guardar en su Setlist. */
  draftsPending: boolean;
}

/**
 * Si esta pestaña debe recargarse ahora mismo.
 *
 * Sólo si fue ésta la que pidió actualizar, y sólo si no hay nada en marcha.
 * Una pestaña que no pidió nada se queda como estaba. Una misa, un ensayo o
 * un editor con cosas escritas se respetan aunque la petición saliera de
 * aquí: pulsar un aviso no es aceptar que se corte lo que estás haciendo.
 *
 * Los borradores sobrevivirían a la recarga, porque se guardan según se
 * escriben. Pero volver y encontrarse el editor cerrado y un «¿recuperamos lo
 * que escribiste?» no es lo mismo que seguir donde estabas, y aquí no corre
 * ninguna prisa.
 *
 * Lo que no recarga se queda con el código anterior, y eso está previsto: si
 * luego necesita una pantalla que ya no puede descargar, el límite de error
 * de `chunkRecovery` se encarga.
 */
export function shouldReloadNow(estado: ReloadState): boolean {
  return estado.requestedHere && !estado.sessionActive && !estado.draftsPending;
}

/** Lo que la coordinación necesita del mundo de fuera. */
export interface UpdateDeps {
  sessionActive: () => boolean;
  draftsPending: () => boolean;
  reload: () => void;
  /** Avisa de que hay una versión nueva esperando a que alguien diga que sí. */
  offerUpdate: () => void;
  /** Le dice al service worker que espera que tome el mando. */
  skipWaiting: () => Promise<void>;
}

export interface UpdateCoordinator {
  /** La persona pulsó Actualizar en ESTA pestaña. */
  request(): Promise<void>;
  /** El service worker nuevo tomó el control. Llega a todas las pestañas. */
  tookControl(): void;
  /** Para mirar por dentro en las pruebas. */
  readonly debug: { requestedHere: boolean; stale: boolean };
}

/**
 * Lleva la cuenta de quién pidió qué, en esta pestaña y sólo en esta.
 *
 * Las dos banderas viven dentro de este cierre, así que cada pestaña tiene
 * las suyas: no hay forma de que una herede el `requestedHere` de otra, que
 * era justamente el riesgo. Nada de esto se guarda en ningún sitio, y por eso
 * tampoco sobrevive a una recarga, que es lo correcto: después de recargar ya
 * no hay nada pendiente que aplicar.
 */
export function createUpdateCoordinator(deps: UpdateDeps): UpdateCoordinator {
  let requestedHere = false;
  let stale = false;

  return {
    async request() {
      requestedHere = true;
      // Si el service worker nuevo ya tomó el control —porque otra pestaña
      // actualizó— no queda nada que activar: lo único que hace falta aquí es
      // recargar para dejar de usar el código viejo.
      if (stale) {
        deps.reload();
        return;
      }
      await deps.skipWaiting();
    },

    tookControl() {
      stale = true;
      if (shouldReloadNow({
        requestedHere,
        sessionActive: deps.sessionActive(),
        draftsPending: deps.draftsPending(),
      })) {
        deps.reload();
        return;
      }
      // No se recarga: o no fue esta pestaña quien lo pidió, o hay algo en
      // marcha. Se vuelve a ofrecer y decide la persona. No queda ninguna
      // recarga apuntada para más tarde: si alguien sale de la misa, no le
      // va a saltar la página de golpe. Vuelve a pulsar cuando quiera.
      deps.offerUpdate();
    },

    get debug() {
      return { requestedHere, stale };
    },
  };
}
