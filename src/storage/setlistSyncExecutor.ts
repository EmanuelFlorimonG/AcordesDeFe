import {
  SetlistCloudAuthError,
  type CloudSetlistProblem,
  type CloudSetlistRead,
  type CloudSetlistRepository,
  type CloudWriteResult,
} from './cloudSetlists';
import type { SetlistSyncPlan } from './setlistSync';

/**
 * Carrying out one plan, and nothing else.
 *
 * The decision was made elsewhere (setlistSync) out of data that was already
 * in hand. This takes the decision as given: it does not weigh it up again,
 * does not look at a revision to choose, does not read a clock, and never
 * asks the engine anything. It sends the one request the plan authorises,
 * checks that what came back is what that request should produce, and says
 * what happened.
 *
 * It also changes nothing on the device. Not a setlist, not a baseline, not a
 * deletion note. A result is a report; whoever asked for it decides what to
 * write down, and that only after the report says the write landed.
 */

/** The three plans that mean a request. Everything else is somebody else's work. */
export type CloudSetlistPlan = Extract<
  SetlistSyncPlan,
  { kind: 'upload-candidate' | 'upload-changes' | 'delete-remote' }
>;

const CLOUD_KINDS = ['upload-candidate', 'upload-changes', 'delete-remote'] as const;

/**
 * Whether a plan is one of those three.
 *
 * The type is the real boundary: nothing else can be passed to the executor
 * at all, so a plan that needs a person, or one that only moves local
 * metadata, cannot reach a request by mistake. This is for a caller holding
 * the whole union that has to sort them first.
 */
export function isCloudSetlistPlan(plan: SetlistSyncPlan): plan is CloudSetlistPlan {
  return (CLOUD_KINDS as readonly string[]).includes(plan.kind);
}

export type SetlistCloudOperation = 'create' | 'update' | 'delete';

/** What the table starts a row at, and therefore what a create must answer with. */
const FIRST_REVISION = 1;

/** Why an answer could not be taken as the operation having happened. */
export type SetlistCloudInvalidReason =
  /** Not exactly one row: none is a conflict, more than one is nonsense. */
  | 'row-count'
  /** A row came back for a different setlist. */
  | 'wrong-id'
  /** A create that did not start at 1, or a write that did not land on the revision after the one named. */
  | 'wrong-revision'
  /** A write or a create answered with a tombstone. */
  | 'deleted'
  /** A delete answered with a setlist that is still there. */
  | 'not-deleted'
  /** The row is in a representation this build does not know. */
  | 'newer'
  /** The row cannot be read at all. */
  | 'unreadable';

export type SetlistSyncExecutionResult =
  /** It happened, and this is the row that proves it. */
  | { kind: 'success'; operation: SetlistCloudOperation; setlistId: string; revision: number; read: CloudSetlistRead }
  /**
   * Nothing was written: the row had moved on, or it is already there. Not an
   * error and not a retry — deciding again means reading again, reconciling
   * again and making a new plan, which is not this layer's to do.
   */
  | { kind: 'conflict'; operation: SetlistCloudOperation; setlistId: string }
  /** The setlist does not fit the table. Nothing was sent. */
  | { kind: 'rejected'; operation: SetlistCloudOperation; setlistId: string; problem: CloudSetlistProblem }
  /** No session. Nothing was sent, nothing signed out, nothing erased. */
  | { kind: 'auth-error'; operation: SetlistCloudOperation; setlistId: string }
  /** The request did not get through, or the database refused it. */
  | { kind: 'request-error'; operation: SetlistCloudOperation; setlistId: string; error: unknown }
  /**
   * The plan itself could not be carried out, and nothing was sent. Not the
   * same as an answer being wrong: here there was no answer, because there
   * was no request.
   */
  | { kind: 'invalid-plan'; operation: SetlistCloudOperation; setlistId: string; reason: 'deleted-at' }
  /** Something came back that this operation could not have produced. */
  | {
      kind: 'invalid-response';
      operation: SetlistCloudOperation;
      setlistId: string;
      reason: SetlistCloudInvalidReason;
      read?: CloudSetlistRead;
    };

/**
 * What the answer has to be for the operation to have happened.
 *
 * A create starts a row at revision 1. A write against revision N leaves it
 * at N+1, because that is what the request asked for. A delete leaves a
 * tombstone, and a tombstone is the only thing it may leave: an active row
 * coming back from a delete means something else was written, and calling
 * that a success would have the device forget a setlist that is still up
 * there.
 */
