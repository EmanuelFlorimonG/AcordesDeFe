import { useEffect, useRef, useState } from 'react';

/**
 * Si el navegador dice que hay conexión.
 *
 * Es lo que dice el navegador, no la verdad: `navigator.onLine` sabe que hay
 * una red enchufada, no que se llegue a Supabase o a YouTube. Por eso sólo se
 * toma como cierto lo negativo — cuando afirma que no hay red, no la hay— y
 * `true` significa «inténtalo», no «funcionará». Lo que dependa de que una
 * petición llegue tiene que seguir manejando su propio fallo.
 *
 * Vive aquí, y no dentro de cada pantalla, porque ya hacía falta en dos
 * sitios y hará falta en más conforme la aplicación funcione sin conexión.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(isOnline);

  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Entre el primer render y este efecto la conexión puede haber cambiado.
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}

/** Lo mismo fuera de React, para lo que se pregunta una sola vez. */
export function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/**
 * Lo que se espera a que la red se asiente antes de intentar algo con ella.
 *
 * El evento `online` llega cuando el sistema cree que hay red, que es antes de
 * que la red sirva: el Wi-Fi todavía asociándose, el DNS sin responder, el
 * portal cautivo sin aceptar. Un intento inmediato fallaría por eso y no por
 * nada real, así que se le da un momento. Uno solo: si falla, ya habrá otra
 * reconexión, y eso es mejor que insistir.
 */
export const RECONNECT_SETTLE_MS = 2000;

/**
 * Cuando vuelve la conexión, y sólo entonces.
 *
 * Lo que importa es la transición, no el estado: abrir la aplicación con red
 * no es volver a tener red, y nada debería pasar sólo porque algo se dibujó.
 * Por eso se recuerda si estábamos sin ella, y sólo se avisa al pasar de no
 * tenerla a tenerla.
 *
 * Si la red se vuelve a caer mientras se esperaba a que se asentara, el aviso
 * se cancela: ya no hay nada que intentar, y volver a tenerla avisará otra vez.
 */
export function useReconnect(onReconnect: () => void, settleMs = RECONNECT_SETTLE_MS): void {
  // Lo último que se quiso hacer, para que el aviso no llame a una versión
  // vieja de la acción y para no reenganchar los eventos en cada render.
  const handler = useRef(onReconnect);
  useEffect(() => {
    handler.current = onReconnect;
  }, [onReconnect]);

  useEffect(() => {
    let offline = !isOnline();
    let timer: number | undefined;
    const cancel = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      timer = undefined;
    };

    const back = () => {
      if (!offline) return;
      offline = false;
      cancel();
      timer = window.setTimeout(() => {
        timer = undefined;
        handler.current();
      }, settleMs);
    };
    const gone = () => {
      offline = true;
      cancel();
    };

    window.addEventListener('online', back);
    window.addEventListener('offline', gone);
    return () => {
      cancel();
      window.removeEventListener('online', back);
      window.removeEventListener('offline', gone);
    };
  }, [settleMs]);
}
