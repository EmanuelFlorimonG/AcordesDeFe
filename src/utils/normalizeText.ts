/**
 * Lowercases and strips accents/diacritics so searches match regardless of
 * whether the user types "alegria" or "alegría".
 */
export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