function check(
  operation: SetlistCloudOperation,
  setlistId: string,
  expectedRevision: number,
  result: Extract<CloudWriteResult, { status: 'written' }>
): SetlistSyncExecutionResult {
  const invalid = (reason: SetlistCloudInvalidReason): SetlistSyncExecutionResult => ({
    kind: 'invalid-response',
    operation,
    setlistId,
    reason,
    read: result.read,
  });

  if (result.rows !== 1) return invalid('row-count');
  const read = result.read;
  if (read.state === 'corrupt') return invalid('unreadable');
  if (read.id !== setlistId) return invalid('wrong-id');
  if (read.state === 'newer') return invalid('newer');

  if (operation === 'delete') {
    if (read.state !== 'deleted') return invalid('not-deleted');
  } else if (read.state !== 'setlist') {
    return invalid('deleted');
  }

  if (read.revision !== expectedRevision) return invalid('wrong-revision');
  return { kind: 'success', operation, setlistId, revision: read.revision, read };
}

/** Everything a failed call can be, told apart by what it is and never by its text. */
function failure(
  operation: SetlistCloudOperation,
  setlistId: string,
  error: unknown
): SetlistSyncExecutionResult {
  // No session: the call should not have been made. Nothing is retried as the
  // public, nothing is signed out, nothing local is touched.
  if (error instanceof SetlistCloudAuthError) return { kind: 'auth-error', operation, setlistId };
  // A refusal from the database (a policy, a check constraint) and a request
  // that never arrived are the same thing here: it did not happen, and the
  // device keeps everything it had. The error travels whole and unread, so
  // whoever is above can tell a SupabaseRequestError carrying 42501 from a
  // dropped connection without anybody here matching on a message.
  return { kind: 'request-error', operation, setlistId, error };
}

export interface SetlistSyncExecution {
  plan: CloudSetlistPlan;
  cloud: CloudSetlistRepository;
}

/**
 * Sends the one request a plan authorises.
 *
 * The revision it names is the plan's, always: for an update it is what the
 * device read, and for a delete it is what was known when somebody pressed
 * delete. Never one discovered along the way — writing against a revision
 * nobody has seen is how another device's work disappears.
 *
 * One request per call. A conflict is an answer, not a reason to try again
 * with something else.
 */
export async function executeSetlistSyncPlan({
  plan,
  cloud,
}: SetlistSyncExecution): Promise<SetlistSyncExecutionResult> {
  const operation: SetlistCloudOperation =
    plan.kind === 'upload-candidate' ? 'create' : plan.kind === 'upload-changes' ? 'update' : 'delete';
  const setlistId = plan.kind === 'delete-remote' ? plan.setlistId : plan.setlist.id;
  // A create starts the row; the other two say which revision they are for,
  // and the row lands on the one after it.
  const expectedRevision = plan.kind === 'upload-candidate' ? FIRST_REVISION : plan.expectedRevision + 1;

  // The engine already refuses to plan a deletion whose moment is not one.
  // This is the same check at the edge where a value turns into a request: a
  // Date built from NaN would go out as null and leave a tombstone with no
  // moment at all. Nothing is repaired and nothing is sent.
  if (plan.kind === 'delete-remote' && !(Number.isInteger(plan.deletedAt) && plan.deletedAt > 0)) {
    return { kind: 'invalid-plan', operation, setlistId, reason: 'deleted-at' };
  }

  let result: CloudWriteResult;
  // Only the call is inside: a mistake in reading the answer is a mistake in
  // this file, and should be seen as one rather than reported as a request
  // that failed.
  try {
    if (plan.kind === 'upload-candidate') {
      result = await cloud.create(plan.setlist);
    } else if (plan.kind === 'upload-changes') {
      result = await cloud.update(plan.setlist, plan.expectedRevision);
    } else {
      // The tombstone carries when the person asked, not when it was sent.
      // The epoch goes through untouched: no string, no parsing, no zone.
      result = await cloud.remove(plan.setlistId, plan.expectedRevision, new Date(plan.deletedAt));
    }
  } catch (error) {
    return failure(operation, setlistId, error);
  }

  if (result.status === 'conflict') return { kind: 'conflict', operation, setlistId };
  if (result.status === 'rejected') return { kind: 'rejected', operation, setlistId, problem: result.problem };
  return check(operation, setlistId, expectedRevision, result);
}
