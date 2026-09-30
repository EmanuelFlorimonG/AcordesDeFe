import type { Setlist } from '../types/setlist';
import type { SetlistRepository } from './setlistStorage';

/**
 * Los Setlists que alguien hizo antes de tener cuenta, llevados a ella.
 *
 * Iniciar sesión cambia de sitio donde se leen los Setlists, así que lo hecho
 * como invitado deja de verse de golpe. No se ha perdido —sigue donde estaba,
 * y saliendo de la cuenta vuelve a aparecer— pero nadie tiene por qué saber
 * eso, así que la aplicación lo ofrece.
 *
 * Copiar, nunca mover: lo del invitado se queda donde está. Si la importación
 * se corta a la mitad, o alguien cambia de idea, no ha desaparecido nada.
 *
 * Un Setlist se copia tal cual, con su mismo id. Ese id es lo que hace que la
 * oferta no se repita eternamente: cuando la cuenta ya tiene uno con ese id,
 * ese Setlist ya está importado y no se vuelve a tocar. Un id que ya existe en
 * la cuenta no se sobrescribe jamás, ni siquiera si lo que hay allí dice algo
 * distinto: lo de la cuenta es lo que la persona ha estado usando dentro de
 * ella, y una importación no es sitio para decidir entre dos versiones.
 */

export interface GuestImportResult {
  /** Copiados a la cuenta en esta pasada. */
  imported: number;
  /** Ya estaban allí: importados antes, y no se tocan. */
  alreadyThere: number;
  /** El dispositivo no aceptó guardarlos. Los demás sí se importaron. */
  failed: number;
}

/** Lo que falta por llevar a la cuenta: ni uno que ya esté allí. */
export function pendingGuestSetlists(guest: SetlistRepository, account: SetlistRepository): Setlist[] {
  const mine = new Set(account.load().setlists.map((setlist) => setlist.id));
  return guest.load().setlists.filter((setlist) => !mine.has(setlist.id));
}

/**
 * Copia a la cuenta los Setlists del invitado que no estén ya allí.
 *
 * Uno a uno, y cada uno releyendo lo que hay: un dispositivo que se queda sin
 * sitio a mitad de camino deja importados los anteriores en vez de perderlos
 * todos, y se dice cuántos fueron. Nada se borra del lado del invitado.
 */
export function importGuestSetlists(guest: SetlistRepository, account: SetlistRepository): GuestImportResult {
  const result: GuestImportResult = { imported: 0, alreadyThere: 0, failed: 0 };

  for (const setlist of guest.load().setlists) {
    const now = account.load().setlists;
    if (now.some((entry) => entry.id === setlist.id)) {
      result.alreadyThere += 1;
      continue;
    }
    try {
      // saveOrThrow, y no save: decirle a alguien que se llevaron tres
      // cuando el navegador no aceptó ninguno sería peor que no ofrecerlo.
      account.saveOrThrow([...now, setlist]);
      result.imported += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

/** Lo que se le cuenta a la persona cuando termina. */
export function describeGuestImport(result: GuestImportResult): { ok: boolean; message: string } {
  const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

  if (result.failed > 0) {
    // Lo que sí entró se dice primero: es lo que la persona quería.
    const entraron = result.imported
      ? `${plural(result.imported, 'Setlist guardado', 'Setlists guardados')} en tu cuenta. `
      : '';
    return {
      ok: false,
      message: `${entraron}${plural(result.failed, 'no se pudo guardar', 'no se pudieron guardar')}: sigue${
        result.failed === 1 ? '' : 'n'
      } donde estaba${result.failed === 1 ? '' : 'n'}. Inténtalo otra vez.`,
    };
  }
  if (result.imported === 0) {
    return { ok: true, message: 'Esos Setlists ya estaban en tu cuenta' };
  }
  return {
    ok: true,
    message: `${plural(result.imported, 'Setlist guardado', 'Setlists guardados')} en tu cuenta`,
  };
}
