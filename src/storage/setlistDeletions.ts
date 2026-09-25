import { setlistKeys, type KeyValueStorage, type SetlistScope } from './setlistStorage';

/**
 * A setlist somebody deleted on purpose, written down so the deletion can
 * travel.
 *
 * Deleting used to be the end of it: the setlist left the list and nothing
 * remained. That is fine while setlists live on one device, and wrong the
 * moment they are also in the cloud, because "I never had this one" and "I
 * deleted this one" then look exactly alike — and the difference decides
 * whether the copy in the cloud comes back or goes away. This is the only
 * evidence of that difference, so it is written *before* the setlist goes,
 * and if it cannot be written the setlist stays.
 *
 * It is not a copy of anything. What was deleted is gone; this is a name and
 * a moment. A visitor keeps none of it at all, the same as they keep no
 * baselines: no account, no cloud, nothing to propagate to.
 */

export interface SetlistDeletionMarker {
  setlistId: string;
  /** When the person asked for it, by this device's clock. Never used to resolve a conflict. */
  deletedAt: number;
  /**
   * The last cloud revision this device had agreed on for that setlist, if
   * there was one.
   *
   * It does *not* claim the row is still at that revision. It records what
   * was known when the decision was made, which is what lets the deletion be
   * sent as "remove it if it is still the one I saw" instead of removing
   * whatever happens to be there — including an edit made somewhere else
   * that nobody here has ever seen.
   *
   * Absent means the setlist had never been shared, or this device never
   * knew what the cloud had. Nothing is invented to fill it in.
   */
  baseRevision?: number;
}

export const SETLIST_DELETIONS_KEY = 'genesaret_setlist_deletions';
/** Only the shape of this metadata; setlists and baselines are versioned apart. */
export const SETLIST_DELETIONS_VERSION = 1;

const SETLIST_STORAGE_PREFIX = 'genesaret_setlists';

/**
 * Where an identity keeps its deletions, or null when it keeps none. Derived
 * from the setlists' own key, so two accounts can never land on the same one
 * and no account can spell the visitor's.
 */
export function deletionsKey(scope: SetlistScope): string | null {
  if (scope.kind === 'guest') return null;
  const keys = setlistKeys(scope);
  return keys ? keys.data.replace(SETLIST_STORAGE_PREFIX, SETLIST_DELETIONS_KEY) : null;
}

export interface SetlistDeletionRepository {
  /** The key this repository writes, or null when this identity keeps nothing. */
  readonly key: string | null;
  list(): SetlistDeletionMarker[];
  get(setlistId: string): SetlistDeletionMarker | null;
  /**
   * Writes down that this setlist was deleted, and returns the marker — or
   * null for an identity that keeps none. **Throws if it cannot be stored**,
   * because a deletion that leaves no evidence is a deletion that will be
   * undone by the next read from the cloud.
   */
  mark(setlistId: string, deletedAt: number, baseRevision?: number): SetlistDeletionMarker | null;
  /** Forgets one, once its deletion has been carried out — or deliberately undone. */
  clear(setlistId: string): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Which of two notes about the same setlist to keep.
 *
 * The later deletion wins: it is the more recent statement of what somebody
 * wanted. An exact tie keeps the one that knows which revision the decision
 * was made against, because that is the only one that can be acted on; a tie
 * with nothing to choose between keeps what was already there. An older note
 * never replaces a newer one, whether it arrives by hand-editing the file or
 * by a call that should not have happened.
 */
function laterOf(kept: SetlistDeletionMarker, candidate: SetlistDeletionMarker): SetlistDeletionMarker {
  if (candidate.deletedAt > kept.deletedAt) return candidate;
  if (candidate.deletedAt < kept.deletedAt) return kept;
  return kept.baseRevision === undefined && candidate.baseRevision !== undefined ? candidate : kept;
}

const positiveInt = (value: unknown): boolean =>
  typeof value === 'number' && Number.isInteger(value) && value > 0;

function readMarker(value: unknown): SetlistDeletionMarker | null {
  if (!isRecord(value)) return null;
  const setlistId = typeof value.setlistId === 'string' ? value.setlistId.trim() : '';
  // The same id a setlist can have: the local store accepts any non-empty
  // one, and the table takes 8 to 64 characters with no whitespace. A marker
  // for an id that could never name a setlist names nothing.
  if (!setlistId || /\s/.test(setlistId)) return null;
  if (!positiveInt(value.deletedAt)) return null;
  if (value.baseRevision !== undefined && !positiveInt(value.baseRevision)) return null;
  return {
    setlistId,
    deletedAt: value.deletedAt as number,
    ...(value.baseRevision === undefined ? {} : { baseRevision: value.baseRevision as number }),
  };
}

/**
 * Deletions waiting to be carried out, kept apart from the setlists.
 *
 * Nothing here asks what time it is: when somebody deleted something belongs
 * to the deleting, not to the writing down, so the caller says when. That is
 * also what makes every one of these tests a fixed value rather than a
 * moving one.
 */
export function createSetlistDeletionRepository(
  storage: KeyValueStorage | null,
  scope: SetlistScope
): SetlistDeletionRepository {
  const key = deletionsKey(scope);

  const read = (): SetlistDeletionMarker[] => {
    if (!key) return [];
    let raw: string | null = null;
    try {
      raw = storage?.getItem(key) ?? null;
    } catch {
      return [];
    }
    if (!raw) return [];
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return [];
    }
    if (!isRecord(data) || data.version !== SETLIST_DELETIONS_VERSION || !Array.isArray(data.deletions)) return [];

    const byId = new Map<string, SetlistDeletionMarker>();
    for (const entry of data.deletions) {
      const marker = readMarker(entry);
      // One unreadable entry is one deletion that has to be made again, not a
      // reason to forget the rest.
      if (!marker) continue;
      // Two notes about the same setlist cannot be written by this code, but
      // a hand-edited file can hold them. The same rule settles it as settles
      // a repeated mark, so reading twice always gives the same answer.
      const seen = byId.get(marker.setlistId);
      byId.set(marker.setlistId, seen ? laterOf(seen, marker) : marker);
    }
    return [...byId.values()];
  };

  const write = (markers: SetlistDeletionMarker[]) => {
    if (!key) return;
    // Deliberately not caught: whoever is deleting has to know this failed.
    storage?.setItem(key, JSON.stringify({ version: SETLIST_DELETIONS_VERSION, deletions: markers }));
  };

  return {
    key,
    list: read,
    get(setlistId) {
      const id = setlistId.trim();
      return read().find((marker) => marker.setlistId === id) ?? null;
    },
    mark(setlistId, deletedAt, baseRevision) {
      if (!key) return null; // a visitor has no cloud to propagate anything to
      const marker = readMarker({ setlistId, deletedAt, baseRevision });
      if (!marker) throw new Error('No se puede anotar este borrado.');
      // An upsert, but never a downgrade: a call carrying older knowledge
      // than what is already written leaves it alone, and says so by
      // returning what is actually stored. The revision in a note is what
      // somebody knew when they decided, and a later call cannot know less
      // and still be right.
      const markers = read();
      const seen = markers.find((entry) => entry.setlistId === marker.setlistId);
      const kept = seen ? laterOf(seen, marker) : marker;
      if (seen === kept) return kept;
      write([...markers.filter((entry) => entry.setlistId !== marker.setlistId), kept]);
      return kept;
    },
    clear(setlistId) {
      if (!key) return;
      const id = setlistId.trim();
      const kept = read().filter((marker) => marker.setlistId !== id);
      write(kept);
    },
  };
}
