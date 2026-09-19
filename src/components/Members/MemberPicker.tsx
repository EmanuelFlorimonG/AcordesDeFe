import React, { useId, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { MinistryMember } from '../../types/ministry';
import { normalizeText } from '../../utils/normalizeText';
import { describeMember, sortMembers } from '../../utils/ministryMembers';
import { MemberAvatar } from './MemberAvatar';
import { SearchField } from '../ui/SearchField';

export interface MemberPickerGroup {
  /** Shown above the group, e.g. "Equipo de esta celebración" */
  title?: string;
  members: MinistryMember[];
}

interface MemberPickerProps {
  /** Accessible name of the list */
  label: string;
  groups: MemberPickerGroup[];
  selectedIds: string[];
  onToggle: (memberId: string) => void;
  /** Adds an "(inactive)" switch; inactive people already selected are always listed */
  allowInactiveToggle?: boolean;
  /** A short hint next to people outside the first group, e.g. "Se añade al equipo" */
  outsideHint?: string;
}

/**
 * Choosing people: a search, a list, a check on each chosen one. Inactive
 * members are hidden unless asked for, except the ones already chosen: nobody
 * disappears silently from where they were.
 */
export const MemberPicker: React.FC<MemberPickerProps> = ({
  label,
  groups,
  selectedIds,
  onToggle,
  allowInactiveToggle = true,
  outsideHint,
}) => {
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const inactiveId = useId();

  const visibleGroups = useMemo(() => {
    const typed = normalizeText(query.trim());
    return groups.map((group) => ({
      ...group,
      members: sortMembers(
        group.members.filter(
          (member) =>
            (member.isActive || showInactive || selectedIds.includes(member.id)) &&
            (!typed || normalizeText(member.name).includes(typed))
        )
      ),
    }));
  }, [groups, query, showInactive, selectedIds]);

  const total = visibleGroups.reduce((sum, group) => sum + group.members.length, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchField label="Buscar miembro" value={query} onChange={setQuery} placeholder="Buscar miembro…" />
        {allowInactiveToggle && (
          <label htmlFor={inactiveId} className="flex items-center gap-2 h-10 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer">
            <input
              id={inactiveId}
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
              className="w-4 h-4 rounded accent-[#2464ED]"
            />
            Mostrar inactivos
          </label>
        )}
      </div>

      <div role="group" aria-label={label} className="mt-2 space-y-3">
        {visibleGroups.map((group, groupIndex) =>
          group.members.length === 0 ? null : (
            <div key={group.title ?? groupIndex}>
              {group.title && (
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                  {group.title}
                </p>
              )}
              <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
                {group.members.map((member) => {
                  const isSelected = selectedIds.includes(member.id);
                  const description = describeMember(member);
                  return (
                    <li key={member.id}>
                      <button
                        type="button"
                        onClick={() => onToggle(member.id)}
                        aria-pressed={isSelected}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-[44px] text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 ${
                          isSelected ? 'bg-[#EAF1FF] dark:bg-blue-500/10' : 'hover:bg-slate-50 dark:hover:bg-dark-800'
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-5 h-5 shrink-0 flex items-center justify-center rounded-md border ${
                            isSelected
                              ? 'border-[#2464ED] bg-[#2464ED] text-white'
                              : 'border-slate-300 dark:border-dark-600'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </span>
                        <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                              {member.name}
                            </span>
                            {!member.isActive && (
                              <span className="shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                                Inactivo
                              </span>
                            )}
                          </span>
                          {description && (
                            <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{description}</span>
                          )}
                          {groupIndex > 0 && outsideHint && !isSelected && (
                            <span className="block text-[11px] text-slate-400 dark:text-slate-500">{outsideHint}</span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )
        )}
        {total === 0 && (
          <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
            {query ? 'Nadie coincide con esta búsqueda.' : 'No hay miembros activos. Añádelos desde Miembros.'}
          </p>
        )}
      </div>
    </div>
  );
};
