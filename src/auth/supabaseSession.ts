import { createClient, isAuthApiError, isAuthRetryableFetchError, type Session, type SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSupabaseStatus, type SupabaseClient, type SupabaseConfig } from '../lib/supabase';
import { AUTH_STORAGE_KEY, type AppAuth, type AppSession, type SignInFailure } from './session';

/**
 * Supabase Auth for the whole app, and the data client that goes with it.
 *
 * The one and only place where a Supabase Auth client is created. Two clients
 * sharing a storage key fight over the same refresh token and end up signing
 * people out at random, so there is exactly one, made on first use and kept:
 *   - the Supabase JS client, used ONLY for Auth (sign-in, session storage,
 *     token refresh, sign-out);
 *   - the project's own REST client (src/lib/supabase.ts), the same one the
 *     public side uses, carrying the signed-in user's access token so Row
 *     Level Security applies to them.
 * Both use the public anon/publishable key; nothing secret reaches the browser.
 *
 * This file is the heavy half (it brings supabase-js with it), so it is only
 * ever imported dynamically: a visitor with no session never downloads it.
 */

function toSession(session: Session | null): AppSession | null {
  return session?.user ? { userId: session.user.id, email: session.user.email ?? null } : null;
}

function toFailure(error: unknown): SignInFailure {
  if (isAuthRetryableFetchError(error)) return 'network';
  if (isAuthApiError(error)) {
    if (error.code === 'email_not_confirmed') return 'email-not-confirmed';
    if (error.status === 429) return 'rate-limited';
    if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid-credentials';
  }
  return 'unavailable';
}

export function createSupabaseAuth(js: SupabaseJsClient): AppAuth {
  return {
    async currentSession() {
      const { data, error } = await js.auth.getSession();
      return error ? null : toSession(data.session);
    },
    async signIn(email, password) {
      try {
        const { data, error } = await js.auth.signInWithPassword({ email: email.trim(), password });
        if (error) return { ok: false, reason: toFailure(error) };
        const session = toSession(data.session);
        return session ? { ok: true, session } : { ok: false, reason: 'unavailable' };
      } catch (error) {
        return { ok: false, reason: toFailure(error) };
      }
    },
    async signOut() {
      // 'local': ends this browser's session even if the server can't be reached.
      await js.auth.signOut({ scope: 'local' });
    },
    subscribe(listener) {
      // Deferred: Supabase asks not to call its own methods (reading the role does) inside this callback.
      const { data } = js.auth.onAuthStateChange((_event, session) => {
        setTimeout(() => listener(toSession(session)), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    async accessToken() {
      const { data } = await js.auth.getSession();
      return data.session?.access_token ?? null;
    },
  };
}

export interface AppServices {
  auth: AppAuth;
  /** REST client acting as the signed-in user: Row Level Security applies to them */
  data: SupabaseClient;
}

let services: AppServices | null | undefined;

export function createAppServices(config: SupabaseConfig): AppServices {
  const js = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // No magic links or OAuth: nothing to read from the URL (the app uses its hash for routes).
      detectSessionInUrl: false,
      storageKey: AUTH_STORAGE_KEY,
    },
  });
  const auth = createSupabaseAuth(js);
  return { auth, data: createSupabaseClient(config, fetch, { accessToken: () => auth.accessToken() }) };
}

/** The app's Auth and data client, created once; null when this build has no Supabase. */
export function getAppServices(): AppServices | null {
  if (services === undefined) {
    const status = getSupabaseStatus();
    services = status.state === 'configured' ? createAppServices(status.config) : null;
  }
  return services;
}
