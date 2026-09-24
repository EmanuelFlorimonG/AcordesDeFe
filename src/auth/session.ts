import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';

/**
 * Who someone is, for the whole app.
 *
 * Signing in proves an identity and nothing more. What that identity may do
 * is decided elsewhere and always by the database: the editorial panel asks
 * `editorial_roles` (see src/admin), and anything a person owns will be theirs
 * because a row says so, never because this browser says so.
 *
 * Nothing here stores a password or a token: the session, its refresh and its
 * persistence are Supabase Auth's business (src/auth/supabaseSession.ts).
 * This file is the light half — types, messages and a look at whether there
 * is anything to check — so the songbook can carry it without downloading
 * supabase-js.
 */

export interface AppSession {
  userId: string;
  email: string | null;
}

export type SignInFailure = 'invalid-credentials' | 'email-not-confirmed' | 'rate-limited' | 'network' | 'unavailable';

export type SignInResult = { ok: true; session: AppSession } | { ok: false; reason: SignInFailure };

export interface AppAuth {
  /** The stored session, refreshed if it expired and can still be refreshed; null otherwise */
  currentSession(): Promise<AppSession | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Called on sign-in, sign-out, refresh and expiry, with the session that holds now */
  subscribe(listener: (session: AppSession | null) => void): () => void;
  /** For the data requests: the current access token, or null when signed out */
  accessToken(): Promise<string | null>;
}

export const SIGN_IN_MESSAGES: Record<SignInFailure, string> = {
  'invalid-credentials': 'El correo o la contraseña no son correctos.',
  'email-not-confirmed': 'Esta cuenta todavía no está confirmada.',
  'rate-limited': 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  network: 'No hay conexión con el servidor. Revisa tu conexión y vuelve a intentarlo.',
  unavailable: 'No se pudo iniciar sesión en este momento. Inténtalo más tarde.',
};

/**
 * Where Supabase Auth keeps the session in this browser (its own key and
 * format; never written by hand). The name still says "admin" because that is
 * where signing in began, and renaming it would end every session open right
 * now for no gain: it is the app's session, whoever signed in.
 */
export const AUTH_STORAGE_KEY = 'genesaret_admin_auth';

/**
 * A hint that there may be a session here, cheap enough to run on every
 * render: it only decides whether it is worth downloading supabase-js, which
 * almost nobody needs. Never a permission — a browser that invents this entry
 * earns one request and an answer from the server.
 */
export function hasStoredSession(storage: KeyValueStorage | null = getBrowserStorage()): boolean {
  try {
    const raw = storage?.getItem(AUTH_STORAGE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown } | null;
    return typeof stored?.access_token === 'string' || typeof stored?.refresh_token === 'string';
  } catch {
    // Unreadable, or storage blocked: as good as no session.
    return false;
  }
}

/** Light checks before asking the server; the server decides. */
export function checkSignInForm(email: string, password: string): { email?: string; password?: string } {
  const problems: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) problems.email = 'Escribe un correo válido.';
  if (!password) problems.password = 'Escribe tu contraseña.';
  return problems;
}
