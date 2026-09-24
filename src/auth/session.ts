import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';

/**
 * Who someone is, for the whole app.
 *
 * An account is optional: the songbook, the setlists and everything else work
 * without one. Signing in proves an identity and nothing more. What that
 * identity may do is decided elsewhere and always by the database: the
 * editorial panel asks `editorial_roles` (see src/admin), and anything a
 * person owns will be theirs because a row says so, never because this
 * browser says so. The name someone chooses is a name, not a permission.
 *
 * Nothing here stores a password or a token: the session, its refresh and its
 * persistence are Supabase Auth's business (src/auth/supabaseSession.ts).
 * This file is the light half — types, messages, checks and a look at whether
 * there is anything to restore — so the songbook can carry it without
 * downloading supabase-js.
 */

export interface AppSession {
  userId: string;
  email: string | null;
  /** What the person chose to be called; shown, never trusted for anything else */
  displayName: string | null;
  /** Whether their address is confirmed, as Supabase reports it */
  emailConfirmed: boolean;
}

/** Everything that can go wrong on the way in, told apart only to explain it in Spanish. */
export type AuthFailure =
  | 'invalid-credentials'
  | 'email-not-confirmed'
  | 'email-taken'
  | 'weak-password'
  | 'invalid-email'
  | 'expired-link'
  | 'rate-limited'
  | 'network'
  | 'unavailable';

/** Kept for what only signs in (the editorial panel). */
export type SignInFailure = AuthFailure;

export type AuthResult<T = void> = { ok: true; value: T } | { ok: false; reason: AuthFailure };
export type SignInResult = { ok: true; session: AppSession } | { ok: false; reason: AuthFailure };
/** A new account either has a session already or is waiting for the confirmation mail. */
export type SignUpResult = { ok: true; needsConfirmation: boolean } | { ok: false; reason: AuthFailure };

export interface AppAuth {
  /** The stored session, refreshed if it expired and can still be refreshed; null otherwise */
  currentSession(): Promise<AppSession | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signUp(name: string, email: string, password: string): Promise<SignUpResult>;
  /** Sends the confirmation mail again, for an address that has not confirmed yet */
  resendConfirmation(email: string): Promise<AuthResult>;
  /** Sends the mail that lets someone set a new password */
  sendPasswordReset(email: string): Promise<AuthResult>;
  /** Changes the password of whoever is signed in (including a recovery session) */
  updatePassword(password: string): Promise<AuthResult>;
  /** Takes the session a recovery link carried, so the new password can be set */
  useRecoveryLink(tokens: { accessToken: string; refreshToken: string }): Promise<AuthResult>;
  signOut(): Promise<void>;
  /** Called on sign-in, sign-out, refresh and expiry, with the session that holds now */
  subscribe(listener: (session: AppSession | null) => void): () => void;
  /** For the data requests: the current access token, or null when signed out */
  accessToken(): Promise<string | null>;
}

/** What Supabase asks for by default. Nothing more is invented here. */
export const MIN_PASSWORD_LENGTH = 6;
export const MAX_NAME_LENGTH = 60;

/** What people read when something fails. Supabase's own wording never reaches them. */
export const AUTH_MESSAGES: Record<AuthFailure, string> = {
  'invalid-credentials': 'El correo o la contraseña no son correctos.',
  'email-not-confirmed': 'Esta cuenta todavía no está confirmada. Revisa tu correo.',
  'email-taken': 'Ya hay una cuenta con este correo. Inicia sesión o recupera tu contraseña.',
  'weak-password': `La contraseña es demasiado corta: al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
  'invalid-email': 'Ese correo no parece válido.',
  'expired-link': 'El enlace ya no sirve. Pide uno nuevo.',
  'rate-limited': 'Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo.',
  network: 'No hay conexión con el servidor. Revisa tu conexión y vuelve a intentarlo.',
  unavailable: 'No se pudo completar la operación en este momento. Inténtalo más tarde.',
};

/** The editorial panel's own sign-in reads the same messages. */
export const SIGN_IN_MESSAGES = AUTH_MESSAGES;

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

const looksLikeEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

/** Light checks before asking the server; the server decides. */
export function checkSignInForm(email: string, password: string): { email?: string; password?: string } {
  const problems: { email?: string; password?: string } = {};
  if (!looksLikeEmail(email)) problems.email = 'Escribe un correo válido.';
  if (!password) problems.password = 'Escribe tu contraseña.';
  return problems;
}

export interface SignUpProblems {
  name?: string;
  email?: string;
  password?: string;
  repeat?: string;
}

/**
 * A new account asks for three things and checks exactly those: a name to be
 * called by, an address that can receive the confirmation, and a password
 * long enough for Supabase. No rules anybody would have to guess.
 */
export function checkSignUpForm(name: string, email: string, password: string, repeat: string): SignUpProblems {
  const problems: SignUpProblems = {};
  const clean = name.trim();
  if (!clean) problems.name = 'Escribe tu nombre.';
  else if (clean.length > MAX_NAME_LENGTH) problems.name = `Como mucho ${MAX_NAME_LENGTH} caracteres.`;
  if (!looksLikeEmail(email)) problems.email = 'Escribe un correo válido.';
  if (password.length < MIN_PASSWORD_LENGTH) problems.password = `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (repeat !== password) problems.repeat = 'Las dos contraseñas no son iguales.';
  return problems;
}

export function checkNewPassword(password: string, repeat: string): { password?: string; repeat?: string } {
  const problems: { password?: string; repeat?: string } = {};
  if (password.length < MIN_PASSWORD_LENGTH) problems.password = `Al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  if (repeat !== password) problems.repeat = 'Las dos contraseñas no son iguales.';
  return problems;
}

export function checkEmailOnly(email: string): { email?: string } {
  return looksLikeEmail(email) ? {} : { email: 'Escribe un correo válido.' };
}

/** How someone is called in the interface: their name, or the part of the address before the @. */
export function nameOf(session: AppSession): string {
  const clean = session.displayName?.trim();
  if (clean) return clean;
  const local = session.email?.split('@')[0]?.trim();
  return local || 'Mi cuenta';
}

/** The letter shown in the round mark next to the name. */
export function initialOf(session: AppSession): string {
  return nameOf(session).charAt(0).toLocaleUpperCase('es');
}
