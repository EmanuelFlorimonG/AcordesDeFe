import React, { useId, useState } from 'react';
import { ArrowLeftRight, Check, ChevronRight, Square, UserPlus, X } from 'lucide-react';
import type { ArrangementTransition, VoiceRole } from '../../types/setlist';
import {
  ADVANCED_VOICE_ROLES,
  MAX_INSTRUCTION_LENGTH,
  MAX_REPEAT_COUNT,
  MIN_REPEAT_COUNT,
  PRIMARY_VOICE_ROLES,
  VOICE_LABELS,
  resolvedSectionName,
  type ArrangementSectionChanges,
  type ResolvedArrangementSection,
} from '../../utils/arrangement';
import { useMinistryData } from '../../hooks/ministryContext';
import { Stepper } from '../Rehearsal/RehearsalControls';
import { MemberAvatar } from '../Members/MemberAvatar';
import { MemberPicker } from '../Members/MemberPicker';
import { Dialog } from './Dialog';
import { chipButton, chipOff, chipOn, fieldLabel, primaryButton, secondaryButton, textField } from './ui';

interface ArrangementSectionDialogProps {
  entry: ResolvedArrangementSection;
  /** Position in the arrangement, 1-based */
  position: number;
  /** Every section of the arrangement, so a jump can say where it leads */
  sections: ResolvedArrangementSection[];
  /** The team of the setlist: offered first when choosing people */
  participantIds: string[];
  onSave: (changes: ArrangementSectionChanges) => void;
  onClose: () => void;
}

type TransitionKind = ArrangementTransition['type'];

const TRANSITIONS: Array<{ kind: TransitionKind; label: string; icon: React.ElementType }> = [
  { kind: 'continue', label: 'Continuar', icon: ChevronRight },
  { kind: 'jump', label: 'Volver a…', icon: ArrowLeftRight },
  { kind: 'end', label: 'Terminar aquí', icon: Square },
];

/**
 * One block of the arrangement: who sings it, how many times, what to remember
 * and what happens next. Everything here belongs to this setlist only.
 */
