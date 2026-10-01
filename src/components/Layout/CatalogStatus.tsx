import React, { useState } from 'react';
import { ArrowLeft, CloudOff, RotateCcw, Search } from 'lucide-react';
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
 * Por qué no se puede abrir una canción.
 *
 * Son dos cosas distintas y se dicen distinto. Que este dispositivo no la
 * tenga y ahora no pueda preguntar es una pausa: con internet vuelve. Que el
 * cancionero haya contestado y no esté es otra cosa, y entonces no hay nada
 * que reintentar, sólo volver a buscar.
 *
 * El id interno no se enseña. A quien mira no le dice nada, y desde que hay
 * canciones retiradas puede aparecer en un Setlist viejo sin que sea culpa de
 * nadie.
 */
export type UnavailableReason = 'offline' | 'missing';

const UNAVAILABLE_COPY: Record<UnavailableReason, { title: string; detail: string }> = {
  offline: {
    title: 'No disponible sin conexión',
    detail:
      'Esta canción todavía no está guardada en este dispositivo y ahora no se puede consultar el catálogo. Vuelve a intentarlo con internet.',
  },
  missing: {
    title: 'No encontramos esta canción',
    detail:
      'Puede que se haya retirado del cancionero o que el enlace esté equivocado. Busca por su nombre y la encuentras si sigue estando.',
  },
};

export const SongUnavailableScreen: React.FC<{
  reason?: UnavailableReason;
  onRetry: () => Promise<void>;
  onBack: () => void;
}> = ({ reason = 'offline', onRetry, onBack }) => {
  const [retrying, setRetrying] = useState(false);
  const copy = UNAVAILABLE_COPY[reason];
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
        <h1 className="text-lg font-bold text-[#10203A] dark:text-white">{copy.title}</h1>
        <p role="alert" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          {copy.detail}
        </p>
        {reason === 'offline' ? (
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
        ) : (
          <button type="button" onClick={onBack} className={`${secondaryButton} mt-5`}>
            <Search aria-hidden="true" className="h-4 w-4" />
            Buscar en el cancionero
          </button>
        )}
      </div>
    </div>
  );
};
