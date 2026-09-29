import { useCallback, useMemo, useState } from 'react';
import { useAuthServices } from '../auth/useSession';
import type { CloudSetlistProblem } from '../storage/cloudSetlists';
import { getBrowserStorage, scopeId, type SetlistScope } from '../storage/setlistStorage';
import { createSetlistSyncStore } from '../storage/setlistSync';
import type { SetlistSyncOutcome } from '../storage/setlistSyncPass';

/**
 * Putting one setlist in somebody's account, because they asked.
 *
 * A setlist made on this device stays on it until the person says otherwise:
 * signing in never sweeps everything up, because nothing here can tell a
 * setlist made inside an account from one made before signing in. So the
 * choice is offered one setlist at a time and carried out through the same
 * machinery everything else uses — a pass, with that single id named as
 * authorised. There is no second way of writing a setlist to the cloud.
 *
 * What comes back is a sentence for the person. Revisions, fingerprints and
 * tokens are how the thing works, not something anybody needs to read.
 */

export interface SetlistCloudUpload {
  /**
   * Whether this setlist is worth offering: there is an account, and the
   * cloud has never been told about this one. Both answers come from what is
   * already on the device, so drawing a menu asks nothing of the network.
   */
  offers: (setlistId: string) => boolean;
  /** The setlist going up right now, or null. */
  busy: string | null;
  /** Puts one setlist in the account. A second call while one is in flight does nothing. */
  upload: (setlistId: string, name: string) => Promise<{ ok: boolean; message: string } | null>;
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

/** What to tell the person, from what the pass reported. Nothing internal leaks. */
export function describeUpload(outcome: SetlistSyncOutcome | undefined, name: string): { ok: boolean; message: string } {
  switch (outcome?.kind) {
    case 'cloud-success':
      // The row is there either way. Whether the note about it landed on this
      // device is the app's own problem, and the next pass settles it.
      return { ok: true, message: `«${name}» guardado en tu cuenta` };
    case 'noop':
    case 'cloud-conflict':
      // Already up there: either agreed on before, or the row turned out to
      // exist. Both are the end the person asked for.
      return { ok: true, message: `«${name}» ya estaba en tu cuenta` };
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
      // ask, blocked, pending-user-action, invalid-plan, invalid-response,
      // applied-local, local-error: none of them is what this action asked
      // for, and none of them is a success to report as one.
      return { ok: false, message: UNEXPECTED };
  }
}

/**
 * `scope` is whose setlists these are, the same one the list is read with, so
 * the offer and the upload can never be about a different account than the
 * one on screen. A visitor is offered nothing: there is no account to put
 * anything in, and nothing about their setlists changes.
 */
export function useSetlistCloudUpload(scope: SetlistScope): SetlistCloudUpload {
  const { services } = useAuthServices();
  const [busy, setBusy] = useState<string | null>(null);
  // Counted up after something went up, so the menu stops offering it.
  const [uploads, setUploads] = useState(0);

  const userId = scope.kind === 'user' ? scope.userId.trim() : '';
  const scopeName = scopeId(scope);

  // What the cloud is already known to hold, read once per account and again
  // after each upload rather than on every render.
  const agreed = useMemo(() => {
    if (!userId) return new Set<string>();
    void scopeName;
    void uploads;
    return new Set(createSetlistSyncStore(getBrowserStorage(), scope).load().keys());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, scopeName, uploads]);

  const offers = useCallback(
    (setlistId: string) => Boolean(userId) && Boolean(services) && !agreed.has(setlistId),
    [userId, services, agreed]
  );

  const upload = useCallback(
    async (setlistId: string, name: string) => {
      // One at a time: a second press while the first is in the air does
      // nothing rather than sending the same setlist twice.
      if (busy) return null;
      if (!services || !userId) return { ok: false, message: SESSION_LOST };

      setBusy(setlistId);
      try {
        // The identity and the token, read together, so the pass belongs to
        // one session (see AppAuth.authenticated).
        const capture = await services.auth.authenticated();
        if (!capture || capture.session.userId.trim() !== userId) return { ok: false, message: SESSION_LOST };

        // Downloaded the first time somebody asks for this, and never for a
        // visitor: the whole of the synchronising machinery is weight that
        // most people never need, like supabase-js itself (see useSession).
        const { runAuthenticatedSetlistSyncPass } = await import('../storage/setlistSyncSession');
        const result = await runAuthenticatedSetlistSyncPass(capture, {}, { authorisedUploads: [setlistId] });
        if (result.status !== 'ran') return { ok: false, message: SESSION_LOST };
        if (result.report.status === 'remote-auth-error') return { ok: false, message: SESSION_LOST };
        if (result.report.status === 'remote-read-error') return { ok: false, message: NO_CONNECTION };

        const answer = describeUpload(result.report.outcomes.get(setlistId), name);
        if (answer.ok) setUploads((count) => count + 1);
        return answer;
      } catch {
        // Nothing reached the cloud, or nothing came back from it.
        return { ok: false, message: NO_CONNECTION };
      } finally {
        setBusy(null);
      }
    },
    [busy, services, userId]
  );

  return { offers, busy, upload };
}
