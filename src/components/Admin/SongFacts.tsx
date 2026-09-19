import React from 'react';
import { ExternalLink } from 'lucide-react';
import { toComparableSong, type SongDraft } from '../../catalog/songDraft';
import { getLiturgicalSeason } from '../../utils/liturgicalSeasons';
import { AdminSectionTitle, adminCard } from './AdminNotice';

interface SongFactsProps {
  draft: SongDraft;
  heading?: string;
  /** 'grid': two columns, for a wide area. 'list': label and value on one line, for a side column. */
  layout?: 'grid' | 'list';
}

/** Everything the song says about itself, as it was sent. Nothing missing is filled in: it says "Sin indicar". */
export const SongFacts: React.FC<SongFactsProps> = ({ draft, heading = 'Información musical', layout = 'grid' }) => {
  const structure = toComparableSong(draft).sections.map((section) => section.label || 'Sin encabezado');
  const youtube = draft.youtubeId ? (
    <a
      href={`https://www.youtube.com/watch?v=${encodeURIComponent(draft.youtubeId)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-mono text-[#2464ED] hover:underline dark:text-sky-400"
    >
      {draft.youtubeId}
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  ) : null;
  const rows: Array<[string, React.ReactNode]> = [
    ['Título', draft.title],
    ['Artista', draft.artist],
    ['Tonalidad', draft.originalKey],
    ['Cejilla recomendada', draft.recommendedCapo === null ? null : String(draft.recommendedCapo)],
    ['BPM', draft.tempo === null ? null : String(draft.tempo)],
    ['Compás', draft.timeSignature],
    ['Patrón rítmico', draft.rhythmPattern],
    ['Categorías', draft.categories.length ? draft.categories.join(', ') : null],
    [
      'Tiempos litúrgicos',
      draft.liturgicalSeasons === null ? null : draft.liturgicalSeasons.length === 0 ? 'Ninguno' : draft.liturgicalSeasons.map((id) => getLiturgicalSeason(id).label).join(', '),
    ],
    ['YouTube', youtube],
    ['Dificultad', draft.difficulty],
    ['Año', draft.year],
    ['Acordes', draft.chordsUsed.length ? draft.chordsUsed.join('  ') : null],
    ['Estructura', structure.length ? structure.join(' · ') : null],
  ];
  const empty = (value: React.ReactNode) => value === null || value === '';
  const shown = (value: React.ReactNode) => (empty(value) ? 'Sin indicar' : value);

  return (
    <section className={`${adminCard} p-4 sm:p-5`}>
      <AdminSectionTitle>{heading}</AdminSectionTitle>
      {layout === 'list' ? (
        <dl className="divide-y divide-slate-100 dark:divide-dark-800">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0">
              <dt className="shrink-0 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className={`min-w-0 break-words text-right text-sm ${empty(value) ? 'italic text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                {shown(value)}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</dt>
              <dd className={`break-words text-sm ${empty(value) ? 'italic text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                {shown(value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
};
