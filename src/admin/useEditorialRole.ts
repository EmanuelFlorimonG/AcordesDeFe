import { useEffect, useState } from 'react';
import { useAuthServices } from '../auth/useSession';
import type { AdminAccess } from './auth';
import type { EditorialRepository } from './editorialRepository';
import { useAdminAccess } from './useAdminAccess';

/**
 * Whether the person reading the songbook belongs to the editorial team.
 *
 * Signing in happens once, for the whole app (src/auth), and the session
 * belongs to this browser, not to a route: leaving #/admin never ended it.
 * This asks the other question, the one that grants anything: does that
 * identity have a row in editorial_roles? The answer comes from the database,
 * with the user's own token and under Row Level Security, never from
 * anything stored here.
 *
 * All it earns is a quiet way back into the panel. Nothing editorial is shown
 * in the songbook, and the panel itself is still a separate lazy chunk.
 */

/** Whether the songbook shows the way into the panel: only a role the database confirmed. */
export function canOpenAdminPanel(access: AdminAccess): boolean {
  return access.state === 'ready';
}

export function useEditorialRole(): AdminAccess {
  const { services, absent } = useAuthServices();
  const [repository, setRepository] = useState<EditorialRepository | null>(null);

  // The panel's data layer is only downloaded for someone who is signed in.
  useEffect(() => {
    if (!services || repository) return;
    let cancelled = false;
    void import('./editorialRepository').then(
      (module) => {
        if (!cancelled) setRepository(module.createEditorialRepository(services.data));
      },
      () => {
        // Nothing to ask with: the access stays as it is (no panel).
      }
    );
    return () => {
      cancelled = true;
    };
  }, [services, repository]);

  const { access } = useAdminAccess(services, repository);
  return absent ? { state: 'signed-out' } : access;
}
