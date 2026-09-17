import React from 'react';
import { CalendarRange } from 'lucide-react';
import type { SpecificSeasonId } from '../../data/liturgicalSeasons';
import { SEASON_FILTER_OPTIONS, getLiturgicalSeason } from '../../utils/liturgicalSeasons';
import { ListboxSelect, type ListboxOption } from '../ui/ListboxSelect';
import { LiturgicalSeasonDot } from './LiturgicalSeasonChips';

interface LiturgicalSeasonSelectProps {
  value: SpecificSeasonId | null;
  onChange: (season: SpecificSeasonId | null) => void;
  /** Songs that fit each season, "Todo el año" included; `all` for no filter */
  counts: Record<SpecificSeasonId | 'all', number>;
  className?: string;
}

/**
 * Chooses a liturgical season to filter by. Each option carries the season's
 * colour dot and how many songs fit it, so the choice is informed at a glance.
 */
export const LiturgicalSeasonSelect: React.FC<LiturgicalSeasonSelectProps> = ({
  value,
  onChange,
  counts,
  className = '',
}) => {
  const options: Array<ListboxOption<SpecificSeasonId | null>> = [
    {
      value: null,
      label: 'Todos los tiempos',
      leading: <CalendarRange className="w-4 h-4 text-slate-400" />,
      trailing: counts.all,
    },
    ...SEASON_FILTER_OPTIONS.map((season, index) => {
      const id = season.id as SpecificSeasonId;
      return {
        value: id,
        label: season.label,
        leading: <LiturgicalSeasonDot id={id} className="w-2.5 h-2.5" />,
        trailing: counts[id],
        separated: index === 0,
      };
    }),
  ];

  return (
    <ListboxSelect
      value={value}
      options={options}
      onChange={onChange}
      label="Tiempo litúrgico"
      highlighted={value !== null}
      panelMinWidth={256}
      className={className}
      renderTrigger={(selected) => (
        <>
          {selected.leading}
          <span className={`min-w-0 flex-1 truncate ${value ? 'font-semibold' : ''}`}>{selected.label}</span>
        </>
      )}
      footer={`Cada tiempo incluye también las canciones de ${getLiturgicalSeason('todo-el-ano').label}.`}
    />
  );
};
