import React, { useId, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Copy, GripVertical, MoreHorizontal, Music2, Plus, Repeat, Trash2, TriangleAlert } from 'lucide-react';
import { useReorderList } from '../../hooks/useReorderList';
import {
  SECTION_KIND_OPTIONS,
  addSection,
  createLine,
  defaultLabelFor,
  duplicateSection,
  effectiveLabel,
  mergeLines,
  moveSection,
  moveSectionBy,
  pasteIntoLine,
  removeSection,
  repeatSection,
  repeatsOf,
  sectionKindOf,
  splitLine,
  updateSection,
  type EditorDocument,
  type EditorIssue,
  type EditorLine,
  type EditorSection,
  type EditorSectionKind,
} from '../../editor/songEditorModel';
import { ActionMenu } from '../Setlists/ActionMenu';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { iconButton, secondaryButton, textField } from '../Setlists/ui';
import { LineEditor } from './LineEditor';

interface SectionsEditorProps {
  doc: EditorDocument;
  issues: EditorIssue[];
  suggestions: string[];
  onChange: (update: (doc: EditorDocument) => EditorDocument) => void;
}

/** "Verso 2" -> 2; null when the label has no trailing number. */
const numberOf = (label: string) => {
  const match = label.trim().match(/\s(\d+)$/);
  return match ? Number(match[1]) : null;
};

/**
 * The song's structure: sections in the order they are sung, each with its
 * lines. Sections are reordered by dragging the handle, with the arrow keys
 * on it, or from each section's menu.
 */
