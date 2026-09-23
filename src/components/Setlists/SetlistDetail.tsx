import React, { useState } from 'react';
import {
  ArrowLeft,
  CalendarDays,
  Copy,
  ListOrdered,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Sparkle,
  Trash2,
} from 'lucide-react';
import type { Setlist, SetlistDetails, SetlistItem } from '../../types/setlist';
import type { MinistryMember } from '../../types/ministry';
import type { Song } from '../../types/song';
import {
  formatDurationSummary,
  formatSetlistDate,
  formatSongCount,
  summarizeSetlistDuration,
} from '../../utils/setlists';
import type { SetlistItemChanges } from '../../utils/setlists';
import { ActionMenu } from './ActionMenu';
import { AddSongsDialog } from './AddSongsDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { SetlistFormDialog } from './SetlistFormDialog';
import { SetlistItemEditor } from './SetlistItemEditor';
import { SetlistSongList } from './SetlistSongList';
import { SetlistTeam } from './SetlistTeam';
import { primaryButton, secondaryButton } from './ui';

interface SetlistDetailProps {
  /** Null when the setlist no longer exists (an old link, or deleted elsewhere) */
  setlist: Setlist | null;
  songs: Song[];
  songsById: Map<string, Song>;
  durations: Record<string, number>;
  onBack: () => void;
  onOpenItem: (item: SetlistItem) => void;
  onStartRehearsal: () => void;
  /** Plays the setlist live, in mass mode */
  onStartMass: () => void;
  onUpdateDetails: (details: SetlistDetails) => void;
  onDuplicate: (details: SetlistDetails) => void;
  onDelete: () => void;
  /** `moment` is set when the song was chosen from a part of the Mass */
  onAddSong: (song: Song, moment: string) => void;
  onRemoveItem: (itemId: string) => void;
  onMoveItem: (itemId: string, toIndex: number) => void;
  onMoveItemBy: (itemId: string, delta: number) => void;
  onUpdateItem: (itemId: string, changes: SetlistItemChanges) => void;
  /** The people of the ministry, to choose the team from */
  members: MinistryMember[];
  membersById: Map<string, MinistryMember>;
  onSetParticipants: (memberIds: string[]) => void;
  onAddParticipants: (memberIds: string[]) => void;
  onGoToMembers: () => void;
  /** The calendar activities that use this setlist */
  activities?: React.ReactNode;
}

type OpenDialog =
  | { kind: 'edit' }
  | { kind: 'duplicate' }
  | { kind: 'delete' }
  | { kind: 'add' }
  | { kind: 'item'; itemId: string }
  | { kind: 'remove-item'; itemId: string };

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

