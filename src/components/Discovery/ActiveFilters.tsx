import React from 'react';
import { X } from 'lucide-react';
import type { SpecificSeasonId } from '../../data/liturgicalSeasons';
import { FILTER_GROUPS, getFilterLabel, type FilterGroup, type SongFilters } from '../../utils/songSearch';
import { LiturgicalSeasonDot } from '../Liturgy/LiturgicalSeasonChips';

interface ActiveFiltersProps {
  filters: SongFilters;
  onRemove: (group: FilterGroup, value: string) => void;
  onClear: () => void;
}

const GROUP_NAMES: Record<FilterGroup, string> = {
  categories: 'categoría',
  seasons: 'tiempo litúrgico',
  keys: 'tonalidad',
  artists: 'artista',
};

/** The filters in use, each one removable on its own. */
export const ActiveFilters: React.FC<ActiveFiltersProps> = ({ filters, onRemove, onClear }) => {
  const active = FILTER_GROUPS.flatMap((group) => (filters[group] as string[]).map((value) => ({ group, value })));
  if (active.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros activos" role="group">
      {active.map(({ group, value }) => {
        const label = getFilterLabel(group, value);
        return (
          <button
            key={`${group}:${value}`}
            type="button"
            onClick={() => onRemove(group, value)}
            aria-label={`Quitar filtro de ${GROUP_NAMES[group]}: ${label}`}
            className="group inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 max-w-full pl-2.5 pr-1.5 rounded-lg border border-[#2464ED]/25 bg-[#EAF1FF] dark:bg-blue-500/15 text-[13px] font-semibold text-[#1D4ED8] dark:text-sky-300 hover:border-[#2464ED]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            {group === 'seasons' && <LiturgicalSeasonDot id={value as SpecificSeasonId} />}
            <span className={`truncate ${group === 'keys' ? 'font-mono' : ''}`}>{label}</span>
            <X aria-hidden="true" className="w-3.5 h-3.5 shrink-0 opacity-60 group-hover:opacity-100" />
          </button>
        );
      })}
      <button
        type="button"
        onClick={onClear}
        className="h-8 [@media(pointer:coarse)]:h-10 px-2 rounded-lg text-[13px] font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        Limpiar filtros
      </button>
    </div>
  );
};
