import { useCallback, useMemo, useState } from 'react';
import {
  describeGuestImport,
  importGuestSetlists,
  pendingGuestSetlists,
} from '../storage/guestSetlistImport';
import {
  GUEST_SETLISTS,
  createLocalSetlistRepository,
  getBrowserStorage,
  scopeId,
  type SetlistScope,
} from '../storage/setlistStorage';

/**
 * Lo que alguien hizo antes de iniciar sesión, y si quiere llevárselo.
 *
 * Nada de esto pasa solo. Se mira si hay Setlists de invitado, se dice, y se
 * espera: importar es una decisión, igual que subir uno a la nube, y por la
 * misma razón — nadie sabe si lo que hay ahí lo hizo esta persona o quien le
 * prestó el teléfono.
 *
 * Un invitado no ve nada de esto: no hay cuenta a la que llevar nada.
 */
export interface GuestSetlistImport {
  /** Cuántos Setlists de invitado faltan por llevar a esta cuenta. */
  pending: number;
  /** Se ha dicho que ahora no. Nada se ha movido; se vuelve a ofrecer otro día. */
  dismissed: boolean;
  dismiss: () => void;
  /** Los copia y dice cómo fue. Null cuando no había ninguno que llevar. */
  importAll: () => { ok: boolean; message: string } | null;
}

export function useGuestSetlistImport(scope: SetlistScope): GuestSetlistImport {
  // Por cuenta, para que decir "ahora no" en una no calle la oferta en otra.
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  // Se vuelve a contar después de importar, no en cada render.
  const [imports, setImports] = useState(0);

  const userId = scope.kind === 'user' ? scope.userId.trim() : '';
  const scopeName = scopeId(scope);

  const repositories = useCallback(() => {
    const storage = getBrowserStorage();
    return {
      guest: createLocalSetlistRepository(storage, GUEST_SETLISTS),
      account: createLocalSetlistRepository(storage, scope),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeName]);

  const pending = useMemo(() => {
    if (!userId) return 0;
    void imports;
    const { guest, account } = repositories();
    return pendingGuestSetlists(guest, account).length;
  }, [userId, imports, repositories]);

  const importAll = useCallback(() => {
    if (!userId) return null;
    const { guest, account } = repositories();
    const result = importGuestSetlists(guest, account);
    setImports((count) => count + 1);
    // Ninguno pendiente y ninguno fallido: no había nada que llevar.
    if (result.imported === 0 && result.alreadyThere === 0 && result.failed === 0) return null;
    return describeGuestImport(result);
  }, [userId, repositories]);

  return {
    pending,
    dismissed: dismissedFor === scopeName,
    dismiss: useCallback(() => setDismissedFor(scopeName), [scopeName]),
    importAll,
  };
}
