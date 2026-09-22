/**
 * submit-song: the only way a proposal reaches the database.
 *
 * 1. The request comes from one of GENESARET's own pages (Origin allowlist).
 * 2. Cloudflare Turnstile confirms, on Cloudflare's side, that a person solved
 *    the check on one of GENESARET's hostnames, for this action.
 * 3. Only then the proposal is stored, by the database function that does
 *    every other check (shape, sizes, retries, rate limit), with the
 *    visitor's IP so the rate limit counts the visitor and not this function.
 *
 * Two actions, both behind the same checks:
 *   - "submit" (the default): a new proposal.
 *   - "resubmit": its author sends it again, corrected, after the team asked
 *     for changes; proven by the tracking code and the edit token. An edit of
 *     a published song also says which version it is based on (baseVersion):
 *     the database refuses it ("stale") unless that is still the current one.
 *
 * This file uses only web standards (Request, Response, fetch) and receives
 * everything else as arguments, so the same code runs in Supabase (Deno,
 * see index.ts) and in the project's tests (Node). No secret lives here.
 */

export interface TurnstileOutcome {
  success: boolean;
  hostname?: string;
  action?: string;
  'error-codes'?: readonly string[];
}

export interface SubmitSongDeps {
  /** Exact origins allowed to call, e.g. "https://genesaret.example" */
  allowedOrigins: readonly string[];
  /** Asks Cloudflare about a token (each token is single use: the browser gets a new one per attempt). */
  verifyTurnstile: (input: { token: string; remoteIp: string | null }) => Promise<TurnstileOutcome>;
  /** Calls submit_song_submission_verified. Throws a GenesaretError, or anything else when the database can't be reached. */
  submit: (payload: unknown, clientIp: string | null) => Promise<{ trackingCode: string; editToken: string }>;
  /** Calls resubmit_song_submission_verified. Same errors as submit. */
  resubmit: (input: ResubmitInput, clientIp: string | null) => Promise<{ trackingCode: string; status: string }>;
}

export interface ResubmitInput {
  trackingCode: string;
  editToken: string;
  song: object;
  /** Edits of a published song only: the version the corrected proposal was made on */
  baseVersion?: number;
}

const TRACKING_CODE = /^GS-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTWXYZ]{4}$/;
const EDIT_TOKEN = /^[0-9a-f]{64}$/;

/** Same bounds as the database: a positive integer of at most nine digits. */
const isBaseVersion = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 999_999_999;

/**
 * The refusals whose detail the app needs to explain what happened. Every
 * other "invalid:*" detail is collapsed to "invalid".
 */
const INVALID_DETAILS = new Set(['invalid:no_changes', 'invalid:base_version', 'invalid:target']);

function databaseRefusal(message: string): { status: number; code: string } | null {
  const code = message.slice('GENESARET:'.length);
  if (code.startsWith('rate_limited')) return { status: 429, code: 'rate_limited' };
  if (code.startsWith('not_editable')) return { status: 409, code: 'not_editable' };
  // The song changed after the proposal was made on it: nothing was stored.
  if (code === 'stale') return { status: 409, code: 'stale' };
  if (code.startsWith('invalid')) return { status: 400, code: INVALID_DETAILS.has(code) ? code : 'invalid' };
  return null;
}

/** The action the browser widget declares, so a token solved for anything else is refused. */
export const TURNSTILE_ACTION = 'submit-song';

/** Largest body accepted: the database refuses payloads over 64 KiB; the token and the wrapper add a little. */
export const MAX_BODY_BYTES = 72 * 1024;

/** A refusal the database raised on purpose: "GENESARET:<reason>[:detail]". */
export class GenesaretError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GenesaretError';
  }
}

/** The visitor's IP as the platform reports it: the first address of X-Forwarded-For. */
export function clientIpOf(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || null;
}

/** "https://a.com,http://localhost:5173" -> exact origins, without trailing slashes. */
export function parseAllowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim().replace(/\/+$/, ''))
    .filter((entry) => /^https?:\/\/[^/]+$/.test(entry));
}

