import { useEffect, useState } from 'react';
import { createWakeLockController, type WakeLockNavigatorLike } from '../utils/wakeLock';

export interface WakeLockState {
  /** False in browsers without the API: the screen may dim as usual */
  isSupported: boolean;
  isActive: boolean;
}

/**
 * Keeps the screen on while `enabled` is true, when the browser allows it.
 *
 * The lock is asked for on entering and released on leaving, and one lost
 * while the phone was locked or the tab hidden is taken again on coming back.
 */
export function useWakeLock(enabled: boolean): WakeLockState {
  const [isActive, setIsActive] = useState(false);
  const [isSupported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in (navigator as object)
  );
  useEffect(() => {
    if (!enabled) return;
    const controller = createWakeLockController(
      typeof navigator !== 'undefined' ? (navigator as WakeLockNavigatorLike) : null,
      setIsActive
    );
    void controller.request();

    const handleVisibility = () => {
      void controller.handleVisibility(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      void controller.release();
      setIsActive(false);
    };
  }, [enabled]);

  return { isSupported, isActive };
}
