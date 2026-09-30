import type { Setlist } from '../types/setlist';
import { SupabaseRequestError, type SupabaseClient } from '../lib/supabase';
import { cloudToSetlist, type CloudSetlistRow } from './cloudSetlists';

/**
 * Un Setlist compartido por enlace.
 *
 * Quien lo prepara quiere que el coro lo vea, y el coro no tiene por qué
 * registrarse para leer la misa del domingo. El enlace es todo lo que hace
 * falta para verlo, y nada más que verlo.
 *
 * Por eso el token es lo único que importa aquí: no se manda nunca el id
 * interno del Setlist a nadie que no sea su dueño, y saber ese id sigue sin
 * servir para leer nada (las políticas de `setlists` no han cambiado). La
 * lectura pública pasa por una sola función de la base de datos, que sólo
 * responde con un token válido y sólo devuelve un Setlist — ni dueño, ni
 * relojes del servidor, ni nada de cómo está guardado.
 *
 * Lo que se ve por el enlace es lo que la cuenta tiene guardado en la nube en
 * ese momento, no una copia del día en que se compartió: quien comparte
 * corrige un tono, sincroniza, y el coro ve la corrección. Un cambio hecho en
 * el móvil y todavía sin sincronizar no se ve, y la aplicación lo dice.
 */

const SHARES = 'setlist_shares';

/** La forma que tiene un token, comprobada antes de preguntar por él. */
export const SHARE_TOKEN = /^[0-9a-f]{32}$/;

/** El token de una URL, o null si eso no es un token. */
export function readShareToken(value: string): string | null {
  const token = value.trim().toLowerCase();
  return SHARE_TOKEN.test(token) ? token : null;
}

interface ShareRow {
  token?: unknown;
  setlist_id?: unknown;
  created_at?: unknown;
}

const tokenOf = (row: ShareRow | undefined): string | null =>
  typeof row?.token === 'string' ? readShareToken(row.token) : null;

// ---------------------------------------------------------------------------
// Lo que hace el dueño
// ---------------------------------------------------------------------------

export interface SetlistShareRepository {
  /** El enlace de este Setlist, o null si todavía no está compartido. */
  find(setlistId: string): Promise<string | null>;
  /**
   * Crea el enlace y devuelve su token. El token lo pone la base de datos, no
   * este código: un navegador no elige con qué azar se protege un enlace.
   */
  create(setlistId: string): Promise<string>;
  /** Desactiva el enlace. A partir de ese instante no abre nada. */
  revoke(setlistId: string): Promise<void>;
}

/**
 * Los enlaces de quien ha iniciado sesión.
 *
 * `owner_id` no se manda nunca, ni se filtra por él: de quién es una fila lo
 * decide `auth.uid()` en la base de datos, y un filtro que fingiera ser esa
 * frontera sólo serviría para esconder el día en que dejara de funcionar.
 */
export function createSetlistShareRepository(client: SupabaseClient): SetlistShareRepository {
  return {
    async find(setlistId) {
      const rows = await client.select<ShareRow>(
        SHARES,
        `select=token&setlist_id=eq.${encodeURIComponent(setlistId)}&limit=1`
      );
      return tokenOf(rows[0]);
    },

    async create(setlistId) {
      // Sólo el Setlist: el token y el dueño los pone la base de datos, y la
      // clave foránea comprueba que ese Setlist existe y es de esta cuenta.
      const rows = await client.insert<ShareRow>(SHARES, { setlist_id: setlistId });
      const token = tokenOf(rows[0]);
      if (!token) throw new SupabaseRequestError('No se pudo crear el enlace.', 500, null);
      return token;
    },

    async revoke(setlistId) {
      await client.remove(SHARES, { setlist_id: setlistId });
    },
  };
}

// ---------------------------------------------------------------------------
// Lo que ve quien abre el enlace
// ---------------------------------------------------------------------------

export type SharedSetlistRead =
  | { state: 'setlist'; setlist: Setlist; sharedAt: string | null }
  /** El enlace no existe, se desactivó, o el Setlist se borró. Lo mismo para quien mira. */
  | { state: 'gone' }
  /** Hay algo, pero este build no sabe leerlo, o vino roto. */
  | { state: 'unreadable' };

/**
 * El Setlist que hay detrás de un enlace.
 *
 * Se llama sin sesión: la función de la base de datos está abierta a
 * cualquiera, y lo que la protege es que hace falta el token. Un token con
 * mala forma ni se envía.
 *
 * Un enlace que no existe y uno que se desactivó se responden igual, porque
 * para quien mira son lo mismo y porque distinguirlos sólo serviría para
 * averiguar qué enlaces existieron.
 */
export async function readSharedSetlist(client: SupabaseClient, token: string): Promise<SharedSetlistRead> {
  const clean = readShareToken(token);
  if (!clean) return { state: 'gone' };

  const rows = await client.rpc<Array<CloudSetlistRow & { shared_at?: unknown }>>('shared_setlist', {
    share_token: clean,
  });
  if (!Array.isArray(rows) || rows.length !== 1) return { state: 'gone' };

  // El mismo lector que usa la sincronización, así que un enlace enseña
  // exactamente lo que vería el dueño desde otro dispositivo. Sin nada local
  // que superponer: quien abre el enlace no tiene miembros de este coro.
  const read = cloudToSetlist(rows[0]);
  if (read.state !== 'setlist') return read.state === 'deleted' ? { state: 'gone' } : { state: 'unreadable' };

  const sharedAt = typeof rows[0].shared_at === 'string' ? rows[0].shared_at : null;
  return { state: 'setlist', setlist: read.setlist, sharedAt };
}
