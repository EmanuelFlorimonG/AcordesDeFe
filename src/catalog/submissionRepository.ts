import { SupabaseRequestError, type SupabaseClient } from '../lib/supabase';
import { parseSongDraft } from './songDraft';
import {
  parseSubmissionPayload,
  toPublicStatus,
  validateSubmissionPayload,
  type PublicSubmissionStatus,
  type ResubmitInput,
  type ResubmitReceipt,
  type SongSubmission,
  type SubmissionForEdit,
  type SongSubmissionPayload,
  type SongSubmissionStatus,
  type SongSubmissionType,
  type SubmissionReceipt,
} from './submission';
import { generateTrackingCode, normalizeTrackingCode, type RandomBytes } from './trackingCode';

/**
 * What the public side can do with submissions: send one, and check the
 * status of one by its tracking code. Nothing here can approve, reject, edit
 * or read anyone's data: those operations belong to the review side, which
 * needs an authenticated reviewer and is enforced by the database.
 */
export interface SongSubmissionRepository {
  /** `humanCheck`: the Cloudflare Turnstile token of this attempt (single use) */
  submit(payload: SongSubmissionPayload, options?: { humanCheck?: string }): Promise<SubmissionReceipt>;
  /** Null when no submission has that code (or the code is malformed) */
  getPublicStatus(trackingCode: string): Promise<PublicSubmissionStatus | null>;
  /** The author's own proposal, to correct it. Null when the code and token don't match. */
  getForEdit(trackingCode: string, editToken: string): Promise<SubmissionForEdit | null>;
  /** Sends a corrected proposal back to review (only after the team asked for changes). */
  resubmit(input: ResubmitInput, options?: { humanCheck?: string }): Promise<ResubmitReceipt>;
}

export type SubmissionFailure = 'invalid' | 'rate-limited' | 'human-check' | 'not-editable' | 'unavailable';

export class SubmissionError extends Error {
  readonly reason: SubmissionFailure;
  constructor(reason: SubmissionFailure, message: string) {
    super(message);
    this.name = 'SubmissionError';
    this.reason = reason;
  }
}

// ---------------------------------------------------------------------------
// Supabase: sending through the Edge Function (Turnstile first), checking
// through a public database function
// ---------------------------------------------------------------------------

interface EditRow {
  tracking_code: string;
  type: SongSubmissionType;
  status: SongSubmissionStatus;
  review_note: string | null;
  proposed_song: unknown;
}

const EDIT_TOKEN = /^[0-9a-f]{64}$/;

interface StatusRow {
  tracking_code: string;
  type: SongSubmissionType;
  title: string;
  status: SongSubmissionStatus;
  review_note: string | null;
  submitted_at: string;
  reviewed_at: string | null;
}

/** The database and the Edge Function answer "GENESARET:<reason>" for the refusals the sender should understand. */
function toSubmissionError(error: unknown): SubmissionError {
  if (error instanceof SupabaseRequestError) {
    if (error.message.includes('GENESARET:not_editable')) {
      return new SubmissionError('not-editable', 'Esta propuesta ya no admite cambios: puede que ya se haya revisado de nuevo.');
    }
    if (error.message.includes('GENESARET:captcha')) {
      return new SubmissionError('human-check', 'No se pudo completar la verificación de seguridad. Vuelve a intentarlo.');
    }
    if (error.message.includes('GENESARET:rate_limited')) {
      return new SubmissionError('rate-limited', 'Demasiados intentos seguidos desde esta conexión. Espera unos minutos y vuelve a intentarlo.');
    }
    if (error.message.includes('GENESARET:invalid')) {
      return new SubmissionError('invalid', 'La propuesta no es válida.');
    }
  }
  return new SubmissionError('unavailable', 'No se pudo enviar la propuesta. Inténtalo más tarde.');
}

export function createSupabaseSubmissionRepository(client: SupabaseClient): SongSubmissionRepository {
  return {
    async submit(payload, options) {
      let receipt: Partial<SubmissionReceipt> | null;
      try {
        receipt = await client.invoke<Partial<SubmissionReceipt> | null>('submit-song', {
          payload,
          turnstileToken: options?.humanCheck ?? '',
        });
      } catch (error) {
        throw toSubmissionError(error);
      }
      if (typeof receipt?.trackingCode !== 'string' || typeof receipt.editToken !== 'string') {
        throw new SubmissionError('unavailable', 'No se pudo enviar la propuesta. Inténtalo más tarde.');
      }
      return { trackingCode: receipt.trackingCode, editToken: receipt.editToken };
    },
    async getPublicStatus(trackingCode) {
      const code = normalizeTrackingCode(trackingCode);
      if (!code) return null;
      let rows: StatusRow[];
      try {
        rows = await client.rpc<StatusRow[]>('get_submission_status', { p_tracking_code: code });
      } catch (error) {
        throw toSubmissionError(error);
      }
      const row = rows[0];
      return row
        ? {
            trackingCode: row.tracking_code,
            type: row.type,
            title: row.title,
            status: row.status,
            reviewNote: row.review_note,
            submittedAt: row.submitted_at,
            reviewedAt: row.reviewed_at,
          }
        : null;
    },
    async getForEdit(trackingCode, editToken) {
      const code = normalizeTrackingCode(trackingCode);
      if (!code || !EDIT_TOKEN.test(editToken)) return null;
      let rows: EditRow[];
      try {
        rows = await client.rpc<EditRow[]>('get_submission_for_edit', { p_tracking_code: code, p_edit_token: editToken });
      } catch (error) {
        throw toSubmissionError(error);
      }
      const row = rows[0];
      return row
        ? { trackingCode: row.tracking_code, type: row.type, status: row.status, reviewNote: row.review_note, song: parseSongDraft(row.proposed_song) }
        : null;
    },
    async resubmit(input, options) {
      let receipt: Partial<ResubmitReceipt> | null;
      try {
        receipt = await client.invoke<Partial<ResubmitReceipt> | null>('submit-song', {
          action: 'resubmit',
          trackingCode: input.trackingCode,
          editToken: input.editToken,
          song: input.song,
          turnstileToken: options?.humanCheck ?? '',
        });
      } catch (error) {
        throw toSubmissionError(error);
      }
      if (typeof receipt?.trackingCode !== 'string' || receipt.status !== 'pending') {
        throw new SubmissionError('unavailable', 'No se pudo reenviar la propuesta. Inténtalo más tarde.');
      }
      return { trackingCode: receipt.trackingCode, status: receipt.status };
    },
  };
}

