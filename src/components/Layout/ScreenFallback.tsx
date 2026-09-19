import React from 'react';
import { LoaderCircle } from 'lucide-react';

/**
 * What shows for the moment a screen takes to arrive: the shape of a page
 * (title, a line, a few rows), quiet, in both themes. Screen readers hear
 * "Cargando…" once.
 */
export const ScreenFallback: React.FC = () => (
  <div role="status" aria-live="polite" className="w-full px-5 sm:px-10 py-6 sm:py-8">
    <span className="sr-only">Cargando…</span>
    <div aria-hidden="true" className="motion-safe:animate-pulse">
      <div className="h-8 w-48 max-w-full rounded-lg bg-slate-100 dark:bg-dark-800" />
      <div className="mt-3 h-4 w-72 max-w-full rounded bg-slate-100 dark:bg-dark-800" />
      <div className="mt-8 space-y-2">
        <div className="h-14 rounded-xl bg-slate-100 dark:bg-dark-800" />
        <div className="h-14 rounded-xl bg-slate-100 dark:bg-dark-800" />
        <div className="h-14 rounded-xl bg-slate-100 dark:bg-dark-800" />
      </div>
    </div>
  </div>
);

/** For full-screen modes (Mass mode, rehearsal): the backdrop they open on, so nothing flashes behind. */
export const FullScreenFallback: React.FC = () => (
  <div role="status" aria-live="polite" className="fixed inset-0 z-[60] flex items-center justify-center bg-white dark:bg-dark-950">
    <span className="text-sm text-slate-400 dark:text-slate-500">Cargando…</span>
  </div>
);

/** A song the address asks for that is not in the catalog shown yet, while Supabase answers. */
export const SongPendingScreen: React.FC = () => (
  <div role="status" aria-live="polite" className="flex items-center justify-center gap-2 px-5 py-20 text-sm text-slate-500 dark:text-slate-400">
    <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
    Cargando canción…
  </div>
);
