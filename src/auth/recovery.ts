import type { AuthFailure } from './session';

/**
 * The link from a "forgot my password" mail, read once and cleared.
 *
 * Supabase sends people back to this app with its own answer in the URL
 * fragment (`#access_token=…&type=recovery`, or `#error=…` when the link has
 * expired). The app routes by hash too, which is why the Supabase client is
 * built with `detectSessionInUrl: false`: nobody else gets to interpret that
 * fragment. This module reads it before anything else runs, puts the address
 * back to a route of ours, and keeps what it found in memory — never in
 * storage, and never in the address bar, where it would sit in the history
 * and in every screenshot.
 *
 * What it found is then handed to Supabase through setSession(), the official
 * way (see useRecoveryLink in supabaseSession.ts). If the tab is reloaded
 * before that happens the link is spent, and the screen says so.
 */

export interface RecoveryLink {
  accessToken: string;
  refreshToken: string;
}

export type RecoveryFromUrl = { kind: 'link'; link: RecoveryLink } | { kind: 'problem'; reason: AuthFailure } | null;

/** Where the app goes to set the new password. A route of ours, with nothing in it. */
export const NEW_PASSWORD_HASH = '#/cuenta/nueva-contrasena';

/** What a recovery answer in the fragment says, without touching anything. */
export function readRecoveryFragment(fragment: string): RecoveryFromUrl {
  const raw = fragment.startsWith('#') ? fragment.slice(1) : fragment;
  // Our own routes start with a slash; anything else is not a route.
  if (!raw || raw.startsWith('/')) return null;
  const params = new URLSearchParams(raw);
  const error = params.get('error') ?? params.get('error_code');
  if (error) {
    const code = params.get('error_code') ?? '';
    return { kind: 'problem', reason: code.includes('expired') || error.includes('expired') ? 'expired-link' : 'unavailable' };
  }
  if (params.get('type') !== 'recovery') return null;
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return { kind: 'problem', reason: 'unavailable' };
  return { kind: 'link', link: { accessToken, refreshToken } };
}

let pending: RecoveryLink | null = null;
let problem: AuthFailure | null = null;

/**
 * Reads the fragment the mail link left, clears it from the address and
 * leaves the app on the screen for setting a new password. Called once, as
 * early as possible, before the router looks at the hash.
 */
export function captureRecovery(target: { location: Location; history: History } = window): RecoveryFromUrl {
  const found = readRecoveryFragment(target.location.hash);
  if (!found) return null;
  if (found.kind === 'link') pending = found.link;
  else problem = found.reason;
  // Replace, never push: the tokens leave the address and the history with it.
  target.history.replaceState(null, '', `${target.location.pathname}${target.location.search}${NEW_PASSWORD_HASH}`);
  return found;
}

/**
 * The link that arrived, if it did. Looking does not spend it: React mounts a
 * screen twice while developing, and a link that vanished on the first mount
 * would look expired on the second. It is dropped once it has been used.
 */
export function recoveryLink(): RecoveryLink | null {
  return pending;
}

/** Why the link could not be used, if that is what arrived. */
export function recoveryProblem(): AuthFailure | null {
  return problem;
}

/** Used, or given up on: nothing of it stays in memory. */
export function clearRecovery(): void {
  pending = null;
  problem = null;
}
