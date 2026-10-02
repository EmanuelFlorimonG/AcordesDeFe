import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T, persist = true) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = persist ? localStorage.getItem(key) : null;
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      // ignore corrupt storage
    }
    return initialValue;
  });

  useEffect(() => {
    if (!persist) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [key, value, persist]);

  return [value, setValue] as const;
}
