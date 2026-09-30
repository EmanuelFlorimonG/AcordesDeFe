import { useEffect, useState } from 'react';

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