export const SectionsEditor: React.FC<SectionsEditorProps> = ({ doc, issues, suggestions, onChange }) => {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [confirmRemove, setConfirmRemove] = useState<EditorSection | null>(null);

  const focusLine = (lineId: string, caret: number) =>
    requestAnimationFrame(() => {
      const input = inputs.current.get(lineId);
      if (!input) return;
      input.focus();
      input.setSelectionRange(caret, caret);
    });

  const { announcement, draggingId, recentlyMovedId, attachList, attachRow, rowStyle, handleProps, moveBy } = useReorderList({
    ids: doc.sections.map((section) => section.id),
    onMove: (id, toIndex) => onChange((current) => moveSection(current, id, toIndex)),
    onMoveBy: (id, delta) => onChange((current) => moveSectionBy(current, id, delta)),
    describeMove: (id, toIndex, total) => {
      const section = doc.sections.find((entry) => entry.id === id);
      return `${section ? effectiveLabel(doc, section) || 'Sección' : 'Sección'} en la posición ${toIndex + 1} de ${total}`;
    },
  });

  const editLines = (sectionId: string, change: (lines: EditorLine[]) => EditorLine[]) =>
    onChange((current) => updateSection(current, sectionId, (section) => ({ ...section, lines: change(section.lines) })));

  const repeatTargets = doc.sections.filter((section) => !section.repeatOf && sectionKindOf(section.label) !== 'custom' && section.label.trim());

  return (
    <div>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol ref={attachList} aria-label="Secciones de la canción" className={`space-y-3 ${draggingId ? 'select-none' : ''}`}>
        {doc.sections.map((section, index) => {
          const sectionIssues = issues.filter((issue) => issue.sectionId === section.id && !issue.lineId);
          const label = effectiveLabel(doc, section);
          return (
            <li
              key={section.id}
              id={`seccion-${section.id}`}
              ref={attachRow(section.id)}
              style={rowStyle(index, section.id)}
              className={`rounded-xl border bg-white dark:bg-dark-900 shadow-sm transition-colors ${
                draggingId === section.id
                  ? 'border-[#2464ED] shadow-lg'
                  : recentlyMovedId === section.id
                    ? 'border-[#2464ED]/60'
                    : 'border-slate-200 dark:border-dark-700'
              }`}
            >
              <SectionHeader
                doc={doc}
                section={section}
                index={index}
                repeatTargets={repeatTargets}
                dragHandle={
                  <button
                    type="button"
                    {...handleProps(section.id, index)}
                    aria-label={`Mover ${label || 'sección'}. Arrastra, o usa las flechas arriba y abajo.`}
                    className={`${iconButton} touch-none cursor-grab active:cursor-grabbing`}
                  >
                    <GripVertical className="w-[18px] h-[18px]" />
                  </button>
                }
                menu={
                  <ActionMenu
                    label={`Opciones de ${label || 'la sección'}`}
                    icon={MoreHorizontal}
                    triggerClassName={iconButton}
                    items={[
                      ...(!section.repeatOf
                        ? [
                            { label: 'Duplicar (copia independiente)', icon: Copy, onSelect: () => onChange((current) => duplicateSection(current, section.id)) },
                            ...(sectionKindOf(section.label) !== 'custom' && section.label.trim()
                              ? [{ label: 'Repetir más adelante', icon: Repeat, onSelect: () => onChange((current) => repeatSection(current, section.id)) }]
                              : []),
                          ]
                        : []),
                      { label: 'Subir', icon: ArrowUp, disabled: index === 0, separated: true, onSelect: () => moveBy(section.id, index, -1) },
                      { label: 'Bajar', icon: ArrowDown, disabled: index === doc.sections.length - 1, onSelect: () => moveBy(section.id, index, 1) },
                      {
                        label: 'Eliminar sección',
                        icon: Trash2,
                        danger: true,
                        separated: true,
                        disabled: doc.sections.length === 1,
                        onSelect: () =>
                          repeatsOf(doc, section.id).length > 0 || section.lines.some((line) => line.text.trim() || line.chords.length > 0)
                            ? setConfirmRemove(section)
                            : onChange((current) => removeSection(current, section.id)),
                      },
                    ]}
                  />
                }
                onChange={onChange}
              />

              {sectionIssues.length > 0 && (
                <ul className="mx-3 mb-2 space-y-1">
                  {sectionIssues.map((issue) => (
                    <li
                      key={issue.code}
                      className={`flex items-start gap-1.5 text-xs font-semibold ${
                        issue.severity === 'error' ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      <TriangleAlert aria-hidden="true" className="mt-0.5 w-3.5 h-3.5 shrink-0" />
                      {issue.message}
                    </li>
                  ))}
                </ul>
              )}

              {section.repeatOf ? (
                <RepeatPreview doc={doc} section={section} />
              ) : (
                <div className="space-y-2 px-3 pb-3">
                  {section.lines.map((line, lineIndex) => (
                    <div key={line.id}>
                      <LineEditor
                        line={line}
                        name={`${label || 'Sección'}, línea ${lineIndex + 1}`}
                        suggestions={suggestions}
                        canRemove={section.lines.length > 1}
                        registerInput={(lineId, element) => {
                          if (element) inputs.current.set(lineId, element);
                          else inputs.current.delete(lineId);
                        }}
                        onChange={(next) => editLines(section.id, (lines) => lines.map((entry) => (entry.id === next.id ? next : entry)))}
                        onSplit={(lineId, caret) => {
                          const target = section.lines.find((entry) => entry.id === lineId);
                          if (!target) return;
                          const [first, second] = splitLine(target, caret);
                          editLines(section.id, (lines) => lines.flatMap((entry) => (entry.id === lineId ? [first, second] : [entry])));
                          focusLine(second.id, 0);
                        }}
                        onMergeWithPrevious={(lineId) => {
                          const at = section.lines.findIndex((entry) => entry.id === lineId);
                          if (at <= 0) return;
                          const previous = section.lines[at - 1];
                          const merged = mergeLines(previous, section.lines[at]);
                          editLines(section.id, (lines) => lines.filter((entry) => entry.id !== lineId).map((entry) => (entry.id === previous.id ? merged : entry)));
                          focusLine(previous.id, previous.text.length);
                        }}
                        onFocusSibling={(lineId, direction, caret) => {
                          const at = section.lines.findIndex((entry) => entry.id === lineId);
                          const sibling = section.lines[at + direction];
                          if (sibling && !sibling.instrumental) focusLine(sibling.id, Math.min(caret, sibling.text.length));
                        }}
                        onPaste={(lineId, start, end, pastedLines) => {
                          const target = section.lines.find((entry) => entry.id === lineId);
                          if (!target) return;
                          const replacement = pasteIntoLine(target, start, end, pastedLines);
                          editLines(section.id, (lines) => lines.flatMap((entry) => (entry.id === lineId ? replacement : [entry])));
                          const last = replacement[replacement.length - 1];
                          if (!last.instrumental) focusLine(last.id, last.text.length);
                        }}
                        onRemove={(lineId) => editLines(section.id, (lines) => lines.filter((entry) => entry.id !== lineId))}
                      />
                      {issues
                        .filter((issue) => issue.lineId === line.id && !issue.anchorId)
                        .map((issue) => (
                          <p key={issue.code} className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                            {issue.message}
                          </p>
                        ))}
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        const line = createLine();
                        editLines(section.id, (lines) => [...lines, line]);
                        focusLine(line.id, 0);
                      }}
                      className={smallAction}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Línea
                    </button>
                    <button
                      type="button"
                      onClick={() => editLines(section.id, (lines) => [...lines, { ...createLine(), instrumental: true }])}
                      className={smallAction}
                    >
                      <Music2 className="w-3.5 h-3.5" />
                      Línea instrumental
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap gap-2">
        <ActionMenu
          label="Agregar sección"
          icon={Plus}
          triggerClassName={`${secondaryButton} gap-1.5`}
          items={SECTION_KIND_OPTIONS.map((option) => ({
            label: option.kind === 'custom' ? 'Personalizada' : option.numbered ? `${option.name} (numerado)` : option.name,
            icon: Plus,
            onSelect: () =>
              onChange((current) => addSection(current, option.kind === 'custom' ? 'Sección' : defaultLabelFor(option.kind, current.sections))),
          }))}
        />
        {repeatTargets.length > 0 && (
          <ActionMenu
            label="Repetir una sección"
            icon={Repeat}
            triggerClassName={`${secondaryButton} gap-1.5`}
            items={repeatTargets.map((target) => ({
              label: `Repetir ${target.label.trim()}`,
              icon: Repeat,
              onSelect: () => onChange((current) => repeatSection(current, target.id)),
            }))}
          />
        )}
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Duplicar crea una copia que puedes cambiar. Repetir vuelve a cantar la misma sección: se escribe una vez y se muestra
        cada vez que se canta.
      </p>

      {confirmRemove && (
        <ConfirmDialog
          title={`¿Eliminar «${effectiveLabel(doc, confirmRemove) || 'la sección'}»?`}
          message={
            repeatsOf(doc, confirmRemove.id).length > 0
              ? 'Se quitarán su letra, sus acordes y también las veces que se repite más adelante.'
              : 'Se quitarán su letra y sus acordes.'
          }
          confirmLabel="Eliminar sección"
          cancelLabel="Conservar"
          onConfirm={() => onChange((current) => removeSection(current, confirmRemove.id))}
          onClose={() => setConfirmRemove(null)}
        />
      )}
    </div>
  );
};

const smallAction =
  'inline-flex items-center gap-1 h-9 [@media(pointer:coarse)]:h-11 rounded-lg px-2.5 text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';

const SectionHeader: React.FC<{
  doc: EditorDocument;
  section: EditorSection;
  index: number;
  repeatTargets: EditorSection[];
  dragHandle: React.ReactNode;
  menu: React.ReactNode;
  onChange: SectionsEditorProps['onChange'];
}> = ({ doc, section, index, repeatTargets, dragHandle, menu, onChange }) => {
  const kindId = useId();
  const numberId = useId();
  const nameId = useId();
  const setLabel = (label: string) => onChange((current) => updateSection(current, section.id, (entry) => ({ ...entry, label })));

  if (section.repeatOf) {
    const targets = repeatTargets.filter((target) => doc.sections.indexOf(target) < index || target.id === section.repeatOf);
    return (
      <div className="flex items-center gap-1 px-1.5 py-1.5">
        {dragHandle}
        <Repeat aria-hidden="true" className="w-4 h-4 shrink-0 text-[#2464ED] dark:text-sky-400" />
        <label htmlFor={kindId} className="ml-1 shrink-0 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
          Repite
        </label>
        <select
          id={kindId}
          value={section.repeatOf}
          onChange={(event) =>
            onChange((current) => updateSection(current, section.id, (entry) => ({ ...entry, repeatOf: event.target.value })))
          }
          className="h-10 [@media(pointer:coarse)]:h-11 min-w-0 flex-1 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-2 text-sm font-semibold text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
        >
          {targets.map((target) => (
            <option key={target.id} value={target.id}>
              {target.label.trim()}
            </option>
          ))}
        </select>
        {menu}
      </div>
    );
  }

  const kind = sectionKindOf(section.label);
  const option = SECTION_KIND_OPTIONS.find((entry) => entry.kind === kind);
  const number = numberOf(section.label);
  return (
    <div className="flex items-center gap-1.5 px-1.5 py-1.5">
      {dragHandle}
      <label htmlFor={kindId} className="sr-only">
        Tipo de sección
      </label>
      <select
        id={kindId}
        value={kind}
        onChange={(event) => {
          const next = event.target.value as EditorSectionKind;
          setLabel(next === 'custom' ? section.label || 'Sección' : defaultLabelFor(next, doc.sections, index));
        }}
        className="h-10 [@media(pointer:coarse)]:h-11 min-w-0 flex-1 sm:flex-none rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-2 text-sm font-bold uppercase tracking-[0.06em] text-[#10203A] dark:text-white dark:[color-scheme:dark]"
      >
        {SECTION_KIND_OPTIONS.map((entry) => (
          <option key={entry.kind} value={entry.kind}>
            {entry.name}
          </option>
        ))}
      </select>
      {kind === 'custom' ? (
        <>
          <label htmlFor={nameId} className="sr-only">
            Nombre de la sección
          </label>
          <input
            id={nameId}
            value={section.label}
            maxLength={40}
            onChange={(event) => setLabel(event.target.value.replace(/[[\]]/g, ''))}
            placeholder="Nombre de la sección"
            className={`${textField} h-10 min-w-0 flex-1 py-0`}
          />
        </>
      ) : (
        option?.numbered !== false || number !== null ? (
          <>
            <label htmlFor={numberId} className="sr-only">
              Número de {option?.name ?? 'sección'}
            </label>
            <input
              id={numberId}
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={number ?? ''}
              onChange={(event) => {
                const value = Number(event.target.value);
                const base = section.label.replace(/\s\d+$/, '').trim();
                setLabel(Number.isInteger(value) && value > 0 ? `${base} ${Math.min(value, 20)}` : base);
              }}
              placeholder="N.º"
              className="h-10 [@media(pointer:coarse)]:h-11 w-16 shrink-0 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 px-2 text-sm text-slate-800 dark:text-slate-100 dark:[color-scheme:dark]"
            />
          </>
        ) : null
      )}
      <span className="hidden sm:block sm:flex-1" />
      {menu}
    </div>
  );
};

const RepeatPreview: React.FC<{ doc: EditorDocument; section: EditorSection }> = ({ doc, section }) => {
  const target = doc.sections.find((entry) => entry.id === section.repeatOf);
  const first = target?.lines.find((line) => line.text.trim());
  return (
    <p className="mx-3 mb-3 rounded-lg border border-dashed border-slate-200 dark:border-dark-700 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
      Se canta de nuevo «{target?.label.trim() ?? 'la sección'}»{first ? `: ${first.text.trim().slice(0, 60)}…` : '.'} La letra y los acordes
      se toman de la sección original.
    </p>
  );
};
