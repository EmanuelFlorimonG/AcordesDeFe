import React, { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import { formatSetlistDate, formatSongCount, groupSetlistsByDate } from '../../utils/setlists';
import { normalizeText } from '../../utils/normalizeText';
import { SearchField } from '../ui/SearchField';

interface SetlistPickerListProps {
  setlists: Setlist[];
  selectedId: string | null;
  onSelect: (setlistId: string | null) => void;
  todayIso: string;
}

/**
 * Choosing the repertoire of an activity: coming setlists first, then the
 * rest, as on the Setlists page. "Sin repertorio" is a real choice: a meeting
 * doesn't need songs.
 */
export const SetlistPickerList: React.FC<SetlistPickerListProps> = ({ setlists, selectedId, onSelect, todayIso }) => {
  const [query, setQuery] = useState('');
  const ordered = useMemo(() => {
    const { upcoming, recent } = groupSetlistsByDate(setlists, todayIso);
    const typed = normalizeText(query.trim());
    return [...upcoming, ...recent].filter((setlist) => !typed || normalizeText(setlist.name).includes(typed));
  }, [setlists, todayIso, query]);

  const row = (id: string | null, title: string, detail: string) => {
    const isSelected = selectedId === id;
    return (
      <li key={id ?? 'none'}>
        <button
          type="button"
          onClick={() => onSelect(id)}
          aria-pressed={isSelected}
          className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 ${
            isSelected ? 'bg-[#EAF1FF] dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-dark-800'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</span>
            {detail && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{detail}</span>}
          </span>
          {isSelected && <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-[#2464ED] dark:text-sky-400" />}
        </button>
      </li>
    );
  };

  return (
    <div>
      {setlists.length > 5 && (
        <div className="mb-2">
          <SearchField label="Buscar Setlist" value={query} onChange={setQuery} placeholder="Buscar Setlist…" />
        </div>
      )}
      <ul
        aria-label="Setlists"
        className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800"
      >
        {row(null, 'Sin repertorio', 'La actividad no tiene canciones asignadas')}
        {ordered.map((setlist) =>
          row(
            setlist.id,
            setlist.name,
            [setlist.date ? formatSetlistDate(setlist.date) : '', formatSongCount(setlist.items.length)].filter(Boolean).join(' · ')
          )
        )}
      </ul>
    </div>
  );
};
