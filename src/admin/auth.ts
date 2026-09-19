import type { EditorialRole } from '../catalog/reviewContract';

/**
 * Sign-in for the editorial team only.
 *
 * The public app never signs anyone in: no account, no "Iniciar sesión" in
 * its header, no registration anywhere. This is the door of #/admin, and it
 * only proves who someone is. What they may do is decided by the database:
 * the editorial_roles table, read through Row Level Security, and the review
 * functions, which check the role themselves. A modified browser that skips
 * any check here still gets nothing from the database.
 *
 * The session (tokens, refresh, persistence) is Supabase Auth's business;
 * nothing here stores a password or a token.
 */

export interface AdminSession {
  userId: string;
  email: string | null;
}

export type SignInFailure = 'invalid-credentials' | 'email-not-confirmed' | 'rate-limited' | 'network' | 'unavailable';

export type SignInResult = { ok: true; session: AdminSession } | { ok: false; reason: SignInFailure };

export interface AdminAuth {
  /** The stored session, refreshed if it expired and can still be refreshed; null otherwise */
  currentSession(): Promise<AdminSession | null>;
  signIn(email: string, password: string): Promise<SignInResult>;
  signOut(): Promise<void>;
  /** Called on sign-in, sign-out, refresh and expiry, with the session that holds now */
  subscribe(listener: (session: AdminSession | null) => void): () => void;
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

/** What the panel may show. Only 'ready' opens it, and even then the database has the last word. */
export type AdminAccess =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'checking'; session: AdminSession }
  | { state: 'no-role'; session: AdminSession }
  | { state: 'ready'; session: AdminSession; role: EditorialRole }
  | { state: 'error'; session: AdminSession };

export function isEditorialRole(value: unknown): value is EditorialRole {
  return value === 'admin' || value === 'reviewer';
}

/**
 * The access of a session: its editorial role, as the database answers it
 * (a user can read only their own row). No row, or anything unexpected,
 * means no access.
 */
export async function resolveAccess(
  session: AdminSession | null,
  fetchOwnRole: (userId: string) => Promise<unknown>
): Promise<AdminAccess> {
  if (!session) return { state: 'signed-out' };
  let role: unknown;
  try {
    role = await fetchOwnRole(session.userId);
  } catch {
    return { state: 'error', session };
  }
  return isEditorialRole(role) ? { state: 'ready', session, role } : { state: 'no-role', session };
}

/** Light checks before asking the server; the server decides. */
export function checkSignInForm(email: string, password: string): { email?: string; password?: string } {
  const problems: { email?: string; password?: string } = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) problems.email = 'Escribe un correo válido.';
  if (!password) problems.password = 'Escribe tu contraseña.';
  return problems;
}
