import type { EditorialRole } from '../catalog/reviewContract';
import type { AppSession } from '../auth/session';

/**
 * What the editorial panel may show.
 *
 * Signing in is not this file's business (src/auth): a session only says who
 * someone is. This says what that identity is allowed to see, and the answer
 * always comes from the database — the editorial_roles table, read through
 * Row Level Security, and the review functions, which check the role
 * themselves. A modified browser that skips every check here still gets
 * nothing from the database.
 */

/** Only 'ready' opens the panel, and even then the database has the last word. */
export type AdminAccess =
  | { state: 'loading' }
  | { state: 'signed-out' }
  | { state: 'checking'; session: AppSession }
  | { state: 'no-role'; session: AppSession }
  | { state: 'ready'; session: AppSession; role: EditorialRole }
  | { state: 'error'; session: AppSession };

export function isEditorialRole(value: unknown): value is EditorialRole {
  return value === 'admin' || value === 'reviewer';
}

/**
 * The access of a session: its editorial role, as the database answers it
 * (a user can read only their own row). No row, or anything unexpected,
 * means no access.
 */
export async function resolveAccess(
  session: AppSession | null,
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
