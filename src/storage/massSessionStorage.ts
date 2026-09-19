/**
 * Where mass mode was left.
 *
 * Reloading a phone in the middle of a celebration must not send whoever is
 * playing back to the first song. Only the setlist and the song being played
 * are remembered, for this tab and this visit: it is a safety net, not a
 * history, and it is cleared when mass mode is left on purpose.
 */

export const MASS_SESSION_KEY = 'genesaret_mass_session';
export const MASS_SESSION_VERSION = 1;

export interface MassSession {
  setlistId: string;
  itemId: string;
  updatedAt: number;
}

/** The part of the Web Storage API this module needs. */
export type MassSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface MassSessionRepository {
  read(): MassSession | null;
  write(session: Omit<MassSession, 'updatedAt'>): void;
  clear(): void;
}

const asString = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/** A session from stored text, or null when there is nothing trustworthy in it. */
export function parseMassSession(raw: string | null): MassSession | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  if (record.version !== MASS_SESSION_VERSION) return null;
  const setlistId = asString(record.setlistId);
  const itemId = asString(record.itemId);
  if (!setlistId || !itemId) return null;
  const updatedAt = typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)
    ? record.updatedAt
    : 0;
  return { setlistId, itemId, updatedAt };
}

export function serializeMassSession(session: MassSession): string {
  return JSON.stringify({ version: MASS_SESSION_VERSION, ...session });
}

function getSessionStorage(): MassSessionStorage | null {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null;
  } catch {
    return null; // storage blocked (private mode): mass mode still works, it just forgets
  }
}

export function createMassSessionRepository(
  storage: MassSessionStorage | null = getSessionStorage(),
  now: () => number = Date.now
): MassSessionRepository {
  return {
    read() {
      try {
        return parseMassSession(storage?.getItem(MASS_SESSION_KEY) ?? null);
      } catch {
        return null;
      }
    },
    write(session) {
      try {
        storage?.setItem(MASS_SESSION_KEY, serializeMassSession({ ...session, updatedAt: now() }));
      } catch {
        // quota or blocked storage: the session simply isn't remembered
      }
    },
    clear() {
      try {
        storage?.removeItem(MASS_SESSION_KEY);
      } catch {
        // nothing to do: there is no state worth reporting an error for
      }
    },
  };
}
