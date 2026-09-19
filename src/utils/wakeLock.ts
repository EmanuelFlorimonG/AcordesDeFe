/**
 * Keeping the screen on while playing.
 *
 * The browser API is wrapped here, away from the screen that uses it, so the
 * behaviour can be tested: a browser without the API, a request that is
 * refused, a lock the system drops when the phone is locked, and getting it
 * back when the page is visible again. Nothing here ever throws: if the screen
 * cannot be kept on, the celebration simply goes on without it.
 */

export interface WakeLockSentinelLike {
  released?: boolean;
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
  removeEventListener?(type: 'release', listener: () => void): void;
}

export interface WakeLockNavigatorLike {
  wakeLock?: {
    request(type: 'screen'): Promise<WakeLockSentinelLike>;
  };
}

export interface WakeLockController {
  /** True when this browser has the API at all */
  readonly isSupported: boolean;
  /** True while the screen is actually being kept on */
  isActive(): boolean;
  /** Asks for the lock and keeps asking again after interruptions */
  request(): Promise<boolean>;
  release(): Promise<void>;
  /** Call on visibilitychange: a lock lost while hidden comes back on return */
  handleVisibility(isVisible: boolean): Promise<void>;
}

export function createWakeLockController(
  navigatorLike: WakeLockNavigatorLike | null | undefined,
  onChange?: (isActive: boolean) => void
): WakeLockController {
  const api = navigatorLike?.wakeLock;
  let sentinel: WakeLockSentinelLike | null = null;
  /** True while mass mode wants the screen on, even if the lock is lost. */
  let wanted = false;

  const setSentinel = (next: WakeLockSentinelLike | null) => {
    sentinel = next;
    onChange?.(next !== null);
  };

  const acquire = async (): Promise<boolean> => {
    if (!api || sentinel) return sentinel !== null;
    try {
      const next = await api.request('screen');
      // The system releases the lock on its own when the screen is locked or
      // the tab is hidden; when that happens there is nothing to release later.
      next.addEventListener?.('release', () => {
        if (sentinel === next) setSentinel(null);
      });
      setSentinel(next);
      return true;
    } catch {
      setSentinel(null);
      return false;
    }
  };

  return {
    isSupported: Boolean(api),
    isActive: () => sentinel !== null,
    async request() {
      wanted = true;
      return acquire();
    },
    async release() {
      wanted = false;
      const current = sentinel;
      setSentinel(null);
      if (!current) return;
      try {
        await current.release();
      } catch {
        // already gone: nothing to report
      }
    },
    async handleVisibility(isVisible) {
      if (!isVisible) return;
      if (!wanted || sentinel) return;
      await acquire();
    },
  };
}
