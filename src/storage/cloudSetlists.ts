import type { Setlist, SetlistArrangement, SetlistItem, ArrangementSection } from '../types/setlist';
import { SupabaseRequestError, type SupabaseClient } from '../lib/supabase';
import { isValidIsoDate } from '../utils/setlists';
import { sanitizeSetlist } from './setlistStorage';

/**
 * Setlists in the cloud: what travels, and how it is read back.
 *
 * A setlist is made on a device and lives there. This is the copy that lets
 * somebody find it again from another one — nothing else. The songbook stays
 * public, the app keeps working with no account, and whoever does not sign in
 * never touches any of this.
 *
 * Two rules shape everything here. Whose a row is, is `auth.uid()` and
 * nothing else: this layer never sends `owner_id`, never derives it, and
 * never filters by it — Row Level Security is the boundary, and a filter
 * pretending to be one would only hide the day it stopped working. And a
 * download never destroys what is on the device: the cloud does not know the
 * ministry's members yet, so who sings what stays local and is put back after
 * every read (see cloudToSetlist).
 *
 * This module decides *what* is written and *what a row means*. It does not
 * decide *when* to write: there is no synchronisation here, automatic or
 * otherwise, and nothing in the app calls it yet.
 */

// ---------------------------------------------------------------------------
// Payload version 1
// ---------------------------------------------------------------------------

/**
 * Which representation the `items` of a row are in. Version 1 is every
 * portable part of a setlist entry and no local identity: no participants and
 * nobody assigned to a block, because the cloud has no members to point at.
 * Those ids mean something only on the device that made them.
 *
 * A client never writes a row whose version it does not understand, and never
 * rewrites a newer one as if it were this one.
 */
export const SETLIST_PAYLOAD_VERSION = 1;

/** A block of an arrangement as it travels: everything but who sings it. */
export type CloudArrangementSection = Omit<ArrangementSection, 'assignedMemberIds'>;

export interface CloudArrangement {
  sections: CloudArrangementSection[];
  songVersion?: number;
}

/** A setlist entry as it travels. */
export interface CloudSetlistItem extends Omit<SetlistItem, 'arrangement'> {
  arrangement?: CloudArrangement;
}

/**
 * The columns a browser writes. `owner_id` is deliberately not among them:
 * the table fills it from `auth.uid()`, which is the only thing that cannot
 * be made up here. Neither are `created_at` and `updated_at`, which are the
 * server's clock and the server's alone.
 */
export interface CloudSetlistWrite {
  id: string;
  name: string;
  /** "YYYY-MM-DD", or null when the celebration has no date (the column is nullable, "" is not a date) */
  date: string | null;
  description: string | null;
  items: CloudSetlistItem[];
  payload_version: number;
  revision: number;
  client_created_at: string;
  client_updated_at: string;
}

/** A row as it comes back. Every field is unknown until it is checked. */
export interface CloudSetlistRow {
  id?: unknown;
  name?: unknown;
  date?: unknown;
  description?: unknown;
  items?: unknown;
  payload_version?: unknown;
  revision?: unknown;
  client_created_at?: unknown;
  client_updated_at?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  deleted_at?: unknown;
}

// ---------------------------------------------------------------------------
// A setlist, on its way up
// ---------------------------------------------------------------------------

/**
 * Every block, without who sings it. Written out field by field on purpose:
 * a field added to the model later has to be brought here deliberately, and
 * TypeScript asks for it, instead of a spread quietly carrying something
 * local into the cloud.
 */
function cloudSection(section: ArrangementSection): CloudArrangementSection {
  return {
    id: section.id,
    sourceSectionId: section.sourceSectionId,
    ...(section.source ? { source: { ...section.source } } : {}),
    ...(section.needsReview ? { needsReview: true as const } : {}),
    label: section.label,
    repeatCount: section.repeatCount,
    voices: [...section.voices],
    instruction: section.instruction,
    transition: { ...section.transition },
  };
}

function cloudArrangement(arrangement: SetlistArrangement): CloudArrangement {
  return {
    sections: arrangement.sections.map(cloudSection),
    ...(arrangement.songVersion !== undefined ? { songVersion: arrangement.songVersion } : {}),
  };
}

function cloudItem(item: SetlistItem): CloudSetlistItem {
  return {
    id: item.id,
    songId: item.songId,
    moment: item.moment,
    transposeSteps: item.transposeSteps,
    capoFret: item.capoFret,
    notes: item.notes,
    ...(item.arrangement ? { arrangement: cloudArrangement(item.arrangement) } : {}),
    ...(item.transitionToNext ? { transitionToNext: { ...item.transitionToNext } } : {}),
  };
}

