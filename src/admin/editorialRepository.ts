import type { EditorialRole } from '../catalog/reviewContract';
import { parseSongDraft, type SongDraft } from '../catalog/songDraft';
import type { SongSubmissionStatus, SongSubmissionType } from '../catalog/submission';
import { songFromRow, SONG_READ_COLUMNS, type SongRow } from '../catalog/supabaseSongRepository';
import { SupabaseRequestError, type SupabaseClient } from '../lib/supabase';
import type { Song } from '../types/song';

/**
 * What the editorial team reads and does, through the REST API as the
 * signed-in reviewer. Every read passes Row Level Security (only users with
 * an editorial role see submissions, versions and hidden songs) and every
 * action is a database function that checks the role again. Nothing here
 * decides who may do what.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SubmissionListItem {
  id: string;
  type: SongSubmissionType;
  status: SongSubmissionStatus;
  title: string;
  artist: string | null;
  targetSongId: string | null;
  trackingCode: string;
  submittedAt: string;
  reviewedAt: string | null;
  /** The contributor left a name or an email. The list says only this, never the email itself. */
  hasContact: boolean;
}

export interface SubmissionDetail {
  id: string;
  type: SongSubmissionType;
  status: SongSubmissionStatus;
  targetSongId: string | null;
  /**
   * An edit: the published version it was made on. It is published only while
   * that is still the current version; older proposals (before versions
   * existed) have none and can't be approved without a rebase.
   */
  baseVersion: number | null;
  /** Null when the stored proposal can't be read as a song (it is then shown as unreadable, never guessed) */
  proposedSong: SongDraft | null;
  contributorName: string | null;
  contributorEmail: string | null;
  trackingCode: string;
  reviewNote: string | null;
  reviewedBy: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  publishedSongId: string | null;
  publishedVersion: number | null;
  /** How many times the author sent it back corrected, and the last time */
  resubmissionCount: number;
  resubmittedAt: string | null;
}

/** The song an edit is for, as the reviewer sees it now. */
export interface TargetSong {
  song: Song;
  status: 'published' | 'hidden';
  currentVersion: number;
}

export interface AdminSongItem {
  id: string;
  title: string;
  artist: string | null;
  originalKey: string | null;
  status: 'published' | 'hidden';
  currentVersion: number;
  updatedAt: string;
}

export interface SongVersionItem {
  version: number;
  publishedAt: string;
  publishedBy: string | null;
  submissionId: string | null;
  /** The song exactly as that version published it */
  song: Song | null;
}

export interface SubmissionCounts {
  pending: number;
  changesRequested: number;
  approvedRecently: number;
  rejectedRecently: number;
}

export type EditorialFailure =
  | 'forbidden'
  | 'session'
  | 'not-found'
  | 'not-reviewable'
  | 'song-id-taken'
  /** An edit made on a version that is no longer the published one */
  | 'stale'
  /** An edit of a song that is no longer published */
  | 'target-hidden'
  | 'invalid'
  | 'unavailable';

export class EditorialError extends Error {
  readonly reason: EditorialFailure;
  constructor(reason: EditorialFailure, message: string) {
    super(message);
    this.name = 'EditorialError';
    this.reason = reason;
  }
}

const MESSAGES: Record<EditorialFailure, string> = {
  forbidden: 'No tienes permisos para esta acción.',
  session: 'Tu sesión terminó. Vuelve a iniciar sesión.',
  'not-found': 'Esta propuesta ya no existe.',
  'not-reviewable': 'Esta propuesta ya fue revisada por alguien más. Se muestran sus datos actuales.',
  'song-id-taken': 'Ya existe una canción con ese identificador. Elige otro.',
  stale: 'La canción tiene una versión más reciente que la propuesta. No se publicó nada: pide al colaborador que la actualice.',
  'target-hidden': 'La canción de esta propuesta ya no está publicada. No se publicó nada.',
  invalid: 'Los datos no son válidos. Revisa el mensaje y la canción.',
  unavailable: 'No se pudo completar la operación. Inténtalo de nuevo.',
};

