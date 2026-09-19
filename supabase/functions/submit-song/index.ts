// Supabase Edge Function (Deno). The logic is in handler.ts; this file only
// connects it to Cloudflare and to the database.
//
// Secrets, read from the function's environment, never from the code:
//   TURNSTILE_SECRET_KEY         set with `supabase secrets set`
//   SUPABASE_URL                 provided by Supabase
//   SUPABASE_SERVICE_ROLE_KEY    provided by Supabase; never leaves this function
//   GENESARET_ALLOWED_ORIGINS    optional, "https://dominio,http://localhost:5173";
//                                without it only the local dev and preview servers are allowed
//
// Deployed with JWT verification off (config.toml): the browser sends the
// publishable key, which is not a JWT. Turnstile is the gate instead.

import { GenesaretError, handleSubmitSong, parseAllowedOrigins, type ResubmitInput, type TurnstileOutcome } from './handler.ts';

const LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:4173'];
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Falta la variable ${name}`);
  return value;
}

const configured = parseAllowedOrigins(Deno.env.get('GENESARET_ALLOWED_ORIGINS'));
const allowedOrigins = configured.length > 0 ? configured : LOCAL_ORIGINS;

async function verifyTurnstile({ token, remoteIp }: { token: string; remoteIp: string | null }): Promise<TurnstileOutcome> {
  const form = new FormData();
  form.append('secret', env('TURNSTILE_SECRET_KEY'));
  form.append('response', token);
  if (remoteIp) form.append('remoteip', remoteIp);
  const response = await fetch(SITEVERIFY, { method: 'POST', body: form, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`siteverify ${response.status}`);
  return (await response.json()) as TurnstileOutcome;
}

/** Calls a database function as service_role; GENESARET refusals come back as GenesaretError. */
async function callDatabase(fn: string, args: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const headers: Record<string, string> = { apikey: key, 'Content-Type': 'application/json', Accept: 'application/json' };
  // A legacy service_role key is a JWT and goes in Authorization too; a new secret key only in `apikey`.
  if (key.split('.').length === 3) headers.Authorization = `Bearer ${key}`;
  const response = await fetch(`${env('SUPABASE_URL')}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(10000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : '';
    if (message.startsWith('GENESARET:')) throw new GenesaretError(message);
    console.error(fn, response.status, body?.code ?? '');
    throw new Error('database');
  }
  return Array.isArray(body) ? body[0] ?? null : null;
}

async function submit(payload: unknown, clientIp: string | null) {
  const row = await callDatabase('submit_song_submission_verified', { p_payload: payload, p_client_ip: clientIp });
  if (!row?.tracking_code || !row?.edit_token) throw new Error('empty receipt');
  return { trackingCode: String(row.tracking_code), editToken: String(row.edit_token) };
}

async function resubmit(input: ResubmitInput, clientIp: string | null) {
  const row = await callDatabase('resubmit_song_submission_verified', {
    p_tracking_code: input.trackingCode,
    p_edit_token: input.editToken,
    p_song: input.song,
    p_client_ip: clientIp,
  });
  if (!row?.tracking_code) throw new Error('empty receipt');
  return { trackingCode: String(row.tracking_code), status: String(row.status) };
}

Deno.serve((request) => handleSubmitSong(request, { allowedOrigins, verifyTurnstile, submit, resubmit }));