// ---------------------------------------------------------------------------
// In memory: for tests and for developing the editor without a backend
// ---------------------------------------------------------------------------

export interface MemorySubmissionRepository extends SongSubmissionRepository {
  /** How many are stored; the stored rows themselves are not reachable from here */
  readonly count: () => number;
  /** What a reviewer does in the database, for tests: ask for changes with a note */
  readonly requestChanges: (trackingCode: string, note: string) => void;
}

/**
 * Behaves like the database functions (same checks, same public projection)
 * so the editor and its tests can run with no backend. Submissions live only
 * in this object and never leave it except as a public status.
 */
export function createMemorySubmissionRepository({
  now = () => new Date(),
  random,
  publishedSongIds,
}: { now?: () => Date; random?: RandomBytes; publishedSongIds?: ReadonlySet<string> } = {}): MemorySubmissionRepository {
  const stored: SongSubmission[] = [];
  // Retries of one proposal: requestId -> its code and the token that proves it's the same sender.
  const byRequest = new Map<string, { trackingCode: string; editToken: string }>();
  const bytes: RandomBytes = random ?? ((length) => crypto.getRandomValues(new Uint8Array(length)));
  // The edit token of each stored proposal (the database keeps only its hash).
  const tokens = new Map<string, string>();

  return {
    count: () => stored.length,
    requestChanges(trackingCode, note) {
      const entry = stored.find((submission) => submission.trackingCode === trackingCode);
      if (!entry || entry.status !== 'pending') throw new SubmissionError('not-editable', 'No se puede pedir cambios.');
      entry.status = 'changes_requested';
      entry.reviewNote = note;
      entry.reviewedAt = now().toISOString();
    },
    async getForEdit(trackingCode, editToken) {
      const code = normalizeTrackingCode(trackingCode);
      const entry = code && tokens.get(code) === editToken ? stored.find((submission) => submission.trackingCode === code) : undefined;
      return entry
        ? {
            trackingCode: entry.trackingCode,
            type: entry.type,
            status: entry.status,
            reviewNote: entry.status === 'pending' ? null : entry.reviewNote,
            song: structuredClone(entry.proposedSong),
          }
        : null;
    },
    async resubmit(input) {
      const code = normalizeTrackingCode(input.trackingCode);
      const entry = code && tokens.get(code) === input.editToken ? stored.find((submission) => submission.trackingCode === code) : undefined;
      if (!entry) throw new SubmissionError('invalid', 'La propuesta no es válida.');
      if (entry.status !== 'changes_requested') {
        throw new SubmissionError('not-editable', 'Esta propuesta ya no admite cambios: puede que ya se haya revisado de nuevo.');
      }
      const check = parseSubmissionPayload({ schemaVersion: 1, type: entry.type, targetSongId: entry.targetSongId, song: input.song, contributor: { name: null, email: null } });
      if (!check) throw new SubmissionError('invalid', 'La propuesta no es válida.');
      entry.proposedSong = structuredClone(input.song);
      entry.status = 'pending';
      entry.updatedAt = now().toISOString();
      return { trackingCode: entry.trackingCode, status: 'pending' };
    },
    async submit(payload) {
      if (!validateSubmissionPayload(payload, { publishedSongIds }).ok) {
        throw new SubmissionError('invalid', 'La propuesta no es válida.');
      }
      if (payload.requestId) {
        const previous = byRequest.get(payload.requestId);
        if (previous) {
          if (previous.editToken !== payload.editToken) throw new SubmissionError('invalid', 'La propuesta no es válida.');
          return { trackingCode: previous.trackingCode, editToken: previous.editToken };
        }
      }
      let trackingCode = generateTrackingCode(bytes);
      while (stored.some((entry) => entry.trackingCode === trackingCode)) trackingCode = generateTrackingCode(bytes);
      const editToken =
        payload.editToken && /^[0-9a-f]{64}$/.test(payload.editToken)
          ? payload.editToken
          : [...bytes(32)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const at = now().toISOString();
      stored.push({
        id: `mem-${stored.length + 1}`,
        type: payload.type,
        targetSongId: payload.targetSongId,
        proposedSong: structuredClone(payload.song),
        status: 'pending',
        contributorName: payload.contributor.name,
        contributorEmail: payload.contributor.email,
        trackingCode,
        reviewNote: null,
        submittedAt: at,
        reviewedAt: null,
        createdAt: at,
        updatedAt: at,
      });
      if (payload.requestId) byRequest.set(payload.requestId, { trackingCode, editToken });
      tokens.set(trackingCode, editToken);
      return { trackingCode, editToken };
    },
    async getPublicStatus(trackingCode) {
      const code = normalizeTrackingCode(trackingCode);
      const entry = code ? stored.find((submission) => submission.trackingCode === code) : undefined;
      return entry ? toPublicStatus(entry) : null;
    },
  };
}
