/// <reference types="vite/client" />

/**
 * Which Supabase project this build talks to, read from Vite's public env
 * variables and checked: nothing here connects to anything. It is apart from
 * the client (supabase.ts) so the first download can know whether there is a
 * backend without carrying the client itself.
 */

export interface SupabaseConfig {
  /** "https://<project-ref>.supabase.co", without a trailing slash */
  url: string;
  /** The public anon (legacy JWT) or publishable key. Never the service_role/secret key. */
  anonKey: string;
}

export type SupabaseStatus =
  | { state: 'unconfigured' }
  | { state: 'invalid'; reason: SupabaseConfigProblem }
  | { state: 'configured'; config: SupabaseConfig };

export type SupabaseConfigProblem = 'url' | 'placeholder' | 'secret-key';

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const PLACEHOLDER = /your-project-ref|your-anon|publishable-key-here/i;

/** The role inside a legacy JWT key, without trusting or verifying it: only to refuse a secret by mistake. */
export function jwtRole(key: string): string | null {
  const parts = key.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const payload: unknown = JSON.parse(json);
    return typeof payload === 'object' && payload !== null && 'role' in payload ? String(payload.role) : null;
  } catch {
    return null;
  }
}

/**
 * Reads the configuration, refusing what must never reach a browser: a
 * service_role JWT or a "sb_secret_" key pasted into a VITE_ variable would
 * be published to every visitor, so the app refuses to use it at all.
 */
export function readSupabaseConfig(env: SupabaseEnv): SupabaseStatus {
  const url = (env.VITE_SUPABASE_URL ?? '').trim().replace(/\/+$/, '');
  const anonKey = (env.VITE_SUPABASE_ANON_KEY ?? '').trim();
  if (!url && !anonKey) return { state: 'unconfigured' };
  if (PLACEHOLDER.test(url) || PLACEHOLDER.test(anonKey)) return { state: 'invalid', reason: 'placeholder' };
  if (anonKey.startsWith('sb_secret_') || jwtRole(anonKey) === 'service_role') {
    return { state: 'invalid', reason: 'secret-key' };
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { state: 'invalid', reason: 'url' };
  }
  const isLocal = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (!anonKey || (parsed.protocol !== 'https:' && !(isLocal && parsed.protocol === 'http:'))) {
    return { state: 'invalid', reason: 'url' };
  }
  return { state: 'configured', config: { url, anonKey } };
}

let status: SupabaseStatus | null = null;

/** The configuration of this build, read once from Vite's public env variables. */
export function getSupabaseStatus(): SupabaseStatus {
  status ??= readSupabaseConfig({
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  });
  return status;
}