export function toEditorialError(error: unknown): EditorialError {
  if (error instanceof EditorialError) return error;
  if (error instanceof SupabaseRequestError) {
    const text = error.message;
    const reason: EditorialFailure =
      text.includes('GENESARET:forbidden') || error.code === '42501'
        ? 'forbidden'
        : error.status === 401 || /jwt/i.test(text)
          ? 'session'
          : text.includes('GENESARET:not_found')
            ? 'not-found'
            : text.includes('GENESARET:not_reviewable')
              ? 'not-reviewable'
              : text.includes('GENESARET:song_id_taken')
                ? 'song-id-taken'
                : text.includes('GENESARET:stale')
                  ? 'stale'
                  : text.includes('GENESARET:invalid:target')
                    ? 'target-hidden'
                    : text.includes('GENESARET:invalid') || error.code === '23514' || error.code === '22P02'
                      ? 'invalid'
                      : 'unavailable';
    return new EditorialError(reason, MESSAGES[reason]);
  }
  return new EditorialError('unavailable', MESSAGES.unavailable);
}

async function guard<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toEditorialError(error);
  }
}

interface SubmissionRow {
  id: string;
  type: SongSubmissionType;
  status: SongSubmissionStatus;
  target_song_id: string | null;
  tracking_code: string;
  submitted_at: string;
  reviewed_at: string | null;
}

interface ListRow extends SubmissionRow {
  title: string | null;
  artist: string | null;
  contributor_name: string | null;
  contributor_email: string | null;
}

interface DetailRow extends SubmissionRow {
  base_version: number | null;
  proposed_song: unknown;
  contributor_name: string | null;
  contributor_email: string | null;
  review_note: string | null;
  reviewed_by: string | null;
  published_song_id: string | null;
  published_version: number | null;
  resubmission_count: number | null;
  resubmitted_at: string | null;
}

const LIST_SELECT =
  'select=id,type,status,target_song_id,tracking_code,submitted_at,reviewed_at,title:proposed_song->>title,artist:proposed_song->>artist,contributor_name,contributor_email';
const DETAIL_SELECT =
  'select=id,type,status,target_song_id,base_version,tracking_code,submitted_at,reviewed_at,proposed_song,contributor_name,contributor_email,review_note,reviewed_by,published_song_id,published_version,resubmission_count,resubmitted_at';

/** How far back "recently" reaches on the summary. */
export const RECENT_DAYS = 30;

export interface EditorialRepository {
  getOwnRole(userId: string): Promise<EditorialRole | null>;
  listSubmissions(options?: { status?: SongSubmissionStatus }): Promise<SubmissionListItem[]>;
  countSubmissions(now?: Date): Promise<SubmissionCounts>;
  getSubmission(id: string): Promise<SubmissionDetail | null>;
  approve(id: string, options?: { songId?: string; reviewNote?: string }): Promise<{ songId: string; version: number }>;
  requestChanges(id: string, reviewNote: string): Promise<void>;
  reject(id: string, reviewNote: string): Promise<void>;
  listSongs(): Promise<AdminSongItem[]>;
  /** Every id in `songs`, published or hidden: what a new song's id must not collide with */
  listSongIds(): Promise<string[]>;
  getSong(id: string): Promise<Song | null>;
  /** The song an edit is for: its content now, whether it is published, and its version */
  getTargetSong(id: string): Promise<TargetSong | null>;
  listVersions(songId: string): Promise<SongVersionItem[]>;
}

