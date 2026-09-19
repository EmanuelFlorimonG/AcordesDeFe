import { getSupabaseClient } from '../lib/supabase';
import { getTurnstileSiteKey } from '../lib/turnstile';
import { createSupabaseSubmissionRepository, type SongSubmissionRepository } from './submissionRepository';

/**
 * The submission services, or null when this build has no backend
 * configured (the catalog reads Supabase on its own, see useCatalog.ts). Callers show a calm "not available here" state instead of
 * failing: the songbook itself never depends on them.
 */

let submissions: SongSubmissionRepository | null | undefined;

/** Checking a proposal's status: needs only Supabase. */
export function getSubmissionRepository(): SongSubmissionRepository | null {
  if (submissions === undefined) {
    const client = getSupabaseClient();
    submissions = client ? createSupabaseSubmissionRepository(client) : null;
  }
  return submissions;
}


/**
 * Sending a proposal: needs Supabase and the Turnstile site key, because the
 * backend only accepts proposals that passed the human check.
 */
export function getSubmissionSender(): { repository: SongSubmissionRepository; turnstileSiteKey: string } | null {
  const repository = getSubmissionRepository();
  const turnstileSiteKey = getTurnstileSiteKey();
  return repository && turnstileSiteKey ? { repository, turnstileSiteKey } : null;
}
