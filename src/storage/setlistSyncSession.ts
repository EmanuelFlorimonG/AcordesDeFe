import { createSupabaseClient, getSupabaseStatus } from '../lib/supabase';
import type { AuthenticatedSession } from '../auth/session';
import { createCloudSetlistRepository, type CloudSetlistRepository } from './cloudSetlists';
import { createSetlistDeletionRepository } from './setlistDeletions';
import { createLocalSetlistRepository, getBrowserStorage, userSetlists, type KeyValueStorage } from './setlistStorage';
import { createSetlistSyncStore } from './setlistSync';
import { runSetlistSyncPass, type SetlistSyncPassReport } from './setlistSyncPass';

/**
 * One pass, for one signed-in person.
 *
 * Everything below this point works on setlists without knowing whose they
 * are. This is where that gets decided, once: it takes a capture of who is
 * signed in and the token of that same session — one reading, made by the
 * only layer that can vouch for the pair (see AppAuth.authenticated) — opens
 * that account's own three stores, builds a cloud that speaks with that
 * token, and runs a single pass over them.
 *
 * All of it is captured before the first request goes out. Nothing here asks
 * again who is signed in after an await — a pass that began as one person
 * must not finish as another, and the way to guarantee that is never to look
 * a second time. If somebody signs out mid-pass, the pass finishes against
 * the stores and the token it started with, which are that person's, and the
 * next pass starts from whoever is there then.
 *
 * It decides nothing about setlists. The report comes back exactly as the
 * pass made it.
 */

export type AuthenticatedSyncResult =
  /** It ran. The report is the pass's own, unread and unchanged. */
  | { status: 'ran'; userId: string; report: SetlistSyncPassReport }
  /** No identity worth the name. Nothing was opened, nothing was asked. */
  | { status: 'not-signed-in' }
  /**
   * An identity with no token. Not an error to explain to a database: a
   * request as the public would reach nothing of this person's, and asking
   * for one would be pretending to be somebody.
   */
  | { status: 'no-access-token'; userId: string }
  /** This build has no Supabase. There is nothing to synchronise with. */
  | { status: 'unconfigured'; userId: string };

/** What one pass is allowed to do beyond reading and reconciling. */
export interface SetlistSyncAuthorisation {
  /**
   * Setlists this person has explicitly asked to put in the cloud, by id.
   * Absent or empty means a pass creates nothing new — signing in never
   * imports anything by itself.
   */
  authorisedUploads?: Iterable<string>;
}

export interface SetlistSyncSessionDependencies {
  /** Where this device keeps things. The browser's own, unless a test says otherwise. */
  storage?: KeyValueStorage | null;
  /**
   * The cloud side, speaking as this exact token. Replaced in tests, which
   * never reach a real Supabase.
   */
  cloudFor?: (accessToken: string) => CloudSetlistRepository | null;
}

/**
 * A cloud that acts as one token and only that one.
 *
 * The app's own client asks the live session for a token on every request,
 * which is right for screens and wrong here: after an await the live session
 * may be somebody else. So the token is frozen into this one. It is a REST
 * wrapper over fetch, not a second Supabase Auth client — there is still
 * exactly one of those, in src/auth/supabaseSession.ts, and this holds no
 * session of its own. An expired token makes requests fail, which is the
 * safe answer; it never falls back to the public.
 */
export function cloudForToken(accessToken: string): CloudSetlistRepository | null {
  const status = getSupabaseStatus();
  if (status.state !== 'configured') return null;
  const frozen = async () => accessToken;
  return createCloudSetlistRepository(createSupabaseClient(status.config, fetch, { accessToken: frozen }), frozen);
}

/**
 * Runs one pass for this person, or says why it did not.
 *
 * The stores are this account's, by its user id and nothing else — never a
 * name, never an address, and never the visitor's, who has no cloud to
 * synchronise with. Building them from the scope means the keys are the ones
 * the rest of the app already uses (see setlistKeys), spelled in one place.
 *
 * What the pass reads is those stores, not anything React is holding: during
 * a change of account the screen and the stores can briefly disagree, and the
 * stores are the ones that are certainly this person's.
 */
export async function runAuthenticatedSetlistSyncPass(
  who: AuthenticatedSession,
  deps: SetlistSyncSessionDependencies = {},
  allowed: SetlistSyncAuthorisation = {}
): Promise<AuthenticatedSyncResult> {
  // The capture already answered all of this — an AuthenticatedSession only
  // exists when there was a session, an id and a token, all from one reading
  // (see AppAuth.authenticated). These are the same checks again at the edge
  // where values become storage keys and requests, because nothing stops a
  // caller from building the object by hand.
  const userId = who.session?.userId?.trim();
  if (!userId) return { status: 'not-signed-in' };

  const accessToken = who.accessToken?.trim();
  if (!accessToken) return { status: 'no-access-token', userId };

  const cloud = (deps.cloudFor ?? cloudForToken)(accessToken);
  if (!cloud) return { status: 'unconfigured', userId };

  const storage = deps.storage === undefined ? getBrowserStorage() : deps.storage;
  const scope = userSetlists(userId);

  const report = await runSetlistSyncPass({
    setlists: createLocalSetlistRepository(storage, scope),
    bases: createSetlistSyncStore(storage, scope),
    deletions: createSetlistDeletionRepository(storage, scope),
    cloud,
    authorisedUploads: allowed.authorisedUploads,
  });

  return { status: 'ran', userId, report };
}
