import { useCallback, useEffect, useState } from 'react';
import { useAuthServices } from '../auth/useSession';
import { sharedSetlistLink } from '../components/Setlists/ui';

/**
 * El enlace público de un Setlist, mientras alguien tiene abierta su ventana
 * de compartir.
 *
 * Nada de esto pasa solo: mirar si hay enlace es leer, y crear o desactivar
 * uno es siempre una pulsación. Abrir la ventana no comparte nada.
 *
 * El enlace se arma con el sitio donde está la aplicación ahora mismo, así
 * que el que se copia, el que se enseña y el que lleva dentro el código QR
 * son exactamente el mismo — no hay dos formas de escribirlo.
 */

export type SetlistShareStatus =
  /** Preguntando si ya está compartido. */
  | 'loading'
  /** No está compartido. */
  | 'off'
  /** Está compartido, y `link` dice dónde. */
  | 'on'
  /** No se pudo saber, o no se pudo hacer. */
  | 'error';

export interface SetlistShare {
  status: SetlistShareStatus;
  /** El enlace entero, listo para copiar. Null mientras no haya. */
  link: string | null;
  /** Una acción en marcha, para no lanzarla dos veces. */
  busy: boolean;
  /** Qué ha pasado, en palabras de la persona. */
  message: string | null;
  create: () => void;
  revoke: () => void;
}

const SESSION_LOST = 'Tu sesión ha caducado. Vuelve a entrar e inténtalo otra vez.';
const NO_CONNECTION = 'No se pudo conectar. Inténtalo otra vez.';

/** Dónde vive la aplicación ahora mismo: el portátil o el dominio publicado. */
const here = () => ({ origin: window.location.origin, pathname: window.location.pathname });

/**
 * `setlistId` es el Setlist cuya ventana está abierta, o null cuando no hay
 * ninguna. Cambiarlo empieza de cero: un enlace pertenece a un Setlist.
 */
export function useSetlistShare(setlistId: string | null): SetlistShare {
  const { services } = useAuthServices();
  const [status, setStatus] = useState<SetlistShareStatus>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /** Una sesión recién leída, con su identidad y su token a la vez. */
  const shares = useCallback(async () => {
    if (!services || !setlistId) return null;
    const capture = await services.auth.authenticated();
    if (!capture) return null;
    const { sharesFor } = await import('../storage/setlistShareSession');
    return sharesFor(capture);
  }, [services, setlistId]);

  // Otro Setlist es otro enlace: se empieza de cero durante el render, no en
  // un efecto, para que no se vea un instante el enlace del anterior.
  const [openFor, setOpenFor] = useState<string | null>(setlistId);
  if (openFor !== setlistId) {
    setOpenFor(setlistId);
    setStatus('loading');
    setToken(null);
    setMessage(null);
  }

  // Al abrir la ventana: ¿ya está compartido? Sólo lee.
  useEffect(() => {
    if (!setlistId) return;
    let current = true;
    void (async () => {
      try {
        const repository = await shares();
        if (!repository) {
          if (current) {
            setStatus('error');
            setMessage(SESSION_LOST);
          }
          return;
        }
        const found = await repository.find(setlistId);
        if (!current) return;
        setToken(found);
        setStatus(found ? 'on' : 'off');
      } catch {
        if (current) {
          setStatus('error');
          setMessage(NO_CONNECTION);
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [setlistId, shares]);

  const act = useCallback(
    (work: (repository: NonNullable<Awaited<ReturnType<typeof shares>>>) => Promise<void>) => {
      if (busy || !setlistId) return;
      setBusy(true);
      setMessage(null);
      void (async () => {
        try {
          const repository = await shares();
          if (!repository) {
            setStatus('error');
            setMessage(SESSION_LOST);
            return;
          }
          await work(repository);
        } catch {
          setMessage(NO_CONNECTION);
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, setlistId, shares]
  );

  const create = useCallback(
    () =>
      act(async (repository) => {
        const created = await repository.create(setlistId as string);
        setToken(created);
        setStatus('on');
        setMessage('Enlace creado. Ya puedes compartirlo.');
      }),
    [act, setlistId]
  );

  const revoke = useCallback(
    () =>
      act(async (repository) => {
        await repository.revoke(setlistId as string);
        // A partir de este instante el enlace anterior no abre nada, y
        // volver a compartir dará uno distinto.
        setToken(null);
        setStatus('off');
        setMessage('Enlace desactivado. Ya no abre nada.');
      }),
    [act, setlistId]
  );

  return {
    status,
    link: token ? sharedSetlistLink(token, here()) : null,
    busy,
    message,
    create,
    revoke,
  };
}
