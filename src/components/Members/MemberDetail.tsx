import React, { useState } from 'react';
import { ArrowLeft, MoreHorizontal, Pencil, Plus, Power, Trash2, UserX, X } from 'lucide-react';
import type { MinistryMember, MinistryMemberDetails, SingerKeyPreference } from '../../types/ministry';
import type { Song } from '../../types/song';
import { preferencesForMember } from '../../utils/keyPreferences';
import { INSTRUMENT_LABELS, describeMemberRoles } from '../../utils/ministryMembers';
import { ActionMenu } from '../Setlists/ActionMenu';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { iconButton, primaryButton, secondaryButton, sectionHeading } from '../Setlists/ui';
import { KeyPreferenceDialog } from './KeyPreferenceDialog';
import { MemberAvatar } from './MemberAvatar';
import { MemberFormDialog } from './MemberFormDialog';

interface MemberDetailProps {
  /** Null when the member no longer exists (an old link, or deleted elsewhere) */
  member: MinistryMember | null;
  songs: Song[];
  songsById: Map<string, Song>;
  keyPreferences: SingerKeyPreference[];
  /** Setlists this person is on, counted from what is stored */
  setlistCount: number;
  onBack: () => void;
  onUpdate: (details: MinistryMemberDetails) => void;
  onSetActive: (isActive: boolean) => void;
  onDelete: () => void;
  onSetKeyPreference: (songId: string, key: string) => void;
  onRemoveKeyPreference: (songId: string) => void;
  /** Their coming activities, from the calendar */
  activities?: React.ReactNode;
  /** What they took part in, from the history of performances */
  history?: React.ReactNode;
}

type OpenDialog =
  | { kind: 'edit' }
  | { kind: 'delete' }
  | { kind: 'key'; songId?: string; key?: string };

/** One person of the ministry: what they do, and the keys they usually sing in. */
export const MemberDetail: React.FC<MemberDetailProps> = ({
  member,
  songs,
  songsById,
  keyPreferences,
  setlistCount,
  onBack,
  onUpdate,
  onSetActive,
  onDelete,
  onSetKeyPreference,
  onRemoveKeyPreference,
  activities,
  history,
}) => {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const closeDialog = () => setDialog(null);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-6 text-sm font-medium"
    >
      <ArrowLeft className="w-4 h-4 text-blue-600" />
      <span>Todos los miembros</span>
    </button>
  );

  if (!member) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {backButton}
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <UserX className="w-8 h-8 text-slate-300 mb-3" />
          <h1 className="text-lg font-bold text-[#10203A] dark:text-white">Este miembro ya no existe</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Puede que se haya eliminado desde otra pestaña.</p>
        </div>
      </div>
    );
  }

  const roles = describeMemberRoles(member);
  const preferences = preferencesForMember(keyPreferences, member.id, songsById);

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {backButton}

      <header className="mb-8 flex items-start gap-4">
        <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words">
            {member.name}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#2464ED] dark:text-sky-400">
            {roles || <span className="text-slate-400 dark:text-slate-500 normal-case tracking-normal">Sin rol indicado</span>}
            {!member.isActive && (
              <span className="rounded-md border border-slate-200 dark:border-dark-700 px-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                Inactivo
              </span>
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setDialog({ kind: 'edit' })} className={secondaryButton}>
              <Pencil className="w-4 h-4" />
              Editar
            </button>
            {member.isActive ? (
              <button type="button" onClick={() => onSetActive(false)} className={secondaryButton}>
                <Power className="w-4 h-4" />
                Desactivar
              </button>
            ) : (
              <button type="button" onClick={() => onSetActive(true)} className={primaryButton}>
                <Power className="w-4 h-4" />
                Reactivar
              </button>
            )}
          </div>
        </div>
        <ActionMenu
          label={`Más opciones de ${member.name}`}
          icon={MoreHorizontal}
          triggerClassName={`${iconButton} border border-slate-200 dark:border-dark-700`}
          items={[
            {
              label: 'Eliminar permanentemente',
              icon: Trash2,
              danger: true,
              onSelect: () => setDialog({ kind: 'delete' }),
            },
          ]}
        />
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="miembro-instrumentos" className="space-y-6">
          <div>
            <h2 id="miembro-instrumentos" className={`${sectionHeading} mb-2`}>
              Instrumentos
            </h2>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {member.instruments.length > 0
                ? member.instruments.map((instrument) => INSTRUMENT_LABELS[instrument]).join(' · ')
                : 'No toca ningún instrumento en el ministerio.'}
            </p>
          </div>

          {member.notes && (
            <div>
              <h2 className={`${sectionHeading} mb-2`}>Notas</h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-200">{member.notes}</p>
            </div>
          )}

          <div>
            <h2 className={`${sectionHeading} mb-2`}>Setlists</h2>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {setlistCount === 0
                ? 'Todavía no está en el equipo de ningún Setlist.'
                : `Está en el equipo de ${setlistCount} ${setlistCount === 1 ? 'Setlist' : 'Setlists'}.`}
            </p>
          </div>

          {activities}

          {history}
        </section>

        <section aria-labelledby="miembro-tonalidades">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="miembro-tonalidades" className={sectionHeading}>
              Tonalidades por canción
            </h2>
            <button
              type="button"
              onClick={() => setDialog({ kind: 'key' })}
              className="inline-flex items-center gap-1.5 h-9 px-2.5 -mr-2.5 rounded-lg text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
            >
              <Plus className="w-4 h-4" />
              Añadir
            </button>
          </div>
          {preferences.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Cuando {member.name} suela cantar una canción en otra tonalidad, guárdala aquí y aparecerá como
              sugerencia al preparar un Setlist.
            </p>
          ) : (
            <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
              {preferences.map((preference) => (
                <li key={preference.songId} className="flex items-center gap-1 pl-3.5 pr-1">
                  <button
                    type="button"
                    onClick={() => setDialog({ kind: 'key', songId: preference.songId, key: preference.key })}
                    className="min-w-0 flex-1 flex items-center justify-between gap-3 py-3 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                  >
                    <span className="truncate text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {preference.songTitle}
                    </span>
                    <span className="shrink-0 font-mono text-sm font-bold text-blue-600 dark:text-sky-400">
                      {preference.key}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemoveKeyPreference(preference.songId)}
                    aria-label={`Quitar la tonalidad de ${preference.songTitle}`}
                    title="Quitar"
                    className={iconButton}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {dialog?.kind === 'edit' && (
        <MemberFormDialog
          mode="edit"
          initialDetails={member}
          onSubmit={(details) => {
            onUpdate(details);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'key' && (
        <KeyPreferenceDialog
          memberName={member.name}
          songs={songs}
          initialSongId={dialog.songId}
          initialKey={dialog.key}
          onSave={(songId, key) => {
            onSetKeyPreference(songId, key);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`¿Eliminar a ${member.name} para siempre?`}
          message={
            <>
              Se borrarán sus tonalidades guardadas, saldrá del equipo de todos los Setlists y de las actividades del calendario, y dejará de estar
              asignado en los arreglos. No se puede deshacer.{' '}
              <strong className="font-semibold">Si solo deja el ministerio por un tiempo, es mejor desactivarlo.</strong>
            </>
          }
          confirmLabel="Eliminar para siempre"
          onConfirm={onDelete}
          onClose={closeDialog}
        />
      )}
    </div>
  );
};
