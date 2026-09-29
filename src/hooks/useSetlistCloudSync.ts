import { useCallback, useMemo, useState } from 'react';
import { useAuthServices } from '../auth/useSession';
import type { Setlist } from '../types/setlist';
import type { CloudSetlistProblem } from '../storage/cloudSetlists';
import { getBrowserStorage, scopeId, type SetlistScope } from '../storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint } from '../storage/setlistSync';
import type { SetlistSyncOutcome, SetlistSyncPassReport } from '../storage/setlistSyncPass';

/**
 * Keeping one setlist and its copy in the account in step, because somebody
 * asked.
 *
 * A setlist made on this device stays on it until the person says otherwise:
 * signing in never sweeps everything up, because nothing here can tell a
 * setlist made inside an account from one made before signing in. And after
 * it is up there, an edit does not fly off on its own either. Both are the
 * same gesture — put what I have in my account — and both go through the one
 * path that already existed: capture the session, run one pass.
 *
 * What comes back is a sentence for the person. Revisions, fingerprints and
 * tokens are how the thing works, not something anybody needs to read.
 */

/** Where one setlist stands with the account, as far as this device knows. */
export type SetlistCloudState =
  /** No account: nothing to offer, and nothing about this setlist changes. */
  | 'guest'
  /** The cloud has never been told about it. */
  | 'new'
  /** It is up there, and it has been edited since. */
  | 'changed'
  /** It is up there and says the same thing. Nothing to offer. */
  | 'synced';

export interface SetlistCloudSync {
  /**
   * Whether there is an account to synchronise with at all. False for a
   * visitor, whose setlists stay exactly where they are.
   */
  available: boolean;
  /** A pass over everything is in the air. */
  busyAll: boolean;
  /**
   * Brings down whatever this account has that this device does not, sends up
   * what changed here, and says what happened. Nothing new is created: a
   * setlist this device has and the cloud has never seen still waits to be
   * asked for, one at a time.
   */
  syncAll: () => Promise<{ ok: boolean; message: string } | null>;
  /**
   * Where this setlist stands. Answered from what is already on the device —
   * a stored baseline and the setlist itself — so drawing a menu asks nothing
   * of the network.
   */
  stateOf: (setlist: Setlist) => SetlistCloudState;
  /** The setlist being synchronised right now, or null. */
  busy: string | null;
  /**
   * Puts what this device has in the account. A second call while one is in
   * flight does nothing rather than sending the same thing twice.
   */
  sync: (setlist: Setlist) => Promise<{ ok: boolean; message: string } | null>;
}

const LIMITS: Record<CloudSetlistProblem, string> = {
  id: 'Este Setlist no se puede guardar en tu cuenta.',
  name: 'El nombre es demasiado largo para guardarlo en tu cuenta.',
  date: 'La fecha no es válida.',
  description: 'La descripción es demasiado larga para guardarla en tu cuenta.',
  'item-count': 'Este Setlist tiene demasiadas canciones para guardarlo en tu cuenta.',
  'payload-size': 'Este Setlist es demasiado grande para guardarlo en tu cuenta.',
};

const SESSION_LOST = 'Tu sesión ha caducado. Vuelve a entrar e inténtalo otra vez.';
const NO_CONNECTION = 'No se pudo conectar. Inténtalo otra vez.';
const UNEXPECTED = 'No se pudo guardar. Inténtalo otra vez.';
const TOO_NEW = 'Este Setlist se guardó desde una versión más reciente de la aplicación. Actualízala para seguir.';

/** Somebody else changed it too. Nothing was overwritten, and that is the point. */
const changedElsewhere = (name: string) =>
  `«${name}» también cambió en otro dispositivo. No se ha guardado nada para no perder ninguna de las dos versiones.`;

/**
 * What to tell the person, from what the pass reported.
 *
 * `intent` is what they asked for, which is all that changes the wording: the
 * outcomes are the same either way. Nothing internal appears in any of it.
 */
