import type { Setlist, SetlistItem, SetlistArrangement, ArrangementSection } from '../types/setlist';
import { normalizeVoices } from '../utils/arrangement';
import type { CloudSetlistRead } from './cloudSetlists';
import type { SetlistDeletionMarker } from './setlistDeletions';
import { setlistKeys, type KeyValueStorage, type SetlistScope } from './setlistStorage';

/**
 * What to do about one setlist, worked out and nothing else.
 *
 * Everything here is arithmetic on data already in hand: a setlist as this
 * device has it, a row as the cloud gave it, and what the two last agreed on.
 * Out comes a plan. Nothing in this file reaches the network, writes a row,
 * saves a setlist or reads a clock — a plan can be looked at, printed and
 * tested, and somebody else decides whether to carry it out.
 *
 * The rule the whole thing exists to keep is that nobody's work disappears
 * without being asked. Two devices that changed the same setlist is not a
 * situation for the newer timestamp to settle: clocks on phones are wrong,
 * and "newer" would quietly throw away whichever half nobody was looking at.
 * When this cannot tell what happened, it says so and stops.
 */

// ---------------------------------------------------------------------------
// What counts as a change
// ---------------------------------------------------------------------------

/**
 * The parts of a setlist that travel, written out in a fixed order.
 *
 * Arrays, not objects, so the shape is the order of these lines and not
 * whatever order a JavaScript engine happens to walk an object in. It is the
 * same idea as a section's signature in arrangements (see sectionSignature),
 * for the same reason: two devices have to agree on the answer exactly.
 *
 * `createdAt` is in here because a setlist is made once and that never
 * changes afterwards — no edit touches it, so it identifies the same setlist
 * rather than reporting a change. `updatedAt` is deliberately left out: every
 * edit moves it, *including choosing who sings*, and those are local. Leaving
 * it in would send a setlist up the wire every time somebody assigned a
 * soloist, and the cloud would have nothing new to store.
 *
 * Who takes part and who sings each block are not here at all. The cloud does
 * not know the ministry's members (see cloudSetlists), so changing them is
 * not a change the cloud can hold an opinion about.
 */
function canonicalTransition(transition: ArrangementSection['transition']): unknown[] {
  return [transition.type, transition.type === 'jump' ? transition.targetId : null];
}

function canonicalSection(section: ArrangementSection): unknown[] {
  return [
    section.id,
    section.sourceSectionId,
    section.source ? [section.source.signature, section.source.version] : null,
    section.needsReview === true,
    section.label,
    section.repeatCount,
    // Sorted the one way the app sorts them, so a list that means the same
    // reads the same whether it came from storage or from the editor.
    normalizeVoices(section.voices),
    section.instruction,
    canonicalTransition(section.transition),
  ];
}

function canonicalArrangement(arrangement: SetlistArrangement): unknown[] {
  return [arrangement.songVersion ?? null, arrangement.sections.map(canonicalSection)];
}

function canonicalItem(item: SetlistItem): unknown[] {
  return [
    item.id,
    item.songId,
    item.moment,
    item.transposeSteps,
    item.capoFret,
    item.notes,
    item.arrangement ? canonicalArrangement(item.arrangement) : null,
    item.transitionToNext ? [item.transitionToNext.type, item.transitionToNext.instruction] : null,
  ];
}

/** Everything portable about a setlist, as one string. Exported so tests can read it. */
export function canonicalSetlist(setlist: Setlist): string {
  return JSON.stringify([
    setlist.id,
    setlist.name,
    setlist.date,
    setlist.description,
    setlist.createdAt,
    // The order is the order they are played in, so it is never sorted.
    setlist.items.map(canonicalItem),
  ]);
}

/**
 * FNV-1a, twice, with different constants: sixteen hex characters that are
 * the same on every device and in every browser.
 *
 * This is not a security boundary — nobody is defending against a setlist
 * built on purpose to collide with another one, and there is nothing to gain
 * by it. It only has to be stable and short enough to keep beside every
 * setlist, which rules out storing the whole canonical string and rules in
 * not adding a crypto dependency to hash a hundred short strings.
 */
