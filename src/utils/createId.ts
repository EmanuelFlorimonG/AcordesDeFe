/**
 * Ids for things the user creates (setlists, entries, arrangement sections).
 *
 * It lives on its own so both setlists and arrangements can use it without
 * importing each other.
 */

export type IdFactory = () => string;

export const createId: IdFactory = () =>
  globalThis.crypto?.randomUUID?.() ??
  `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