export function describeSync(
  outcome: SetlistSyncOutcome | undefined,
  name: string,
  intent: 'new' | 'changed'
): { ok: boolean; message: string } {
  switch (outcome?.kind) {
    case 'cloud-success':
      // The row is right either way. Whether the note about it landed on this
      // device is the app's own problem, and the next pass settles it.
      return {
        ok: true,
        message: intent === 'new' ? `«${name}» guardado en tu cuenta` : `Cambios de «${name}» guardados en tu cuenta`,
      };
    case 'noop':
      return { ok: true, message: `«${name}» ya estaba al día en tu cuenta` };
    case 'cloud-conflict':
      // For a first upload: the row turned out to exist. For a change: the row
      // moved since it was read. Both mean somebody else got there, and both
      // mean nothing of theirs was overwritten.
      return intent === 'new'
        ? { ok: true, message: `«${name}» ya estaba en tu cuenta` }
        : { ok: false, message: changedElsewhere(name) };
    case 'ask':
      // Each side changed since they last agreed, or a deletion crossed an
      // edit. A person decides; nothing is written either way.
      return { ok: false, message: changedElsewhere(name) };
    case 'blocked':
      return { ok: false, message: TOO_NEW };
    case 'cloud-auth-error':
      return { ok: false, message: SESSION_LOST };
    case 'cloud-request-error':
      return { ok: false, message: NO_CONNECTION };
    case 'cloud-rejected':
      return {
        ok: false,
        message: outcome.result.kind === 'rejected' ? LIMITS[outcome.result.problem] : UNEXPECTED,
      };
    default:
      // pending-user-action, invalid-plan, invalid-response, applied-local,
      // skipped-stale, local-error: none is what this action asked for, and
      // none is a success to report as one.
      return { ok: false, message: UNEXPECTED };
  }
}

/** A pass that ran, or the reason there was none. */
type PassAttempt = { ran: true; report: SetlistSyncPassReport } | { ran: false; message: string };

/** How many setlists each kind of thing happened to, for one sentence about all of them. */
export interface SyncTally {
  /** Came down from the account: setlists this device did not have, or had older. */
  recovered: number;
  /** Went up: changes made here. */
  saved: number;
  /** Changed on both sides, or deleted on one and edited on the other. Nothing was touched. */
  conflicts: number;
  /** Here but never put in the account. Each one waits to be asked for. */
  pending: number;
  /** Written by a newer version of the app, or unreadable. */
  blocked: number;
  /** Something went wrong with one of them. */
  failed: number;
}

export function tally(outcomes: Iterable<SetlistSyncOutcome>): SyncTally {
  const counts: SyncTally = { recovered: 0, saved: 0, conflicts: 0, pending: 0, blocked: 0, failed: 0 };
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'applied-local':
        // Only a setlist arriving or being removed is worth counting; writing
        // down an agreement is housekeeping nobody asked about.
        if (outcome.plan.kind === 'apply-remote' || outcome.plan.kind === 'delete-local') counts.recovered += 1;
        break;
      case 'cloud-success':
        counts.saved += 1;
        break;
      case 'ask':
      case 'cloud-conflict':
        counts.conflicts += 1;
        break;
      case 'pending-user-action':
        counts.pending += 1;
        break;
      case 'blocked':
        counts.blocked += 1;
        break;
      case 'cloud-rejected':
      case 'cloud-request-error':
      case 'cloud-auth-error':
      case 'invalid-plan':
      case 'invalid-response':
      case 'local-error':
        counts.failed += 1;
        break;
      case 'noop':
      case 'skipped-stale':
        break;
    }
  }
  return counts;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * One sentence about a whole pass.
 *
 * What somebody wants to know first is whether anything needs them: a setlist
 * that changed in two places is the only thing here they have to do something
 * about, so it is said first even when other things went well.
 */
export function describePass(counts: SyncTally): { ok: boolean; message: string } {
  const parts: string[] = [];
  if (counts.recovered) parts.push(plural(counts.recovered, 'Setlist recuperado', 'Setlists recuperados'));
  if (counts.saved) parts.push(plural(counts.saved, 'cambio guardado', 'cambios guardados'));

  if (counts.conflicts) {
    const also = parts.length ? `${parts.join(' y ')}. ` : '';
    return {
      ok: false,
      message:
        `${also}${plural(counts.conflicts, 'Setlist cambió', 'Setlists cambiaron')} aquí y en otro dispositivo: ` +
        'no se ha guardado nada de ésos para no perder ninguna de las dos versiones.',
    };
  }
  if (counts.failed) {
    const also = parts.length ? `${parts.join(' y ')}. ` : '';
    return { ok: false, message: `${also}Algo no se pudo guardar. Inténtalo otra vez.` };
  }
  if (counts.blocked) {
    const also = parts.length ? `${parts.join(' y ')}. ` : '';
    return {
      ok: false,
      message: `${also}Hay Setlists guardados desde una versión más reciente de la aplicación. Actualízala para verlos.`,
    };
  }

  if (!parts.length) {
    return {
      ok: true,
      message: counts.pending
        ? `Todo al día. ${plural(counts.pending, 'Setlist sigue', 'Setlists siguen')} sin guardar en tu cuenta.`
        : 'Tus Setlists están al día',
    };
  }
  const tail = counts.pending
    ? `. ${plural(counts.pending, 'Setlist sigue', 'Setlists siguen')} sin guardar en tu cuenta`
    : '';
  return { ok: true, message: `${parts.join(' y ')}${tail}` };
}

