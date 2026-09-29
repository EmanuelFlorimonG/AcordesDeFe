import { useCallback, useMemo, useState } from 'react';
import { useAuthServices } from '../auth/useSession';
import type { Setlist } from '../types/setlist';
import type { CloudSetlistProblem } from '../storage/cloudSetlists';
import { getBrowserStorage, scopeId, type SetlistScope } from '../storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint } from '../storage/setlistSync';
import type { SetlistSyncOutcome } from '../storage/setlistSyncPass';

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

/**
 * `scope` is whose setlists these are, the same one the list is read with, so
 * what is offered can never be about a different account than the one on
 * screen. A visitor is offered nothing: there is no account to put anything
 * in, and nothing about their setlists changes.
 */
export function useSetlistCloudSync(scope: SetlistScope): SetlistCloudSync {
  const { services } = useAuthServices();
  const [busy, setBusy] = useState<string | null>(null);
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

  const sync = useCallback(
    async (setlist: Setlist) => {
      // One at a time: a second press while the first is in the air does
      // nothing rather than sending the same setlist twice.
      if (busy) return null;
      if (!services || !userId) return { ok: false, message: SESSION_LOST };
      const intent = agreed.has(setlist.id) ? 'changed' : 'new';

      setBusy(setlist.id);
      try {
        // The identity and the token, read together, so the pass belongs to
        // one session (see AppAuth.authenticated).
        const capture = await services.auth.authenticated();
        if (!capture || capture.session.userId.trim() !== userId) return { ok: false, message: SESSION_LOST };

        // Downloaded the first time somebody asks for this, and never for a
        // visitor: the whole of the synchronising machinery is weight that
        // most people never need, like supabase-js itself (see useSession).
        const { runAuthenticatedSetlistSyncPass } = await import('../storage/setlistSyncSession');
        // Naming it authorises a first upload of this one and nothing else; a
        // setlist that is already up there needs no permission to be kept in
        // step, and the engine works that out for itself.
        const result = await runAuthenticatedSetlistSyncPass(capture, {}, { authorisedUploads: [setlist.id] });
        if (result.status !== 'ran') return { ok: false, message: SESSION_LOST };
        if (result.report.status === 'remote-auth-error') return { ok: false, message: SESSION_LOST };
        if (result.report.status === 'remote-read-error') return { ok: false, message: NO_CONNECTION };

        // A pass settles every setlist, so what this one learned is worth
        // keeping whatever it says about the one that was clicked.
        setPasses((count) => count + 1);
        return describeSync(result.report.outcomes.get(setlist.id), setlist.name, intent);
      } catch {
        // Nothing reached the cloud, or nothing came back from it.
        return { ok: false, message: NO_CONNECTION };
      } finally {
        setBusy(null);
      }
    },
    [busy, services, userId, agreed]
  );

  return { stateOf, busy, sync };
}
