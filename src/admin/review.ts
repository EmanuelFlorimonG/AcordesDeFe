import { isSongId, suggestSongId } from '../catalog/songId';

/** The database accepts review notes up to this length. */
export const MAX_REVIEW_NOTE_LENGTH = 2000;

/**
 * Why a chosen id can't be used for a new song, or null. `reserved` are the
 * songs bundled with the app: until they are imported, the database doesn't
 * know their ids, so this check keeps a new song from taking one of them.
 */
export function songIdProblem(id: string, taken: ReadonlySet<string>, reserved: ReadonlySet<string>): string | null {
  const value = id.trim();
  if (!value) return 'Escribe un identificador.';
  if (!isSongId(value)) return 'Solo minúsculas sin acentos, números y guiones, sin guion al principio ni al final.';
  if (taken.has(value)) return 'Ya existe una canción publicada con ese identificador.';
  if (reserved.has(value)) return 'Ese identificador pertenece a una de las canciones incluidas en la app.';
  return null;
}

/** The id proposed for a new song: its title as a slug, numbered if taken by the catalog or the bundled songs. */
export function suggestNewSongId(title: string, taken: ReadonlySet<string>, reserved: ReadonlySet<string>): string {
  return suggestSongId(title, new Set([...taken, ...reserved]));
}
