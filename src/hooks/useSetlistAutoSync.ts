import { useCallback } from 'react';
import { useReconnect } from './useOnline';
import type { SetlistCloudSync } from './useSetlistCloudSync';

/**
 * Sincronizar al volver la conexión.
 *
 * Alguien prepara la misa en el móvil, sin cobertura, y al salir a la calle
 * vuelve la red. Lo que ha escrito debería llegar a su cuenta sin tener que
 * acordarse de pulsar nada — y lo que corrigió en el portátil debería bajar.
 *
 * Esto es sólo el disparador. No sabe reconciliar, ni decidir, ni resolver
 * nada: llama a la misma pasada que llama el botón, con los mismos permisos
 * que el botón, que son ninguno. Una pasada automática no sube por primera vez
 * un Setlist que nunca se guardó en la cuenta: eso lo sigue pidiendo una
 * persona, Setlist a Setlist. Y si el motor encuentra un conflicto, lo deja
 * como conflicto, igual que siempre.
 *
 * Vive en un sitio y nada más: la aplicación lo monta una vez. Dos pantallas
 * escuchando la reconexión serían dos pasadas, y aquí el número correcto de
 * pasadas por reconexión es una.
 */
export function useSetlistAutoSync(sync: SetlistCloudSync, onFinished: () => void): void {
  const attempt = useCallback(() => {
    // Sin cuenta no hay nada que sincronizar: los Setlists de un invitado son
    // suyos y de este dispositivo, y volver a tener red no cambia eso.
    if (!sync.available) return;
    // Ya hay una pasada en el aire —la del botón, o la de una reconexión
    // anterior—. Ésa dirá cómo fue; dos a la vez no sirven de nada.
    if (sync.busyAll || sync.busy) return;

    void sync.syncAll().then((answer) => {
      // Una pasada escribe los Setlists directamente en el almacenamiento, así
      // que lo que está en pantalla hay que volver a leerlo. `null` significa
      // que había otra en marcha y no se hizo nada.
      if (answer) onFinished();
    });
  }, [sync, onFinished]);

  useReconnect(attempt);
}
