/** The part of the Web Storage API the stores need, so tests can pass their own. */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage, or null where the browser blocks it (privacy settings). */
export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}
