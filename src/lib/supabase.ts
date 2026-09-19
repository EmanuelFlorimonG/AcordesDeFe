/**
 * The only door to Supabase: configuration and one client, created here and
 * nowhere else.
 *
 * The public side of GENESARET needs very little from Supabase: read the
 * published catalog and call two public functions (send a submission, check
 * its status). Supabase exposes both over its REST API (PostgREST), so this
 * client is a small fetch wrapper instead of the full SDK: no extra weight in
 * the bundle and no dependency to keep up to date. Sending goes through the
 * Edge Function `submit-song`, which checks Cloudflare Turnstile first. The
 * admin panel uses supabase-js only for Auth and reads data through this same
 * client, with the reviewer's token. The configuration lives apart
 * (supabaseConfig.ts) so the first download doesn't carry this client.
 *
 * Security lives in the database (Row Level Security and functions), never
 * here: this client only ever holds the public anon/publishable key.
 */

import { getSupabaseStatus, jwtRole, type SupabaseConfig } from './supabaseConfig';

export {
  getSupabaseStatus,
  readSupabaseConfig,
  type SupabaseConfig,
  type SupabaseConfigProblem,
  type SupabaseEnv,
  type SupabaseStatus,
} from './supabaseConfig';

export class SupabaseRequestError extends Error {
  readonly status: number;
  /** PostgREST / Postgres error code, e.g. "P0001" for a raised exception, "42501" for a denied permission */
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = 'SupabaseRequestError';
    this.status = status;
    this.code = code;
  }
}

export interface SupabaseClient {
  /** SELECT through the REST API; `query` is PostgREST syntax ("select=id,title&status=eq.published"). */
  select<T>(table: string, query: string, options?: { signal?: AbortSignal }): Promise<T[]>;
  /** Calls a database function (RPC). Only functions granted to the anon role work from a browser. */
  rpc<T>(fn: string, args: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<T>;
  /** POSTs JSON to an Edge Function. Its errors come back as { message }, like PostgREST's. */
  invoke<T>(fn: string, body: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<T>;
  /** How many rows a SELECT would return (PostgREST exact count), without downloading them. */
  count(table: string, query: string, options?: { signal?: AbortSignal }): Promise<number>;
}

export interface SupabaseClientOptions {
  /**
   * The signed-in user's access token (the admin panel). Row Level Security
   * then applies to that user instead of the anonymous role. Without it, or
   * while it returns null, requests go out as the public.
   */
  accessToken?: () => Promise<string | null>;
}

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const NAME = /^[a-z_][a-z0-9_]*$/;

export function createSupabaseClient(
  config: SupabaseConfig,
  fetchImpl: FetchLike = fetch,
  options: SupabaseClientOptions = {}
): SupabaseClient {
  const baseHeaders: Record<string, string> = { apikey: config.anonKey, Accept: 'application/json' };
  // Legacy anon keys are JWTs and go in Authorization too; new publishable keys only in `apikey`.
  if (jwtRole(config.anonKey) !== null) baseHeaders.Authorization = `Bearer ${config.anonKey}`;

  const headersFor = async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
    const token = options.accessToken ? await options.accessToken() : null;
    return { ...baseHeaders, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  };

  const send = async (path: string, init: RequestInit & { extraHeaders?: Record<string, string> }) => {
    const { extraHeaders, ...rest } = init;
    return fetchImpl(`${config.url}/${path}`, { ...rest, headers: await headersFor(extraHeaders) });
  };

  const request = async <T>(path: string, init: RequestInit & { extraHeaders?: Record<string, string> }): Promise<T> => {
    const response = await send(path, init);
    const text = await response.text();
    let body: unknown = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      // A proxy or gateway page instead of JSON: keep the status, drop the body.
      if (response.ok) throw new SupabaseRequestError('Respuesta no válida del servidor.', response.status, null);
    }
    if (!response.ok) {
      const error = (body ?? {}) as { message?: string; code?: string };
      throw new SupabaseRequestError(error.message ?? `Error ${response.status}`, response.status, error.code ?? null);
    }
    return body as T;
  };

  return {
    select(table, query, options) {
      if (!NAME.test(table)) throw new Error('Nombre de tabla no válido.');
      return request(`rest/v1/${table}?${query}`, { method: 'GET', signal: options?.signal });
    },
    rpc(fn, args, options) {
      if (!NAME.test(fn)) throw new Error('Nombre de función no válido.');
      return request(`rest/v1/rpc/${fn}`, {
        method: 'POST',
        extraHeaders: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
        signal: options?.signal,
      });
    },
    invoke(fn, body, options) {
      if (!/^[a-z][a-z0-9-]*$/.test(fn)) throw new Error('Nombre de función no válido.');
      return request(`functions/v1/${fn}`, {
        method: 'POST',
        extraHeaders: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: options?.signal,
      });
    },
    async count(table, query, options) {
      if (!NAME.test(table)) throw new Error('Nombre de tabla no válido.');
      const response = await send(`rest/v1/${table}?${query}`, {
        method: 'HEAD',
        extraHeaders: { Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' },
        signal: options?.signal,
      });
      // "0-0/42", or "*/0" when there is nothing.
      const total = Number(response.headers.get('content-range')?.split('/')[1]);
      if (!(response.ok || response.status === 206) || !Number.isFinite(total)) {
        throw new SupabaseRequestError(`Error ${response.status}`, response.status, null);
      }
      return total;
    },
  };
}

let client: SupabaseClient | null | undefined;

/** The app's single client, or null when Supabase isn't configured for this build. */
export function getSupabaseClient(): SupabaseClient | null {
  if (client === undefined) {
    const current = getSupabaseStatus();
    client = current.state === 'configured' ? createSupabaseClient(current.config) : null;
  }
  return client;
}
