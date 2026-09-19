import { createClient, isAuthApiError, isAuthRetryableFetchError, type Session, type SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSupabaseStatus, type SupabaseClient, type SupabaseConfig } from '../lib/supabase';
import type { AdminAuth, AdminSession, SignInFailure } from './auth';

/**
 * Supabase Auth for the admin panel, and the data client that goes with it.
 *
 * This file is only imported by the admin screens (lazy), so the public app
 * never downloads supabase-js. One instance of each, created on first use:
 *   - the Supabase JS client, used ONLY for Auth (sign-in, session storage,
 *     token refresh, sign-out);
 *   - the project's own REST client (src/lib/supabase.ts), the same one the
 *     public side uses, carrying the reviewer's access token so Row Level
 *     Security applies to them.
 * Both use the public anon/publishable key; nothing secret reaches the browser.
 */

/** Where Supabase keeps the session in this browser (its own format; never read or written by hand here). */
export const ADMIN_AUTH_STORAGE_KEY = 'genesaret_admin_auth';

function toSession(session: Session | null): AdminSession | null {
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

export function createSupabaseAdminAuth(js: SupabaseJsClient): AdminAuth {
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

export interface AdminServices {
  auth: AdminAuth;
  /** REST client acting as the signed-in reviewer */
  data: SupabaseClient;
}

let services: AdminServices | null | undefined;

export function createAdminServices(config: SupabaseConfig): AdminServices {
  const js = createClient(config.url, config.anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // No magic links or OAuth: nothing to read from the URL (the app uses its hash for routes).
      detectSessionInUrl: false,
      storageKey: ADMIN_AUTH_STORAGE_KEY,
    },
  });
  const auth = createSupabaseAdminAuth(js);
  return { auth, data: createSupabaseClient(config, fetch, { accessToken: () => auth.accessToken() }) };
}

/** The panel's services, created once; null when this build has no Supabase. */
export function getAdminServices(): AdminServices | null {
  if (services === undefined) {
    const status = getSupabaseStatus();
    services = status.state === 'configured' ? createAdminServices(status.config) : null;
  }
  return services;
}
