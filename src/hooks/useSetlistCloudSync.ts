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

/**
 * Two versions of one setlist as they were a moment ago, for somebody to
 * choose between.
 *
 * `seenRevision` is which copy of the account's version this is. It is never
 * shown to anybody: it goes back with the decision, so that a choice made
 * about these two versions is only ever carried out against the version it
 * was made about. If the account's copy changes while the dialog is open, the
 * decision does not apply to it and the conflict is reported again.
 */
export interface SetlistVersions {
  mine: Setlist;
  theirs: Setlist;
  seenRevision: number;
}

/** What came of looking at the account's version of a setlist. */
export type SetlistVersionsLookup =
  | ({ kind: 'conflict' } & SetlistVersions)
  /** No longer two versions: somebody settled it, here or elsewhere. */
  | { kind: 'settled' }
  | { kind: 'error'; message: string };

/** Which version somebody chose to keep. */
export type SetlistKeep = 'local' | 'remote';

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
  /**
   * True when the last pass found this setlist changed here *and* in the
   * account. Nothing was written either way, and nothing will be until
   * somebody chooses.
   */
  conflicted: (setlist: Setlist) => boolean;
  /**
   * Reads the account's version so the two can be shown side by side. Reads
   * only: looking at a conflict never resolves it, and never writes anywhere.
   */
  inspect: (setlist: Setlist) => Promise<SetlistVersionsLookup>;
  /**
   * Carries out what somebody chose, against the version they were shown.
   *
   * Keeping this one sends it over the account's copy, and keeping the
   * account's one replaces what is here — in both cases only if the account's
   * copy is still the `seenRevision` they compared. If it moved, nothing is
   * written and the conflict is reported again.
   */
  resolve: (
    setlist: Setlist,
    keep: SetlistKeep,
    seenRevision: number
  ) => Promise<{ ok: boolean; message: string } | null>;
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

/** It moved again while somebody was deciding. Still nothing overwritten. */
const MOVED_AGAIN =
  'La versión de tu cuenta ha vuelto a cambiar mientras decidías. No se ha guardado nada: vuelve a compararlas.';
const NO_LONGER = 'Ya no hay dos versiones distintas de este Setlist.';

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

/**
 * What to tell the person after they chose.
 *
 * The two choices fail differently and have to read differently: keeping this
 * version is a write that the account's copy can refuse, and keeping the
 * account's version is not a write at all. Either way, the one thing somebody
 * must never be told is that something was saved when it was not.
 */
