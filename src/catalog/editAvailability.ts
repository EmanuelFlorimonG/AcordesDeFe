/// <reference types="vite/client" />
import { getSupabaseStatus } from '../lib/supabaseConfig';
import { readCatalogSource } from './useCatalog';

/**
 * Whether this build can take suggested edits of published songs at all: it
 * needs Supabase (to read the song's current version and to send), and it
 * isn't running on the bundled songs only (VITE_CATALOG_SOURCE=bundled),
 * whose versions can't be trusted. Cheap: nothing is loaded to answer.
 */
export function canSuggestEdits(): boolean {
  return readCatalogSource(import.meta.env.VITE_CATALOG_SOURCE) === 'remote' && getSupabaseStatus().state === 'configured';
}

/** The route of the edit screen of one song. */
export const suggestEditHash = (songId: string) => `#/song/${encodeURIComponent(songId)}/sugerir`;

/** "#/song/<id>/sugerir" -> the id, or null. */
export function parseSuggestEditHash(hash: string): string | null {
  const match = hash.match(/^#\/song\/([^/]+)\/sugerir$/);
  return match ? match[1] : null;
}