/**
 * `scope` is whose setlists these are, the same one the list is read with, so
 * what is offered can never be about a different account than the one on
 * screen. A visitor is offered nothing: there is no account to put anything
 * in, and nothing about their setlists changes.
 */
export function useSetlistCloudSync(scope: SetlistScope): SetlistCloudSync {
  const { services } = useAuthServices();
  const [busy, setBusy] = useState<string | null>(null);
  const [busyAll, setBusyAll] = useState(false);
  // Counted up after something reached the cloud, so the menu stops offering
  // what is now up to date.
  const [passes, setPasses] = useState(0);

  const userId = scope.kind === 'user' ? scope.userId.trim() : '';
  const scopeName = scopeId(scope);

  // What the cloud is known to hold, read once per account and again after
  // each pass rather than on every render. Another tab's pass is not noticed
  // until this one runs again, which only ever means offering something that
  // turns out to be already done.
  const agreed = useMemo(() => {
    if (!userId) return new Map<string, string>();
    void scopeName;
    void passes;
    const bases = createSetlistSyncStore(getBrowserStorage(), scope).load();
    return new Map([...bases.values()].map((base) => [base.setlistId, base.fingerprint]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scopeName, passes]);

  const stateOf = useCallback(
    (setlist: Setlist): SetlistCloudState => {
      if (!userId || !services) return 'guest';
      const agreedFingerprint = agreed.get(setlist.id);
      if (agreedFingerprint === undefined) return 'new';
      // Only what travels counts. Choosing who sings, or who takes part, is
      // not something the cloud can hold an opinion about (see
      // portableFingerprint), so it never asks to be saved.
      return portableFingerprint(setlist) === agreedFingerprint ? 'synced' : 'changed';
    },
    [userId, services, agreed]
  );

  /**
   * One pass for this account, or a sentence saying why there was none. The
   * capture is made here so both actions get the same guarantee: an identity
   * and a token read together, and nothing asked again afterwards.
   */
  const runPass = useCallback(
    async (authorisedUploads: string[]): Promise<PassAttempt> => {
      const stopped = (message: string): PassAttempt => ({ ran: false, message });
      if (!services || !userId) return stopped(SESSION_LOST);
      const capture = await services.auth.authenticated();
      if (!capture || capture.session.userId.trim() !== userId) return stopped(SESSION_LOST);

      // Downloaded the first time somebody asks for this, and never for a
      // visitor: the whole of the synchronising machinery is weight that most
      // people never need, like supabase-js itself (see useSession).
      const { runAuthenticatedSetlistSyncPass } = await import('../storage/setlistSyncSession');
      const result = await runAuthenticatedSetlistSyncPass(capture, {}, { authorisedUploads });
      if (result.status !== 'ran') return stopped(SESSION_LOST);
      if (result.report.status === 'remote-auth-error') return stopped(SESSION_LOST);
      if (result.report.status === 'remote-read-error') return stopped(NO_CONNECTION);
      return { ran: true, report: result.report };
    },
    [services, userId]
  );

  const syncAll = useCallback(async () => {
    if (busy || busyAll) return null;
    setBusyAll(true);
    try {
      // Nothing is named, so nothing new is created: bringing down and keeping
      // in step need no permission, but a first upload always does.
      const outcome = await runPass([]);
      if (!outcome.ran) return { ok: false, message: outcome.message };
      setPasses((count) => count + 1);
      return describePass(tally(outcome.report.outcomes.values()));
    } catch {
      return { ok: false, message: NO_CONNECTION };
    } finally {
      setBusyAll(false);
    }
  }, [busy, busyAll, runPass]);

  const sync = useCallback(
    async (setlist: Setlist) => {
      // One at a time: a second press while the first is in the air does
      // nothing rather than sending the same setlist twice.
      if (busy || busyAll) return null;
      const intent = agreed.has(setlist.id) ? 'changed' : 'new';

      setBusy(setlist.id);
      try {
        // Naming it authorises a first upload of this one and nothing else; a
        // setlist that is already up there needs no permission to be kept in
        // step, and the engine works that out for itself.
        const outcome = await runPass([setlist.id]);
        if (!outcome.ran) return { ok: false, message: outcome.message };
        // A pass settles every setlist, so what this one learned is worth
        // keeping whatever it says about the one that was clicked.
        setPasses((count) => count + 1);
        return describeSync(outcome.report.outcomes.get(setlist.id), setlist.name, intent);
      } catch {
        // Nothing reached the cloud, or nothing came back from it.
        return { ok: false, message: NO_CONNECTION };
      } finally {
        setBusy(null);
      }
    },
    [busy, busyAll, runPass, agreed]
  );

  return { available: Boolean(userId) && Boolean(services), stateOf, busy, busyAll, sync, syncAll };
}