export function describeResolution(
  outcome: SetlistSyncOutcome | undefined,
  name: string,
  keep: SetlistKeep
): { ok: boolean; message: string } {
  if (keep === 'remote') {
    switch (outcome?.kind) {
      case 'applied-local':
        return { ok: true, message: `«${name}» es ahora la versión de tu cuenta` };
      case 'noop':
        return { ok: true, message: NO_LONGER };
      case 'ask':
        // The row moved while the dialog was open, so what they compared is
        // not what is there. Nothing was touched on either side.
        return { ok: false, message: MOVED_AGAIN };
      case 'local-error':
        return { ok: false, message: 'No se pudo guardar en este dispositivo. Inténtalo otra vez.' };
      default:
        return describeSync(outcome, name, 'changed');
    }
  }
  switch (outcome?.kind) {
    case 'cloud-success':
      return { ok: true, message: `«${name}» de este dispositivo es ahora la versión de tu cuenta` };
    case 'ask':
      return { ok: false, message: MOVED_AGAIN };
    case 'cloud-conflict':
      // The revision matched when the pass read it and no longer did when the
      // request landed. Same answer: compare them again.
      return { ok: false, message: MOVED_AGAIN };
    case 'noop':
      return { ok: true, message: NO_LONGER };
    default:
      return describeSync(outcome, name, 'changed');
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
  // The setlists the last pass found changed on both sides. Remembered so the
  // menu can offer to settle one, and cleared the moment a pass says
  // otherwise — it is never a verdict, only what was true a moment ago.
  const [conflicts, setConflicts] = useState<ReadonlySet<string>>(() => new Set());
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
    async (
      authorisedUploads: string[],
      resolutions?: Array<readonly [string, { keep: SetlistKeep; seenRevision: number }]>
    ): Promise<PassAttempt> => {
      const stopped = (message: string): PassAttempt => ({ ran: false, message });
      if (!services || !userId) return stopped(SESSION_LOST);
      const capture = await services.auth.authenticated();
      if (!capture || capture.session.userId.trim() !== userId) return stopped(SESSION_LOST);

      // Downloaded the first time somebody asks for this, and never for a
      // visitor: the whole of the synchronising machinery is weight that most
      // people never need, like supabase-js itself (see useSession).
      const { runAuthenticatedSetlistSyncPass } = await import('../storage/setlistSyncSession');
      const result = await runAuthenticatedSetlistSyncPass(capture, {}, { authorisedUploads, resolutions });
      if (result.status !== 'ran') return stopped(SESSION_LOST);
      if (result.report.status === 'remote-auth-error') return stopped(SESSION_LOST);
      if (result.report.status === 'remote-read-error') return stopped(NO_CONNECTION);
      // What still needs a person, as of this pass. Written down whole, so a
      // setlist that was settled stops being offered as a conflict.
      setConflicts(
        new Set(
          [...result.report.outcomes]
            .filter(([, outcome]) => outcome.kind === 'ask' || outcome.kind === 'cloud-conflict')
            .map(([id]) => id)
        )
      );
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

  const conflicted = useCallback((setlist: Setlist) => conflicts.has(setlist.id), [conflicts]);

  /**
   * Reads the account's version of one setlist, for showing beside this one.
   *
   * It asks the preflight, which is the read-only half of the same machinery:
   * the plans come from the same engine a pass would ask, so what is called a
   * conflict here is exactly what a pass would refuse to settle on its own.
   * Nothing is written by looking.
   */
  const inspect = useCallback(
    async (setlist: Setlist): Promise<SetlistVersionsLookup> => {
      if (!services || !userId) return { kind: 'error', message: SESSION_LOST };
      try {
        const capture = await services.auth.authenticated();
        if (!capture || capture.session.userId.trim() !== userId) {
          return { kind: 'error', message: SESSION_LOST };
        }
        const { runSetlistSyncPreflight } = await import('../storage/setlistSyncPreflight');
        const report = await runSetlistSyncPreflight(capture);
        if (report.status === 'remote-read-error') return { kind: 'error', message: NO_CONNECTION };
        if (report.status !== 'ready') return { kind: 'error', message: SESSION_LOST };

        const plan = report.plans.get(setlist.id);
        // Only "both changed" is a choice between two versions. Anything else
        // the engine wants a person for — a deletion crossing an edit, a row
        // this build cannot read — is not something two buttons can answer.
        if (plan?.kind !== 'ask' || plan.question !== 'both-changed') return { kind: 'settled' };
        const row = report.rows.find((read) => read.id === setlist.id);
        if (row?.state !== 'setlist') return { kind: 'settled' };
        return { kind: 'conflict', mine: setlist, theirs: row.setlist, seenRevision: row.revision };
      } catch {
        return { kind: 'error', message: NO_CONNECTION };
      }
    },
    [services, userId]
  );

  const resolve = useCallback(
    async (setlist: Setlist, keep: SetlistKeep, seenRevision: number) => {
      if (busy || busyAll) return null;
      setBusy(setlist.id);
      try {
        // The decision names the version it was made about. Nothing else is
        // authorised: no upload of anything new, no other conflict settled.
        const outcome = await runPass([], [[setlist.id, { keep, seenRevision }]]);
        if (!outcome.ran) return { ok: false, message: outcome.message };
        setPasses((count) => count + 1);
        return describeResolution(outcome.report.outcomes.get(setlist.id), setlist.name, keep);
      } catch {
        return { ok: false, message: NO_CONNECTION };
      } finally {
        setBusy(null);
      }
    },
    [busy, busyAll, runPass]
  );

  return {
    available: Boolean(userId) && Boolean(services),
    stateOf,
    busy,
    busyAll,
    sync,
    syncAll,
    conflicted,
    inspect,
    resolve,
  };
}