/**
 * A setlist as the table takes it. Pure: the setlist it is given comes back
 * untouched, and nothing of what it returns is shared with it.
 *
 * What is left behind is only what the cloud cannot mean yet: the people
 * taking part and the people singing each block. They are not translated into
 * names, and no cloud member is invented for them — they stay where they are
 * understood, and a read puts them back.
 */
export function setlistToCloud(setlist: Setlist, revision: number): CloudSetlistWrite {
  return {
    id: setlist.id,
    name: setlist.name,
    date: setlist.date || null,
    description: setlist.description || null,
    items: setlist.items.map(cloudItem),
    payload_version: SETLIST_PAYLOAD_VERSION,
    revision,
    client_created_at: new Date(setlist.createdAt).toISOString(),
    client_updated_at: new Date(setlist.updatedAt).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// What the table will not take
// ---------------------------------------------------------------------------

/**
 * The limits are the database's, written down again here only so a setlist
 * that cannot fit is refused before anything is sent, with a word for which
 * field it was, instead of coming back as a check constraint nobody can read.
 *
 * They are stricter than the editor's in two places (a name of up to 120
 * characters, a description of up to 1000), so a setlist made before there was
 * a cloud can legitimately be too long for it. That is said, never trimmed:
 * silently cutting somebody's text is worse than not uploading it.
 */
export const CLOUD_LIMITS = { name: 80, description: 500, items: 200, payloadBytes: 200_000 } as const;

export type CloudSetlistProblem = 'id' | 'name' | 'date' | 'description' | 'item-count' | 'payload-size';

export function cloudSetlistProblem(setlist: Setlist): CloudSetlistProblem | null {
  const id = setlist.id;
  if (id.length < 8 || id.length > 64 || /\s/.test(id)) return 'id';
  const name = setlist.name.trim();
  if (!name || name.length > CLOUD_LIMITS.name) return 'name';
  if (setlist.date && !isValidIsoDate(setlist.date)) return 'date';
  if (setlist.description.length > CLOUD_LIMITS.description) return 'description';
  if (setlist.items.length > CLOUD_LIMITS.items) return 'item-count';
  // The column measures the JSON it accepts; this measures the JSON we send.
  // Postgres renders jsonb slightly differently, so treat it as very close
  // rather than exact — the limit is a guard against absurd payloads, and
  // nothing real comes anywhere near it.
  const bytes = new TextEncoder().encode(JSON.stringify(setlist.items.map(cloudItem))).length;
  if (bytes > CLOUD_LIMITS.payloadBytes) return 'payload-size';
  return null;
}

// ---------------------------------------------------------------------------
// A row, on its way down
// ---------------------------------------------------------------------------

/**
 * What a row turned out to be. Four outcomes, because a synchroniser has to
 * tell them apart: one that was read, one that was deleted somewhere else, one
 * written by a client that knows more than this one, and one that cannot be
 * read at all.
 */
export type CloudSetlistRead =
  | { state: 'setlist'; id: string; setlist: Setlist; revision: number; serverUpdatedAt: string | null }
  /** Deleted on another device. The row stays, so the deletion can reach this one. */
  | { state: 'deleted'; id: string; revision: number; deletedAt: string }
  /** Written in a representation this build does not know. Readable as a fact, never as content. */
  | { state: 'newer'; id: string; revision: number; payloadVersion: number }
  /** Nothing here can be trusted. Reported, never guessed at: `id` when even that much held. */
  | { state: 'corrupt'; id: string | null };

const positiveInt = (value: unknown): number | null =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 ? value : null;

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/**
 * What PostgREST writes a `timestamptz` as: a date, a T, a time, and the zone
 * it is in ("2026-09-15T12:00:00+00:00", or the "…Z" this app sends).
 *
 * The shape is required instead of handing anything to Date.parse, which
 * outside ISO 8601 reads what it likes ("Dec 2026" is a date to it, and a
 * string with no zone would be read in whatever zone the phone is in). A
 * timestamp that does not say when it is, is not a timestamp.
 */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}(:?\d{2})?)$/;

/**
 * An instant, as milliseconds, or null when it is not one. Zero and anything
 * before it are refused too: the local store reads a timestamp that is not
 * positive as no timestamp at all and puts the current time in its place,
 * which would quietly turn a corrupt row into one made "just now".
 */
const instant = (value: unknown): number | null => {
  if (typeof value !== 'string' || !ISO_INSTANT.test(value)) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) && time > 0 ? time : null;
};

/**
 * Who sings each block, put back from the device.
 *
 * The match is the block's own id: inside an arrangement it is unique (the
 * store gives a repeated one its own), it identifies *this appearance* of a
 * section, and it is what travelled up, so it comes back the same. The label
 * is never used — a chorus sung three times is three blocks with the same
 * label, and guessing between them would put the wrong person on stage. The
 * source section has to agree as well: an id that now plays a different part
 * of the song is no longer the block those people were assigned to.
 *
 * No match, no assignment. An empty list is the honest answer, and the person
 * assigns again; a wrong name is somebody walking up at the wrong moment.
 */
