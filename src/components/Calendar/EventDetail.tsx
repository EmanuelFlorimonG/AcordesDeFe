import React, { useState } from 'react';
import {
  ArrowLeft,
  Ban,
  CalendarX,
  CheckCircle2,
  History,
  RotateCcw,
  Copy,
  ListOrdered,
  MapPin,
  MoreHorizontal,
  Pencil,
  Play,
  Repeat,
  Sparkle,
  Trash2,
  UserX,
  Users,
} from 'lucide-react';
import type { EventOccurrence, MinistryEventDetails } from '../../types/event';
import type { MinistryMember } from '../../types/ministry';
import type { PerformanceRecord } from '../../types/performance';
import type { Setlist } from '../../types/setlist';
import type { EventStatus } from '../../types/event';
import type { Song } from '../../types/song';
import { formatLongDate, formatShortDate } from '../../utils/dates';
import { describeMember, sortMembers } from '../../utils/ministryMembers';
import {
  RECURRENCE_LABELS,
  duplicateEventDetails,
  isDateLocked,
  occurrenceTimeLabel,
  statusChangeError,
  type CalendarNow,
} from '../../utils/ministryEvents';
import { occurrenceActions, recordableItems } from '../../utils/performanceHistory';
import { ClosePerformanceDialog } from '../History/ClosePerformanceDialog';
import { formatSetlistDate, formatSongCount } from '../../utils/setlists';
import { MemberAvatar } from '../Members/MemberAvatar';
import { MemberPicker } from '../Members/MemberPicker';
import { ActionMenu, type ActionMenuItem } from '../Setlists/ActionMenu';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { Dialog } from '../Setlists/Dialog';
import { iconButton, primaryButton, secondaryButton, sectionHeading } from '../Setlists/ui';
import { EventFormDialog } from './EventFormDialog';
import { EventStatusBadge } from './EventStatusBadge';
import { EventTypeBadge } from './EventTypeBadge';
import { SetlistPickerList } from './SetlistPickerList';

interface EventDetailProps {
  /** Null when the activity no longer exists (an old link, or deleted elsewhere) */
  occurrence: EventOccurrence | null;
  setlists: Setlist[];
  members: MinistryMember[];
  membersById: Map<string, MinistryMember>;
  now: CalendarNow;
  onBack: () => void;
  onUpdate: (details: MinistryEventDetails) => void;
  onDelete: () => void;
  onDuplicate: (details: MinistryEventDetails) => void;
  onSetSetlist: (setlistId: string | null) => void;
  onSetParticipants: (memberIds: string[]) => void;
  onCopyTeamToSetlist: () => void;
  onOpenSetlist: (setlistId: string) => void;
  onStartRehearsal: (setlistId: string) => void;
  onStartMass: (setlistId: string) => void;
  songsById: Map<string, Song>;
  /** The record of this date, if one was made */
  performance: PerformanceRecord | null;
  /** How many records this activity has across all its dates (they survive its deletion) */
  performanceCount: number;
  /** Changes this date's status; only called for changes statusChangeError allows */
  onSetStatus: (status: EventStatus) => void;
  /**
   * Closes this date as done. `performedItemIds` are the setlist entries sung;
   * empty when nothing musical is recorded (no repertoire, or none ticked).
   */
  onComplete: (performedItemIds: string[], notes: string) => void;
  /** Records what was sung on a date that is already Realizada */
  onRecordPerformance: (performedItemIds: string[], notes: string) => void;
  onViewPerformance: (recordId: string) => void;
  /** Opens the closing straight away (from "Finalizar celebración" in Mass mode) */
  startClosing?: boolean;
}

type OpenDialog =
  | 'edit'
  | 'duplicate'
  | 'delete'
  | 'team'
  | 'setlist'
  | 'copy-team'
  | 'complete'
  | 'complete-plain'
  | 'record'
  | 'cancel'
  | 'reopen'
  | 'reopen-blocked'
  | 'restore';

/**
 * One activity: when, where, who, and with which songs. From here the
 * existing flows open as they always do: the setlist, rehearsal, mass mode.
 * The date informs; it never blocks opening mass mode to rehearse ahead.
 */
