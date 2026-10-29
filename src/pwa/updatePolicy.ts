/**
 * Quién se recarga cuando llega una versión nueva.
 *
 * Vive aparte del registro del service worker por dos razones. La primera es
 * que se pueda probar: `src/pwa.ts` importa el módulo virtual del plugin, que
 * sólo existe dentro de una compilación de la aplicación. La segunda es que
 * esta regla es lo único que de verdad hay que entender del asunto, y merece
 * leerse sola.
 *
 * El problema que resuelve: `vite-plugin-pwa`, en modo «prompt», registra un
 * oyente de `controlling` en cuanto hay una versión esperando —no cuando
 * alguien pulsa Actualizar— y ese oyente recarga la página. Como `controlling`
 * llega a todas las pestañas del origen a la vez, actualizar en una las
 * recargaba todas, incluida la que tuviera una misa abierta.
 */

/**
 * Si esta pestaña debe recargarse ahora mismo.
 *
 * Sólo si fue ésta la que pidió actualizar, y sólo si no hay nada en marcha
 * que no se pueda interrumpir. Una pestaña que no pidió nada se queda como
 * estaba; una misa o un ensayo se respetan aunque la petición saliera de
 * aquí, porque pulsar un aviso no es aceptar que se corte lo que estás
 * haciendo.
 *
 * Lo que no recarga se queda con el código anterior, y eso está previsto: si
 * luego necesita una pantalla que ya no puede descargar, el límite de error
 * de `chunkRecovery` se encarga.
 */
export function shouldReloadNow(estado: { requestedHere: boolean; sessionActive: boolean }): boolean {
  return estado.requestedHere && !estado.sessionActive;
}
