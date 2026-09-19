import React from 'react';
import { useMinistryData } from '../../hooks/ministryContext';
import { preferencesForSong } from '../../utils/keyPreferences';
import { sortMembers } from '../../utils/ministryMembers';

/**
 * The keys members of the ministry usually sing this song in. Only there when
 * someone has one saved: a song nobody has a preference for shows nothing.
 */
export const TeamKeysCard: React.FC<{ songId: string }> = ({ songId }) => {
  const { membersById, keyPreferences } = useMinistryData();
  const preferences = preferencesForSong(keyPreferences, songId, new Set(membersById.keys()));
  if (preferences.length === 0) return null;

  const rows = sortMembers(preferences.map((entry) => membersById.get(entry.memberId)!)).map((member) => ({
    member,
    key: preferences.find((entry) => entry.memberId === member.id)!.key,
  }));

  return (
    <div className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg p-4">
      <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-3">
        Tonalidades del equipo
      </h3>
      <ul className="space-y-1.5">
        {rows.map(({ member, key }) => (
          <li key={member.id} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">
              {member.name}
              {!member.isActive && <span className="ml-1.5 text-[11px] text-slate-400">(inactivo)</span>}
            </span>
            <span className="shrink-0 font-mono font-bold text-blue-600 dark:text-sky-400">{key}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};