export function createEditorialRepository(client: SupabaseClient): EditorialRepository {
  return {
    getOwnRole: (userId) =>
      guard(async () => {
        if (!UUID.test(userId)) return null;
        const rows = await client.select<{ role: string }>('editorial_roles', `select=role&user_id=eq.${userId}&limit=1`);
        const role = rows[0]?.role;
        return role === 'admin' || role === 'reviewer' ? role : null;
      }),

    listSubmissions: ({ status } = {}) =>
      guard(async () => {
        const filter = status ? `&status=eq.${status}` : '';
        const rows = await client.select<ListRow>('song_submissions', `${LIST_SELECT}${filter}&order=submitted_at.desc&limit=500`);
        // The contact data is reduced to a yes/no here and goes no further.
        return rows.map((row) => ({
          id: row.id,
          type: row.type,
          status: row.status,
          title: row.title?.trim() || 'Sin título',
          artist: row.artist?.trim() || null,
          targetSongId: row.target_song_id,
          trackingCode: row.tracking_code,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          hasContact: Boolean(row.contributor_email || row.contributor_name),
        }));
      }),

    countSubmissions: (now = new Date()) =>
      guard(async () => {
        const since = new Date(now.getTime() - RECENT_DAYS * 86_400_000).toISOString();
        const [pending, changesRequested, approvedRecently, rejectedRecently] = await Promise.all([
          client.count('song_submissions', 'select=id&status=eq.pending'),
          client.count('song_submissions', 'select=id&status=eq.changes_requested'),
          client.count('song_submissions', `select=id&status=eq.approved&reviewed_at=gte.${encodeURIComponent(since)}`),
          client.count('song_submissions', `select=id&status=eq.rejected&reviewed_at=gte.${encodeURIComponent(since)}`),
        ]);
        return { pending, changesRequested, approvedRecently, rejectedRecently };
      }),

    getSubmission: (id) =>
      guard(async () => {
        // The id comes from the route: anything that isn't a uuid is simply not found.
        if (!UUID.test(id)) return null;
        const rows = await client.select<DetailRow>('song_submissions', `${DETAIL_SELECT}&id=eq.${id}&limit=1`);
        const row = rows[0];
        if (!row) return null;
        return {
          id: row.id,
          type: row.type,
          status: row.status,
          targetSongId: row.target_song_id,
          baseVersion: Number.isInteger(row.base_version) && (row.base_version as number) >= 1 ? row.base_version : null,
          proposedSong: parseSongDraft(row.proposed_song),
          contributorName: row.contributor_name,
          contributorEmail: row.contributor_email,
          trackingCode: row.tracking_code,
          reviewNote: row.review_note,
          reviewedBy: row.reviewed_by,
          submittedAt: row.submitted_at,
          reviewedAt: row.reviewed_at,
          publishedSongId: row.published_song_id,
          publishedVersion: row.published_version,
          resubmissionCount: row.resubmission_count ?? 0,
          resubmittedAt: row.resubmitted_at ?? null,
        };
      }),

    approve: (id, options = {}) =>
      guard(async () => {
        const rows = await client.rpc<Array<{ song_id: string; version: number }>>('approve_submission', {
          p_submission_id: id,
          p_song_id: options.songId?.trim() || null,
          p_review_note: options.reviewNote?.trim() || null,
        });
        const row = rows[0];
        if (!row) throw new EditorialError('unavailable', MESSAGES.unavailable);
        return { songId: row.song_id, version: row.version };
      }),

    requestChanges: (id, reviewNote) =>
      guard(async () => {
        if (!reviewNote.trim()) throw new EditorialError('invalid', 'Escribe un mensaje para el colaborador.');
        await client.rpc('request_submission_changes', { p_submission_id: id, p_review_note: reviewNote.trim() });
      }),

    reject: (id, reviewNote) =>
      guard(async () => {
        if (!reviewNote.trim()) throw new EditorialError('invalid', 'Escribe el motivo.');
        await client.rpc('reject_submission', { p_submission_id: id, p_review_note: reviewNote.trim() });
      }),

    listSongs: () =>
      guard(async () => {
        const rows = await client.select<{
          id: string;
          title: string;
          artist: string | null;
          original_key: string | null;
          status: 'published' | 'hidden';
          current_version: number;
          updated_at: string;
        }>('songs', 'select=id,title,artist,original_key,status,current_version,updated_at&order=title.asc&limit=1000');
        return rows.map((row) => ({
          id: row.id,
          title: row.title,
          artist: row.artist,
          originalKey: row.original_key,
          status: row.status,
          currentVersion: row.current_version,
          updatedAt: row.updated_at,
        }));
      }),

    listSongIds: () =>
      guard(async () => (await client.select<{ id: string }>('songs', 'select=id&limit=10000')).map((row) => row.id)),

    getSong: (id) =>
      guard(async () => {
        const rows = await client.select<SongRow>('songs', `select=${SONG_READ_COLUMNS.join(',')}&id=eq.${encodeURIComponent(id)}&limit=1`);
        return rows[0] ? songFromRow(rows[0]) : null;
      }),

    getTargetSong: (id) =>
      guard(async () => {
        const rows = await client.select<SongRow & { status: 'published' | 'hidden' }>(
          'songs',
          `select=${SONG_READ_COLUMNS.join(',')},status&id=eq.${encodeURIComponent(id)}&limit=1`
        );
        const row = rows[0];
        const song = row ? songFromRow(row) : null;
        return row && song ? { song, status: row.status, currentVersion: song.version ?? 1 } : null;
      }),

    listVersions: (songId) =>
      guard(async () => {
        const rows = await client.select<{ version: number; published_at: string; published_by: string | null; submission_id: string | null; snapshot: SongRow }>(
          'song_versions',
          `select=version,published_at,published_by,submission_id,snapshot&song_id=eq.${encodeURIComponent(songId)}&order=version.desc`
        );
        return rows.map((row) => ({
          version: row.version,
          publishedAt: row.published_at,
          publishedBy: row.published_by,
          submissionId: row.submission_id,
          song: row.snapshot ? songFromRow(row.snapshot) : null,
        }));
      }),
  };
}
