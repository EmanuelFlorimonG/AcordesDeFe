import { createClient, isAuthApiError, isAuthRetryableFetchError, type Session, type SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { createSupabaseClient, getSupabaseStatus, type SupabaseClient, type SupabaseConfig } from '../lib/supabase';
import { AUTH_STORAGE_KEY, MAX_NAME_LENGTH, type AppAuth, type AppSession, type AuthFailure } from './session';

/**
 * Supabase Auth for the whole app, and the data client that goes with it.
 *
 * The one and only place where a Supabase Auth client is created. Two clients
 * sharing a storage key fight over the same refresh token and end up signing
 * people out at random, so there is exactly one, made on first use and kept:
 *   - the Supabase JS client, used ONLY for Auth (sign-in, sign-up, session
 *     storage, token refresh, password recovery, sign-out);
 *   - the project's own REST client (src/lib/supabase.ts), the same one the
 *     public side uses, carrying the signed-in user's access token so Row
 *     Level Security applies to them.
 * Both use the public anon/publishable key; nothing secret reaches the browser.
 *
 * This file is the heavy half (it brings supabase-js with it), so it is only
 * ever imported dynamically: nobody downloads it until there is a session to
 * restore or somebody asks to sign in.
 */

/**
 * The name someone chose lives in Supabase's own user metadata for now, which
 * is exactly what it is worth: a label the person can change about themselves.
 * It is shown and nothing else. When `profiles` exists it will be filled from
 * here. Never, under any circumstance, does it decide what anyone may do.
 */
const DISPLAY_NAME = 'display_name';

function toSession(session: Session | null): AppSession | null {
  const user = session?.user;
  if (!user) return null;
  const name = (user.user_metadata as Record<string, unknown> | undefined)?.[DISPLAY_NAME];
  return {
    userId: user.id,
    email: user.email ?? null,
    displayName: typeof name === 'string' && name.trim() ? name.trim().slice(0, MAX_NAME_LENGTH) : null,
    emailConfirmed: Boolean(user.email_confirmed_at ?? user.confirmed_at),
  };
}

function toFailure(error: unknown): AuthFailure {
  if (isAuthRetryableFetchError(error)) return 'network';
  if (isAuthApiError(error)) {
    if (error.code === 'email_not_confirmed') return 'email-not-confirmed';
    if (error.code === 'user_already_exists' || error.code === 'email_exists') return 'email-taken';
    if (error.code === 'weak_password') return 'weak-password';
    if (error.code === 'validation_failed' || error.code === 'email_address_invalid') return 'invalid-email';
    if (error.code === 'otp_expired' || error.code === 'flow_state_expired') return 'expired-link';
    if (error.status === 429) return 'rate-limited';
    if (error.code === 'invalid_credentials' || error.status === 400) return 'invalid-credentials';
  }
  return 'unavailable';
}

/**
 * Where Supabase sends people back to, after the confirmation or recovery
 * mail: this app, at its own address, with no route of ours attached. What
 * Supabase adds to it (its tokens, in the fragment) is read and cleared at
 * startup by src/auth/recovery.ts, which then opens the right screen.
 */
function appUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return `${window.location.origin}${window.location.pathname}`;
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
    async signUp(name, email, password) {
      try {
        const { data, error } = await js.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { [DISPLAY_NAME]: name.trim().slice(0, MAX_NAME_LENGTH) }, emailRedirectTo: appUrl() },
        });
        if (error) return { ok: false, reason: toFailure(error) };
        // No session back means the project asks for the address to be
        // confirmed first, which is what we want it to ask.
        return { ok: true, needsConfirmation: !data.session };
      } catch (error) {
        return { ok: false, reason: toFailure(error) };
      }
    },
    async resendConfirmation(email) {
      try {
        const { error } = await js.auth.resend({ type: 'signup', email: email.trim(), options: { emailRedirectTo: appUrl() } });
        return error ? { ok: false, reason: toFailure(error) } : { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: toFailure(error) };
      }
    },
    async sendPasswordReset(email) {
      try {
        const { error } = await js.auth.resetPasswordForEmail(email.trim(), { redirectTo: appUrl() });
        return error ? { ok: false, reason: toFailure(error) } : { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: toFailure(error) };
      }
    },
    async updatePassword(password) {
      try {
        const { error } = await js.auth.updateUser({ password });
        return error ? { ok: false, reason: toFailure(error) } : { ok: true, value: undefined };
      } catch (error) {
        return { ok: false, reason: toFailure(error) };
      }
    },
    async useRecoveryLink({ accessToken, refreshToken }) {
      try {
        const { error } = await js.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        return error ? { ok: false, reason: toFailure(error) } : { ok: true, value: undefined };
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
      // The app routes by hash, so Supabase must not read the URL on its own:
      // the confirmation and recovery links are handled by src/auth/recovery.ts.
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
