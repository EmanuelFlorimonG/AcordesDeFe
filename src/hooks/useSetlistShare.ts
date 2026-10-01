import { useCallback, useEffect, useState } from 'react';
import { useAuthServices, useSession } from '../auth/useSession';
import { sharedSetlistLink } from '../components/Setlists/ui';
import {
  classifyShareFailure,
  createKnownShareStore,
  lookupShare,
  type KnownShare,
  type ShareFailure,
} from '../storage/knownShares';
import { userSetlists } from '../storage/setlistStorage';
import { isOnline } from './useOnline';

/**
 * El enlace público de un Setlist, mientras alguien tiene abierta su ventana
 * de compartir.
 *
 * Nada de esto pasa solo: mirar si hay enlace es leer, y crear o desactivar
 * uno es siempre una pulsación. Abrir la ventana no comparte nada.
 *
 * Supabase manda siempre que se le pueda preguntar. Lo que este dispositivo
 * recuerda es memoria, no una segunda verdad: sirve para que alguien sin
 * cobertura pueda enseñar el enlace que ya tenía, y se borra en cuanto la
 * nube dice que ese enlace ya no existe.
 *
 * La diferencia que decide todo es por qué falló una petición. No llegar al
 * servidor y que el servidor diga que no son cosas distintas: sin red, lo
 * último que se supo es la mejor respuesta; con la sesión caducada, enseñar
 * lo guardado sería decir que todo va bien cuando no va.
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
  /**
   * El enlace sale de lo que este dispositivo recordaba, sin haber podido
   * confirmarlo. Sigue abriendo, salvo que alguien lo haya desactivado desde
   * otro sitio — y eso, sin conexión, no hay forma de saberlo.
   */
  fromMemory: boolean;
  /** Si hay conexión para crear o desactivar. */
  online: boolean;
  /** Una acción en marcha, para no lanzarla dos veces. */
  busy: boolean;
  /** Qué ha pasado, en palabras de la persona. */
  message: string | null;
  create: () => void;
  revoke: () => void;
}

const SESSION_LOST = 'Tu sesión ha caducado. Vuelve a entrar e inténtalo otra vez.';
const NO_CONNECTION = 'No se pudo conectar. Inténtalo otra vez.';
const SERVER_PROBLEM = 'No se pudo comprobar el enlace. Inténtalo otra vez.';
export const NEEDS_INTERNET_TO_CREATE = 'Necesitas conexión a internet para crear un enlace público.';
export const NEEDS_INTERNET_TO_REVOKE = 'Necesitas conexión a internet para desactivar el enlace.';

/** Lo que se dice cuando el fallo impide saber en qué estado está el enlace. */
const explain = (failure: ShareFailure): string =>
  failure === 'auth' ? SESSION_LOST : failure === 'server' ? SERVER_PROBLEM : NO_CONNECTION;

/** Dónde vive la aplicación ahora mismo: el portátil o el dominio publicado. */
const here = () => ({ origin: window.location.origin, pathname: window.location.pathname });

/**
 * `setlistId` es el Setlist cuya ventana está abierta, o null cuando no hay
 * ninguna. Cambiarlo empieza de cero: un enlace pertenece a un Setlist.
 */
export function useSetlistShare(setlistId: string | null): SetlistShare {
  const { services } = useAuthServices();
  const who = useSession();
  const [status, setStatus] = useState<SetlistShareStatus>('loading');
  const [share, setShare] = useState<KnownShare | null>(null);
  const [fromMemory, setFromMemory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [online, setOnline] = useState(isOnline);

  // La cuenta de quien está dentro, que es la que da nombre a lo guardado.
  // Un invitado no tiene ninguna, y tampoco tiene enlaces: crearlos exige sesión.
  const userId = who.state === 'signed-in' ? who.session.userId.trim() : '';

  /** Lo que este dispositivo recuerda de esta cuenta. Nunca de otra. */
  const memory = useCallback(
    () => (userId ? createKnownShareStore(userSetlists(userId)) : null),
    [userId]
  );

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
    setShare(null);
    setFromMemory(false);
    setMessage(null);
  }

  // Si hay red o no, para poder decirlo sin intentarlo.
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  // Al abrir la ventana: ¿ya está compartido? Sólo lee.
  useEffect(() => {
    if (!setlistId) return;
    let current = true;

    void (async () => {
      const online = isOnline();
      // Sin conexión no hace falta sesión ni petición: la respuesta está aquí.
      const repository = online ? await shares() : null;
      if (!current) return;
      if (online && !repository) {
        setStatus('error');
        setMessage(SESSION_LOST);
        return;
      }

      const found = await lookupShare(
        setlistId,
        () => (repository as NonNullable<typeof repository>).find(setlistId),
        memory(),
        online
      );
      if (!current) return;
      setShare(found.state === 'on' ? found.share : null);
      setFromMemory(found.state === 'on' && found.fromMemory);
      setStatus(found.state === 'error' ? 'error' : found.state);
      if (found.state === 'error') setMessage(explain(found.failure));
    })();

    return () => {
      current = false;
    };
  }, [setlistId, shares, memory]);

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
        } catch (error) {
          setMessage(explain(classifyShareFailure(error)));
        } finally {
          setBusy(false);
        }
      })();
    },
    [busy, setlistId, shares]
  );

  const create = useCallback(() => {
    // Sin conexión no se inventa un enlace ni se finge que se creó: un token
    // lo pone la base de datos, y aquí no hay base de datos que lo ponga.
    if (!isOnline()) {
      setMessage(NEEDS_INTERNET_TO_CREATE);
      return;
    }
    act(async (repository) => {
      const created = await repository.create(setlistId as string);
      memory()?.remember(created);
      setShare(created);
      setFromMemory(false);
      setStatus('on');
      setMessage('Enlace creado. Ya puedes compartirlo.');
    });
  }, [act, setlistId, memory]);

  const revoke = useCallback(() => {
    // Desactivar es borrar una fila en Supabase. Sin conexión no se borra
    // nada, y desde luego no se finge borrándolo sólo aquí.
    if (!isOnline()) {
      setMessage(NEEDS_INTERNET_TO_REVOKE);
      return;
    }
    act(async (repository) => {
      await repository.revoke(setlistId as string);
      // A partir de este instante el enlace anterior no abre nada, y volver
      // a compartir dará uno distinto. Lo que se recordaba, sobra.
      memory()?.forget(setlistId as string);
      setShare(null);
      setFromMemory(false);
      setStatus('off');
      setMessage('Enlace desactivado. Ya no abre nada.');
    });
  }, [act, setlistId, memory]);

  return {
    status,
    link: share ? sharedSetlistLink(share.token, here()) : null,
    fromMemory,
    online,
    busy,
    message,
    create,
    revoke,
  };
}