export const EventDetail: React.FC<EventDetailProps> = ({
  occurrence,
  setlists,
  members,
  membersById,
  now,
  onBack,
  onUpdate,
  onDelete,
  onDuplicate,
  onSetSetlist,
  onSetParticipants,
  onCopyTeamToSetlist,
  onOpenSetlist,
  onStartRehearsal,
  onStartMass,
  songsById,
  performance,
  performanceCount,
  onSetStatus,
  onComplete,
  onRecordPerformance,
  onViewPerformance,
  startClosing = false,
}) => {
  const [dialog, setDialog] = useState<OpenDialog | null>(() => (startClosing ? 'complete' : null));
  const [draftTeam, setDraftTeam] = useState<string[]>([]);
  const [draftSetlist, setDraftSetlist] = useState<string | null>(null);
  const close = () => setDialog(null);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-6 text-sm font-medium"
    >
      <ArrowLeft className="w-4 h-4 text-blue-600" />
      <span>Calendario</span>
    </button>
  );

  if (!occurrence) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {backButton}
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <CalendarX className="w-8 h-8 text-slate-300 mb-3" />
          <h1 className="text-lg font-bold text-[#10203A] dark:text-white">Esta actividad ya no existe</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Puede que se haya eliminado desde otra pestaña.</p>
        </div>
      </div>
    );
  }

  const { event, date } = occurrence;
  const setlist = event.setlistId ? setlists.find((candidate) => candidate.id === event.setlistId) ?? null : null;
  const setlistMissing = event.setlistId !== null && !setlist;
  const canPlay = Boolean(setlist && setlist.items.length > 0);
  const isToday = date === now.date;
  const isMass = event.type === 'mass';
  const team = sortMembers(
    event.participantIds.map((id) => membersById.get(id)).filter((member): member is MinistryMember => Boolean(member))
  );
  const { status } = occurrence;
  const canRecord = Boolean(setlist && recordableItems(setlist, songsById).length > 0);
  const actions = occurrenceActions({ status, hasPerformance: performance !== null, canRecord });
  const longDate = formatLongDate(date, now.date);
  const isSeries = event.recurrence !== null;

  const requestStatus = (next: EventStatus) => {
    if (statusChangeError(status, next, performance !== null) === 'has-performance') {
      setDialog('reopen-blocked');
      return;
    }
    if (next === 'completed') setDialog(canRecord ? 'complete' : 'complete-plain');
    else if (next === 'cancelled') setDialog('cancel');
    else setDialog(status === 'cancelled' ? 'restore' : 'reopen');
  };

  const secondaryActions: ActionMenuItem[] = [
    { label: 'Editar', icon: Pencil, onSelect: () => setDialog('edit') },
    { label: 'Duplicar actividad', icon: Copy, onSelect: () => setDialog('duplicate') },
    // Mass mode stays reachable for any activity with repertoire, just out of the way.
    ...(!isMass && setlist && canPlay
      ? [{ label: 'Modo Misa', icon: Sparkle, onSelect: () => onStartMass(setlist.id), separated: true }]
      : []),
    ...(actions.includes('cancel')
      ? [{ label: isSeries ? 'Cancelar esta fecha' : 'Cancelar actividad', icon: Ban, onSelect: () => requestStatus('cancelled'), separated: true }]
      : []),
    ...(actions.includes('reopen')
      ? [{ label: 'Volver a Programada', icon: RotateCcw, onSelect: () => requestStatus('scheduled'), separated: true }]
      : []),
    { label: 'Eliminar actividad', icon: Trash2, danger: true, separated: true, onSelect: () => setDialog('delete') },
  ];

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {backButton}

      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EventTypeBadge type={event.type} size="md" />
              <EventStatusBadge status={status} size="md" />
              {isToday && status === 'scheduled' && (
                <span className="rounded-md bg-[#2464ED] px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-white">
                  Hoy
                </span>
              )}
            </div>
            <h1
              className={`mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words ${
                status === 'cancelled' ? 'line-through decoration-slate-400 decoration-2' : ''
              }`}
            >
              {event.title}
            </h1>
            <p className="mt-1.5 text-base font-semibold text-slate-700 dark:text-slate-200">
              {longDate} ·{' '}
              <span className="whitespace-nowrap">{occurrenceTimeLabel(occurrence)}</span>
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              {event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="w-4 h-4" />
                  {event.location}
                </span>
              )}
              {event.recurrence && (
                <span className="inline-flex items-center gap-1.5">
                  <Repeat aria-hidden="true" className="w-4 h-4" />
                  {RECURRENCE_LABELS[event.recurrence.frequency]}
                  {event.recurrence.until ? ` hasta el ${formatShortDate(event.recurrence.until)}` : ''}
                </span>
              )}
            </div>
          </div>
          <ActionMenu
            label={`Más opciones de ${event.title}`}
            icon={MoreHorizontal}
            triggerClassName={`${iconButton} border border-slate-200 dark:border-dark-700`}
            items={secondaryActions}
          />
        </div>

        {/* What became of this date: the one action that matters now comes first. */}
        <div className="mt-5 flex flex-wrap gap-2">
          {actions.includes('complete') && (
            <button type="button" onClick={() => requestStatus('completed')} className={secondaryButton}>
              <CheckCircle2 className="w-4 h-4" />
              Marcar como realizada
            </button>
          )}
          {actions.includes('view-performance') && performance && (
            <button type="button" onClick={() => onViewPerformance(performance.id)} className={primaryButton}>
              <History className="w-4 h-4" />
              Ver interpretación
            </button>
          )}
          {actions.includes('record-performance') && (
            <button type="button" onClick={() => setDialog('record')} className={secondaryButton}>
              <History className="w-4 h-4" />
              Registrar interpretación
            </button>
          )}
          {actions.includes('restore') && (
            <button type="button" onClick={() => requestStatus('scheduled')} className={primaryButton}>
              <RotateCcw className="w-4 h-4" />
              Restaurar a Programada
            </button>
          )}
        </div>

        {setlist && (
          <div className="mt-2 flex flex-wrap gap-2">
            {isMass && (
              <button
                type="button"
                disabled={!canPlay}
                onClick={() => onStartMass(setlist.id)}
                className={isToday && status === 'scheduled' ? primaryButton : secondaryButton}
              >
                <Sparkle className="w-4 h-4" />
                Modo Misa
              </button>
            )}
            <button
              type="button"
              disabled={!canPlay}
              onClick={() => onStartRehearsal(setlist.id)}
              className={status === 'scheduled' && (!isMass || !isToday) ? primaryButton : secondaryButton}
            >
              <Play className="w-4 h-4 fill-current" />
              Ensayar
            </button>
            <button type="button" onClick={() => onOpenSetlist(setlist.id)} className={secondaryButton}>
              <ListOrdered className="w-4 h-4" />
              Abrir Setlist
            </button>
          </div>
        )}
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <section aria-labelledby="actividad-equipo">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 id="actividad-equipo" className={sectionHeading}>
              Equipo
            </h2>
            {members.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setDraftTeam(event.participantIds.filter((id) => membersById.has(id)));
                  setDialog('team');
                }}
                className="inline-flex items-center gap-1.5 h-9 px-2.5 -mr-2.5 rounded-lg text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
              >
                <Users className="w-4 h-4" />
                Gestionar equipo
              </button>
            )}
          </div>
          {team.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Nadie convocado todavía.
            </p>
          ) : (
            <ul className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
              {team.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-3 py-2.5">
                  <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{member.name}</span>
                      {!member.isActive && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                          <UserX aria-hidden="true" className="w-3 h-3" />
                          Inactivo
                        </span>
                      )}
                    </span>
                    {describeMember(member) && (
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{describeMember(member)}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {setlist && team.length > 0 && (
            <button
              type="button"
              onClick={() => setDialog('copy-team')}
              className="mt-2 inline-flex items-center gap-1.5 h-9 px-2.5 -ml-2.5 rounded-lg text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400"
            >
              <Copy className="w-3.5 h-3.5" />
              Copiar equipo al Setlist
            </button>
          )}
        </section>

        <div className="space-y-8">
          <section aria-labelledby="actividad-repertorio">
            <h2 id="actividad-repertorio" className={`${sectionHeading} mb-2`}>
              Repertorio
            </h2>
            {setlist ? (
              <div className="rounded-xl border border-slate-200 dark:border-dark-700 p-3.5">
                <p className="text-sm font-bold text-[#10203A] dark:text-white">{setlist.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {[setlist.date ? formatSetlistDate(setlist.date) : '', formatSongCount(setlist.items.length)]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-x-3">
                  <button type="button" onClick={() => openSetlistChooser()} className="h-9 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400">
                    Cambiar
                  </button>
                  <button type="button" onClick={() => onSetSetlist(null)} className="h-9 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400">
                    Quitar
                  </button>
                </div>
              </div>
            ) : setlistMissing ? (
              <div className="rounded-xl border border-dashed border-amber-300 dark:border-amber-500/40 p-3.5">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">Repertorio no disponible</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">El Setlist de esta actividad ya no existe.</p>
                <div className="mt-2 flex flex-wrap gap-x-3">
                  <button type="button" onClick={() => openSetlistChooser()} className="h-9 text-xs font-semibold text-[#2464ED] dark:text-sky-400">
                    Elegir otro Setlist
                  </button>
                  <button type="button" onClick={() => onSetSetlist(null)} className="h-9 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Quitar referencia
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 p-3.5">
                <p className="text-sm text-slate-500 dark:text-slate-400">No asignado.</p>
                {setlists.length > 0 && (
                  <button type="button" onClick={() => openSetlistChooser()} className="mt-1 h-9 text-xs font-semibold text-[#2464ED] dark:text-sky-400">
                    Elegir Setlist
                  </button>
                )}
              </div>
            )}
          </section>

          {event.notes && (
            <section aria-labelledby="actividad-notas">
              <h2 id="actividad-notas" className={`${sectionHeading} mb-2`}>
                Notas
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-200">{event.notes}</p>
            </section>
          )}
        </div>
      </div>

      {dialog === 'edit' && (
        <EventFormDialog
          mode="edit"
          initialDetails={event}
          dateLocked={isDateLocked(event)}
          setlists={setlists}
          members={members}
          todayIso={now.date}
          onSubmit={(details) => {
            onUpdate(details);
            close();
          }}
          onClose={close}
        />
      )}

      {dialog === 'duplicate' && (
        <EventFormDialog
          mode="duplicate"
          initialDetails={duplicateEventDetails(event)}
          setlists={setlists}
          members={members}
          todayIso={now.date}
          onSubmit={(details) => {
            onDuplicate(details);
            close();
          }}
          onClose={close}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title={`¿Eliminar «${event.title}»?`}
          message={`${
            event.recurrence
              ? 'Se elimina la actividad con todas sus fechas. El Setlist, los miembros y las canciones no se tocan.'
              : 'Solo se elimina la actividad. El Setlist, los miembros y las canciones no se tocan.'
          }${performanceCount > 0 ? ' Su historial de interpretaciones se conserva.' : ''}`}
          confirmLabel="Eliminar actividad"
          onConfirm={onDelete}
          onClose={close}
        />
      )}

      {(dialog === 'complete' || dialog === 'record') && setlist && canRecord && (
        <ClosePerformanceDialog
          subtitle={`${event.title} · ${longDate}`}
          setlist={setlist}
          songsById={songsById}
          mode={dialog === 'record' ? 'record' : 'complete'}
          onSubmit={(performedItemIds, notes) => {
            if (dialog === 'record') onRecordPerformance(performedItemIds, notes);
            else onComplete(performedItemIds, notes);
            close();
          }}
          onClose={close}
        />
      )}

      {dialog === 'complete-plain' && (
        <ConfirmDialog
          title="¿Marcar como realizada?"
          message={
            setlistMissing
              ? 'El Setlist de esta actividad ya no existe, así que queda como realizada sin registro musical.'
              : 'Queda como realizada. Sin repertorio, no hay canciones que registrar.'
          }
          confirmLabel="Marcar como realizada"
          tone="normal"
          onConfirm={() => onComplete([], '')}
          onClose={close}
        />
      )}

      {dialog === 'cancel' && (
        <ConfirmDialog
          title={isSeries ? '¿Cancelar esta fecha?' : '¿Cancelar esta actividad?'}
          message={`Esta actividad se conservará en el calendario, pero aparecerá como cancelada.${
            isSeries ? ` Solo se cancela el ${longDate}; el resto de la serie sigue programada.` : ''
          }`}
          confirmLabel={isSeries ? 'Cancelar esta fecha' : 'Cancelar actividad'}
          cancelLabel="Mantener programada"
          onConfirm={() => onSetStatus('cancelled')}
          onClose={close}
        />
      )}

      {dialog === 'restore' && (
        <ConfirmDialog
          title="¿Restaurar a Programada?"
          message="La actividad vuelve a aparecer como programada y entre las próximas si aún no ha pasado."
          confirmLabel="Restaurar"
          tone="normal"
          onConfirm={() => onSetStatus('scheduled')}
          onClose={close}
        />
      )}

      {dialog === 'reopen' && (
        <ConfirmDialog
          title="¿Volver a Programada?"
          message="Esta fecha dejará de aparecer como realizada."
          confirmLabel="Volver a Programada"
          tone="normal"
          onConfirm={() => onSetStatus('scheduled')}
          onClose={close}
        />
      )}

      {dialog === 'reopen-blocked' && performance && (
        <ConfirmDialog
          title="Primero hay que eliminar el registro"
          message="Esta fecha tiene un registro de interpretación. Para volver a Programada, elimina antes el registro desde su detalle: así el historial nunca contradice al calendario."
          confirmLabel="Ver interpretación"
          tone="normal"
          onConfirm={() => onViewPerformance(performance.id)}
          onClose={close}
        />
      )}

      {dialog === 'copy-team' && setlist && (
        <ConfirmDialog
          title="¿Copiar el equipo al Setlist?"
          message={`El equipo de «${setlist.name}» se reemplazará por el de esta actividad (${team.length} ${
            team.length === 1 ? 'persona' : 'personas'
          }). Las personas asignadas en los arreglos no cambian.`}
          confirmLabel="Copiar equipo"
          tone="normal"
          onConfirm={onCopyTeamToSetlist}
          onClose={close}
        />
      )}

      {dialog === 'team' && (
        <Dialog
          title="Equipo de esta actividad"
          description="Quién está convocado este día. No cambia el equipo del Setlist."
          onClose={close}
          onSubmit={() => {
            onSetParticipants(draftTeam);
            close();
          }}
          footer={
            <>
              <button type="button" onClick={close} className={secondaryButton}>
                Cancelar
              </button>
              <button type="submit" className={primaryButton}>
                Guardar equipo
              </button>
            </>
          }
        >
          {setlist && setlist.participantIds.some((id) => membersById.has(id)) && (
            <button
              type="button"
              onClick={() => setDraftTeam(setlist.participantIds.filter((id) => membersById.has(id)))}
              className="mb-3 inline-flex items-center gap-1.5 h-9 px-2.5 -ml-2.5 rounded-lg text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
            >
              <Users className="w-4 h-4" />
              Usar equipo del Setlist
            </button>
          )}
          <p role="status" aria-live="polite" className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
            {draftTeam.length === 1 ? '1 persona convocada' : `${draftTeam.length} personas convocadas`}
          </p>
          <MemberPicker
            label="Miembros convocados"
            groups={[{ members }]}
            selectedIds={draftTeam}
            onToggle={(id) =>
              setDraftTeam((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))
            }
          />
        </Dialog>
      )}

      {dialog === 'setlist' && (
        <Dialog
          title="Repertorio de la actividad"
          onClose={close}
          onSubmit={() => {
            onSetSetlist(draftSetlist);
            close();
          }}
          footer={
            <>
              <button type="button" onClick={close} className={secondaryButton}>
                Cancelar
              </button>
              <button type="submit" className={primaryButton}>
                Guardar
              </button>
            </>
          }
        >
          <SetlistPickerList setlists={setlists} selectedId={draftSetlist} onSelect={setDraftSetlist} todayIso={now.date} />
        </Dialog>
      )}
    </div>
  );

  function openSetlistChooser() {
    setDraftSetlist(setlist ? setlist.id : null);
    setDialog('setlist');
  }
};
