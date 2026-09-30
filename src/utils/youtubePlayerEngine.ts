// Singleton wrapper around the YouTube IFrame Player API.
//
// The player instance, its hidden DOM container, and the <script> tag are all
// created at module scope — outside React's render tree — so this survives
// React StrictMode's mount/cleanup/mount cycle without ever creating a second
// YT.Player (which the API does not support cleanly) and without ever being
// torn down while the app is still running.

export const PLAYER_STATE = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export interface YouTubePlayerListener {
  onReady?: () => void;
  onStateChange?: (state: number) => void;
  onError?: (errorCode: number) => void;
}

const CONTAINER_ID = 'genesaret-youtube-audio-engine';
const SCRIPT_MARK = 'data-genesaret-youtube-api';

/**
 * No se pudo llegar a YouTube: sin conexión, bloqueado por la red, o la carga
 * del reproductor se cortó a medias.
 *
 * Es su propio tipo porque quien escucha tiene que poder decirlo con palabras
 * distintas a «esta canción no está disponible»: la canción está bien, lo que
 * falta es internet.
 */
export class YouTubeUnavailableError extends Error {
  constructor(message = 'No se pudo cargar el reproductor de YouTube.') {
    super(message);
    this.name = 'YouTubeUnavailableError';
  }
}

/** Lo que el navegador dice ahora mismo. `false` sólo cuando lo afirma. */
const offline = (): boolean => typeof navigator !== 'undefined' && navigator.onLine === false;

/** Cuánto se espera a que la API aparezca antes de darla por perdida. */
const API_TIMEOUT_MS = 10_000;

let apiPromise: Promise<void> | null = null;

/**
 * Carga la API de YouTube, o dice que no se puede.
 *
 * Antes esto podía quedarse esperando para siempre: se inyectaba el
 * `<script>` y se confiaba en que algún día llamara a
 * `onYouTubeIframeAPIReady`. Sin conexión, o con YouTube bloqueado, esa
 * llamada no llega nunca — y la promesa tampoco se rompía, así que el botón
 * de reproducir se quedaba en «Cargando reproductor…» hasta recargar.
 *
 * Ahora falla de tres maneras y todas terminan: el navegador dice que no hay
 * red y ni se intenta; el `<script>` avisa de que no pudo cargarse; o pasa
 * demasiado tiempo sin que la API aparezca. En los tres casos se olvida el
 * intento, así que volver a pulsar cuando haya internet vuelve a intentarlo
 * de verdad en vez de devolver el fracaso de antes.
 */
function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise;

  // Sin conexión no se pide nada: ni una petición a YouTube, ni un <script>
  // colgado esperando. Y al no recordar el intento, con internet se reintenta.
  if (offline()) return Promise.reject(new YouTubeUnavailableError('La reproducción necesita conexión a internet.'));

  apiPromise = new Promise<void>((resolve, reject) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    let settled = false;
    const done = (fail?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (fail) reject(fail);
      else resolve();
    };

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      done();
    };

    // La API a veces no llama a nada: el <script> carga y se queda callado
    // (un portal cautivo que devuelve su propia página, por ejemplo).
    const timer = window.setTimeout(() => done(new YouTubeUnavailableError()), API_TIMEOUT_MS);

    const existing = document.querySelector(`script[${SCRIPT_MARK}]`);
    if (existing) {
      existing.addEventListener('error', () => done(new YouTubeUnavailableError()), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.setAttribute(SCRIPT_MARK, 'true');
    script.addEventListener('error', () => {
      // Se quita para que el siguiente intento vuelva a pedirlo de verdad.
      script.remove();
      done(new YouTubeUnavailableError());
    });
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // Olvidar el intento es lo que permite reintentar cuando vuelva la red.
    apiPromise = null;
    throw error;
  });

  return apiPromise;
}

function ensureHiddenContainer(): HTMLDivElement {
  let host = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!host) {
    host = document.createElement('div');
    host.id = CONTAINER_ID;
    // Kept in the DOM (not display:none) so the browser doesn't throttle or
    // suspend playback for being "invisible" — just tucked off-screen.
    Object.assign(host.style, {
      position: 'fixed',
      width: '1px',
      height: '1px',
      top: '-9999px',
      left: '-9999px',
      overflow: 'hidden',
      pointerEvents: 'none',
    });
    document.body.appendChild(host);
  }
  return host;
}

let player: YT.Player | null = null;
let playerPromise: Promise<YT.Player> | null = null;
const listeners = new Set<YouTubePlayerListener>();

export function getYouTubePlayer(): Promise<YT.Player> {
  if (playerPromise) return playerPromise;

  playerPromise = loadIframeApi().then(
    () =>
      new Promise<YT.Player>((resolve) => {
        const host = ensureHiddenContainer();
        // Defensive: if a player was already created here in a previous
        // instantiation of this module (e.g. a dev-server hot-reload) and
        // wasn't cleaned up, its iframe would otherwise be left orphaned —
        // still playing, with no reference left to control it — while a
        // second one gets created alongside it. Clearing first guarantees
        // at most one iframe ever exists.
        host.innerHTML = '';
        const mountPoint = document.createElement('div');
        host.appendChild(mountPoint);

        player = new window.YT!.Player(mountPoint, {
          height: '1',
          width: '1',
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            fs: 0,
          },
          events: {
            onReady: () => {
              listeners.forEach((l) => l.onReady?.());
              resolve(player!);
            },
            onStateChange: (event) => {
              listeners.forEach((l) => l.onStateChange?.(event.data));
            },
            onError: (event) => {
              listeners.forEach((l) => l.onError?.(event.data));
            },
          },
        });
      })
  );

  // Un intento fallido no se guarda: pulsar otra vez con internet tiene que
  // volver a intentarlo, no repetir el fracaso de hace media hora.
  playerPromise = playerPromise.catch((error: unknown) => {
    playerPromise = null;
    throw error;
  });

  return playerPromise;
}

/** Returns the player synchronously if it's already ready, else null. */
export function getReadyPlayer(): YT.Player | null {
  return player;
}

export function subscribeYouTubePlayer(listener: YouTubePlayerListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Dev-only: when Vite hot-reloads this module (e.g. while iterating on the
// player), tear down the old player and its hidden iframe properly instead
// of leaving it orphaned and still playing underneath a freshly-created one.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    try {
      player?.destroy();
    } catch {
      // player may already be in a bad state — the DOM removal below is
      // what actually matters for stopping playback.
    }
    player = null;
    playerPromise = null;
    listeners.clear();
    document.getElementById(CONTAINER_ID)?.remove();
  });
}
