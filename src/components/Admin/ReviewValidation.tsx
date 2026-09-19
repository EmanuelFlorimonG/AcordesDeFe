import React from 'react';
import { CircleCheck, CircleX, TriangleAlert } from 'lucide-react';
import type { SongValidationResult } from '../../catalog/validateSongDraft';
import { AdminSectionTitle, adminCard } from './AdminNotice';

/**
 * validateSongDraft, run again on what is stored: the reviewer never relies
 * on the sender's browser having checked it. Errors first, then warnings,
 * each with its line when it has one.
 */
export const ReviewValidation: React.FC<{ result: SongValidationResult }> = ({ result }) => {
  const clean = result.errors.length === 0 && result.warnings.length === 0;
  return (
    <section id="validacion" aria-labelledby="validacion-titulo" className={`${adminCard} scroll-mt-20 p-4 sm:p-5 lg:scroll-mt-6`}>
      <AdminSectionTitle id="validacion-titulo">Validación</AdminSectionTitle>
      {clean && (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          <CircleCheck aria-hidden="true" className="h-4 w-4" />
          Sin errores ni avisos.
        </p>
      )}
      {result.errors.length > 0 && (
        <div className="rounded-xl bg-red-50 px-3 py-2.5 dark:bg-red-500/10">
          <p className="mb-1.5 text-xs font-bold text-red-700 dark:text-red-300">
            {result.errors.length} {result.errors.length === 1 ? 'error' : 'errores'}: no se puede publicar así
          </p>
          <ul className="space-y-1">
            {result.errors.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="flex items-start gap-1.5 text-sm text-red-800 dark:text-red-200">
                <CircleX aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{issue.line ? `${issue.message} (línea ${issue.line})` : issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {result.warnings.length > 0 && (
        <div className={`rounded-xl bg-amber-50 px-3 py-2.5 dark:bg-amber-500/10 ${result.errors.length > 0 ? 'mt-2.5' : ''}`}>
          <p className="mb-1.5 text-xs font-bold text-amber-800 dark:text-amber-300">
            {result.warnings.length} {result.warnings.length === 1 ? 'aviso' : 'avisos'}: revisar, no impiden publicar
          </p>
          <ul className="space-y-1">
            {result.warnings.map((issue, index) => (
              <li key={`${issue.code}-${index}`} className="flex items-start gap-1.5 text-sm text-amber-900 dark:text-amber-200">
                <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{issue.line ? `${issue.message} (línea ${issue.line})` : issue.message}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};
