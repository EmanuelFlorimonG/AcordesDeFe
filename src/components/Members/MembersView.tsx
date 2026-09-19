import React, { useMemo, useState } from 'react';
import { Plus, Users } from 'lucide-react';
import type { MinistryInstrument, MinistryMember, MinistryRole, VocalPart } from '../../types/ministry';
import {
  DEFAULT_MEMBER_FILTERS,
  INSTRUMENT_LABELS,
  MINISTRY_INSTRUMENTS,
  MINISTRY_ROLES,
  ROLE_LABELS,
  VOCAL_PARTS,
  VOCAL_PART_LABELS,
  describeMember,
  filterMembers,
  type MemberFilters,
  type MemberStatusFilter,
} from '../../utils/ministryMembers';
import { ListboxSelect, type ListboxOption } from '../ui/ListboxSelect';
import { SearchField } from '../ui/SearchField';
import { primaryButton } from '../Setlists/ui';
import { MemberAvatar } from './MemberAvatar';

interface MembersViewProps {
  members: MinistryMember[];
  onOpen: (memberId: string) => void;
  onCreate: () => void;
}

const STATUS_OPTIONS: Array<{ value: MemberStatusFilter; label: string }> = [
  { value: 'active', label: 'Activos' },
  { value: 'inactive', label: 'Inactivos' },
  { value: 'all', label: 'Todos' },
];

function optionsFor<T extends string>(values: T[], labels: Record<T, string>, all: string): ListboxOption<T | 'all'>[] {
  return [{ value: 'all', label: all }, ...values.map((value) => ({ value, label: labels[value] }))];
}

const ROLE_OPTIONS = optionsFor<MinistryRole>(MINISTRY_ROLES, ROLE_LABELS, 'Todos los roles');
const INSTRUMENT_OPTIONS = optionsFor<MinistryInstrument>(MINISTRY_INSTRUMENTS, INSTRUMENT_LABELS, 'Todos los instrumentos');
const PART_OPTIONS = optionsFor<VocalPart>(VOCAL_PARTS, VOCAL_PART_LABELS, 'Todas las voces');

/** The people of the ministry: who they are and what they do, easy to find. */
export const MembersView: React.FC<MembersViewProps> = ({ members, onOpen, onCreate }) => {
  const [filters, setFilters] = useState<MemberFilters>(DEFAULT_MEMBER_FILTERS);
  const visible = useMemo(() => filterMembers(members, filters), [members, filters]);
  const set = <K extends keyof MemberFilters>(key: K, value: MemberFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white">Miembros</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Las personas del ministerio: qué hacen, qué tocan y qué voz suelen cantar.
          </p>
        </div>
        <button type="button" onClick={onCreate} className={primaryButton}>
          <Plus className="w-4 h-4" />
          Añadir miembro
        </button>
      </header>

      {members.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <Users className="w-6 h-6 text-[#2464ED]" />
          </div>
          <h2 className="text-base font-bold text-[#10203A] dark:text-white">Aún no hay miembros</h2>
          <p className="mt-1.5 mb-5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Añade a las personas del ministerio para formar el equipo de cada celebración y asignarlas a partes de
            las canciones.
          </p>
          <button type="button" onClick={onCreate} className={primaryButton}>
            <Plus className="w-4 h-4" />
            Añadir el primer miembro
          </button>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center">
            <SearchField
              label="Buscar miembro"
              value={filters.query}
              onChange={(value) => set('query', value)}
              placeholder="Buscar miembro…"
            />
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <ListboxSelect
                size="sm"
                label="Rol"
                value={filters.role ?? 'all'}
                options={ROLE_OPTIONS}
                highlighted={filters.role !== null}
                onChange={(value) => set('role', value === 'all' ? null : (value as MinistryRole))}
              />
              <ListboxSelect
                size="sm"
                label="Instrumento"
                value={filters.instrument ?? 'all'}
                options={INSTRUMENT_OPTIONS}
                highlighted={filters.instrument !== null}
                onChange={(value) => set('instrument', value === 'all' ? null : (value as MinistryInstrument))}
              />
              <ListboxSelect
                size="sm"
                label="Parte vocal"
                value={filters.vocalPart ?? 'all'}
                options={PART_OPTIONS}
                highlighted={filters.vocalPart !== null}
                onChange={(value) => set('vocalPart', value === 'all' ? null : (value as VocalPart))}
              />
              <ListboxSelect
                size="sm"
                label="Estado"
                value={filters.status}
                options={STATUS_OPTIONS}
                highlighted={filters.status !== 'active'}
                onChange={(value) => set('status', value)}
              />
            </div>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {visible.length === 1 ? '1 miembro' : `${visible.length} miembros`}
          </p>

          {visible.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Nadie coincide con esta búsqueda.
            </p>
          ) : (
            <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
              {visible.map((member) => {
                const description = describeMember(member);
                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => onOpen(member.id)}
                      className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-dark-900 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40"
                    >
                      <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#10203A] dark:text-white">
                            {member.name}
                          </span>
                          {!member.isActive && (
                            <span className="shrink-0 rounded-md border border-slate-200 dark:border-dark-700 px-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
                              Inactivo
                            </span>
                          )}
                        </span>
                        {description && (
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{description}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
};
