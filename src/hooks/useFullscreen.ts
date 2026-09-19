import { useCallback, useEffect, useState } from 'react';
import { isFullscreen, isFullscreenSupported, toggleFullscreen } from '../utils/fullscreen';

export interface FullscreenState {
  isSupported: boolean;
  isFullscreen: boolean;
  toggle: () => void;
}

/**
 * Full screen as an option, never as something that happens on its own.
 * Leaving it (Esc, the system gesture) is noticed, so the menu always says
 * what is actually going on.
 */
export function useFullscreen(): FullscreenState {
  const [isSupported] = useState(() => typeof document !== 'undefined' && isFullscreenSupported(document));
  const [active, setActive] = useState(() => typeof document !== 'undefined' && isFullscreen(document));

  useEffect(() => {
    const handleChange = () => setActive(isFullscreen(document));
    document.addEventListener('fullscreenchange', handleChange);
    return () => document.removeEventListener('fullscreenchange', handleChange);
  }, []);

  const toggle = useCallback(() => {
    void toggleFullscreen(document).then(setActive);
  }, []);

  return { isSupported, isFullscreen: active, toggle };
}
