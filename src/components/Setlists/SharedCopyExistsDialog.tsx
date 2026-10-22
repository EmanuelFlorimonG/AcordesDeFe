import React from 'react';
import { Dialog } from './Dialog';
import { primaryButton, secondaryButton } from './ui';

/**
 * «De este Setlist ya tienes una copia.»
 *
 * No es un error ni un bloqueo: quien reparte un enlace lo reparte una vez y
 * quien lo recibe puede abrirlo muchas. Lo que se ofrece depende de dónde
 * esté esa copia.
 *
 * Si está en la cuenta, lo normal es querer ir a ella, y lo raro pero
 * legítimo es querer otra aparte —una para el ensayo y otra para el domingo—.
 * Si todavía no subió, lo que hace falta no es otra copia: es volver a subir
 * la que hay. Hacer otra dejaría dos sin guardar, que es el doble del
 * problema.
 *
 * La copia se reconoce por el Setlist del que salió, no por su nombre: dos
 * celebraciones distintas pueden llamarse igual.
 */

interface SharedCopyExistsDialogProps {
  /** El nombre del Setlist compartido, para que se sepa de cuál se habla */
  name: string;
  /** La copia está en este dispositivo pero la nube no la tiene todavía */
  pending: boolean;
  onRetry: () => void;
  onOpenExisting: () => void;
  onSaveAnother: () => void;
  onClose: () => void;
}

export const SharedCopyExistsDialog: React.FC<SharedCopyExistsDialogProps> = ({
  name,
  pending,
  onRetry,
  onOpenExisting,
  onSaveAnother,
  onClose,
}) => (
  <Dialog
    size="sm"
    title={pending ? 'Tu copia todavía no está en tu cuenta' : 'Ya tienes una copia de este Setlist'}
    description={
      pending
        ? `«${name}» está guardado en este dispositivo, pero la última subida no llegó a terminar.`
        : `«${name}» ya está en tus Setlists, guardado desde este mismo enlace.`
    }
    onClose={onClose}
    footer={
      pending ? (
        <>
          <button type="button" onClick={onOpenExisting} className={secondaryButton}>
            Abrir mi copia
          </button>
          <button type="button" onClick={onRetry} className={primaryButton}>
            Reintentar guardado
          </button>
        </>
      ) : (
        <>
          <button type="button" onClick={onSaveAnother} className={secondaryButton}>
            Guardar otra copia
          </button>
          <button type="button" onClick={onOpenExisting} className={primaryButton}>
            Abrir mi copia
          </button>
        </>
      )
    }
  >
    <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
      {pending
        ? 'Vuelve a intentarlo y se subirá la misma copia, con sus mismos cambios. No se creará otra.'
        : 'Puedes abrir la que ya tienes, o guardar otra aparte si quieres trabajar las dos por separado. La que ya tienes no se toca.'}
    </p>
  </Dialog>
);
