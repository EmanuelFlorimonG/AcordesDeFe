import React, { useState } from 'react';
import { Check, Copy, Link2, Link2Off, Loader2, TriangleAlert, WifiOff } from 'lucide-react';
import {
  NEEDS_INTERNET_TO_CREATE,
  NEEDS_INTERNET_TO_REVOKE,
  useSetlistShare,
} from '../../hooks/useSetlistShare';
import { Dialog } from './Dialog';
import { QrCode } from './QrCode';
import { dangerButton, primaryButton, secondaryButton } from './ui';

/**
 * Compartir un Setlist con quien no tiene cuenta.
 *
 * Un enlace y un código QR, que llevan al mismo sitio. Quien lo abra ve el
 * Setlist y no puede cambiar nada: no es un permiso que se pueda ajustar, es
 * lo único que ese enlace sabe hacer.
 *
 * Crear el enlace es una decisión, igual que desactivarlo. Abrir esta ventana
 * no comparte nada.
 *
 * Sin conexión se puede enseñar y copiar un enlace que ya existía, y su código
 * QR se dibuja aquí mismo. Lo que no se puede es crear uno ni desactivarlo: eso
 * lo hace la base de datos, y se dice en vez de fingirlo.
 */

/** Una línea discreta: ni alarma ni error, sólo lo que pasa. */
const Offline: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
    <WifiOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
    <span>{children}</span>
  </p>
);

interface ShareSetlistDialogProps {
  setlistId: string;
  setlistName: string;
  onClose: () => void;
}

export const ShareSetlistDialog: React.FC<ShareSetlistDialogProps> = ({ setlistId, setlistName, onClose }) => {
  const share = useSetlistShare(setlistId);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  const copy = async () => {
    if (!share.link) return;
    try {
      await navigator.clipboard.writeText(share.link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Un navegador que no deja copiar: el enlace está a la vista y se
      // puede seleccionar a mano, que es exactamente lo que hará la persona.
      setCopied(false);
    }
  };

  if (confirmingRevoke) {
    return (
      <Dialog
        role="alertdialog"
        size="sm"
        title="Desactivar el enlace"
        onClose={() => setConfirmingRevoke(false)}
        footer={
          <>
            <button type="button" onClick={() => setConfirmingRevoke(false)} className={secondaryButton} disabled={share.busy}>
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => {
                share.revoke();
                setConfirmingRevoke(false);
              }}
              className={dangerButton}
              disabled={share.busy}
            >
              Sí, desactivar
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Quien tenga el enlace dejará de ver «{setlistName}» inmediatamente, y el código QR que hayas repartido
          tampoco abrirá nada.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Puedes volver a compartirlo cuando quieras, pero será un enlace nuevo: el anterior no vuelve.
        </p>
      </Dialog>
    );
  }

  return (
    <Dialog
      title="Compartir Setlist"
      description={`Quien tenga el enlace podrá ver «${setlistName}» sin necesidad de cuenta, y sólo verlo.`}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={secondaryButton}>
          Cerrar
        </button>
      }
    >
      {share.status === 'loading' && (
        <p className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          Un momento…
        </p>
      )}

      {share.status === 'error' && (
        <p className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-200">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          {share.message ?? 'No se pudo comprobar si está compartido.'}
        </p>
      )}

      {share.status === 'off' && (
        <div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Todavía no está compartido. Al crear el enlace, cualquiera que lo reciba podrá abrir este Setlist y leerlo:
            las canciones, el orden, los tonos y los arreglos. No podrá cambiar nada ni ver el resto de tus Setlists.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Se verá la versión guardada en tu cuenta, así que sincroniza antes si acabas de cambiar algo aquí.
          </p>
          <button
            type="button"
            onClick={share.create}
            disabled={share.busy || !share.online}
            className={`${primaryButton} mt-4`}
          >
            {share.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
            {share.busy ? 'Creando…' : 'Crear enlace para compartir'}
          </button>
          {!share.online && <Offline>{NEEDS_INTERNET_TO_CREATE}</Offline>}
        </div>
      )}

      {share.status === 'on' && share.link && (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              Enlace
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-950 px-3 py-2 text-xs text-slate-700 dark:text-slate-200">
                {share.link}
              </code>
              <button type="button" onClick={() => void copy()} className={secondaryButton}>
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado' : 'Copiar enlace'}
              </button>
            </div>
          </div>

          <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-200 dark:border-dark-700 p-4">
            <QrCode value={share.link} size={190} label={`Código QR del enlace de «${setlistName}»`} />
            <p className="text-center text-xs text-slate-500 dark:text-slate-400">
              Apunta con la cámara del móvil para abrirlo.
            </p>
          </div>

          {share.fromMemory && (
            <Offline>
              Este enlace está guardado en el dispositivo. Es el último que conocemos: sin conexión no podemos
              confirmar que siga activo.
            </Offline>
          )}

          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Se ve la versión guardada en tu cuenta. Si cambias algo en este dispositivo, sincroniza para que lo vean.
          </p>

          <div>
            <button
              type="button"
              onClick={() => setConfirmingRevoke(true)}
              disabled={share.busy || !share.online}
              className={secondaryButton}
            >
              {share.busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2Off className="w-4 h-4" />}
              Desactivar enlace
            </button>
            {!share.online && <Offline>{NEEDS_INTERNET_TO_REVOKE}</Offline>}
          </div>
        </div>
      )}

      {share.message && share.status !== 'error' && (
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{share.message}</p>
      )}
    </Dialog>
  );
};
