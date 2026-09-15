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

let apiPromise: Promise<void> | null = null;

function loadIframeApi(): Promise<void> {
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const previousCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previousCallback?.();
      resolve();
    };

    if (!document.querySelector('script[data-genesaret-youtube-api]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.setAttribute('data-genesaret-youtube-api', 'true');
      document.head.appendChild(script);
    }
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
