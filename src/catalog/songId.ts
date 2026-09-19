/**
 * Song ids are readable slugs ("sencillamente-dios"), and they are forever:
 * favourites, recents, setlists, key preferences and the history all point at
 * them. The bundled songs keep theirs; a new song gets one when it is
 * approved. The database applies the same rule (slugify_song_id in the
 * migration); this copy lets the editor show it and the tests pin it down.
 */

export const SONG_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const MAX_SONG_ID_LENGTH = 80;

const FROM = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const TO = 'aaaaaeeeeiiiiooooouuuunc';

export function isSongId(value: string): boolean {
  return SONG_ID_PATTERN.test(value) && value.length <= MAX_SONG_ID_LENGTH;
}

export function slugifySongId(title: string): string {
  const folded = [...title.toLowerCase()].map((char) => {
    const index = FROM.indexOf(char);
    return index >= 0 ? TO[index] : char;
  }).join('');
  const slug = folded.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/^-+|-+$/g, '');
  return slug || 'cancion';
}

/** A free id for a new song: the slug, or the slug with a number when taken. */
export function suggestSongId(title: string, taken: ReadonlySet<string>): string {
  const base = slugifySongId(title);
  if (!taken.has(base)) return base;
  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}
