import type { Setlist } from '../types/setlist';
import {
  SetlistCloudAuthError,
  withLocalMembership,
  type CloudSetlistRead,
  type CloudSetlistRepository,
} from './cloudSetlists';
import type { SetlistDeletionMarker, SetlistDeletionRepository } from './setlistDeletions';
import type { SetlistRepository } from './setlistStorage';
import {
  portableFingerprint,
  reconcileSetlists,
  type SetlistSyncBase,
  type SetlistSyncPlan,
  type SetlistSyncStore,
} from './setlistSync';
import { executeSetlistSyncPlan, isCloudSetlistPlan, type SetlistSyncExecutionResult } from './setlistSyncExecutor';

/**
 * One pass: look at both sides, work out what should happen, do the safe part
 * of it, and report the rest.
 *
 * Read everything, reconcile, carry out the plans that cannot lose anything,
 * write down what is now known — and stop at everything else. Nothing here
 * resolves a conflict, nothing retries, nothing polls, nothing decides that
 * the newer timestamp wins. A pass that finds a question leaves the question.
 *
 * The hard part is not the order of the steps; it is that a person keeps
 * using the app while a request is in the air. Somebody edits a setlist while
 * its own upload is in flight, assigns a singer while a download is being
 * applied, deletes something twice. So the pass takes a snapshot of both
 * sides at the start, and before it writes anything it looks again: if what
 * justified a plan is no longer true, it does not apply it and says so. The
 * next pass will see the new state and decide again.
 *
 * Every dependency is passed in, so a whole pass runs in memory with nothing
 * but plain objects.
 */

// ---------------------------------------------------------------------------
// What a pass found
// ---------------------------------------------------------------------------

export type SetlistSyncOutcome =
  /** Both sides agree, or there was nothing to do. */
  | { kind: 'noop'; plan: SetlistSyncPlan }
  /** Somebody has to decide. Untouched on both sides. */
  | { kind: 'ask'; plan: SetlistSyncPlan }
  /** A row this build must not touch. */
  | { kind: 'blocked'; plan: SetlistSyncPlan }
  /**
   * There is a setlist here the cloud has never seen. Taking it up there is
   * somebody's to ask for, not a pass's to do (see the note on
   * upload-candidate below).
   */
  | { kind: 'pending-user-action'; plan: SetlistSyncPlan }
  /** Only this device changed, and it changed by itself. */
  | { kind: 'applied-local'; plan: SetlistSyncPlan }
  /**
   * A request went out and did what it was supposed to. What was then written
   * down on the device is a separate fact: the cloud moved either way, and a
   * report that hid that would have the next pass, and anybody reading it,
   * believe nothing happened.
   */
  | {
      kind: 'cloud-success';
      plan: SetlistSyncPlan;
      result: SetlistSyncExecutionResult;
      local: 'written' | 'skipped-stale' | 'failed';
      /** What had changed, when the local part was skipped. */
      staleWhat?: StaleReason;
    }
  /** The row had moved on. Nothing was written anywhere, and nothing is retried. */
  | { kind: 'cloud-conflict'; plan: SetlistSyncPlan }
  | { kind: 'cloud-auth-error'; plan: SetlistSyncPlan }
  | { kind: 'cloud-request-error'; plan: SetlistSyncPlan; error: unknown }
  /** The setlist does not fit the table. Nothing was sent. */
  | { kind: 'cloud-rejected'; plan: SetlistSyncPlan; result: SetlistSyncExecutionResult }
  | { kind: 'invalid-plan'; plan: SetlistSyncPlan; result: SetlistSyncExecutionResult }
  | { kind: 'invalid-response'; plan: SetlistSyncPlan; result: SetlistSyncExecutionResult }
  /**
   * What justified this plan stopped being true while the pass was running:
   * somebody edited, deleted, or another tab wrote. Nothing was applied, and
   * the next pass starts from what is there now.
   */
  | { kind: 'skipped-stale'; plan: SetlistSyncPlan; what: StaleReason }
  /**
   * Nothing was in anybody's way; the device simply would not take the write
   * (storage full, storage blocked). Nothing was lost — what should have been
   * forgotten is still there, and the next pass reaches the same conclusion.
   */
  | { kind: 'local-error'; plan: SetlistSyncPlan; error: unknown };

/** Which of the things a plan was counting on had changed. */
export type StaleReason = 'local' | 'base' | 'deletion';

