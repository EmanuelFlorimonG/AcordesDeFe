import React from 'react';
import type { DiffLine, SongComparison } from '../../admin/songDiff';
import { AdminSectionTitle, adminCard } from './AdminNotice';

const CHANGE_LABELS = { added: 'Nueva', removed: 'Eliminada', changed: 'Modificada', same: 'Sin cambios' } as const;

const Lines: React.FC<{ lines: DiffLine[] | null; side: 'before' | 'after'; label: string }> = ({ lines, side, label }) =>
  lines === null ? (
    <p className="text-xs italic text-slate-400 dark:text-slate-500">No existe en {label.toLowerCase()}</p>
  ) : (
    <ol className="space-y-0.5 font-mono text-[13px] leading-relaxed">
      {lines.map((line, index) => (
        <li
          key={index}
          className={`whitespace-pre-wrap break-words rounded px-1.5 ${
            line.changed
              ? side === 'before'
                ? 'bg-red-50 text-red-900 dark:bg-red-500/10 dark:text-red-200'
                : 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
              : 'text-slate-700 dark:text-slate-300'
          }`}
        >
          {line.changed && <span className="sr-only">{side === 'before' ? 'Antes: ' : 'Ahora: '}</span>}
          {line.text || ' '}
        </li>
      ))}
    </ol>
  );

/**
 * PUBLICADA | PROPUESTA: metadata, then each section with its lines. Changes
 * are marked in words, not colour alone. The two sides can be renamed, to
 * compare the version a proposal was made on with the proposal itself, or
 * with what is published now.
 */
export const SongComparisonView: React.FC<{
  comparison: SongComparison;
  title?: string;
  /** What the left side is called ("Publicada" by default) */
  beforeLabel?: string;
  /** What the right side is called ("Propuesta" by default) */
  afterLabel?: string;
  /** Said when both sides are the same */
  identicalText?: string;
}> = ({
  comparison,
  title = 'Cambios frente a la versión publicada',
  beforeLabel = 'Publicada',
  afterLabel = 'Propuesta',
  identicalText = 'La propuesta es idéntica a la versión publicada.',
}) => {
  const changedSections = comparison.sections.filter((section) => section.change !== 'same');
  return (
    <section className={`${adminCard} p-4 sm:p-5`}>
      <AdminSectionTitle>{title}</AdminSectionTitle>
      {comparison.identical && <p className="text-sm text-slate-600 dark:text-slate-300">{identicalText}</p>}

      {comparison.fields.length > 0 && (
        <div className="mb-5 overflow-hidden rounded-lg border border-slate-200 dark:border-dark-800">
          <div className="hidden grid-cols-[10rem_1fr_1fr] gap-3 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-500 dark:bg-dark-800 dark:text-slate-400 sm:grid">
            <span>Dato</span>
            <span>{beforeLabel}</span>
            <span>{afterLabel}</span>
          </div>
          <ul>
            {comparison.fields.map((field) => (
              <li key={field.field} className="grid gap-1 border-t border-slate-100 px-3 py-2 text-sm first:border-t-0 dark:border-dark-800 sm:grid-cols-[10rem_1fr_1fr] sm:gap-3">
                <span className="font-semibold text-slate-700 dark:text-slate-200">{field.label}</span>
                <span className="text-slate-500 line-through decoration-red-400 dark:text-slate-400">
                  <span className="text-xs font-semibold text-slate-400 no-underline sm:sr-only">{beforeLabel}: </span>
                  {field.before || 'Sin indicar'}
                </span>
                <span className="text-slate-900 dark:text-white">
                  <span className="text-xs font-semibold text-slate-400 sm:sr-only">{afterLabel}: </span>
                  {field.after || 'Sin indicar'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {comparison.orderChanged && (
        <div className="mb-5 text-sm">
          <p className="font-semibold text-slate-700 dark:text-slate-200">Cambia el orden de las secciones</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">{beforeLabel}: {comparison.orderBefore.join(' · ')}</p>
          <p className="text-slate-800 dark:text-slate-100">{afterLabel}: {comparison.orderAfter.join(' · ')}</p>
        </div>
      )}

      {changedSections.length > 0 && (
        <ul className="space-y-4">
          {changedSections.map((section) => (
            <li key={`${section.change}-${section.key}`} className="rounded-lg border border-slate-200 dark:border-dark-800">
              <p className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 dark:border-dark-800 dark:text-slate-100">
                {section.label}
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-dark-800 dark:text-slate-300">
                  {CHANGE_LABELS[section.change]}
                  {section.change === 'changed' &&
                    ` · ${[section.lyricsChanged && 'letra', section.chordsChanged && 'acordes'].filter(Boolean).join(' y ')}`}
                </span>
              </p>
              <div className="grid gap-3 p-3 md:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{beforeLabel}</p>
                  <Lines lines={section.before} side="before" label={beforeLabel} />
                </div>
                <div>
                  <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{afterLabel}</p>
                  <Lines lines={section.after} side="after" label={afterLabel} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
