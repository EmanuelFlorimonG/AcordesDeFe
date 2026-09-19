import { getSupabaseClient } from '../lib/supabase';
import type { SongRepository } from './songRepository';
import { createSupabaseSongRepository } from './supabaseSongRepository';

/**
 * The remote catalog's reader, loaded on demand right after the first render
 * (see useCatalog.ts): the REST client isn't part of the first download.
 */
export function createRemoteSongRepository(): SongRepository | null {
  const client = getSupabaseClient();
  return client ? createSupabaseSongRepository(client) : null;
}
