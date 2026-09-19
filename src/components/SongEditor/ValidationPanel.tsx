import React from 'react';
import { CircleCheck, CircleDashed, CircleX, TriangleAlert } from 'lucide-react';
import type { SongValidationResult } from '../../catalog/validateSongDraft';
import type { EditorIssue, SongMeta } from '../../editor/songEditorModel';
import { sectionHeading } from '../Setlists/ui';

interface ValidationPanelProps {
  meta: SongMeta;
  song: SongValidationResult;
  editor: EditorIssue[];
  onGoToSection: (sectionId: string) => void;
}

type Row = { state: 'ok' | 'error' | 'optional'; label: string };

/**
 * What stands between the draft and sending it. Errors must be fixed;
 * warnings are shown so the author can decide; optional fields left empty
 * are simply said, never filled in.
 */
export const ValidationPanel: React.FC<ValidationPanelProps> = ({ meta, song, editor, onGoToSection }) => {
  const has = (codes: string[]) => song.errors.some((issue) => codes.includes(issue.code));
  const editorErrors = editor.filter((issue) => issue.severity === 'error');
  const editorWarnings = editor.filter((issue) => issue.severity === 'warning' && issue.code !== 'chord-unrecognized');
  // Unknown chords come from both checks; the song-level ones already say which chord.
  const warnings = [
    // An empty section is already an error of the editor, said once, where it is.
    ...song.warnings.filter((issue) => issue.code !== 'empty-section' || !editorErrors.some((entry) => entry.code === 'section-empty')).map((issue) => ({ key: `${issue.code}-${issue.line ?? ''}-${issue.message}`, message: issue.message, sectionId: null as string | null })),
    ...editorWarnings.map((issue) => ({ key: `${issue.code}-${issue.lineId}`, message: issue.message, sectionId: issue.sectionId })),
  ];
  const errors = [
    ...song.errors.map((issue) => ({ key: `${issue.code}-${issue.line ?? ''}`, message: issue.line ? `${issue.message} (línea ${issue.line} del texto)` : issue.message, sectionId: null as string | null })),
    ...editorErrors.map((issue) => ({ key: `${issue.code}-${issue.sectionId}`, message: issue.message, sectionId: issue.sectionId })),
  ];

  const rows: Row[] = [
    { state: has(['title-required', 'title-too-long']) ? 'error' : 'ok', label: 'Título' },
    { state: has(['content-required', 'content-too-long', 'unbalanced-brackets']) ? 'error' : 'ok', label: 'Letra' },
    { state: editorErrors.length > 0 ? 'error' : 'ok', label: 'Secciones' },
    { state: has(['original-key-invalid']) ? 'error' : meta.originalKey ? 'ok' : 'optional', label: meta.originalKey ? `Tonalidad: ${meta.originalKey}` : 'Tonalidad sin indicar' },
    { state: has(['tempo-invalid']) ? 'error' : meta.tempo ? 'ok' : 'optional', label: meta.tempo ? `BPM: ${meta.tempo}` : 'BPM sin indicar' },
    { state: meta.artist ? 'ok' : 'optional', label: meta.artist ? 'Artista' : 'Artista sin indicar' },
  ];
  const ok = errors.length === 0;

  return (
    <section aria-labelledby="revision-previa" className="rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-4 shadow-sm">
      <h2 id="revision-previa" className={`${sectionHeading} mb-3`}>
        Antes de enviar
      </h2>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center gap-2 text-sm">
            {row.state === 'ok' ? (
              <CircleCheck aria-hidden="true" className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            ) : row.state === 'error' ? (
              <CircleX aria-hidden="true" className="w-4 h-4 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <CircleDashed aria-hidden="true" className="w-4 h-4 shrink-0 text-slate-400" />
            )}
            <span className={row.state === 'optional' ? 'text-slate-500 dark:text-slate-400' : 'text-slate-800 dark:text-slate-100'}>
              {row.label}
              <span className="sr-only">{row.state === 'ok' ? ': correcto' : row.state === 'error' ? ': hay que corregirlo' : ': opcional'}</span>
            </span>
          </li>
        ))}
      </ul>

      {errors.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-red-600 dark:text-red-400">Hay que corregir</p>
          <ul className="space-y-1">
            {errors.map((issue) => (
              <li key={issue.key} className="flex items-start gap-1.5 text-sm text-red-700 dark:text-red-300">
                <CircleX aria-hidden="true" className="mt-0.5 w-4 h-4 shrink-0" />
                <span>
                  {issue.message}
                  {issue.sectionId && (
                    <button type="button" onClick={() => onGoToSection(issue.sectionId as string)} className="ml-1.5 font-semibold underline underline-offset-2">
                      Ir a la sección
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-4">
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.1em] text-amber-700 dark:text-amber-400">Para revisar (no impide enviar)</p>
          <ul className="space-y-1">
            {warnings.map((issue) => (
              <li key={issue.key} className="flex items-start gap-1.5 text-sm text-amber-800 dark:text-amber-300">
                <TriangleAlert aria-hidden="true" className="mt-0.5 w-4 h-4 shrink-0" />
                <span>
                  {issue.message}
                  {issue.sectionId && (
                    <button type="button" onClick={() => onGoToSection(issue.sectionId as string)} className="ml-1.5 font-semibold underline underline-offset-2">
                      Ir a la sección
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {ok ? 'Sin errores: la canción se puede enviar.' : `${errors.length} ${errors.length === 1 ? 'error' : 'errores'} por corregir.`}
      </p>
    </section>
  );
};
