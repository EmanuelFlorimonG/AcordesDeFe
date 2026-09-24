import { useEffect, useState } from 'react';
import { resolveAccess, type AdminAccess } from './auth';
import type { AppSession } from '../auth/session';
import type { EditorialRepository } from './editorialRepository';
import type { AppServices } from '../auth/supabaseSession';

/**
 * The editorial access of whoever is signed in, kept in step with Supabase
 * Auth: restored from the stored session on load, updated on sign-in,
 * sign-out and expiry. The role is asked again only when the user changes,
 * not on every token refresh.
 */
export function useAdminAccess(services: AppServices | null, repository: EditorialRepository | null): {
  access: AdminAccess;
  recheck: () => void;
} {
  const [access, setAccess] = useState<AdminAccess>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!services || !repository) return;
    // Per run of the effect: an answer from an earlier run (or its subscription) is ignored.
    let cancelled = false;
    let sequence = 0;
    let lastUser: string | null | undefined;

    const apply = async (session: AppSession | null) => {
      const userId = session?.userId ?? null;
      if (cancelled || userId === lastUser) return;
      lastUser = userId;
      const mine = ++sequence;
      if (session) setAccess({ state: 'checking', session });
      const next = await resolveAccess(session, (id) => repository.getOwnRole(id));
      if (!cancelled && mine === sequence) setAccess(next);
    };

    services.auth.currentSession().then(apply, () => apply(null));
    const unsubscribe = services.auth.subscribe((session) => void apply(session));
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [services, repository, attempt]);

  return { access, recheck: () => setAttempt((value) => value + 1) };
}