export interface SetlistSyncPassReport {
  /**
   * Whether the pass got as far as having opinions about setlists at all. A
   * pass that could not read the cloud knows nothing, and must not be read as
   * "there is nothing up there": that would look like every setlist being
   * local-only, and like every baseline pointing at something gone.
   */
  status: 'completed' | 'remote-auth-error' | 'remote-read-error';
  /** One outcome per setlist, by id, in the order they were processed. */
  outcomes: Map<string, SetlistSyncOutcome>;
  /** The ids, in the order the pass walked them. */
  order: string[];
  /** What stopped it, when the cloud could not be read. */
  error?: unknown;
}

// ---------------------------------------------------------------------------
// What the pass saw when it started
// ---------------------------------------------------------------------------

/**
 * Both sides as they were when the pass began, by value and never by
 * reference: a setlist is remembered by what it says (its portable
 * fingerprint), not by which object it was, because the object is replaced
 * on every edit and a reference would prove nothing.
 */
interface Snapshot {
  setlists: Map<string, Setlist>;
  fingerprints: Map<string, string>;
  bases: Map<string, SetlistSyncBase>;
  deletions: Map<string, SetlistDeletionMarker>;
}

const sameBase = (a: SetlistSyncBase | undefined, b: SetlistSyncBase | undefined): boolean =>
  a === undefined || b === undefined
    ? a === b
    : a.setlistId === b.setlistId && a.cloudRevision === b.cloudRevision && a.fingerprint === b.fingerprint;

const sameMarker = (a: SetlistDeletionMarker | undefined, b: SetlistDeletionMarker | undefined): boolean =>
  a === undefined || b === undefined
    ? a === b
    : a.setlistId === b.setlistId && a.deletedAt === b.deletedAt && a.baseRevision === b.baseRevision;

export interface SetlistSyncPassInput {
  setlists: SetlistRepository;
  bases: SetlistSyncStore;
  deletions: SetlistDeletionRepository;
  cloud: CloudSetlistRepository;
}

/**
 * Everything a pass does to the device, in one place.
 *
 * Each of these reads the store again, compares what it finds against the
 * snapshot, and only then writes. The reading and the writing are one stretch
 * of synchronous code with no request in between, so within this tab nothing
 * can slip past. Another tab could still write between the two, which is as
 * good as browser storage gets: this is compare-before-write, not a
 * transaction, and the worst case is that a pass loses a write it should have
 * made — never that it destroys something it should have kept.
 */
