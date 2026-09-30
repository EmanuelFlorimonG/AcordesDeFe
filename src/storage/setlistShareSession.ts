import { createSupabaseClient, getSupabaseClient, getSupabaseStatus } from '../lib/supabase';
import type { AuthenticatedSession } from '../auth/session';
import { createSetlistShareRepository, readSharedSetlist, type SetlistShareRepository, type SharedSetlistRead } from './setlistShares';

/**
 * Quién habla con Supabase cuando se comparte un Setlist.
 *
 * Dos conversaciones muy distintas, y por eso están las dos aquí, juntas y a
 * la vista:
 *
 *   * la del dueño, que crea y desactiva enlaces, y va con el token de su
 *     sesión, congelado igual que en la sincronización: la identidad y el
 *     token se leyeron a la vez, y nada se vuelve a preguntar por el camino;
 *   * la de quien abre el enlace, que va con la clave pública y nada más,
 *     porque para eso está el enlace.
 */

/** Los enlaces de quien ha iniciado sesión, con su token congelado. */
export function sharesForToken(accessToken: string): SetlistShareRepository | null {
  const status = getSupabaseStatus();
  if (status.state !== 'configured') return null;
  const frozen = async () => accessToken;
  return createSetlistShareRepository(createSupabaseClient(status.config, fetch, { accessToken: frozen }));
}

/** Los enlaces de esta persona, o null si no hay sesión o no hay Supabase. */
export function sharesFor(who: AuthenticatedSession): SetlistShareRepository | null {
  const accessToken = who.accessToken?.trim();
  if (!who.session?.userId?.trim() || !accessToken) return null;
  return sharesForToken(accessToken);
}

/**
 * El Setlist que hay detrás de un enlace, sin sesión ninguna.
 *
 * Usa el cliente público de la aplicación, el mismo con el que se lee el
 * cancionero: quien abre un enlace no tiene cuenta, y no hace falta que la
 * tenga.
 */
export async function loadSharedSetlist(token: string): Promise<SharedSetlistRead | { state: 'unconfigured' }> {
  const client = getSupabaseClient();
  if (!client) return { state: 'unconfigured' };
  return readSharedSetlist(client, token);
}
