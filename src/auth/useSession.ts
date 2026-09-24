import { useEffect, useState } from 'react';
import { hasStoredSession, type AppSession } from './session';
import type { AppServices } from './supabaseSession';

/**
 * Who is using the app, wherever they are in it.
 *
 * A visitor costs nothing: no session stored means no import, no request, and
 * the answer is "signed out" from the first render, so nothing meant for
 * someone signed in ever flashes for someone who isn't. Only a browser that
 * holds a session downloads supabase-js, and then always the same instance
 * (see supabaseSession.ts).
 *
 * Identity only. What the person may do is asked separately, and always to
 * the database: the editorial panel does it in src/admin/useEditorialRole.
 */

export type SessionState =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; session: AppSession };

/**
 * The app's Auth and data client, loaded only when there is a session to
 * check. `absent` says there is nothing to load, which is not the same as
 * "still loading".
 */
export function useAuthServices(): { services: AppServices | null; absent: boolean } {
  const [services, setServices] = useState<AppServices | null>(null);
  const [absent, setAbsent] = useState(() => !hasStoredSession());

  useEffect(() => {
    if (absent || services) return;
    let cancelled = false;
    void import('./supabaseSession').then(
      (module) => {
        if (cancelled) return;
        const loaded = module.getAppServices();
        if (loaded) setServices(loaded);
        else setAbsent(true);
      },
      () => {
        if (!cancelled) setAbsent(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [absent, services]);

  return { services, absent };
}

/** The session there is right now, kept in step with Supabase Auth. */
export function useSession(): SessionState {
  const { services, absent } = useAuthServices();
  const [status, setStatus] = useState<SessionState>({ state: 'loading' });

  useEffect(() => {
    if (!services) return;
    let cancelled = false;
    const apply = (session: AppSession | null) => {
      if (!cancelled) setStatus(session ? { state: 'signed-in', session } : { state: 'signed-out' });
    };
    services.auth.currentSession().then(apply, () => apply(null));
    const unsubscribe = services.auth.subscribe(apply);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [services]);

  return absent ? { state: 'signed-out' } : status;
}
