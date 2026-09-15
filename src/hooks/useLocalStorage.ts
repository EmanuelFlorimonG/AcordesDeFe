import { useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initialValue: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as T;
    } catch {
      // ignore corrupt storage
    }
    return initialValue;
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore quota / privacy-mode errors
    }
  }, [key, value]);

  return [value, setValue] as const;
}
