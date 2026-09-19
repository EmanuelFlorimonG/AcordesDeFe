import React, { useState } from 'react';
import { ArrowLeft, CalendarDays, CalendarX, History, MapPin, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import type { MinistryMember } from '../../types/ministry';
import type { PerformanceRecord, PerformanceSection, PerformanceSong } from '../../types/performance';
import { formatVoices } from '../../utils/arrangement';
import { formatLongDate, formatTime } from '../../utils/dates';
import { ROLE_LABELS } from '../../utils/ministryMembers';
import { describeCapoShapes, performedSongs, soloistsOf, type PerformanceChanges } from '../../utils/performanceHistory';
import { EventStatusBadge } from '../Calendar/EventStatusBadge';
import { EventTypeBadge } from '../Calendar/EventTypeBadge';
import { ActionMenu } from '../Setlists/ActionMenu';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { iconButton, primaryButton, secondaryButton, sectionHeading } from '../Setlists/ui';
import { EditPerformanceDialog } from './EditPerformanceDialog';

interface PerformanceDetailProps {
  /** Null when the record no longer exists (an old link, or deleted elsewhere) */
  record: PerformanceRecord | null;
  /** False when the activity (or that date of it) was deleted after the record was made */
  eventExists: boolean;
  todayIso: string;
  members: MinistryMember[];
  onBack: () => void;
  onOpenEvent: () => void;
  onUpdate: (changes: PerformanceChanges) => void;
  onDelete: () => void;
}

const TRANSITION_TEXT: Record<'stop' | 'direct' | 'instrumental' | 'custom', string> = {
  stop: 'Pausa antes de la siguiente',
  direct: 'Directo a la siguiente',
  instrumental: 'Instrumental hasta la siguiente',
  custom: 'Transición indicada',
};

/**
 * One day, as it was recorded: who was there and what was sung, in which key,
 * by whom. It reads only the record; nothing here is looked up again in the
 * setlist, the songbook or the members, so later changes never rewrite it.
 */
export const PerformanceDetail: React.FC<PerformanceDetailProps> = ({
  record,
  eventExists,
  todayIso,
  members,
  onBack,
  onOpenEvent,
  onUpdate,
  onDelete,
}) => {
  const [dialog, setDialog] = useState<'edit' | 'delete' | null>(null);
  const close = () => setDialog(null);

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-6 text-sm font-medium"
    >
      <ArrowLeft className="w-4 h-4 text-blue-600" />
      <span>Historial</span>
    </button>
  );

  if (!record) {
    return (
      <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
        {backButton}
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-slate-200 dark:border-dark-700 rounded-xl">
          <History className="w-8 h-8 text-slate-300 mb-3" />
          <h1 className="text-lg font-bold text-[#10203A] dark:text-white">Este registro ya no existe</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Puede que se haya eliminado desde otra pestaña.</p>
        </div>
      </div>
    );
  }

  const sung = performedSongs(record);
  const skipped = record.songs.filter((song) => !song.performed);
  const when = [
    formatLongDate(record.occurrenceDate, todayIso),
    record.event.allDay || !record.event.startTime ? '' : formatTime(record.event.startTime),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="w-full px-5 sm:px-10 py-6 sm:py-8">
      {backButton}

      <header className="mb-8">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <EventTypeBadge type={record.event.type} size="md" />
              <EventStatusBadge status="completed" size="md" />
            </div>
            <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words">
              {record.event.title}
            </h1>
            <p className="mt-1.5 text-base font-semibold text-slate-700 dark:text-slate-200">{when}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
              {record.event.location && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden="true" className="w-4 h-4" />
                  {record.event.location}
                </span>
              )}
              {record.setlistName && <span>Setlist: {record.setlistName}</span>}
            </div>
          </div>
          <ActionMenu
            label="Más opciones del registro"
            icon={MoreHorizontal}
            triggerClassName={`${iconButton} border border-slate-200 dark:border-dark-700`}
            items={[{ label: 'Eliminar registro', icon: Trash2, danger: true, onSelect: () => setDialog('delete') }]}
          />
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {eventExists ? (
            <button type="button" onClick={onOpenEvent} className={secondaryButton}>
              <CalendarDays className="w-4 h-4" />
              Ver actividad original
            </button>
          ) : (
            <span className="inline-flex items-center gap-2 h-10 px-3 rounded-lg border border-dashed border-slate-300 dark:border-dark-600 text-sm text-slate-500 dark:text-slate-400">
              <CalendarX aria-hidden="true" className="w-4 h-4" />
              Actividad original eliminada
            </span>
          )}
          <button type="button" onClick={() => setDialog('edit')} className={primaryButton}>
            <Pencil className="w-4 h-4" />
            Editar registro
          </button>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="space-y-8 lg:order-2">
          <section aria-labelledby="registro-equipo">
            <h2 id="registro-equipo" className={`${sectionHeading} mb-2`}>
              Equipo
            </h2>
            {record.participants.length === 0 ? (
              <p className="text-sm text-slate-500 dark:text-slate-400">No quedó registrado el equipo.</p>
            ) : (
              <ul className="space-y-1.5">
                {record.participants.map((entry) => (
                  <li key={entry.memberId} className="text-sm">
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{entry.name}</span>
                    {entry.roles.length > 0 && (
                      <span className="text-slate-500 dark:text-slate-400"> · {entry.roles.map((role) => ROLE_LABELS[role]).join(', ')}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {record.notes && (
            <section aria-labelledby="registro-notas">
              <h2 id="registro-notas" className={`${sectionHeading} mb-2`}>
                Notas del registro
              </h2>
              <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700 dark:text-slate-200">{record.notes}</p>
            </section>
          )}
        </div>
        <section aria-labelledby="registro-repertorio" className="min-w-0 lg:order-1">
          <h2 id="registro-repertorio" className={`${sectionHeading} mb-2`}>
            Repertorio interpretado
          </h2>
          <ol className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
            {sung.map((song, index) => (
              <SongEntry key={song.id} song={song} position={index + 1} />
            ))}
          </ol>

          {skipped.length > 0 && (
            <div className="mt-4">
              <h3 className={`${sectionHeading} mb-1.5`}>Preparadas y no interpretadas</h3>
              <ul className="text-sm text-slate-500 dark:text-slate-400">
                {skipped.map((song) => (
                  <li key={song.id}>{[song.moment, song.title].filter(Boolean).join(' · ')}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

      </div>

      {dialog === 'edit' && (
        <EditPerformanceDialog
          record={record}
          members={members}
          onSubmit={(changes) => {
            onUpdate(changes);
            close();
          }}
          onClose={close}
        />
      )}

      {dialog === 'delete' && (
        <ConfirmDialog
          title="¿Eliminar este registro de interpretación?"
          message="Se borra lo que se registró de este día: canciones, tonalidades, equipo y notas. No se puede deshacer. La actividad no se elimina y sigue como Realizada; si hace falta, después puede volver a Programada."
          confirmLabel="Eliminar registro"
          onConfirm={onDelete}
          onClose={close}
        />
      )}
    </div>
  );
};

const SongEntry: React.FC<{ song: PerformanceSong; position: number }> = ({ song, position }) => {
  const soloists = soloistsOf(song);
  const shapes = describeCapoShapes(song);
  return (
    <li className="px-3.5 py-3">
      <div className="flex items-start gap-3">
        <span className="w-6 shrink-0 pt-0.5 text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">
          {String(position).padStart(2, '0')}
        </span>
        <div className="min-w-0 flex-1">
          {song.moment && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">{song.moment}</p>
          )}
          <p className="text-sm font-bold text-[#10203A] dark:text-white break-words">{song.title}</p>
          {song.artist && <p className="text-xs text-slate-500 dark:text-slate-400">{song.artist}</p>}
          {shapes && <p className="text-xs text-slate-500 dark:text-slate-400">{shapes}</p>}
          {soloists.length > 0 && (
            <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-200">
              Solista: {soloists.map((entry) => entry.name).join(', ')}
            </p>
          )}
          {song.sections && song.sections.length > 0 && (
            <ul aria-label={`Arreglo de ${song.title}`} className="mt-1.5 space-y-0.5">
              {song.sections.map((section, index) => (
                <li key={index} className="text-xs text-slate-500 dark:text-slate-400">
                  {describeSection(section)}
                </li>
              ))}
            </ul>
          )}
          {song.notes && <p className="mt-1 text-xs italic text-slate-500 dark:text-slate-400">{song.notes}</p>}
          {song.transitionToNext && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {song.transitionToNext.instruction || TRANSITION_TEXT[song.transitionToNext.type]}
            </p>
          )}
        </div>
        {song.key && (
          <span className="shrink-0 font-mono text-sm font-bold text-[#10203A] dark:text-white">
            <span className="sr-only">Tonalidad </span>
            {song.key}
          </span>
        )}
      </div>
    </li>
  );
};

/** "Coro ×2 · Todos · Laura · luego Verso 1" */
function describeSection(section: PerformanceSection): string {
  return [
    section.repeatCount > 1 ? `${section.label} ×${section.repeatCount}` : section.label,
    section.voices.length > 0 ? formatVoices(section.voices) : '',
    section.assigned.map((entry) => entry.name).join(', '),
    section.instruction,
    section.transition.type === 'jump'
      ? `luego ${section.transition.targetLabel}`
      : section.transition.type === 'end'
        ? 'fin'
        : '',
  ]
    .filter(Boolean)
    .join(' · ');
}