function withLocalMembers(item: CloudSetlistItem, local: SetlistItem | undefined): SetlistItem {
  if (!item.arrangement) return item as SetlistItem;
  const localSections = new Map((local?.arrangement?.sections ?? []).map((section) => [section.id, section]));
  return {
    ...item,
    arrangement: {
      ...item.arrangement,
      sections: item.arrangement.sections.map((section) => {
        const match = localSections.get(section.id);
        const assignedMemberIds =
          match && match.sourceSectionId === section.sourceSectionId ? [...(match.assignedMemberIds ?? [])] : [];
        return { ...section, assignedMemberIds };
      }),
    },
  };
}

/**
 * What one row says.
 *
 * `localExisting` is the setlist as this device has it, when it has it. It is
 * the only source of everything version 1 does not carry: the team taking
 * part and who sings each block. A read never empties them — what the cloud
 * does not know, the device keeps.
 *
 * A tombstone is settled before the payload version: a deletion has no
 * content to misread, and passing it on takes nothing away. A newer payload
 * is settled before anything is read out of `items`, so nothing is ever
 * interpreted as version 1 that was not written as version 1.
 */
export function cloudToSetlist(row: CloudSetlistRow, localExisting?: Setlist | null): CloudSetlistRead {
  const id = text(row.id).trim();
  const revision = positiveInt(row.revision);
  if (!id || revision === null) return { state: 'corrupt', id: id || null };

  if (row.deleted_at !== null && row.deleted_at !== undefined) {
    const deletedAt = text(row.deleted_at);
    return instant(deletedAt) === null
      ? { state: 'corrupt', id }
      : { state: 'deleted', id, revision, deletedAt };
  }

  const payloadVersion = positiveInt(row.payload_version);
  if (payloadVersion === null) return { state: 'corrupt', id };
  if (payloadVersion > SETLIST_PAYLOAD_VERSION) return { state: 'newer', id, revision, payloadVersion };

  const createdAt = instant(row.client_created_at);
  const updatedAt = instant(row.client_updated_at);
  if (createdAt === null || updatedAt === null || !Array.isArray(row.items)) return { state: 'corrupt', id };

  // The same repair every stored setlist gets: entries without a song are
  // dropped, everything else is trimmed and clamped to what the model allows.
  // A row that has been tampered with becomes a poorer setlist, never a crash,
  // and never anything it did not say.
  const setlist = sanitizeSetlist({
    id,
    name: text(row.name),
    date: text(row.date),
    description: text(row.description),
    items: row.items,
    createdAt,
    updatedAt,
  });
  if (!setlist || setlist.id !== id) return { state: 'corrupt', id };

  const localItems = new Map((localExisting?.items ?? []).map((item) => [item.id, item]));
  return {
    state: 'setlist',
    id,
    setlist: {
      ...setlist,
      // Never from the cloud, which does not know the ministry: only what this
      // device already had for this setlist.
      participantIds: localExisting?.participantIds ? [...localExisting.participantIds] : [],
      items: setlist.items.map((item) => withLocalMembers(item as CloudSetlistItem, localItems.get(item.id))),
    },
    revision,
    serverUpdatedAt: typeof row.updated_at === 'string' ? row.updated_at : null,
  };
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export class SetlistCloudAuthError extends Error {
  constructor() {
    super('Hay que iniciar sesión para guardar setlists en la nube.');
    this.name = 'SetlistCloudAuthError';
  }
}

/**
 * How a write ended. A conflict is not a failure: it means the row changed
 * since it was read, and whoever called decides what to do about it. Deciding
 * that is synchronisation, and it is not written yet.
 */
export type CloudWriteResult =
  /**
   * The server wrote and answered. Not the same as "this went well": the row
   * that came back still has to be the right one, and saying so is the
   * caller's job (see setlistSyncExecutor). What is reported here is what
   * arrived — how many rows, and what the first one turned out to be.
   */
  | { status: 'written'; rows: number; read: CloudSetlistRead }
  /** Nothing matched: another device got there first, or the row is gone. */
  | { status: 'conflict' }
  /** This setlist cannot fit the table as it is. Nothing was sent. */
  | { status: 'rejected'; problem: CloudSetlistProblem };

export interface CloudSetlistRepository {
  /**
   * Every row of whoever is signed in, tombstones included. They are kept, not
   * filtered out: a deletion made on another device only reaches this one
   * through its tombstone, and dropping them here would mean reading them
   * twice later. Each row comes back classified, so one unreadable row leaves
   * the rest alone.
   */
  list(local?: Setlist[]): Promise<CloudSetlistRead[]>;
  create(setlist: Setlist): Promise<CloudWriteResult>;
  /** Writes it only while it is still at `expectedRevision`, and only over version 1. */
  update(setlist: Setlist, expectedRevision: number): Promise<CloudWriteResult>;
  /** Marks it deleted, keeping the row so the deletion can travel. Never a physical delete. */
  remove(id: string, expectedRevision: number, deletedAt?: Date): Promise<CloudWriteResult>;
}

const COLUMNS =
  'id,name,date,description,items,payload_version,revision,client_created_at,client_updated_at,created_at,updated_at,deleted_at';

/**
 * The cloud setlists of whoever is signed in.
 *
 * `accessToken` is the session's, asked for before every request: without one
 * nothing is sent at all. Being anonymous is not an error the database has to
 * explain — it is a call that should not have been made, and it says so here.
 * The token itself is never kept: the REST client asks the same session for it
 * when it builds the headers.
 */
export function createCloudSetlistRepository(
  client: SupabaseClient,
  accessToken: () => Promise<string | null>
): CloudSetlistRepository {
  const signedIn = async () => {
    if (!(await accessToken())) throw new SetlistCloudAuthError();
  };

  const written = (rows: CloudSetlistRow[]): CloudWriteResult => {
    const row = rows[0];
    // Nothing matched the filters: somebody wrote in between, or the row is
    // not there, or it is not this person's. Which of those is not something
    // an empty answer can say.
    if (!row) return { status: 'conflict' };
    // The row is read exactly as a row from a list is read, so a write and a
    // read agree on what a row means — including that it cannot be read.
    return { status: 'written', rows: rows.length, read: cloudToSetlist(row) };
  };

  return {
    async list(local = []) {
      await signedIn();
      // No owner filter: the rows somebody can read are the rows that are
      // theirs, and that is decided in the database.
      const rows = await client.select<CloudSetlistRow>('setlists', `select=${COLUMNS}&order=updated_at.desc`);
      const byId = new Map(local.map((setlist) => [setlist.id, setlist]));
      return rows.map((row) => cloudToSetlist(row, byId.get(text(row.id).trim())));
    },

    async create(setlist) {
      await signedIn();
      const problem = cloudSetlistProblem(setlist);
      if (problem) return { status: 'rejected', problem };
      try {
        // A plain insert, with no conflict resolution: this is a setlist that
        // is not up there yet. Bringing what was made as a guest into an
        // account is a different thing, asked for explicitly, and it is not
        // written yet.
        const rows = await client.insert<CloudSetlistRow>('setlists', setlistToCloud(setlist, 1));
        return written(rows);
      } catch (error) {
        // It is already there, written by another device. A conflict, not a
        // failure, and deliberately not resolved here: what is up there may
        // say something different from what is down here, and finding that out
        // means reading the row. Assuming it matches would lose whichever of
        // the two nobody looked at.
        if (error instanceof SupabaseRequestError && error.code === '23505') return { status: 'conflict' };
        throw error;
      }
    },

    async update(setlist, expectedRevision) {
      await signedIn();
      const problem = cloudSetlistProblem(setlist);
      if (problem) return { status: 'rejected', problem };
      const { id, revision: _next, ...changes } = setlistToCloud(setlist, expectedRevision + 1);
      const rows = await client.update<CloudSetlistRow>(
        'setlists',
        // The revision is what makes this safe: if somebody wrote in between,
        // nothing matches. The payload version is what keeps a newer row from
        // being written back as version 1 — that row is not this one's to
        // touch, and the filter says so where it cannot be forgotten.
        { id, revision: expectedRevision, payload_version: SETLIST_PAYLOAD_VERSION },
        { ...changes, revision: expectedRevision + 1 }
      );
      return written(rows);
    },

    async remove(id, expectedRevision, deletedAt = new Date()) {
      await signedIn();
      // A tombstone, not a physical delete: a device that was offline learns
      // about the deletion by reading the row. `deleted_at` is this device's
      // clock and means "deleted", nothing more — what decides who wrote last
      // is the revision, never a timestamp.
      const rows = await client.update<CloudSetlistRow>(
        'setlists',
        // The same three as an update, for the same reason: a row written in a
        // representation this build does not know is not this build's to touch
        // at all. Not even a column as innocent-looking as `deleted_at`, which
        // still ends somebody's setlist and still moves the revision on.
        { id, revision: expectedRevision, payload_version: SETLIST_PAYLOAD_VERSION },
        { deleted_at: deletedAt.toISOString(), revision: expectedRevision + 1 }
      );
      return written(rows);
    },
  };
}
