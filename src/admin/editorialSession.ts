import { useEffect, useState } from 'react';
import { getBrowserStorage, type KeyValueStorage } from '../storage/localRepository';
import type { AdminAccess } from './auth';
import type { EditorialRepository } from './editorialRepository';
import type { AdminServices } from './supabaseAuth';
import { useAdminAccess } from './useAdminAccess';

/**
 * Whether the songbook is being read by someone from the editorial team.
 *
 * Signing in happens at #/admin and nowhere else, and the session Supabase
 * Auth stores there belongs to this browser, not to a route: leaving the
 * panel never ended it, the songbook simply never asked. This is the asking,
 * and all it earns is a quiet way back into the panel.
 *
 * What it does NOT do is decide anything. The stored session is read only to
 * know whether it is worth downloading the panel's authentication at all; the
 * role always comes from the database, through Row Level Security, with the
 * user's own token (resolveAccess). A browser that invents the entry below
 * gets one request and an answer of "no role", and the review functions would
 * refuse it anyway.
 */

/** Where Supabase Auth keeps the session in this browser (its own key and format; never written by hand). */
export const ADMIN_AUTH_STORAGE_KEY = 'genesaret_admin_auth';

/**
 * A hint that there may be a session here, cheap enough to run on every
 * render of the songbook: it only avoids loading supabase-js for the
 * visitors, who are almost everyone. Never a permission.
 */
export function hasStoredEditorialSession(storage: KeyValueStorage | null = getBrowserStorage()): boolean {
  try {
    const raw = storage?.getItem(ADMIN_AUTH_STORAGE_KEY);
    if (!raw) return false;
    const stored = JSON.parse(raw) as { access_token?: unknown; refresh_token?: unknown } | null;
    return typeof stored?.access_token === 'string' || typeof stored?.refresh_token === 'string';
  } catch {
    // Unreadable, or storage blocked: as good as no session.
    return false;
  }
}

/**
 * The panel's own Auth and data layer, downloaded only when there is
 * something to check. It is the same instance the panel uses (one client,
 * one session), so neither of them fights the other for it.
 */
export async function openEditorialSession(): Promise<{ services: AdminServices; repository: EditorialRepository } | null> {
  const [{ getAdminServices }, { createEditorialRepository }] = await Promise.all([import('./supabaseAuth'), import('./editorialRepository')]);
  const services = getAdminServices();
  return services ? { services, repository: createEditorialRepository(services.data) } : null;
}

/** Whether the songbook shows the way into the panel: only a role the database confirmed. */
export function canOpenAdminPanel(access: AdminAccess): boolean {
  return access.state === 'ready';
}

/**
 * The editorial access of whoever is reading the songbook. A visitor costs
 * nothing: no session stored, no import, no request, and the answer is
 * "signed out" from the first render, so the way into the panel never
 * flashes for someone who doesn't have it.
 */
export function useEditorialAccess(): AdminAccess {
  const [opened, setOpened] = useState<{ services: AdminServices; repository: EditorialRepository } | null>(null);
  const [absent, setAbsent] = useState(() => !hasStoredEditorialSession());

  useEffect(() => {
    if (absent || opened) return;
    let cancelled = false;
    void openEditorialSession().then(
      (session) => {
        if (cancelled) return;
        if (session) setOpened(session);
        else setAbsent(true);
      },
      () => {
        if (!cancelled) setAbsent(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [absent, opened]);

  // The same hook the panel uses: the role is resolved once and kept in step
  // with Supabase Auth, so signing out or an expired session takes the way in away.
  const { access } = useAdminAccess(opened?.services ?? null, opened?.repository ?? null);
  return absent ? { state: 'signed-out' } : access;
}
