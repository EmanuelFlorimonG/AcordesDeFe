import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPwaState, subscribeToPwa, type PwaState } from '../pwa';

/**
 * El estado del service worker, visto desde React.
 *
 * `src/pwa.ts` no sabe de React a propósito: registra, escucha y publica. Esto
 * es el puente, y es todo lo que hacía falta para que una pantalla pueda
 * ofrecer la versión nueva. Nada se aplica solo.
 */
export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribeToPwa, getPwaState, getPwaState);
}

/**
 * Que la aplicación ya está guardada y abre sin conexión, dicho una vez.
 *
 * Es una noticia de un momento, no un estado: pasa cuando el service worker
 * termina de guardarlo todo, y a partir de ahí es simplemente cómo son las
 * cosas. Un aviso permanente diciéndolo sería ruido para siempre.
 */
export function useOfflineReadyOnce(seconds = 6): boolean {
  const ready = usePwaState().kind === 'ready';
  // Que la noticia ha llegado se apunta durante el render: ya está aquí, no
  // hay nada con lo que sincronizarse. Lo único que espera es el silencio.
  const [said, setSaid] = useState(false);
  const [quiet, setQuiet] = useState(false);
  if (ready && !said) setSaid(true);
  const showing = said && !quiet;

  useEffect(() => {
    if (!showing) return;
    const timer = window.setTimeout(() => setQuiet(true), seconds * 1000);
    return () => window.clearTimeout(timer);
  }, [showing, seconds]);

  return showing;
}
