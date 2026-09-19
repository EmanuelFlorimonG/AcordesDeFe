import React, { useId, useState } from 'react';
import type { MinistryMember } from '../../types/ministry';
import type { PerformanceParticipant, PerformanceRecord } from '../../types/performance';
import { isSameKey, keyOptionsFor } from '../../utils/keyPreferences';
import { sortMembers } from '../../utils/ministryMembers';
import { MAX_PERFORMANCE_NOTES_LENGTH, type PerformanceChanges } from '../../utils/performanceHistory';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, sectionHeading, textField } from '../Setlists/ui';

interface EditPerformanceDialogProps {
  record: PerformanceRecord;
  /** The ministry now, to add someone who was left out of the record */
  members: MinistryMember[];
  onSubmit: (changes: PerformanceChanges) => void;
  onClose: () => void;
}

/**
 * A conscious correction of what was recorded: which songs were sung, in
 * which key, who was there, and the notes. It never reads the setlist again.
 * Who sang each block of an arrangement is kept as recorded; correcting that
 * would need the whole arrangement editor, and is left for later.
 */
export const EditPerformanceDialog: React.FC<EditPerformanceDialogProps> = ({ record, members, onSubmit, onClose }) => {
  const [performed, setPerformed] = useState(() => record.songs.filter((song) => song.performed).map((song) => song.id));
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [people, setPeople] = useState<string[]>(() => record.participants.map((entry) => entry.memberId));
  const [notes, setNotes] = useState(record.notes);
  const [error, setError] = useState('');
  const notesId = useId();

  // Those recorded that day, as recorded, then anyone of the ministry who isn't there yet.
  const recorded = new Map(record.participants.map((entry) => [entry.memberId, entry]));
  const candidates: PerformanceParticipant[] = [
    ...record.participants,
    ...sortMembers(members.filter((member) => member.isActive && !recorded.has(member.id))).map((member) => ({
      memberId: member.id,
      name: member.name,
      roles: [...member.roles],
    })),
  ];

  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);

  return (
    <Dialog
      title="Editar registro"
      description="Corrige lo que se registró. El Setlist y los miembros no cambian."
      size="lg"
      onClose={onClose}
      onSubmit={() => {
        if (performed.length === 0) {
          setError('Marca al menos una canción. Si no se interpretó ninguna, elimina el registro.');
          return;
        }
        onSubmit({
          performedSongIds: performed,
          keys,
          participants: candidates.filter((entry) => people.includes(entry.memberId)),
          notes,
        });
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            Guardar cambios
          </button>
        </>
      }
    >
      <h3 className={`${sectionHeading} mb-2`}>Canciones</h3>
      <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
        {record.songs.map((song) => {
          const checked = performed.includes(song.id);
          const current = keys[song.id] ?? song.key;
          const options = current ? keyOptionsFor(current) : [];
          const shown = current && !options.some((option) => isSameKey(option, current)) ? [current, ...options] : options;
          return (
            <li key={song.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 min-h-[48px]">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    setPerformed((list) => toggle(list, song.id));
                    setError('');
                  }}
                  className="w-5 h-5 shrink-0 rounded accent-[#2464ED]"
                />
                <span className="min-w-0">
                  {song.moment && (
                    <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                      {song.moment}
                    </span>
                  )}
                  <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{song.title}</span>
                </span>
              </label>
              {current && (
                <select
                  aria-label={`Tonalidad de ${song.title}`}
                  value={shown.find((option) => isSameKey(option, current)) ?? current}
                  onChange={(event) => setKeys((map) => ({ ...map, [song.id]: event.target.value }))}
                  className="h-10 [@media(pointer:coarse)]:h-11 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-2 font-mono text-sm text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
                >
                  {shown.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
        La tonalidad es la que sonó. Con cejilla, los acordes se ajustan solos. Quién cantó cada parte del arreglo se
        conserva tal como se registró.
      </p>

      <h3 className={`${sectionHeading} mt-5 mb-2`}>Equipo</h3>
      {candidates.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No hay miembros que añadir.</p>
      ) : (
        <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
          {candidates.map((entry) => (
            <li key={entry.memberId}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 min-h-[44px]">
                <input
                  type="checkbox"
                  checked={people.includes(entry.memberId)}
                  onChange={() => setPeople((list) => toggle(list, entry.memberId))}
                  className="w-5 h-5 shrink-0 rounded accent-[#2464ED]"
                />
                <span className="min-w-0 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{entry.name}</span>
                {!recorded.has(entry.memberId) && (
                  <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">no estaba registrado</span>
                )}
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <label htmlFor={notesId} className={fieldLabel}>
          Notas del registro
        </label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={MAX_PERFORMANCE_NOTES_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          className={textField}
        />
      </div>
    </Dialog>
  );
};
