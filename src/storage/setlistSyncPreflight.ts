import type { AuthenticatedSession } from '../auth/session';
import { SetlistCloudAuthError, type CloudSetlistRead } from './cloudSetlists';
import { createSetlistDeletionRepository } from './setlistDeletions';
import { createLocalSetlistRepository, getBrowserStorage, userSetlists } from './setlistStorage';
import { createSetlistSyncStore, reconcileSetlists, type SetlistSyncPlan } from './setlistSync';
import { cloudForToken, type SetlistSyncSessionDependencies } from './setlistSyncSession';

/**
 * What a pass *would* do, without doing any of it.
 *
 * Before letting this loose on somebody's real setlists it should be
 * possible to look first: how many are here, what the cloud has, and what
 * would happen to each one. So this reads both sides, asks the engine for
 * its plans, and describes them. It stops there.
 *
 * Read-only is not a promise, it is the shape of the file: the only things
 * it ever calls are `load` on the three local stores and `list` on the
 * cloud. There is no mention anywhere of creating, updating, removing,
 * saving, marking or clearing — nor of the pass that does those, whose job
 * includes writing and which is therefore not what a look-first uses.
 *
 * The plans come from the same function the pass asks, with the same four
 * arguments, so what is described here is what would actually happen and not
 * a second opinion about it.
 */

export interface LocalCounts {
  setlists: number;
  bases: number;
  deletions: number;
}

export interface RemoteCounts {
  rows: number;
  setlists: number;
  deleted: number;
  newer: number;
  corrupt: number;
}

/**
 * What kind of effect each plan would have, by setlist id. Descriptive only:
 * nothing here decides anything, and reading it changes nothing.
 */
export interface PlannedEffects {
  /** Both sides already agree. */
  nothing: string[];
  /** Would write on this device only: a baseline, a download, a deletion, a tidy-up. */
  local: string[];
  /** Would send a request that changes a row: the number to look at before a first real run. */
  cloud: string[];
  /** Waits for a person: a setlist the cloud has never seen, or a question only somebody can answer. */
  decision: string[];
  /** A row this build must not touch. */
  blocked: string[];
}

export type SetlistSyncPreflightReport =
  /** No identity worth the name. Nothing was opened, nothing was asked. */
  | { status: 'not-signed-in' }
  | { status: 'no-access-token'; userId: string }
  | { status: 'unconfigured'; userId: string }
  /** The cloud could not be read. What is here was still counted; nothing was concluded about it. */
  | { status: 'remote-auth-error'; userId: string; local: LocalCounts; error: unknown }
  | { status: 'remote-read-error'; userId: string; local: LocalCounts; error: unknown }
  | {
      status: 'ready';
      userId: string;
      local: LocalCounts;
      remote: RemoteCounts;
      /** Exactly what the engine says, by id. */
      plans: Map<string, SetlistSyncPlan>;
      /** The ids in the order a pass would walk them. */
      order: string[];
      effects: PlannedEffects;
      /**
       * The rows as they were read, so what the cloud holds can be shown
       * beside what this device holds when somebody has to choose.
       */
      rows: CloudSetlistRead[];
    };

/**
 * Which plans would touch what.
 *
 * `upload-candidate` counts as a decision, not as a cloud write: a pass
 * leaves it for somebody to ask for, so a preflight that counted it as a
 * write would say a run is about to upload things it would not touch.
 */
function effectsOf(plans: Map<string, SetlistSyncPlan>, order: string[]): PlannedEffects {
  const effects: PlannedEffects = { nothing: [], local: [], cloud: [], decision: [], blocked: [] };
  for (const id of order) {
    const kind = plans.get(id)?.kind;
    switch (kind) {
      case 'noop':
        effects.nothing.push(id);
        break;
      case 'adopt-baseline':
      case 'apply-remote':
      case 'delete-local':
      case 'confirm-deletion':
      case 'forget-baseline':
        effects.local.push(id);
        break;
      case 'upload-changes':
      case 'delete-remote':
        effects.cloud.push(id);
        break;
      case 'upload-candidate':
      case 'ask':
        effects.decision.push(id);
        break;
      case 'blocked':
        effects.blocked.push(id);
        break;
    }
  }
  return effects;
}

function countRemote(rows: CloudSetlistRead[]): RemoteCounts {
  const counts: RemoteCounts = { rows: rows.length, setlists: 0, deleted: 0, newer: 0, corrupt: 0 };
  for (const row of rows) {
    if (row.state === 'setlist') counts.setlists += 1;
    else if (row.state === 'deleted') counts.deleted += 1;
    else if (row.state === 'newer') counts.newer += 1;
    else counts.corrupt += 1;
  }
  return counts;
}

/**
 * Looks at both sides for one signed-in person and says what a pass would
 * do. Changes nothing, anywhere.
 *
 * The identity and the token are the capture's, frozen (see
 * AppAuth.authenticated): the stores are that account's by its user id, and
 * the cloud speaks with that token. Nothing asks again who is signed in, so
 * a look that began as one person cannot end as another.
 */
export async function runSetlistSyncPreflight(
  who: AuthenticatedSession,
  deps: SetlistSyncSessionDependencies = {}
): Promise<SetlistSyncPreflightReport> {
  const userId = who.session?.userId?.trim();
  if (!userId) return { status: 'not-signed-in' };

  const accessToken = who.accessToken?.trim();
  if (!accessToken) return { status: 'no-access-token', userId };

  const cloud = (deps.cloudFor ?? cloudForToken)(accessToken);
  if (!cloud) return { status: 'unconfigured', userId };

  const storage = deps.storage === undefined ? getBrowserStorage() : deps.storage;
  const scope = userSetlists(userId);
  // Three reads, and only reads: `load` and `list` are all these stores are
  // asked for anywhere in this file.
  const setlists = createLocalSetlistRepository(storage, scope).load().setlists;
  const bases = createSetlistSyncStore(storage, scope).load();
  const deletions = createSetlistDeletionRepository(storage, scope).list();
  const local: LocalCounts = { setlists: setlists.length, bases: bases.size, deletions: deletions.length };

  let rows: CloudSetlistRead[];
  try {
    rows = await cloud.list(setlists);
  } catch (error) {
    // Not an empty cloud: reading it that way would call every setlist
    // local-only and every baseline stale, which is a diagnosis and not a
    // failure to read.
    const status = error instanceof SetlistCloudAuthError ? 'remote-auth-error' : 'remote-read-error';
    return { status, userId, local, error };
  }

  const plans = reconcileSetlists(setlists, rows, bases, deletions);
  const order = [...plans.keys()].sort();
  return {
    status: 'ready',
    userId,
    local,
    remote: countRemote(rows),
    plans,
    order,
    effects: effectsOf(plans, order),
    rows,
  };
}
