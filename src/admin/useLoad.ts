import { useEffect, useState } from 'react';
import { toEditorialError, type EditorialError } from './editorialRepository';

export type Loaded<T> =
  | { state: 'loading' }
  | { state: 'ready'; value: T }
  | { state: 'error'; error: EditorialError };

/**
 * Loads something for a screen and loads it again when `key` changes or on
 * reload(). An answer that arrives after the key moved on is ignored.
 */
export function useLoad<T>(load: () => Promise<T>, key: string): Loaded<T> & { reload: () => void } {
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<{ key: string; loaded: Loaded<T> } | null>(null);
  const current = `${key}#${round}`;

  useEffect(() => {
    let active = true;
    load().then(
      (value) => active && setResult({ key: current, loaded: { state: 'ready', value } }),
      (error: unknown) => active && setResult({ key: current, loaded: { state: 'error', error: toEditorialError(error) } })
    );
    return () => {
      active = false;
    };
    // `load` is recreated every render; `current` says when it must run again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const loaded: Loaded<T> = result && result.key === current ? result.loaded : { state: 'loading' };
  return { ...loaded, reload: () => setRound((value) => value + 1) };
}
