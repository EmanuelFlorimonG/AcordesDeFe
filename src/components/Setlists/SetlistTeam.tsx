import React, { useState } from 'react';
import { UserX, Users } from 'lucide-react';
import type { MinistryMember } from '../../types/ministry';
import { describeMember, sortMembers } from '../../utils/ministryMembers';
import { MemberAvatar } from '../Members/MemberAvatar';
import { MemberPicker } from '../Members/MemberPicker';
import { Dialog } from './Dialog';
import { primaryButton, secondaryButton, sectionHeading } from './ui';

interface SetlistTeamProps {
  participantIds: string[];
  members: MinistryMember[];
  membersById: Map<string, MinistryMember>;
  onSave: (memberIds: string[]) => void;
  onGoToMembers: () => void;
}

/**
 * Who takes part in this celebration. The setlist keeps only ids, so a
 * renamed member shows the new name here, an inactive one says so, and one
 * that was deleted is simply no longer listed.
 */
export const SetlistTeam: React.FC<SetlistTeamProps> = ({
  participantIds,
  members,
  membersById,
  onSave,
  onGoToMembers,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<string[]>([]);
  const team = sortMembers(
    participantIds.map((id) => membersById.get(id)).filter((member): member is MinistryMember => Boolean(member))
  );

  const open = () => {
    setDraft(participantIds.filter((id) => membersById.has(id)));
    setIsEditing(true);
  };

  return (
    <section aria-labelledby="setlist-equipo" className="mb-6">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="setlist-equipo" className={sectionHeading}>
          Equipo
        </h2>
        {members.length > 0 && (
          <button
            type="button"
            onClick={open}
            className="inline-flex items-center gap-1.5 h-9 px-2.5 -mr-2.5 rounded-lg text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
          >
            <Users className="w-4 h-4" />
            Gestionar equipo
          </button>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Todavía no hay miembros registrados.{' '}
          <button type="button" onClick={onGoToMembers} className="font-semibold text-[#2464ED] dark:text-sky-400 hover:underline">
            Añadir miembros
          </button>
        </p>
      ) : team.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Nadie elegido todavía para esta celebración.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {team.map((member) => {
            const description = describeMember(member);
            return (
              <li
                key={member.id}
                className="flex min-w-0 max-w-full items-center gap-2.5 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 py-1.5 pl-1.5 pr-3"
              >
                <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} size="sm" />
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name}</span>
                    {!member.isActive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                        <UserX aria-hidden="true" className="w-3 h-3" />
                        Inactivo
                      </span>
                    )}
                  </span>
                  {description && (
                    <span className="block max-w-[16rem] truncate text-[11px] text-slate-500 dark:text-slate-400">{description}</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {isEditing && (
        <Dialog
          title="Equipo de esta celebración"
          description="Elige quién participa. Los miembros inactivos solo aparecen si ya estaban o si los muestras."
          onClose={() => setIsEditing(false)}
          onSubmit={() => {
            onSave(draft);
            setIsEditing(false);
          }}
          footer={
            <>
              <button type="button" onClick={() => setIsEditing(false)} className={secondaryButton}>
                Cancelar
              </button>
              <button type="submit" className={primaryButton}>
                Guardar equipo
              </button>
            </>
          }
        >
          <p role="status" aria-live="polite" className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {draft.length === 1 ? '1 persona elegida' : `${draft.length} personas elegidas`}
          </p>
          <MemberPicker
            label="Miembros del ministerio"
            groups={[{ members }]}
            selectedIds={draft}
            onToggle={(id) =>
              setDraft((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
            }
          />
        </Dialog>
      )}
    </section>
  );
};
