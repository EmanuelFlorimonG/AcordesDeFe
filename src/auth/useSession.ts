import { useEffect, useState } from 'react';
import { hasStoredSession, type AppSession } from './session';
import type { AppServices } from './supabaseSession';

/**
 * Who is using the app, wherever they are in it.
 *
 * A visitor costs nothing: no session stored means no import, no request, and
 * the answer is "signed out" from the first render, so nothing meant for
 * someone signed in ever flashes for someone who isn't. supabase-js is
 * downloaded only when there is a session to restore or when somebody asks to
 * sign in, and then always the same instance (see supabaseSession.ts).
 *
 * Identity only. What the person may do is asked separately, and always to
 * the database: the editorial panel does it in src/admin/useEditorialRole.
 */

export type SessionState =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'signed-in'; session: AppSession };

let loaded: AppServices | null | undefined;
let loading: Promise<AppServices | null> | null = null;
const listeners = new Set<(services: AppServices | null) => void>();

/**
 * The app's Auth and data client. Whoever asks first downloads it; everyone
 * else, hooks included, is told the moment it is here, so a sign-in started
 * from one screen is known by every other one.
 */
export async function loadAuthServices(): Promise<AppServices | null> {
  if (loaded !== undefined) return loaded;
  loading ??= import('./supabaseSession')
    .then((module) => module.getAppServices())
    .catch(() => null)
    .then((services) => {
      loaded = services;
      loading = null;
      listeners.forEach((listener) => listener(services));
      return services;
    });
  return loading;
}

/**
 * The services, if they are worth loading: a stored session to restore, or
 * `wanted` because somebody opened the account screens. `absent` means there
 * is nothing to load, which is not the same as "still loading".
 */
export function useAuthServices(wanted = false): { services: AppServices | null; absent: boolean } {
  const [services, setServices] = useState<AppServices | null>(loaded ?? null);
  const [absent, setAbsent] = useState(() => loaded === null || (loaded === undefined && !wanted && !hasStoredSession()));

  useEffect(() => {
    const listener = (next: AppServices | null) => {
      setServices(next);
      setAbsent(next === null);
    };
    listeners.add(listener);
    if (loaded !== undefined) listener(loaded);
    else if (wanted || hasStoredSession()) void loadAuthServices();
    return () => {
      listeners.delete(listener);
    };
  }, [wanted]);

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