function hostnameOf(origin: string): string {
  return new URL(origin).hostname;
}

function corsHeaders(origin: string | null, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = { Vary: 'Origin' };
  if (origin && allowed.includes(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'authorization, apikey, content-type, x-client-info';
    headers['Access-Control-Max-Age'] = '600';
  }
  return headers;
}

/** Errors carry only a stable code, never internals: the app turns the code into a message. */
function reply(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

const refuse = (status: number, code: string, cors: Record<string, string>) => reply(status, { message: `GENESARET:${code}` }, cors);

async function readBody(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return null;
  const text = await request.text();
  return new TextEncoder().encode(text).length > MAX_BODY_BYTES ? null : text;
}

export async function handleSubmitSong(request: Request, deps: SubmitSongDeps): Promise<Response> {
  const origin = request.headers.get('origin');
  const cors = corsHeaders(origin, deps.allowedOrigins);

  // A browser on another site: no CORS headers, and no work done.
  if (origin && !deps.allowedOrigins.includes(origin)) return refuse(403, 'forbidden', cors);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'POST') return refuse(405, 'invalid:method', cors);

  const text = await readBody(request);
  if (text === null) return refuse(413, 'invalid:payload', cors);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return refuse(400, 'invalid:payload', cors);
  }
  if (typeof body !== 'object' || body === null) return refuse(400, 'invalid:payload', cors);
  const { action = 'submit', payload, turnstileToken, trackingCode, editToken, song, baseVersion } = body as Record<string, unknown>;
  // Everything that can be checked without Cloudflare is checked first.
  let resubmission: ResubmitInput | null = null;
  if (action === 'resubmit') {
    const code = typeof trackingCode === 'string' ? trackingCode.trim().toUpperCase() : '';
    if (!TRACKING_CODE.test(code) || typeof editToken !== 'string' || !EDIT_TOKEN.test(editToken)) return refuse(400, 'invalid', cors);
    if (typeof song !== 'object' || song === null || Array.isArray(song)) return refuse(400, 'invalid:payload', cors);
    // Absent (or null) for a new song; the database decides whether this proposal needs it.
    if (baseVersion !== undefined && baseVersion !== null && !isBaseVersion(baseVersion)) return refuse(400, 'invalid:base_version', cors);
    resubmission = isBaseVersion(baseVersion) ? { trackingCode: code, editToken, song, baseVersion } : { trackingCode: code, editToken, song };
  } else if (action !== 'submit') {
    return refuse(400, 'invalid:action', cors);
  } else if (typeof payload !== 'object' || payload === null) {
    return refuse(400, 'invalid:payload', cors);
  }
  if (typeof turnstileToken !== 'string' || turnstileToken.length === 0 || turnstileToken.length > 2048) {
    return refuse(403, 'captcha', cors);
  }

  // The human check, decided by Cloudflare, before anything touches the database.
  const clientIp = clientIpOf(request);
  let outcome: TurnstileOutcome;
  try {
    // Throws when Cloudflare can't be reached: nothing is sent, and a retry is safe.
    outcome = await deps.verifyTurnstile({ token: turnstileToken, remoteIp: clientIp });
  } catch {
    return refuse(503, 'unavailable', cors);
  }
  const hostnames = deps.allowedOrigins.map(hostnameOf);
  if (!outcome.success || outcome.action !== TURNSTILE_ACTION || !outcome.hostname || !hostnames.includes(outcome.hostname)) {
    return refuse(403, 'captcha', cors);
  }

  try {
    const result = resubmission ? await deps.resubmit(resubmission, clientIp) : await deps.submit(payload, clientIp);
    return reply(200, result, cors);
  } catch (error) {
    if (error instanceof GenesaretError) {
      const refusal = databaseRefusal(error.message);
      if (refusal) return refuse(refusal.status, refusal.code, cors);
    }
    return refuse(503, 'unavailable', cors);
  }
}