export const ArrangementSectionDialog: React.FC<ArrangementSectionDialogProps> = ({
  entry,
  position,
  sections,
  participantIds,
  onSave,
  onClose,
}) => {
  const [voices, setVoices] = useState<VoiceRole[]>(entry.voices);
  const { members, membersById } = useMinistryData();
  // Someone deleted in the meantime simply isn't listed: nothing to show for them.
  const [assigned, setAssigned] = useState<string[]>(() =>
    entry.assignedMemberIds.filter((id) => membersById.has(id))
  );
  const [isChoosingPeople, setIsChoosingPeople] = useState(false);
  const peopleId = useId();
  const team = members.filter((member) => participantIds.includes(member.id));
  const others = members.filter((member) => !participantIds.includes(member.id));
  const toggleAssigned = (id: string) =>
    setAssigned((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));
  const [repeatCount, setRepeatCount] = useState(entry.repeatCount);
  const [instruction, setInstruction] = useState(entry.instruction);
  const [transitionKind, setTransitionKind] = useState<TransitionKind>(entry.transition.type);
  const [targetId, setTargetId] = useState(
    entry.transition.type === 'jump' ? entry.transition.targetId : ''
  );
  const [showAdvanced, setShowAdvanced] = useState(
    entry.voices.some((role) => ADVANCED_VOICE_ROLES.includes(role))
  );
  const instructionId = useId();
  const voicesId = useId();
  const jumpId = useId();

  // A jump leads to another section, never to itself.
  const targets = sections.filter((candidate) => candidate.id !== entry.id);
  const chosenTarget = targets.find((candidate) => candidate.id === targetId) ?? null;

  const toggleVoice = (role: VoiceRole) => {
    setVoices((current) =>
      current.includes(role) ? current.filter((entryRole) => entryRole !== role) : [...current, role]
    );
  };

  const save = () => {
    const transition: ArrangementTransition =
      transitionKind === 'end'
        ? { type: 'end' }
        : transitionKind === 'jump' && chosenTarget
          ? { type: 'jump', targetId: chosenTarget.id }
          : { type: 'continue' };
    onSave({ voices, assignedMemberIds: assigned, repeatCount, instruction, transition });
  };

  const renderVoice = (role: VoiceRole) => {
    const selected = voices.includes(role);
    return (
      <button
        key={role}
        type="button"
        onClick={() => toggleVoice(role)}
        aria-pressed={selected}
        className={`${chipButton} ${selected ? chipOn : chipOff}`}
      >
        {selected && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />}
        {VOICE_LABELS[role]}
      </button>
    );
  };

  return (
    <Dialog
      title={resolvedSectionName(entry)}
      description={`Sección ${position} del arreglo`}
      onClose={onClose}
      onSubmit={save}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            Guardar sección
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <p id={voicesId} className={fieldLabel}>
            Quién canta
          </p>
          <div role="group" aria-labelledby={voicesId} className="flex flex-wrap gap-1.5">
            {PRIMARY_VOICE_ROLES.map(renderVoice)}
            {showAdvanced ? (
              ADVANCED_VOICE_ROLES.map(renderVoice)
            ) : (
              <button
                type="button"
                onClick={() => setShowAdvanced(true)}
                aria-expanded={false}
                className={`${chipButton} border-dashed ${chipOff} normal-case tracking-normal`}
              >
                Más voces
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {voices.length === 0
              ? 'Sin asignar: se canta como siempre.'
              : 'Puedes elegir varias: por ejemplo solista y coro a la vez.'}
          </p>
        </div>

        {members.length > 0 && (
          <div>
            <p id={peopleId} className={fieldLabel}>
              Personas
            </p>
            {assigned.length > 0 ? (
              <ul aria-labelledby={peopleId} className="mb-2 flex flex-wrap gap-1.5">
                {assigned.map((id) => {
                  const member = membersById.get(id);
                  if (!member) return null;
                  return (
                    <li
                      key={id}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 py-1 pl-1 pr-1"
                    >
                      <MemberAvatar id={member.id} name={member.name} isActive={member.isActive} size="sm" />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{member.name}</span>
                      {!member.isActive && (
                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                          Inactivo
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleAssigned(id)}
                        aria-label={`Quitar a ${member.name} de esta sección`}
                        title="Quitar"
                        className="w-8 h-8 [@media(pointer:coarse)]:w-10 [@media(pointer:coarse)]:h-10 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                {voices.length > 0 ? 'Todavía sin decidir quién.' : 'Nadie en particular.'}
              </p>
            )}
            <button
              type="button"
              onClick={() => setIsChoosingPeople((value) => !value)}
              aria-expanded={isChoosingPeople}
              className="inline-flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-11 px-2.5 -ml-2.5 rounded-lg text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
            >
              <UserPlus className="w-4 h-4" />
              {isChoosingPeople ? 'Listo' : 'Asignar miembro'}
            </button>
            {isChoosingPeople && (
              <div className="mt-2">
                <MemberPicker
                  label="Miembros para esta sección"
                  groups={[
                    { title: team.length > 0 ? 'Equipo de esta celebración' : undefined, members: team },
                    { title: team.length > 0 ? 'Otros miembros' : undefined, members: others },
                  ]}
                  selectedIds={assigned}
                  onToggle={toggleAssigned}
                  outsideHint={team.length > 0 ? 'Se añade también al equipo' : undefined}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Repeticiones</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {repeatCount === 1 ? 'Se canta una vez' : `Se canta ${repeatCount} veces seguidas`}. La letra
              no se duplica.
            </p>
          </div>
          <Stepper
            size="lg"
            label="Repeticiones de esta sección"
            value={<span className="font-mono">×{repeatCount}</span>}
            onDecrease={() => setRepeatCount((current) => Math.max(MIN_REPEAT_COUNT, current - 1))}
            onIncrease={() => setRepeatCount((current) => Math.min(MAX_REPEAT_COUNT, current + 1))}
            canDecrease={repeatCount > MIN_REPEAT_COUNT}
            canIncrease={repeatCount < MAX_REPEAT_COUNT}
            decreaseTitle="Una repetición menos"
            increaseTitle="Una repetición más"
          />
        </div>

        <div>
          <label htmlFor={instructionId} className={fieldLabel}>
            Indicación
          </label>
          <input
            id={instructionId}
            type="text"
            value={instruction}
            maxLength={MAX_INSTRUCTION_LENGTH}
            onChange={(event) => setInstruction(event.target.value)}
            placeholder="Piano solo, entrar suave…"
            className={textField}
          />
        </div>

        <div>
          <p id={jumpId} className={fieldLabel}>
            Al terminar
          </p>
          <div role="group" aria-labelledby={jumpId} className="flex flex-wrap gap-1.5">
            {TRANSITIONS.map(({ kind, label, icon: Icon }) => {
              const selected = transitionKind === kind;
              const disabled = kind === 'jump' && targets.length === 0;
              return (
                <button
                  key={kind}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    setTransitionKind(kind);
                    if (kind === 'jump' && !chosenTarget && targets.length > 0) setTargetId(targets[0].id);
                  }}
                  aria-pressed={selected}
                  className={`${chipButton} normal-case tracking-normal disabled:opacity-40 disabled:pointer-events-none ${
                    selected ? chipOn : chipOff
                  }`}
                >
                  <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${kind === 'end' ? 'fill-current' : ''}`} />
                  {label}
                </button>
              );
            })}
          </div>

          {transitionKind === 'jump' && targets.length > 0 && (
            <div
              role="group"
              aria-label="Sección a la que se vuelve"
              className="mt-2.5 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800"
            >
              {targets.map((candidate) => {
                const selected = candidate.id === chosenTarget?.id;
                const number = sections.findIndex((item) => item.id === candidate.id) + 1;
                return (
                  <button
                    key={candidate.id}
                    type="button"
                    onClick={() => setTargetId(candidate.id)}
                    aria-pressed={selected}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                      selected
                        ? 'bg-[#EAF1FF] dark:bg-blue-500/10 text-[#10203A] dark:text-white font-semibold'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800'
                    }`}
                  >
                    <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-slate-400 dark:text-slate-500">
                      {String(number).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{resolvedSectionName(candidate)}</span>
                    {selected && <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-[#2464ED]" />}
                  </button>
                );
              })}
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Es una indicación para los músicos: durante el ensayo se muestra, no se salta solo.
          </p>
        </div>
      </div>
    </Dialog>
  );
};
