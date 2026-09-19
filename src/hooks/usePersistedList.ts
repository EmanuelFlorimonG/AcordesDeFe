import { useEffect, useRef, useState } from 'react';
import type { Repository } from '../storage/localRepository';

/**
 * A list kept in a repository: loaded once, saved after every change (never
 * on first load, so unreadable data stays backed up and untouched), and kept
 * in step with other tabs.
 */
export function usePersistedList<T>(repo: Repository<T>, storageKey: string) {
  const [initial] = useState(() => repo.load());
  const [items, setItems] = useState<T[]>(initial.items);

  const hasLoadedRef = useRef(false);
  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    repo.save(items);
  }, [repo, items]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) setItems(repo.load().items);
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [repo, storageKey]);

  return { items, setItems, recoveredFromUnreadableData: initial.recoveredFromUnreadableData };
}
