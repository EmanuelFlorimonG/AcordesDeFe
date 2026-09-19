/**
 * The browser side of a repository, shared by every store that keeps a list:
 * read once, write after changes, and back up anything unreadable before it
 * could be overwritten. Screens never see this: they see a Repository, which
 * an API-backed one can replace later.
 */

export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

export interface LoadResult<T> {
  items: T[];
  /** Stored data couldn't be read at all (it was backed up first) */
  recoveredFromUnreadableData: boolean;
}

export interface Repository<T> {
  load(): LoadResult<T>;
  save(items: T[]): void;
}

export function getBrowserStorage(): KeyValueStorage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // storage blocked (privacy settings)
  }
}

export function createLocalRepository<T>(
  storage: KeyValueStorage | null,
  key: string,
  backupKey: string,
  parse: (raw: string | null) => { items: T[]; unreadable: boolean },
  serialize: (items: T[]) => string
): Repository<T> {
  const read = (name: string) => {
    try {
      return storage?.getItem(name) ?? null;
    } catch {
      return null;
    }
  };
  const write = (name: string, value: string) => {
    try {
      storage?.setItem(name, value);
    } catch {
      // quota or blocked storage: the data stays in memory for this visit
    }
  };
  return {
    load() {
      const raw = read(key);
      const { items, unreadable } = parse(raw);
      if (unreadable && raw !== null) write(backupKey, raw);
      return { items, recoveredFromUnreadableData: unreadable };
    },
    save(items) {
      write(key, serialize(items));
    },
  };
}