export const SetlistDetail: React.FC<SetlistDetailProps> = ({
  setlist,
  songs,
  songsById,
  durations,
  onBack,
  onOpenItem,
  onStartRehearsal,
  onStartMass,
  onUpdateDetails,
  onDuplicate,
  onDelete,
  onAddSong,
  onRemoveItem,
  onMoveItem,
  onMoveItemBy,
  onUpdateItem,
  members,
  membersById,
  onSetParticipants,
  onAddParticipants,
  onGoToMembers,
  activities,
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
      <span>Todos los Setlists</span>
    </button>
  );

  if (!setlist) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {backButton}
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <ListOrdered className="w-8 h-8 text-slate-300 mb-3" />
          <h1 className="text-lg font-bold text-[#10203A] dark:text-white">Este Setlist ya no existe</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Puede que se haya eliminado desde otra pestaña o en otro dispositivo.
          </p>
        </div>
      </div>
    );
  }

  const summary = summarizeSetlistDuration(setlist, durations);
  const durationLabel = formatDurationSummary(summary);
  const dateLabel = formatSetlistDate(setlist.date, 'long');
  const playableCount = setlist.items.filter((item) => songsById.has(item.songId)).length;
  const openItem = dialog?.kind === 'item' || dialog?.kind === 'remove-item'
    ? setlist.items.find((item) => item.id === dialog.itemId) ?? null
    : null;
  const openItemSong = openItem ? songsById.get(openItem.songId) ?? null : null;
  // The song after the one being edited, taken from the order as it is now:
  // a transition belongs to the song you leave, never to a fixed pair.
  const nextAfterOpenItem = openItem
    ? setlist.items[setlist.items.findIndex((item) => item.id === openItem.id) + 1] ?? null
    : null;

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {backButton}

      <header className="mb-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
              <CalendarDays className="w-3.5 h-3.5" />
              {dateLabel ? capitalize(dateLabel) : 'Sin fecha'}
            </p>
            <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words">
              {setlist.name}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {formatSongCount(setlist.items.length)}
              {durationLabel && ` · ${durationLabel}`}
            </p>
          </div>

          <ActionMenu
            label="Opciones del Setlist"
            icon={MoreHorizontal}
            triggerClassName="w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors touch-manipulation"
            items={[
              { label: 'Editar nombre y fecha', icon: Pencil, onSelect: () => setDialog({ kind: 'edit' }) },
              { label: 'Duplicar Setlist', icon: Copy, onSelect: () => setDialog({ kind: 'duplicate' }) },
              {
                label: 'Eliminar Setlist',
                icon: Trash2,
                danger: true,
                separated: true,
                onSelect: () => setDialog({ kind: 'delete' }),
              },
            ]}
          />
        </div>

        {setlist.description && (
          <p className="mt-3 max-w-2xl whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {setlist.description}
          </p>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onStartRehearsal}
            disabled={playableCount === 0}
            title={
              playableCount === 0
                ? 'Añade una canción para poder ensayar'
                : 'Abre la primera canción en modo ensayo'
            }
            className={primaryButton}
          >
            <Play className="w-4 h-4 fill-current" />
            Iniciar ensayo
          </button>
          <button
            type="button"
            onClick={onStartMass}
            disabled={playableCount === 0}
            title={
              playableCount === 0
                ? 'Añade una canción para poder tocar'
                : 'Toca este Setlist durante la celebración'
            }
            className={secondaryButton}
          >
            <Sparkle className="w-4 h-4" />
            Modo Misa
          </button>
          <button type="button" onClick={() => setDialog({ kind: 'add' })} className={secondaryButton}>
            <Plus className="w-4 h-4" />
            Añadir canción
          </button>
        </div>
      </header>

      <SetlistTeam
        participantIds={setlist.participantIds}
        members={members}
        membersById={membersById}
        onSave={onSetParticipants}
        onGoToMembers={onGoToMembers}
      />

      {activities && <div className="mb-6">{activities}</div>}

      {setlist.items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <div className="w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center mb-4">
            <ListOrdered className="w-6 h-6 text-[#2464ED]" />
          </div>
          <h2 className="text-base font-bold text-[#10203A] dark:text-white">Este Setlist está vacío</h2>
          <p className="mt-1.5 mb-5 max-w-sm text-sm text-slate-500 dark:text-slate-400">
            Añade las canciones en el orden en que se van a cantar. Después podrás cambiar el tono, escribir el
            momento y dejar notas para el coro, solo para este día.
          </p>
          <button type="button" onClick={() => setDialog({ kind: 'add' })} className={primaryButton}>
            <Plus className="w-4 h-4" />
            Añadir la primera canción
          </button>
        </div>
      ) : (
        <SetlistSongList
          items={setlist.items}
          songsById={songsById}
          onOpenItem={onOpenItem}
          onEditItem={(item) => setDialog({ kind: 'item', itemId: item.id })}
          onRemoveItem={(item) => {
            // Confirm only when there is something to lose besides the order.
            if (item.moment || item.notes || item.transposeSteps !== 0) {
              setDialog({ kind: 'remove-item', itemId: item.id });
            } else {
              onRemoveItem(item.id);
            }
          }}
          onMoveItem={onMoveItem}
          onMoveItemBy={onMoveItemBy}
          onArrangementNeedsReview={(itemId, arrangement) => onUpdateItem(itemId, { arrangement })}
        />
      )}

      {dialog?.kind === 'add' && (
        <AddSongsDialog songs={songs} setlist={setlist} onAdd={onAddSong} onClose={closeDialog} />
      )}

      {dialog?.kind === 'edit' && (
        <SetlistFormDialog
          mode="edit"
          initialDetails={setlist}
          onSubmit={(details) => {
            onUpdateDetails(details);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'duplicate' && (
        <SetlistFormDialog
          mode="duplicate"
          initialDetails={{ ...setlist, name: `${setlist.name} (copia)` }}
          onSubmit={(details) => {
            onDuplicate(details);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'delete' && (
        <ConfirmDialog
          title={`¿Eliminar «${setlist.name}»?`}
          message="Esta acción eliminará el Setlist, no las canciones. Las actividades del calendario que lo usen se conservan, sin repertorio."
          confirmLabel="Eliminar Setlist"
          onConfirm={onDelete}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'remove-item' && openItem && (
        <ConfirmDialog
          title={`¿Quitar «${openItemSong?.title ?? 'esta canción'}» del Setlist?`}
          message="Se perderán el momento, el tono y la nota que guardaste para esta canción en este Setlist. La canción sigue en el cancionero."
          confirmLabel="Quitar del Setlist"
          onConfirm={() => onRemoveItem(openItem.id)}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'item' && openItem && openItemSong && (
        <SetlistItemEditor
          song={openItemSong}
          item={openItem}
          nextSongTitle={
            nextAfterOpenItem
              ? songsById.get(nextAfterOpenItem.songId)?.title ?? 'Canción no disponible'
              : null
          }
          participantIds={setlist.participantIds}
          onSave={({ newParticipantIds, ...changes }) => {
            // Someone assigned from outside the team joins it, as the editor said.
            if (newParticipantIds.length > 0) onAddParticipants(newParticipantIds);
            onUpdateItem(openItem.id, changes);
            closeDialog();
          }}
          onClose={closeDialog}
        />
      )}
    </div>
  );
};
