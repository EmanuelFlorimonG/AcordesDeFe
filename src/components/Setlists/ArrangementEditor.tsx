import React, { useId, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  Copy,
  GripVertical,
  MoreVertical,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { SetlistArrangement } from '../../types/setlist';
import type { SongSection } from '../../types/song';
import { useReorderList } from '../../hooks/useReorderList';
import { memberNames, useMinistryData } from '../../hooks/ministryContext';
import {
  addArrangementSection,
  createArrangement,
  describeArrangement,
  duplicateArrangementSection,
  formatVoices,
  listArrangementSources,
  matchesSongStructure,
  moveArrangementSection,
  moveArrangementSectionBy,
  removeArrangementSection,
  resolveArrangement,
  resolvedSectionName,
  summarizeArrangement,
  updateArrangementSection,
  UNTITLED_SECTION_LABEL,
  type ArrangementSectionChanges,
  type ArrangementSource,
} from '../../utils/arrangement';
import { ActionMenu } from './ActionMenu';
import { ArrangementSectionDialog } from './ArrangementSectionDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog } from './Dialog';
import { iconButton, secondaryButton, sectionHeading, textField } from './ui';

interface ArrangementEditorProps {
  /** The song's sections, as it is written in the songbook */
  songSections: SongSection[];
  /** Undefined while the song is played exactly as it is written */
  arrangement: SetlistArrangement | undefined;
  onChange: (arrangement: SetlistArrangement | undefined) => void;
  /** The team of the setlist, offered first when assigning people */
  participantIds: string[];
  /** Someone assigned from outside the team joins it (applied when the entry is saved) */
  onAddParticipants: (memberIds: string[]) => void;
  /**
   * Blocks of an arrangement made on an older version of the song that could
   * not be matched without doubt (see bindArrangement): someone chooses.
   */
  pendingIds?: string[];
  /** Points a pending block at a section of the song now, or takes it out (null) */
  onResolvePending?: (id: string, source: ArrangementSource | null) => void;
}

type OpenDialog = { kind: 'section'; id: string } | { kind: 'add' } | { kind: 'reset' };

/**
 * The arrangement of one song in one setlist: the order of its sections, who
 * sings each one, how many times and what happens next.
 *
 * It starts from the song's own structure and stays a *reference* to it: what
 * is edited here is how the song will be played on this occasion, never the
 * song in the songbook.
 */
export const ArrangementEditor: React.FC<ArrangementEditorProps> = ({
  songSections,
  arrangement,
  onChange,
  participantIds,
  onAddParticipants,
  pendingIds = [],
  onResolvePending,
}) => {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const pendingFieldId = useId();
  const { membersById } = useMinistryData();
  const closeDialog = () => setDialog(null);

  const sections = useMemo(
    () => resolveArrangement(songSections, arrangement),
    [songSections, arrangement]
  );
  const sources = useMemo(() => listArrangementSources(songSections), [songSections]);
  const summary = useMemo(() => summarizeArrangement(sections), [sections]);
  const isCustom = Boolean(arrangement) && !matchesSongStructure(songSections, arrangement);
  const pending = new Set(pendingIds);
  // A pending block still points at a place in the old text: its stored name is
  // what it was, never the name of whatever section sits there now.
  const storedLabels = new Map((arrangement?.sections ?? []).map((entry) => [entry.id, entry.label || UNTITLED_SECTION_LABEL]));

  // Until something is changed there is nothing stored: the song's own
  // structure is the arrangement, and the first edit is what writes one down.
  const edit = (change: (current: SetlistArrangement) => SetlistArrangement) => {
    onChange(change(arrangement ?? createArrangement(songSections)));
  };

  const {
    announcement,
    draggingId,
    recentlyMovedId,
    attachList,
    attachRow,
    rowStyle,
    handleProps,
    moveBy,
  } = useReorderList({
    ids: sections.map((entry) => entry.id),
    onMove: (id, toIndex) => edit((current) => moveArrangementSection(current, id, toIndex)),
    onMoveBy: (id, delta) => edit((current) => moveArrangementSectionBy(current, id, delta)),
    describeMove: (id, toIndex, total) => {
      const entry = sections.find((candidate) => candidate.id === id);
      return `${entry ? resolvedSectionName(entry) : 'Sección'} en la posición ${toIndex + 1} de ${total}`;
    },
  });

  const openSection = dialog?.kind === 'section' ? sections.find((entry) => entry.id === dialog.id) : null;

  const saveSection = (id: string, changes: ArrangementSectionChanges) => {
    edit((current) => updateArrangementSection(current, id, changes));
    closeDialog();
  };

  if (sections.length === 0) {
    return (
      <div>
        <p className={`${sectionHeading} mb-2.5`}>Arreglo musical</p>
        <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
          Esta canción todavía no tiene secciones marcadas en su letra, así que no hay nada que ordenar.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className={sectionHeading}>Arreglo musical</p>
        {(isCustom || pending.size > 0) && (
          <button
            type="button"
            onClick={() => setDialog({ kind: 'reset' })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors"
          >
            <RotateCcw aria-hidden="true" className="w-3.5 h-3.5" />
            Restablecer al original
          </button>
        )}
      </div>

      <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {isCustom ? describeArrangement(summary) : 'Tal como está escrita la canción.'}
      </p>

      {pending.size > 0 && (
        <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="flex items-start gap-2 text-sm font-semibold text-amber-900 dark:text-amber-200">
            <TriangleAlert aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            La canción cambió desde que se hizo este arreglo
          </p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900/80 dark:text-amber-200/80">
            Elige a qué sección de la canción corresponde cada bloque marcado, o vuelve a la estructura original. Mientras
            quede alguno sin elegir, Modo Ensayo y Modo Misa muestran la canción tal como está escrita.
          </p>
          <ul className="mt-3 space-y-2">
            {arrangement?.sections
              .filter((entry) => pending.has(entry.id))
              .map((entry, index) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <label
                    htmlFor={`${pendingFieldId}-${index}`}
                    className="min-w-0 flex-1 text-[13px] font-bold uppercase tracking-[0.08em] text-[#10203A] dark:text-white"
                  >
                    {storedLabels.get(entry.id)}
                  </label>
                  <select
                    id={`${pendingFieldId}-${index}`}
                    value=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (value === '__remove') onResolvePending?.(entry.id, null);
                      else {
                        const source = sources.find((candidate) => candidate.sectionId === value);
                        if (source) onResolvePending?.(entry.id, source);
                      }
                    }}
                    className={`${textField} w-full sm:w-60`}
                  >
                    <option value="" disabled>
                      Elegir sección…
                    </option>
                    {sources.map((source, position) => (
                      <option key={source.sectionId} value={source.sectionId}>
                        {position + 1}. {source.label}
                      </option>
                    ))}
                    <option value="__remove">Quitar del arreglo</option>
                  </select>
                </li>
              ))}
          </ul>
        </div>
      )}

      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol
        ref={attachList}
        className={`rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800 ${
          draggingId ? 'select-none' : ''
        }`}
      >
        {sections.map((entry, index) => {
          const isDragged = draggingId === entry.id;
          const isPending = pending.has(entry.id);
          const name = isPending ? storedLabels.get(entry.id) ?? entry.label : resolvedSectionName(entry);
          return (
            <li
              key={entry.id}
              ref={attachRow(entry.id)}
              style={rowStyle(index, entry.id)}
              className={`relative flex items-center gap-1 pl-2 pr-1 ${
                isDragged
                  ? 'z-10 rounded-lg bg-white dark:bg-dark-900 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#2464ED]/30'
                  : recentlyMovedId === entry.id
                    ? 'bg-[#EAF1FF] dark:bg-blue-500/10 transition-colors duration-500'
                    : 'transition-colors'
              }`}
            >
              <span
                aria-hidden="true"
                className="w-6 shrink-0 text-center font-mono text-xs font-bold tabular-nums text-slate-300 dark:text-dark-600"
              >
                {String(index + 1).padStart(2, '0')}
              </span>

              <button
                type="button"
                onClick={() => setDialog({ kind: 'section', id: entry.id })}
                className="min-w-0 flex-1 flex flex-col justify-center min-h-[44px] py-2.5 pr-1 text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
              >
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-bold uppercase tracking-[0.08em] text-[#10203A] dark:text-white">
                    {name}
                  </span>
                  {entry.repeatCount > 1 && (
                    <span className="shrink-0 rounded border border-slate-200 dark:border-dark-700 px-1.5 font-mono text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      ×{entry.repeatCount}
                    </span>
                  )}
                  {entry.voices.length > 0 && (
                    <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#2464ED] dark:text-sky-400">
                      {formatVoices(entry.voices)}
                    </span>
                  )}
                  {memberNames(entry.assignedMemberIds, membersById).length > 0 && (
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                      {memberNames(entry.assignedMemberIds, membersById).join(' · ')}
                    </span>
                  )}
                </span>
                {entry.instruction && (
                  <span className="mt-0.5 block truncate text-xs italic text-slate-500 dark:text-slate-400">
                    {entry.instruction}
                  </span>
                )}
                {entry.transition.type !== 'continue' && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                    {entry.transition.type === 'end' ? (
                      <>
                        <Square aria-hidden="true" className="w-3 h-3 shrink-0 fill-current" />
                        Terminar aquí
                      </>
                    ) : (
                      <>
                        <ArrowLeftRight aria-hidden="true" className="w-3 h-3 shrink-0" />
                        Volver a {entry.transitionTargetLabel ?? 'otra sección'}
                      </>
                    )}
                  </span>
                )}
                {isPending ? (
                  <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                    <TriangleAlert aria-hidden="true" className="w-3 h-3 shrink-0" />
                    Falta elegir su sección
                  </span>
                ) : (
                  !entry.section && (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                      <TriangleAlert aria-hidden="true" className="w-3 h-3 shrink-0" />
                      Ya no está en la canción
                    </span>
                  )
                )}
              </button>

              <ActionMenu
                label={`Opciones de ${name}`}
                icon={MoreVertical}
                triggerClassName={iconButton}
                items={[
                  {
                    label: 'Editar esta sección',
                    icon: Pencil,
                    onSelect: () => setDialog({ kind: 'section', id: entry.id }),
                  },
                  {
                    label: 'Duplicar sección',
                    icon: Copy,
                    onSelect: () => edit((current) => duplicateArrangementSection(current, entry.id)),
                  },
                  {
                    label: 'Mover arriba',
                    icon: ArrowUp,
                    disabled: index === 0,
                    separated: true,
                    onSelect: () => moveBy(entry.id, index, -1),
                  },
                  {
                    label: 'Mover abajo',
                    icon: ArrowDown,
                    disabled: index === sections.length - 1,
                    onSelect: () => moveBy(entry.id, index, 1),
                  },
                  {
                    label: 'Quitar del arreglo',
                    icon: Trash2,
                    danger: true,
                    separated: true,
                    onSelect: () => edit((current) => removeArrangementSection(current, entry.id)),
                  },
                ]}
              />

              <button
                type="button"
                {...handleProps(entry.id, index)}
                aria-label={`Reordenar ${name}, posición ${index + 1} de ${sections.length}. Usa las flechas arriba y abajo.`}
                title="Arrastra para reordenar, o usa las flechas"
                className={`${iconButton} touch-none cursor-grab active:cursor-grabbing ${
                  isDragged ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-300 dark:text-dark-600'
                } disabled:cursor-default`}
              >
                <GripVertical className="w-[18px] h-[18px]" />
              </button>
            </li>
          );
        })}
      </ol>

      <div className="mt-2.5">
        <button type="button" onClick={() => setDialog({ kind: 'add' })} className={secondaryButton}>
          <Plus aria-hidden="true" className="w-4 h-4" />
          Añadir sección
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        Solo cambia cómo se toca en este Setlist. La canción del cancionero no se toca.
      </p>

      {openSection && (
        <ArrangementSectionDialog
          entry={openSection}
          position={sections.findIndex((entry) => entry.id === openSection.id) + 1}
          sections={sections}
          participantIds={participantIds}
          onSave={(changes) => {
            const outside = (changes.assignedMemberIds ?? []).filter((id) => !participantIds.includes(id));
            if (outside.length > 0) onAddParticipants(outside);
            saveSection(openSection.id, changes);
          }}
          onClose={closeDialog}
        />
      )}

      {dialog?.kind === 'add' && (
        <Dialog
          title="Añadir sección"
          description="Las secciones de la canción. Puedes añadir la misma más de una vez."
          onClose={closeDialog}
          size="sm"
        >
          <div className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
            {sources.map((source, index) => {
              const uses = sections.filter((entry) => entry.sourceSectionId === source.sectionId).length;
              // Two sections of the song can be called the same ("Coro" written
              // out twice): the place each one holds in the letra tells them apart.
              const repeated = sources.filter((other) => other.label === source.label).length > 1;
              return (
                <button
                  key={source.sectionId}
                  type="button"
                  onClick={() => {
                    edit((current) => addArrangementSection(current, source));
                    closeDialog();
                  }}
                  className="w-full flex items-center gap-2.5 px-3.5 py-3 text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-dark-800"
                >
                  <Plus aria-hidden="true" className="w-4 h-4 shrink-0 text-[#2464ED] dark:text-sky-400" />
                  <span className="min-w-0 flex-1 truncate font-semibold uppercase tracking-[0.06em] text-[13px]">
                    {source.label}
                    {repeated && (
                      <span className="ml-1.5 font-mono text-[11px] font-normal normal-case tracking-normal text-slate-400 dark:text-slate-500">
                        {`nº ${index + 1} de la letra`}
                      </span>
                    )}
                  </span>
                  {uses > 0 && (
                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">
                      {uses === 1 ? 'ya está 1 vez' : `ya está ${uses} veces`}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Dialog>
      )}

      {dialog?.kind === 'reset' && (
        <ConfirmDialog
          title="¿Restablecer el arreglo?"
          message="El arreglo volverá a la estructura original de la canción: se perderán el orden, las voces, las repeticiones y las indicaciones que guardaste aquí."
          confirmLabel="Restablecer"
          onConfirm={() => onChange(undefined)}
          onClose={closeDialog}
        />
      )}
    </div>
  );
};
