import type { SetlistSyncState } from '../../hooks/useSetlistCloudSync';

/**
 * Qué decirle a la persona sobre la conexión, sus Setlists y la aplicación.
 *
 * Todo lo que pasa por debajo —que no hay red, que una pasada está en marcha,
 * que hay dos versiones de un Setlist, que hay una versión nueva esperando—
 * cabe en una sola línea, y sólo en una. La aplicación no se llena de avisos
 * apilados: se dice lo más importante de este momento y nada más.
 *
 * El orden no es arbitrario. Sin red, lo demás no se puede ni intentar, así
 * que eso va primero. Luego lo que espera a una persona, luego lo que salió
 * mal, luego lo que está pasando, y por último lo que puede esperar. Una
 * versión nueva no corre prisa: sigue esperando debajo de todo lo demás y
 * vuelve a asomar cuando no haya nada más urgente que contar.
 *
 * Esto es sólo la decisión. No pinta nada, no sabe de React, y por eso se
 * puede comprobar entera sin montar una pantalla.
 */

export type NoticeKind =
  /** El navegador dice que no hay red. */
  | 'offline'
  /** Un Setlist cambió aquí y en la cuenta. Espera a que alguien elija. */
  | 'conflict'
  /** La última pasada no se pudo hacer. */
  | 'sync-error'
  /** Hay una pasada en marcha. */
  | 'syncing'
  /** Hay una versión nueva de la aplicación esperando. */
  | 'update'
  /** Acaba de volver la red. Se dice un momento y se calla. */
  | 'reconnected'
  /** La aplicación ya está guardada y abre sin conexión. Se dice una vez. */
  | 'offline-ready';

/** Lo que se puede hacer desde el aviso, cuando hay algo que hacer. */
export type NoticeAction = 'resolve' | 'retry' | 'update';

export interface Notice {
  kind: NoticeKind;
  text: string;
  action?: { name: NoticeAction; label: string };
  /** Si se va solo al rato, o si se queda mientras siga siendo verdad. */
  fleeting: boolean;
}

export interface ConnectionNow {
  /** Lo que dice el navegador. */
  online: boolean;
  /** Cómo va la sincronización de esta cuenta (Fase 5). */
  sync: SetlistSyncState;
  /** Si hay cuenta con la que sincronizar. Un invitado no tiene nada que decir aquí. */
  canSync: boolean;
  /** Si hay una versión nueva esperando a que alguien diga que sí. */
  update: boolean;
  /** Si acaba de volver la red. */
  reconnected: boolean;
  /** Si la aplicación acaba de quedar lista para usarse sin conexión. */
  offlineReady: boolean;
  /** Si hay un Setlist concreto que abrir para resolver el conflicto. */
  canResolve: boolean;
}

const OFFLINE = 'Sin conexión. Tus canciones y Setlists siguen disponibles.';
const CONFLICT = 'Hay un conflicto de sincronización pendiente';
const SYNC_ERROR = 'No pudimos sincronizar tus Setlists';
const SYNCING = 'Sincronizando Setlists…';
const UPDATE = 'Nueva versión disponible';
const RECONNECTED = 'Conexión restaurada';
const OFFLINE_READY = 'Acordes de Fe está listo para usarse sin conexión';

export function connectionNotice(now: ConnectionNow): Notice | null {
  // Sin red no se puede ni intentar lo demás, y es lo único que cambia lo que
  // la persona puede hacer ahora mismo. No se promete que todo funcione:
  // reproducir necesita internet, y compartir un enlace nuevo también.
  if (!now.online) return { kind: 'offline', text: OFFLINE, fleeting: false };

  if (now.canSync) {
    // Lo que espera a una persona va antes que lo que salió solo. Y no se va
    // por su cuenta: mientras haya dos versiones, sigue habiendo dos
    // versiones. Resolverlo es la pantalla de siempre, no una nueva.
    if (now.sync === 'conflict') {
      return {
        kind: 'conflict',
        text: CONFLICT,
        action: now.canResolve ? { name: 'resolve', label: 'Resolver' } : undefined,
        fleeting: false,
      };
    }
    if (now.sync === 'error') {
      // No se dice que se haya perdido nada, porque no se ha perdido nada:
      // lo de este dispositivo sigue aquí y la próxima pasada lo intentará.
      return { kind: 'sync-error', text: SYNC_ERROR, action: { name: 'retry', label: 'Reintentar' }, fleeting: false };
    }
    if (now.sync === 'syncing') return { kind: 'syncing', text: SYNCING, fleeting: false };
  }

  // Una versión nueva puede esperar a que no haya nada más que contar, y
  // sigue esperando mientras tanto: nadie la pierde por mirar otra cosa.
  if (now.update) return { kind: 'update', text: UPDATE, action: { name: 'update', label: 'Actualizar' }, fleeting: false };

  if (now.reconnected) return { kind: 'reconnected', text: RECONNECTED, fleeting: true };
  if (now.offlineReady) return { kind: 'offline-ready', text: OFFLINE_READY, fleeting: true };
  return null;
}
