import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';
import { isTrackingCode } from '../catalog/trackingCode';

/**
 * The proposals sent from this browser: their tracking codes (so the person
 * can check them without writing them down) and, kept apart, the secret edit
 * token each one came with.
 *
 * The token is the only proof, without an account, that someone is the author
 * of a proposal; it will let them correct it when that exists. It is kept in
 * this browser's storage only, never shown on screen, never printed or logged,
 * and `list()` never returns it. Anyone with access to this browser profile
 * could read it, which is the same trust as the drafts themselves.
 */

export const MY_SUBMISSIONS_STORAGE_KEY = 'genesaret_my_submissions';
export const MY_SUBMISSIONS_STORAGE_VERSION = 1;
const MAX_ENTRIES = 50;

export interface MySubmission {
  trackingCode: string;
  title: string;
  submittedAt: string;
}

interface StoredSubmission extends MySubmission {
  editToken: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function read(storage: KeyValueStorage | null): StoredSubmission[] {
  try {
    const raw = storage?.getItem(MY_SUBMISSIONS_STORAGE_KEY);
    if (!raw) return [];
    const data: unknown = JSON.parse(raw);
    if (!isRecord(data) || data.version !== MY_SUBMISSIONS_STORAGE_VERSION || !Array.isArray(data.submissions)) return [];
    return data.submissions.filter(isRecord).flatMap((entry): StoredSubmission[] =>
      typeof entry.trackingCode === 'string' &&
      isTrackingCode(entry.trackingCode) &&
      typeof entry.editToken === 'string' &&
      /^[0-9a-f]{64}$/.test(entry.editToken)
        ? [{
            trackingCode: entry.trackingCode,
            title: typeof entry.title === 'string' ? entry.title.slice(0, 120) : '',
            submittedAt: typeof entry.submittedAt === 'string' ? entry.submittedAt : '',
            editToken: entry.editToken,
          }]
        : []
    );
  } catch {
    // Unreadable: behave as if empty. It is a convenience list, not the record of the proposals.
    return [];
  }
}

export interface MySubmissionsStore {
  /** Newest first, without tokens */
  list(): MySubmission[];
  add(entry: MySubmission & { editToken: string }): boolean;
  /** For the future "edit my proposal"; not used by any screen yet */
  editTokenFor(trackingCode: string): string | null;
}

export function createMySubmissionsStore(storage: KeyValueStorage | null = getBrowserStorage()): MySubmissionsStore {
  return {
    list: () => read(storage).map(({ trackingCode, title, submittedAt }) => ({ trackingCode, title, submittedAt })),
    add(entry) {
      const next = [entry, ...read(storage).filter((item) => item.trackingCode !== entry.trackingCode)].slice(0, MAX_ENTRIES);
      try {
        storage?.setItem(MY_SUBMISSIONS_STORAGE_KEY, JSON.stringify({ version: MY_SUBMISSIONS_STORAGE_VERSION, submissions: next }));
        return Boolean(storage);
      } catch {
        return false;
      }
    },
    editTokenFor: (trackingCode) => read(storage).find((item) => item.trackingCode === trackingCode)?.editToken ?? null,
  };
}
