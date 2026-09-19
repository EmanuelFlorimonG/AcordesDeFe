import type { SongSubmission } from './submission';

/**
 * The review side, as a contract only (phase 6C builds it).
 *
 * None of this exists in the public app on purpose. Every operation will run
 * with an authenticated reviewer's session and call a database function that
 * checks the reviewer's role itself (editorial_roles), so a modified browser
 * gains nothing: without that role the database refuses. Approving publishes
 * in one transaction inside the database (approve_submission): the song, its
 * new version and the submission's status change together or not at all.
 */

export type EditorialRole = 'admin' | 'reviewer';

export interface ApproveOptions {
  /** For a new song: the id it will be published under (a slug); the database proposes one if absent */
  songId?: string;
  /** Shown to the contributor with the tracking code */
  reviewNote?: string;
}

export interface EditorialReviewRepository {
  listSubmissions(filter: { status?: SongSubmission['status'] }): Promise<SongSubmission[]>;
  approve(submissionId: string, options?: ApproveOptions): Promise<{ songId: string; version: number }>;
  requestChanges(submissionId: string, reviewNote: string): Promise<void>;
  reject(submissionId: string, reviewNote: string): Promise<void>;
}