function localWrites(input: SetlistSyncPassInput, snapshot: Snapshot) {
  const currentSetlists = () => new Map(input.setlists.load().setlists.map((setlist) => [setlist.id, setlist]));

  return {
    /** True while the setlist says exactly what it said when the pass began. */
    localUnchanged(id: string): boolean {
      const now = currentSetlists().get(id);
      const before = snapshot.setlists.get(id);
      if (!now || !before) return !now && !before;
      return portableFingerprint(now) === snapshot.fingerprints.get(id);
    },

    /** True while nothing about the setlist changed at all, people included. */
    localIdentical(id: string): boolean {
      const now = currentSetlists().get(id);
      const before = snapshot.setlists.get(id);
      if (!now || !before) return !now && !before;
      return JSON.stringify(now) === JSON.stringify(before);
    },

    baseUnchanged(id: string): boolean {
      return sameBase(input.bases.load().get(id), snapshot.bases.get(id));
    },

    markerUnchanged(id: string): boolean {
      return sameMarker(input.deletions.get(id) ?? undefined, snapshot.deletions.get(id));
    },

    /** Puts a setlist in place, keeping every other one exactly as it is now. */
    putSetlist(setlist: Setlist): void {
      const now = input.setlists.load().setlists;
      const index = now.findIndex((entry) => entry.id === setlist.id);
      const next = index === -1 ? [...now, setlist] : now.map((entry, at) => (at === index ? setlist : entry));
      input.setlists.save(next);
    },

    dropSetlist(id: string): void {
      input.setlists.save(input.setlists.load().setlists.filter((setlist) => setlist.id !== id));
    },

    putBase(base: SetlistSyncBase): void {
      const bases = input.bases.load();
      bases.set(base.setlistId, base);
      input.bases.save(bases);
    },

    dropBase(id: string): void {
      const bases = input.bases.load();
      bases.delete(id);
      input.bases.save(bases);
    },

    dropMarker(id: string): void {
      input.deletions.clear(id);
    },

    /** The setlist as it is right now, for keeping the people somebody just chose. */
    current(id: string): Setlist | undefined {
      return currentSetlists().get(id);
    },
  };
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

/**
 * One pass over every setlist on either side.
 *
 * Ids are walked in a fixed order — sorted — so two runs over the same state
 * do the same things in the same sequence, and one id's conflict, error or
 * stale state never stops the next one: each is decided and applied on its
 * own.
 *
 * The cloud is read once, at the start, hydrated against the local setlists
 * of that same moment, so the plans and the snapshot agree about what was
 * there.
 */
export async function runSetlistSyncPass(input: SetlistSyncPassInput): Promise<SetlistSyncPassReport> {
  const localSetlists = input.setlists.load().setlists;
  const snapshot: Snapshot = {
    setlists: new Map(localSetlists.map((setlist) => [setlist.id, setlist])),
    fingerprints: new Map(localSetlists.map((setlist) => [setlist.id, portableFingerprint(setlist)])),
    bases: input.bases.load(),
    deletions: new Map(input.deletions.list().map((marker) => [marker.setlistId, marker])),
  };

  // Read once, at the start, hydrated against the local setlists of this same
  // moment. If it fails there is nothing to reconcile against: an empty list
  // would read as "the cloud has none of these", which would call every
  // setlist local-only and every baseline stale. Nothing is touched.
  let remote: CloudSetlistRead[];
  try {
    remote = await input.cloud.list(localSetlists);
  } catch (error) {
    const status = error instanceof SetlistCloudAuthError ? 'remote-auth-error' : 'remote-read-error';
    return { status, outcomes: new Map(), order: [], error };
  }

  const plans = reconcileSetlists(localSetlists, remote, snapshot.bases, [...snapshot.deletions.values()]);
  const writes = localWrites(input, snapshot);

  const order = [...plans.keys()].sort();
  const outcomes = new Map<string, SetlistSyncOutcome>();
  for (const id of order) {
    const plan = plans.get(id);
    if (plan) outcomes.set(id, await settle(id, plan, input, snapshot, writes));
  }
  return { status: 'completed', outcomes, order };
}

type LocalWrites = ReturnType<typeof localWrites>;

async function settle(
  id: string,
  plan: SetlistSyncPlan,
  input: SetlistSyncPassInput,
  snapshot: Snapshot,
  writes: LocalWrites
): Promise<SetlistSyncOutcome> {
  const stale = (what: StaleReason): SetlistSyncOutcome => ({ kind: 'skipped-stale', plan, what });

  switch (plan.kind) {
    case 'noop':
      return { kind: 'noop', plan };
    case 'ask':
      return { kind: 'ask', plan };
    case 'blocked':
      return { kind: 'blocked', plan };

    // A setlist the cloud has never seen. It might have been made inside this
    // account, or it might be what somebody had as a visitor before signing
    // in — nothing on the device tells the two apart. Uploading everything
    // the moment somebody signs in is not a decision a pass gets to make, so
    // this is reported and left alone.
    case 'upload-candidate':
      return { kind: 'pending-user-action', plan };

    case 'upload-changes':
      return afterCloud(plan, input, (result) => {
        if (result.kind !== 'success') return null;
        // What the cloud now holds is what the row that came back says — not
        // what is on the device, which may have changed while the request was
        // in the air, and not merely what was sent: the server is the last
        // word on what ended up stored. The executor has already checked that
        // this row is this setlist at the revision this write should have
        // produced. The local setlist is never touched here.
        if (!writes.baseUnchanged(id)) return { kind: 'cloud-success', plan, result, local: 'skipped-stale', staleWhat: 'base' };
        const stored = result.read.state === 'setlist' ? result.read.setlist : plan.setlist;
        writes.putBase({ setlistId: id, cloudRevision: result.revision, fingerprint: portableFingerprint(stored) });
        return { kind: 'cloud-success', plan, result, local: 'written' };
      });

    case 'delete-remote':
      return afterCloud(plan, input, (result) => {
        if (result.kind !== 'success') return null;
        const skipped = (what: StaleReason): SetlistSyncOutcome => ({
          kind: 'cloud-success',
          plan,
          result,
          local: 'skipped-stale',
          staleWhat: what,
        });
        // The note that authorised this has to be the one still there: a
        // later deletion of the same id is a different intention, and the
        // success of an older one says nothing about it.
        if (!writes.markerUnchanged(id)) return skipped('deletion');
        // And nothing may have come back under that id in the meantime.
        if (writes.current(id)) return skipped('local');
        if (!writes.baseUnchanged(id)) return skipped('base');
        // There is a real tombstone up there now, so nothing is at risk of
        // coming back. If the device will not take one of these two writes,
        // the note is the one to keep: with it, the next pass sees the
        // tombstone again and reaches the same end. Without it, and with a
        // baseline left behind, it would see a setlist that simply is not
        // here any more and have to ask a person about it.
        try {
          writes.dropBase(id);
          writes.dropMarker(id);
        } catch {
          return { kind: 'cloud-success', plan, result, local: 'failed' };
        }
        return { kind: 'cloud-success', plan, result, local: 'written' };
      });

    // --- Plans that only move what this device knows --------------------------
    case 'adopt-baseline':
      if (!writes.baseUnchanged(id)) return stale('base');
      if (!writes.localUnchanged(id)) return stale('local');
      writes.putBase(plan.base);
      return { kind: 'applied-local', plan };

    case 'apply-remote': {
      // Changing who sings while a download is being applied must not throw
      // that away: the portable content comes from the cloud, and the people
      // are taken from the device as it is at this instant, by the same rule
      // that put them there when the row was read.
      if (!writes.localUnchanged(id)) return stale('local');
      if (!writes.baseUnchanged(id)) return stale('base');
      writes.putSetlist(withLocalMembership(plan.setlist, writes.current(id)));
      writes.putBase(plan.base);
      return { kind: 'applied-local', plan };
    }

    case 'delete-local':
      // Deleting takes the people with it, so anything at all having changed
      // is reason enough to leave it for the next pass.
      if (!writes.localIdentical(id)) return stale('local');
      if (!writes.baseUnchanged(id)) return stale('base');
      writes.dropSetlist(id);
      writes.dropBase(id);
      return { kind: 'applied-local', plan };

    case 'confirm-deletion':
      if (!writes.markerUnchanged(id)) return stale('deletion');
      if (writes.current(id)) return stale('local');
      if (!writes.baseUnchanged(id)) return stale('base');
      // The baseline first and the note last, so that a device that refuses
      // the second write keeps the evidence of what somebody wanted rather
      // than a baseline for a setlist nobody has. Keeping the note means the
      // next pass reaches this same conclusion; keeping the baseline alone
      // would mean having to ask a person about a setlist that is simply
      // gone.
      try {
        writes.dropBase(id);
        writes.dropMarker(id);
      } catch (error) {
        return { kind: 'local-error', plan, error };
      }
      return { kind: 'applied-local', plan };

    case 'forget-baseline':
      if (!writes.baseUnchanged(id)) return stale('base');
      writes.dropBase(id);
      return { kind: 'applied-local', plan };
  }
}

/**
 * Sends one request and turns what comes back into an outcome, letting the
 * caller add what should be written down when — and only when — it worked.
 */
async function afterCloud(
  plan: SetlistSyncPlan,
  input: SetlistSyncPassInput,
  onSuccess: (result: SetlistSyncExecutionResult) => SetlistSyncOutcome | null
): Promise<SetlistSyncOutcome> {
  if (!isCloudSetlistPlan(plan)) return { kind: 'ask', plan };
  const result = await executeSetlistSyncPlan({ plan, cloud: input.cloud });

  const applied = onSuccess(result);
  if (applied) return applied;

  switch (result.kind) {
    case 'success':
      // The success branches above return before this; reaching it means the
      // request worked and there was nothing to write down.
      return { kind: 'cloud-success', plan, result, local: 'written' };
    case 'conflict':
      // Nothing was written anywhere. Reading again, reconciling again and
      // making a new plan is the next pass's work, not a retry.
      return { kind: 'cloud-conflict', plan };
    case 'auth-error':
      return { kind: 'cloud-auth-error', plan };
    case 'request-error':
      return { kind: 'cloud-request-error', plan, error: result.error };
    case 'rejected':
      return { kind: 'cloud-rejected', plan, result };
    case 'invalid-plan':
      return { kind: 'invalid-plan', plan, result };
    case 'invalid-response':
      return { kind: 'invalid-response', plan, result };
  }
}
