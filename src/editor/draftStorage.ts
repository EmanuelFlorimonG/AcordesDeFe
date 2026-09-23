import { createLocalRepository, getBrowserStorage, type KeyValueStorage, type Repository } from '../storage/localRepository';
import { isSubmissionAttempt, type SubmissionAttempt } from '../catalog/submission';
import { parseEditorDocument, type EditorDocument } from './songEditorModel';

/**
 * Songs being written, kept in this browser only. Nothing goes to the backend
 * until "Enviar para revisión": a draft is local work, saved as you type (with
 * a pause) so a reload or a closed tab loses nothing.
 *
 * Drafts are keyed: 'new' is the song being created now, "edit:<code>" a
 * proposal being corrected, and "update:<songId>" a suggested edit of a
 * published song. An edit is made on one version of the song, so its draft
 * always says which (its base); one without a base is not kept.
 */

export const SONG_DRAFTS_STORAGE_KEY = 'genesaret_song_drafts';
export const SONG_DRAFTS_BACKUP_KEY = 'genesaret_song_drafts_backup';
export const SONG_DRAFTS_STORAGE_VERSION = 1;
export const NEW_SONG_DRAFT_KEY = 'new';

/** The draft of a suggested edit of a published song. */
export const updateDraftKey = (songId: string) => `update:${songId}`;

/** The published version an edit draft was started on. */
export interface DraftBase {
  songId: string;
  version: number;
}

const isDraftBase = (value: unknown): value is DraftBase => {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.songId === 'string' && entry.songId !== '' && Number.isInteger(entry.version) && (entry.version as number) >= 1;
};

export interface StoredSongDraft {
  key: string;
  document: EditorDocument;
  updatedAt: number;
  /**
   * The retry identity of a send that didn't confirm (a network error): kept
   * so a retry, even after a reload, is recognised by the backend instead of
   * creating a second proposal. Cleared with the draft once a send succeeds.
   */
  attempt: SubmissionAttempt | null;
  /**
   * An edit of a published song ("update:<songId>"): the song and version it
   * was made on. Required for those keys: the editor never continues such a
   * draft on another version without saying so.
   */
  base?: DraftBase;
  /**
   * Changes written on older versions that the author is reapplying by hand,
   * oldest first. They are kept here, next to the draft being written, until
   * the proposal is sent or each one is discarded on purpose: autosaving the
   * new draft must never be what loses them, and neither must a second
   * rebase (v1 → v2 → v3 keeps what was written on v1 and on v2).
   */
  previous?: Array<{ document: EditorDocument; version: number | null }>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The references kept during a rebase, or undefined when there is none that can be read. */
function parsePrevious(value: unknown): StoredSongDraft['previous'] | undefined {
  // One reference was stored on its own before there could be several.
  const entries = Array.isArray(value) ? value : [value];
  const kept = entries.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const record = entry as Record<string, unknown>;
    const document = parseEditorDocument(record.document);
    if (!document) return [];
    const version = Number.isInteger(record.version) && (record.version as number) >= 1 ? (record.version as number) : null;
    return [{ document, version }];
  });
  return kept.length > 0 ? kept : undefined;
}

export function parseStoredDrafts(raw: string | null): { drafts: StoredSongDraft[]; unreadable: boolean } {
  if (raw === null || raw === '') return { drafts: [], unreadable: false };
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { drafts: [], unreadable: true };
  }
  if (!isRecord(data) || data.version !== SONG_DRAFTS_STORAGE_VERSION || !Array.isArray(data.drafts)) {
    return { drafts: [], unreadable: true };
  }
  const seen = new Set<string>();
  const drafts = data.drafts.filter(isRecord).flatMap((entry): StoredSongDraft[] => {
    const document = parseEditorDocument(entry.document);
    if (typeof entry.key !== 'string' || !entry.key || seen.has(entry.key) || !document) return [];
    const base = isDraftBase(entry.base) ? { songId: entry.base.songId, version: entry.base.version } : undefined;
    // An edit draft that doesn't say which song and version it was made on can't be continued safely.
    if (entry.key.startsWith('update:') && (!base || updateDraftKey(base.songId) !== entry.key)) return [];
    seen.add(entry.key);
    const updatedAt = typeof entry.updatedAt === 'number' && Number.isFinite(entry.updatedAt) ? entry.updatedAt : 0;
    const previous = parsePrevious(entry.previous);
    return [
      {
        key: entry.key,
        document,
        updatedAt,
        attempt: isSubmissionAttempt(entry.attempt) ? entry.attempt : null,
        ...(base ? { base } : {}),
        ...(previous ? { previous } : {}),
      },
    ];
  });
  return { drafts, unreadable: false };
}

