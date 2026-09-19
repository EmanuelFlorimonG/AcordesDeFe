import type { SubmissionListItem } from './editorialRepository';

/** Lowercase, no accents, no punctuation: "Canción" finds "cancion", "gs 2345" finds "GS-2345-6789". */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

/** Every word of the query must appear in the title, the artist or the tracking code. */
export function matchesSubmission(item: Pick<SubmissionListItem, 'title' | 'artist' | 'trackingCode'>, query: string): boolean {
  const words = normalizeForSearch(query).split(' ').filter(Boolean);
  if (words.length === 0) return true;
  const code = normalizeForSearch(item.trackingCode);
  const haystack = `${normalizeForSearch(item.title)} ${normalizeForSearch(item.artist ?? '')} ${code} ${code.replace(/ /g, '')}`;
  return words.every((word) => haystack.includes(word));
}
