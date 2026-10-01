import React, { useEffect, useState } from 'react';
import { AlertTriangle, CloudOff, Download, RefreshCw, TriangleAlert, Wifi } from 'lucide-react';
import { useReconnect } from '../../hooks/useOnline';
import { connectionNotice, type ConnectionNow, type Notice, type NoticeAction } from './connectionNotice';

/**
 * Una sola línea, abajo, que dice cómo va todo.
 *
 * Es lo único que esta parte de la aplicación enseña: no hay banderas de
 * colores apiladas ni ventanas que interrumpan. Se decide fuera, en
 * `connectionNotice`, y aquí sólo se pinta.
 *
 * En Modo Misa se encoge a un icono con dos palabras en una esquina. Estar
 * sin conexión es algo que conviene saber; tapar la letra de lo que se está
 * cantando, no.
 *
 * Lo que se lee en voz alta cambia cuando cambia el aviso y no en cada
 * dibujado: el contenedor es siempre el mismo, así que un lector de pantalla
 * no repite lo mismo una y otra vez.
 */

const ICONS: Record<Notice['kind'], React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  offline: CloudOff,
  conflict: AlertTriangle,
  'sync-error': TriangleAlert,
  syncing: RefreshCw,
  update: Download,
  reconnected: Wifi,
  'offline-ready': CloudOff,
};

/** En Modo Misa no cabe una frase: cabe esto. */
const SHORT: Record<Notice['kind'], string> = {
  offline: 'Sin conexión',
  conflict: 'Conflicto pendiente',
  'sync-error': 'Sin sincronizar',
  syncing: 'Sincronizando',
  update: 'Nueva versión',
  reconnected: 'Conexión restaurada',
  'offline-ready': 'Listo sin conexión',
};

export interface ConnectionStatusProps extends Omit<ConnectionNow, 'reconnected' | 'offlineReady' | 'canResolve'> {
  /** Si la aplicación acaba de quedar guardada para abrir sin conexión. */
  offlineReady?: boolean;
  /** Abre la pantalla de siempre para elegir entre las dos versiones. */
  onResolve?: () => void;
  /** Vuelve a intentar la misma pasada de siempre. */
  onRetry?: () => void;
  /** Aplica la versión que está esperando. */
  onUpdate?: () => void;
  /** En Modo Misa: un icono y dos palabras en una esquina. */
  compact?: boolean;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  online,
  sync,
  canSync,
  update,
  offlineReady = false,
  onResolve,
  onRetry,
  onUpdate,
  compact = false,
}) => {
  // Volver a tener red se dice en el momento, no dentro de dos segundos: aquí
  // no se intenta nada con ella, sólo se cuenta. Y se calla solo.
  const [reconnected, setReconnected] = useState(false);
  useReconnect(() => setReconnected(true), 0);
  useEffect(() => {
    if (!reconnected) return;
    const timer = window.setTimeout(() => setReconnected(false), 4000);
    return () => window.clearTimeout(timer);
  }, [reconnected]);

  const notice = connectionNotice({
    online,
    sync,
    canSync,
    update,
    reconnected,
    offlineReady,
    canResolve: Boolean(onResolve),
  });

  const act: Record<NoticeAction, (() => void) | undefined> = {
    resolve: onResolve,
    retry: onRetry,
    update: onUpdate,
  };
  const run = notice?.action ? act[notice.action.name] : undefined;
  // Sólo se deja pulsar lo que se puede pulsar. Un aviso sin botón no se come
  // el clic de lo que tenga detrás, que estando en una esquina puede ser
  // cualquier cosa de la pantalla.
  const clickable = Boolean(!compact && run);
  const Icon = notice ? ICONS[notice.kind] : null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        compact
          ? 'pointer-events-none fixed bottom-4 right-4 z-[70] print:hidden'
          : 'pointer-events-none fixed inset-x-4 bottom-28 z-50 flex justify-center sm:inset-x-auto sm:right-6 sm:bottom-6 sm:justify-end print:hidden'
      }
    >
      {notice && Icon && (
        <div
          className={
            compact
              ? 'flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/95 px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm backdrop-blur dark:border-dark-700 dark:bg-dark-900/95 dark:text-slate-300'
              : `flex max-w-full items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-700 shadow-lg dark:border-dark-700 dark:bg-dark-900 dark:text-slate-200 ${
                  clickable ? 'pointer-events-auto' : ''
                }`
          }
        >
          <Icon
            aria-hidden
            className={`h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500 ${
              notice.kind === 'syncing' ? 'motion-safe:animate-spin' : ''
            }`}
          />
          <span className="min-w-0 flex-1">{compact ? SHORT[notice.kind] : notice.text}</span>
          {!compact && notice.action && run && (
            <button
              type="button"
              onClick={run}
              className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-[#2464ED] hover:bg-[#EAF1FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 dark:text-sky-400 dark:hover:bg-blue-500/10"
            >
              {notice.action.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