export function serializeDrafts(drafts: StoredSongDraft[]): string {
  return JSON.stringify({ version: SONG_DRAFTS_STORAGE_VERSION, drafts });
}

export interface SongDraftStore {
  load(key: string): StoredSongDraft | null;
  /**
   * False when the browser refused to store it (full, blocked): the caller
   * keeps warning before leaving. `base` is required for an edit draft
   * ("update:<songId>"), which is refused without it.
   */
  save(key: string, document: EditorDocument, now?: number, base?: DraftBase): boolean;
  remove(key: string): void;
  /** Remembers (or forgets) the retry identity of this draft's send */
  setAttempt(key: string, attempt: SubmissionAttempt | null): boolean;
  /**
   * Starts writing `document` on a new base, keeping what was written on the
   * old one as one more reference: the ones already stored are never replaced
   * by it. Only this and setPrevious change them; saving never touches them.
   * False when the browser refused to store it, and then nothing changed.
   */
  startRebase(key: string, document: EditorDocument, base: DraftBase, previous: { document: EditorDocument; version: number | null }, now?: number): boolean;
  /** Keeps only these references (null forgets them all), when the author says so */
  setPrevious(key: string, previous: StoredSongDraft['previous'] | null): boolean;
  /** True when stored drafts couldn't be read and were set aside (backed up) */
  readonly recoveredFromUnreadableData: boolean;
}

/**
 * The drafts store. Unreadable data is backed up once and never overwritten
 * silently; a write that fails is reported, so the editor can say it.
 */
export function createSongDraftStore(storage: KeyValueStorage | null = getBrowserStorage()): SongDraftStore {
  const repository: Repository<StoredSongDraft> = createLocalRepository(
    storage,
    SONG_DRAFTS_STORAGE_KEY,
    SONG_DRAFTS_BACKUP_KEY,
    (raw) => {
      const { drafts, unreadable } = parseStoredDrafts(raw);
      return { items: drafts, unreadable };
    },
    serializeDrafts
  );
  const initial = repository.load();
  let drafts = initial.items;

  const persist = (next: StoredSongDraft[]): boolean => {
    if (!storage) return false;
    try {
      storage.setItem(SONG_DRAFTS_STORAGE_KEY, serializeDrafts(next));
      drafts = next;
      return true;
    } catch {
      return false;
    }
  };

  return {
    recoveredFromUnreadableData: initial.recoveredFromUnreadableData,
    load: (key) => drafts.find((entry) => entry.key === key) ?? null,
    save: (key, document, now = Date.now(), base) => {
      const previous = drafts.find((entry) => entry.key === key);
      if (key.startsWith('update:') && (!base || updateDraftKey(base.songId) !== key)) return false;
      // Another version is another starting point: what was being sent before is not this send.
      const sameBase = previous?.base?.version === base?.version;
      const reference = previous?.previous;
      return persist([
        ...drafts.filter((entry) => entry.key !== key),
        {
          key,
          document,
          updatedAt: now,
          // A retry identity only stands for the exact song it was sent with:
          // once the song changes, sending it again is a new proposal.
          attempt: previous && sameBase && JSON.stringify(previous.document) === JSON.stringify(document) ? previous.attempt : null,
          ...(base ? { base: { songId: base.songId, version: base.version } } : {}),
          // Kept as it is: only startRebase and setPrevious decide about it.
          ...(reference ? { previous: reference } : {}),
        },
      ]);
    },
    startRebase: (key, document, base, previous, now = Date.now()) => {
      // An edit of a published song is keyed by that song; a proposal being
      // corrected is keyed by its tracking code, and carries the song it edits.
      if (key.startsWith('update:') && updateDraftKey(base.songId) !== key) return false;
      const kept = drafts.find((entry) => entry.key === key)?.previous ?? [];
      return persist([
        ...drafts.filter((entry) => entry.key !== key),
        {
          key,
          document,
          updatedAt: now,
          attempt: null,
          base: { songId: base.songId, version: base.version },
          previous: [...kept, previous],
        },
      ]);
    },
    setPrevious: (key, previous) => {
      const entry = drafts.find((draft) => draft.key === key);
      if (!entry) return false;
      const { previous: _dropped, ...rest } = entry;
      void _dropped;
      const next = previous && previous.length > 0 ? { ...rest, previous } : rest;
      return persist(drafts.map((draft) => (draft.key === key ? next : draft)));
    },
    setAttempt: (key, attempt) => {
      const previous = drafts.find((entry) => entry.key === key);
      if (!previous) return false;
      return persist(drafts.map((entry) => (entry.key === key ? { ...entry, attempt } : entry)));
    },
    remove: (key) => {
      persist(drafts.filter((entry) => entry.key !== key));
    },
  };
}