function hash(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x811c9dc5 ^ 0x5bf03635;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export function portableFingerprint(setlist: Setlist): string {
  return hash(canonicalSetlist(setlist));
}

// ---------------------------------------------------------------------------
// What the two sides last agreed on
// ---------------------------------------------------------------------------

/**
 * The last state a device and the cloud are known to have shared, for one
 * setlist. It is not a copy of the setlist: it is the two facts needed to
 * tell who changed what since.
 *
 * Without it, a device and a cloud row that differ are just two different
 * things, with no way to know which one came from the other. That is why
 * `updatedAt` is not a substitute: it says when something was touched, never
 * what the other side had at the time.
 */
export interface SetlistSyncBase {
  setlistId: string;
  /** The row's revision when the two agreed. */
  cloudRevision: number;
  /** What both sides held then (see portableFingerprint). */
  fingerprint: string;
}

export const SETLIST_SYNC_KEY = 'genesaret_setlist_sync';
/** The setlists' own key, which this one is derived from so they can never collide. */
const SETLIST_STORAGE_PREFIX = 'genesaret_setlists';
/** Only the shape of this metadata; the setlists themselves are versioned apart. */
export const SETLIST_SYNC_VERSION = 1;

/**
 * Where an identity keeps its sync metadata, or null when it keeps none.
 *
 * A visitor has no cloud and therefore no baseline: whatever they make stays
 * on the device until they sign in and ask for it to be taken along. The key
 * is derived from the setlists' own key, so an account's metadata can never
 * land where another account's does, and no account can spell the visitor's.
 */
export function syncKey(scope: SetlistScope): string | null {
  if (scope.kind === 'guest') return null;
  const keys = setlistKeys(scope);
  if (!keys) return null;
  return keys.data.replace(SETLIST_STORAGE_PREFIX, SETLIST_SYNC_KEY);
}

export interface SetlistSyncStore {
  /** The key this store writes, or null when this identity keeps nothing. */
  readonly key: string | null;
  load(): Map<string, SetlistSyncBase>;
  save(bases: Map<string, SetlistSyncBase>): void;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Exactly what portableFingerprint writes, and nothing else. */
const FINGERPRINT = /^[0-9a-f]{16}$/;

function readBase(value: unknown): SetlistSyncBase | null {
  if (!isRecord(value)) return null;
  const setlistId = typeof value.setlistId === 'string' ? value.setlistId.trim() : '';
  const fingerprint = typeof value.fingerprint === 'string' ? value.fingerprint.trim() : '';
  const cloudRevision = value.cloudRevision;
  // A fingerprint that could not have come from here would never match
  // anything again: it would report a change for ever. Better to have none
  // and let the two sides introduce themselves.
  if (!setlistId || !FINGERPRINT.test(fingerprint)) return null;
  if (typeof cloudRevision !== 'number' || !Number.isInteger(cloudRevision) || cloudRevision < 1) return null;
  return { setlistId, cloudRevision, fingerprint };
}

/**
 * Sync metadata, kept apart from the setlists.
 *
 * Unreadable metadata is thrown away rather than backed up, which is the
 * opposite of what happens to setlists — and right, because none of this is
 * anybody's work. Losing it means the next reconciliation meets both sides
 * for the first time again, which is a question, never a loss.
 */
export function createSetlistSyncStore(storage: KeyValueStorage | null, scope: SetlistScope): SetlistSyncStore {
  const key = syncKey(scope);

  return {
    key,
    load() {
      const bases = new Map<string, SetlistSyncBase>();
      if (!key) return bases;
      let raw: string | null = null;
      try {
        raw = storage?.getItem(key) ?? null;
      } catch {
        return bases; // storage blocked: this visit reconciles from scratch
      }
      if (!raw) return bases;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return bases;
      }
      if (!isRecord(data) || data.version !== SETLIST_SYNC_VERSION || !Array.isArray(data.bases)) return bases;
      for (const entry of data.bases) {
        const base = readBase(entry);
        // One unreadable entry is one setlist that meets the cloud again, not
        // a reason to forget the others. Two entries for the same setlist
        // cannot be written by this code; if hand-editing produces them, the
        // last one wins, which is at least the same answer every time.
        if (base) bases.set(base.setlistId, base);
      }
      return bases;
    },
    save(bases) {
      if (!key) return;
      try {
        storage?.setItem(key, JSON.stringify({ version: SETLIST_SYNC_VERSION, bases: [...bases.values()] }));
      } catch {
        // quota or blocked storage: the baselines are rebuilt next time
      }
    },
  };
}

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Something happened that this cannot decide on its own, and guessing would
 * risk somebody's work. Each one is a different question for whoever is
 * above: a screen, or a person.
 */
export type SetlistQuestion =
  /** Both sides have this setlist, they say different things, and nothing records what they last shared. */
  | 'first-meeting'
  /** Each side changed since they agreed. */
  | 'both-changed'
  /** Deleted on another device, changed on this one, since they agreed. */
  | 'deleted-elsewhere-edited-here'
  /** Deleted on another device; what this one has never agreed with anything. */
  | 'deleted-elsewhere-unknown-here'
  /** It was shared, it is still in the cloud, and it is no longer on this device. */
  | 'gone-locally'
  /** It was shared and the row is not there at all — not even a tombstone. */
  | 'gone-remotely'
  /**
   * The row reads older than what the two last agreed on. Revisions only ever
   * go up, so this is a read from behind — a stale cache, a replica that has
   * not caught up — and not a version of anything. Writing against it would
   * name a revision that has already been overtaken.
   */
  | 'revision-regressed'
  /**
   * Deleted here, and the row moved on afterwards. Somebody's edit is in
   * there that nobody on this device has seen, and the deletion was decided
   * without it.
   */
  | 'deleted-here-changed-there'
  /** Deleted here, and this device never knew what the cloud had for it. */
  | 'deleted-here-unknown-revision'
  /** It is marked as deleted and it is also right here. One of the two is wrong. */
  | 'inconsistent-local-deletion'
  /**
   * The note says it was deleted at a moment that is not a moment. The store
   * refuses to keep one of those, so this is a note built by hand or by a
   * caller that should not have: it cannot be acted on, and no time is
   * invented to make it work.
   */
  | 'deletion-unreadable';

/**
 * What to do about one setlist. Nothing here is carried out: every case that
 * could lose something says so instead of choosing.
 */
export type SetlistSyncPlan =
  | { kind: 'noop'; reason: 'in-sync' | 'nothing-anywhere' | 'local-only-change' | 'already-deleted' }
  /**
   * Both sides already say the same thing: write down that they agree, and
   * nothing else. No content moves in either direction.
   */
  | { kind: 'adopt-baseline'; base: SetlistSyncBase }
  /**
   * This device has a setlist the cloud has never seen, and nothing says
   * whether it was made here inside this account or arrived some other way.
   * A candidate, not an instruction: uploading somebody's setlist is theirs
   * to ask for, and the layer above knows the context this one does not.
   */
  | { kind: 'upload-candidate'; setlist: Setlist }
  /** Only this device changed, and the row is where it was. */
  | { kind: 'upload-changes'; setlist: Setlist; expectedRevision: number }
  /** Only the cloud changed. The setlist carries what the device already knew about members. */
  | { kind: 'apply-remote'; setlist: Setlist; base: SetlistSyncBase }
  /** Deleted elsewhere, untouched here since they agreed. */
  | { kind: 'delete-local'; setlistId: string; cloudRevision: number }
  /** The baseline points at something neither side has any more. */
  | { kind: 'forget-baseline'; setlistId: string }
  /**
   * Deleted here on purpose, and the row is still the one that was deleted.
   * The revision is the one the deletion was decided with, never the one the
   * row happens to be at now: that is what makes it a removal of the thing
   * somebody saw and not of whatever is there.
   */
  | {
      kind: 'delete-remote';
      setlistId: string;
      expectedRevision: number;
      /**
       * When the person asked for it, carried through so the tombstone says
       * that and not when it happened to be sent. Somebody who deletes on a
       * train and syncs an hour later meant it on the train. The server's own
       * clock records the writing, separately, which is a different fact.
       */
      deletedAt: number;
    }
  /**
   * The deletion is done on both sides. Nothing left to send: the marker and
   * the baseline can be forgotten, and the setlist stays gone.
   */
  | { kind: 'confirm-deletion'; setlistId: string }
  /** A row this build must not touch. */
  | { kind: 'blocked'; setlistId: string; reason: 'newer' | 'corrupt' }
  | { kind: 'ask'; question: SetlistQuestion; setlistId: string };

export interface SetlistSyncInput {
  /** As this device has it. */
  local?: Setlist | null;
  /** As the cloud gave it, already classified (see cloudToSetlist). Absent means no row at all. */
  remote?: CloudSetlistRead | null;
  /** What the two last agreed on, if anything does. */
  base?: SetlistSyncBase | null;
  /**
   * Somebody deleted it here on purpose. Handed in, never read from storage:
   * this stays a function of its arguments.
   */
  deletion?: SetlistDeletionMarker | null;
}

const baselineOf = (setlistId: string, cloudRevision: number, fingerprint: string): SetlistSyncBase => ({
  setlistId,
  cloudRevision,
  fingerprint,
});

/**
 * What to do about one setlist.
 *
 * Reads nothing, writes nothing, and never asks what time it is: the same
 * three inputs always give the same plan, which is what makes the table of
 * cases in the tests worth anything.
 */
export function reconcileSetlist({ local, remote, base, deletion }: SetlistSyncInput): SetlistSyncPlan {
  const setlistId = local?.id ?? (remote && 'id' in remote ? remote.id : base?.setlistId ?? deletion?.setlistId) ?? '';

  // A row written by a client that knows more, or one that cannot be read at
  // all: not this build's to touch, whatever is on this device. Nothing is
  // created under that id either, which would collide with it.
  if (remote?.state === 'newer') return { kind: 'blocked', setlistId, reason: 'newer' };
  if (remote?.state === 'corrupt') return { kind: 'blocked', setlistId, reason: 'corrupt' };

  // It is marked as deleted and it is also sitting right here. Two statements
  // that cannot both be true: something happened between the note and the
  // removal — storage that would not take the shorter list, another tab, a
  // hand-edited file. Neither statement gets to win, whatever the cloud says
  // or does not say, so nothing is uploaded, nothing is removed there and
  // nothing is removed here.
  if (deletion && local) return { kind: 'ask', question: 'inconsistent-local-deletion', setlistId };

  // A revision only ever goes up. One that reads lower than the baseline is a
  // read from behind, not an older version to work from: nothing is applied
  // over what is here, nothing is written naming a revision that has already
  // been passed, and an old tombstone does not get to delete newer work.
  if (base && (remote?.state === 'setlist' || remote?.state === 'deleted') && remote.revision < base.cloudRevision) {
    return { kind: 'ask', question: 'revision-regressed', setlistId };
  }

  // --- Deleted here, on purpose --------------------------------------------------
  if (deletion) {
    // Somewhere between deciding to delete and now, this device agreed with
    // the cloud on something the deletion did not know about: the baseline
    // has moved past what the note recorded. Whatever is in the row now, and
    // whatever the tombstone is, one of them was written for a reason nobody
    // here has seen, and there is no telling which. Keep everything.
    const learnedMore = Boolean(base) && (deletion.baseRevision === undefined || base!.cloudRevision > deletion.baseRevision);

    if (remote?.state === 'deleted') {
      // Gone on both sides, and nothing happened in between that this device
      // did not account for: the tombstone is this deletion arriving, or
      // somebody else's to the same end. Either way the end state is the one
      // that was asked for, so the note and the baseline can be let go.
      return learnedMore
        ? { kind: 'ask', question: 'deleted-here-changed-there', setlistId }
        : { kind: 'confirm-deletion', setlistId };
    }

    if (!remote) {
      // No row, and none was ever agreed on: the setlist never reached the
      // cloud, so there is nothing to remove and nothing to wait for.
      if (!base) return { kind: 'confirm-deletion', setlistId };
      // It had been shared and the row is not there at all. Not a success to
      // claim: something removed it outright, which this app never does.
      return { kind: 'ask', question: 'gone-remotely', setlistId };
    }

    // The row is still active. Deleting it means saying which revision is
    // being deleted, and that can only be the one the decision was made with.
    if (deletion.baseRevision === undefined) {
      return { kind: 'ask', question: 'deleted-here-unknown-revision', setlistId };
    }
    // The tombstone will carry when somebody asked for this, so that moment
    // has to be one. A note this broken does not become a request.
    if (!Number.isInteger(deletion.deletedAt) || deletion.deletedAt <= 0) {
      return { kind: 'ask', question: 'deletion-unreadable', setlistId };
    }
    if (learnedMore) return { kind: 'ask', question: 'deleted-here-changed-there', setlistId };
    // Anything else in the row now was written after that decision, by
    // somebody whose work nobody here has seen. Deleting revision 5 because
    // revision 4 was deleted on a device that was offline is exactly the
    // thing this whole design exists to prevent — and the content being
    // identical does not change it, because the revision moved for a reason.
    return remote.revision === deletion.baseRevision
      ? { kind: 'delete-remote', setlistId, expectedRevision: deletion.baseRevision, deletedAt: deletion.deletedAt }
      : { kind: 'ask', question: 'deleted-here-changed-there', setlistId };
  }

  // --- Deleted somewhere else --------------------------------------------------
  if (remote?.state === 'deleted') {
    if (!local) return { kind: 'noop', reason: 'already-deleted' };
    if (!base) return { kind: 'ask', question: 'deleted-elsewhere-unknown-here', setlistId };
    // Deleting what somebody has since edited is not housekeeping.
    return portableFingerprint(local) === base.fingerprint
      ? { kind: 'delete-local', setlistId, cloudRevision: remote.revision }
      : { kind: 'ask', question: 'deleted-elsewhere-edited-here', setlistId };
  }

  // --- No row at all -----------------------------------------------------------
  if (!remote) {
    if (!local) return base ? { kind: 'forget-baseline', setlistId } : { kind: 'noop', reason: 'nothing-anywhere' };
    // It was up there and now there is not even a tombstone. Rows are never
    // removed outright by this app, so something happened that this does not
    // know about: re-creating it would fight whatever did.
    if (base) return { kind: 'ask', question: 'gone-remotely', setlistId };
    return { kind: 'upload-candidate', setlist: local };
  }

  const remoteFingerprint = portableFingerprint(remote.setlist);

  // --- Nothing on this device ---------------------------------------------------
  if (!local) {
    // Never shared: taking it down is the whole point of having an account.
    // (What this cannot see is a setlist deleted here before it ever synced —
    // local deletions leave no trace yet. See the note on markers below.)
    if (!base) {
      return { kind: 'apply-remote', setlist: remote.setlist, base: baselineOf(remote.id, remote.revision, remoteFingerprint) };
    }
    // It was shared and it is gone from here. Either somebody deleted it, or
    // this browser's storage was cleared. Putting it back would undo the
    // first; deleting the row would undo the second.
    return { kind: 'ask', question: 'gone-locally', setlistId };
  }

  const localFingerprint = portableFingerprint(local);

  // --- Meeting for the first time -----------------------------------------------
  if (!base) {
    // The same thing on both sides: they agree already, and saying so costs
    // nobody anything. Different things, and there is nothing to say which
    // came from which — that is a question, never a choice made quietly.
    return localFingerprint === remoteFingerprint
      ? { kind: 'adopt-baseline', base: baselineOf(remote.id, remote.revision, remoteFingerprint) }
      : { kind: 'ask', question: 'first-meeting', setlistId };
  }

  // --- Both sides, and a baseline to measure from --------------------------------
  const localChanged = localFingerprint !== base.fingerprint;
  const remoteMoved = remote.revision !== base.cloudRevision;
  // A revision can move without the content moving with it. What matters is
  // what the row says, not how many times it was written.
  const remoteChanged = remoteFingerprint !== base.fingerprint;

  if (!localChanged) {
    if (!remoteMoved) return { kind: 'noop', reason: 'in-sync' };
    // The row moved on; if it still says what it said, only the baseline is
    // out of date. Nothing comes down, because there is nothing new in it.
    return remoteChanged
      ? { kind: 'apply-remote', setlist: remote.setlist, base: baselineOf(remote.id, remote.revision, remoteFingerprint) }
      : { kind: 'adopt-baseline', base: baselineOf(remote.id, remote.revision, remoteFingerprint) };
  }

  if (!remoteChanged) {
    // Only this device changed. The write names the revision the row is at
    // now, which may be further along than the baseline if somebody wrote
    // something that read the same.
    return { kind: 'upload-changes', setlist: local, expectedRevision: remote.revision };
  }

  // Both changed since they agreed — unless they changed into the same thing,
  // which is nobody's loss.
  return localFingerprint === remoteFingerprint
    ? { kind: 'adopt-baseline', base: baselineOf(remote.id, remote.revision, remoteFingerprint) }
    : { kind: 'ask', question: 'both-changed', setlistId };
}

/**
 * Every setlist on both sides, each with its plan.
 *
 * Ids are taken from all three places, so a setlist that exists only in one
 * of them still gets looked at — including one that only a stale baseline
 * remembers.
 */
export function reconcileSetlists(
  locals: Setlist[],
  remotes: CloudSetlistRead[],
  bases: Map<string, SetlistSyncBase>,
  deletions: SetlistDeletionMarker[] = []
): Map<string, SetlistSyncPlan> {
  const localById = new Map(locals.map((setlist) => [setlist.id, setlist]));
  const remoteById = new Map(remotes.filter((read) => read.id !== null).map((read) => [read.id as string, read]));
  const deletionById = new Map(deletions.map((marker) => [marker.setlistId, marker]));
  const ids = new Set([...localById.keys(), ...remoteById.keys(), ...bases.keys(), ...deletionById.keys()]);

  const plans = new Map<string, SetlistSyncPlan>();
  for (const id of ids) {
    plans.set(
      id,
      reconcileSetlist({
        local: localById.get(id),
        remote: remoteById.get(id),
        base: bases.get(id),
        deletion: deletionById.get(id),
      })
    );
  }
  return plans;
}
