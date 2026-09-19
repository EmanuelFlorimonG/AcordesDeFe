import React, { useState } from 'react';
import { ArrowLeft, CloudOff, RotateCcw } from 'lucide-react';
import type { CatalogSnapshot } from '../../catalog/catalogStore';
import { secondaryButton } from '../Setlists/ui';

const savedOn = (iso: string | null) => {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('es', { day: 'numeric', month: 'long' }).format(date);
};

/**
 * Said once, quietly, on the songbook when Supabase could not be reached: the
 * songs shown are the saved copy or the bundled ones, not the current catalog.
 */
export const CatalogFallbackNotice: React.FC<{ catalog: CatalogSnapshot; onRetry: () => Promise<void> }> = ({ catalog, onRetry }) => {
  const [retrying, setRetrying] = useState(false);
  if (catalog.remote !== 'failed' || catalog.source === 'remote') return null;
  const date = savedOn(catalog.savedAt);
  return (
    <div role="status" className="mx-5 mt-5 flex flex-wrap items-center gap-x-3 sm:mx-10 sm:mt-6 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-600 dark:border-dark-700 dark:bg-dark-900 dark:text-slate-300">
      <CloudOff aria-hidden="true" className="h-4 w-4 shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        Sin conexión con el catálogo.{' '}
        {catalog.source === 'cache' ? `Mostrando el guardado${date ? ` el ${date}` : ''}.` : 'Mostrando el catálogo incluido en la app.'}
      </span>
      <button
        type="button"
        disabled={retrying}
        onClick={async () => {
          setRetrying(true);
          await onRetry();
          setRetrying(false);
        }}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-[#2464ED] hover:bg-[#EAF1FF] disabled:opacity-60 dark:text-sky-400 dark:hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        <RotateCcw aria-hidden="true" className={`h-3.5 w-3.5 ${retrying ? 'motion-safe:animate-spin' : ''}`} />
        Reintentar
      </button>
    </div>
  );
};

/**
 * A song this device has never received and can't check now (no connection
 * and no saved copy with it). It is said plainly: the song may exist.
 */
export const SongUnavailableScreen: React.FC<{ songId: string | null; onRetry: () => Promise<void>; onBack: () => void }> = ({ songId, onRetry, onBack }) => {
  const [retrying, setRetrying] = useState(false);
  return (
    <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        Cancionero
      </button>
      <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-dark-700 dark:bg-dark-900">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-dark-800 dark:text-slate-400">
          <CloudOff aria-hidden="true" className="h-5 w-5" />
        </span>
        <h1 className="text-lg font-bold text-[#10203A] dark:text-white">No disponible sin conexión</h1>
        <p role="alert" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Esta canción todavía no está guardada en este dispositivo y ahora no se puede consultar el catálogo. Vuelve a intentarlo con internet.
        </p>
        {songId && <p className="mt-2 font-mono text-xs text-slate-400">{songId}</p>}
        <button
          type="button"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            await onRetry();
            setRetrying(false);
          }}
          className={`${secondaryButton} mt-5`}
        >
          <RotateCcw aria-hidden="true" className={`h-4 w-4 ${retrying ? 'motion-safe:animate-spin' : ''}`} />
          Reintentar
        </button>
      </div>
    </div>
  );
};
