import React, { useId, useState } from 'react';
import { Check, Users } from 'lucide-react';
import type { MinistryEventDetails, MinistryEventType, RecurrenceFrequency } from '../../types/event';
import type { MinistryMember } from '../../types/ministry';
import type { Setlist } from '../../types/setlist';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  MAX_EVENT_LOCATION_LENGTH,
  MAX_EVENT_NOTES_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_LABELS,
  suggestedTitle,
  validateEventDetails,
  type EventValidationError,
} from '../../utils/ministryEvents';
import { MemberPicker } from '../Members/MemberPicker';
import { Dialog } from '../Setlists/Dialog';
import { chipButton, chipOff, chipOn, fieldLabel, primaryButton, secondaryButton, sectionHeading, textField } from '../Setlists/ui';
import { EVENT_TYPE_ICONS } from './eventTypeStyle';
import { SetlistPickerList } from './SetlistPickerList';
import { DatePicker } from '../ui/DatePicker';

interface EventFormDialogProps {
  mode: 'create' | 'edit' | 'duplicate';
  initialDetails: Partial<MinistryEventDetails>;
  setlists: Setlist[];
  members: MinistryMember[];
  todayIso: string;
  /**
   * A single activity already closed (Realizada or Cancelada) keeps its date
   * and doesn't become a series: its status and history point at that day.
   */
  dateLocked?: boolean;
  onSubmit: (details: MinistryEventDetails) => void;
  onClose: () => void;
}

const ERROR_TEXT: Record<EventValidationError, string> = {
  title: 'Escribe un título.',
  date: 'Elige una fecha.',
  startTime: 'Indica la hora de inicio, o marca "Todo el día".',
  endTime: 'La hora de fin no puede ser anterior a la de inicio.',
  until: 'La fecha final de la serie no puede ser anterior a la primera.',
};

const TITLES = { create: 'Nueva actividad', edit: 'Editar actividad', duplicate: 'Duplicar actividad' };

/**
 * An activity: what, when, where, with whom and with which songs. Choosing a
 * setlist never changes the team on its own: "Usar equipo del Setlist" copies
 * it, once, when asked.
 */
export const EventFormDialog: React.FC<EventFormDialogProps> = ({
  mode,
  initialDetails,
  setlists,
  members,
  todayIso,
  dateLocked = false,
  onSubmit,
  onClose,
}) => {
  const [details, setDetails] = useState<MinistryEventDetails>({
    // A new activity starts titled after its type ("Misa"), ready to be refined.
    title: suggestedTitle(initialDetails.type ?? 'mass'),
    type: 'mass',
    date: todayIso,
    allDay: false,
    startTime: '',
    endTime: '',
    location: '',
    notes: '',
    setlistId: null,
    participantIds: [],
    recurrence: null,
    ...initialDetails,
  } as MinistryEventDetails);
  // The title follows the type until someone writes their own.
  const [titleIsSuggested, setTitleIsSuggested] = useState(
    !initialDetails.title || initialDetails.title === suggestedTitle(initialDetails.type ?? 'mass')
  );
  const [errors, setErrors] = useState<EventValidationError[]>([]);
  const [teamMessage, setTeamMessage] = useState('');
  const ids = {
    title: useId(),
    date: useId(),
    start: useId(),
    end: useId(),
    until: useId(),
    location: useId(),
    notes: useId(),
    allDay: useId(),
    type: useId(),
    repeat: useId(),
  };

  const set = <K extends keyof MinistryEventDetails>(key: K, value: MinistryEventDetails[K]) => {
    setDetails((current) => ({ ...current, [key]: value }));
    setErrors([]);
  };

  const chooseType = (type: MinistryEventType) => {
    setDetails((current) => ({ ...current, type, title: titleIsSuggested ? suggestedTitle(type) : current.title }));
  };

  const selectedSetlist = setlists.find((setlist) => setlist.id === details.setlistId) ?? null;
  const setlistTeam = selectedSetlist?.participantIds.filter((id) => members.some((member) => member.id === id)) ?? [];

  const submit = () => {
    const found = validateEventDetails(details);
    if (found.length > 0) {
      setErrors(found);
      return;
    }
    onSubmit(details);
  };

  const errorFor = (key: EventValidationError) =>
    errors.includes(key) ? (
      <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
        {ERROR_TEXT[key]}
      </p>
    ) : null;

  return (
    <Dialog
      title={TITLES[mode]}
      description={mode === 'duplicate' ? 'Una copia con el mismo equipo y repertorio. Elige su fecha.' : undefined}
      size="lg"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            {mode === 'edit' ? 'Guardar' : 'Crear actividad'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <p id={ids.type} className={fieldLabel}>
            Tipo
          </p>
          <div role="group" aria-labelledby={ids.type} className="flex flex-wrap gap-1.5">
            {EVENT_TYPES.map((type) => {
              const Icon = EVENT_TYPE_ICONS[type];
              const selected = details.type === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => chooseType(type)}
                  aria-pressed={selected}
                  className={`${chipButton} normal-case tracking-normal ${selected ? chipOn : chipOff}`}
                >
                  <Icon aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
                  {EVENT_TYPE_LABELS[type]}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor={ids.title} className={fieldLabel}>
            Título <span className="text-red-500">*</span>
          </label>
          <input
            id={ids.title}
            data-autofocus=""
            type="text"
            value={details.title}
            maxLength={MAX_EVENT_TITLE_LENGTH}
            onChange={(event) => {
              set('title', event.target.value);
              setTitleIsSuggested(false);
            }}
            placeholder="Por ejemplo, Misa de Jóvenes"
            aria-invalid={errors.includes('title')}
            className={textField}
          />
          {errorFor('title')}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor={ids.date} className={fieldLabel}>
              Fecha <span className="text-red-500">*</span>
            </label>
            <DatePicker
              id={ids.date}
              value={details.date}
              onChange={(value) => set('date', value)}
              disabled={dateLocked}
              describedBy={dateLocked ? `${ids.date}-bloqueada` : undefined}
              invalid={errors.includes('date')}
            />
            {dateLocked && (
              <p id={`${ids.date}-bloqueada`} className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                Ya está cerrada en esta fecha. Para moverla, vuelve antes a Programada.
              </p>
            )}
            {errorFor('date')}
          </div>
          <label htmlFor={ids.allDay} className="flex items-center gap-3 self-end h-11 cursor-pointer">
            <input
              id={ids.allDay}
              type="checkbox"
              checked={details.allDay}
              onChange={(event) => set('allDay', event.target.checked)}
              className="w-5 h-5 rounded accent-[#2464ED]"
            />
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Todo el día</span>
          </label>
        </div>

        {!details.allDay && (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor={ids.start} className={fieldLabel}>
                Hora de inicio <span className="text-red-500">*</span>
              </label>
              <input
                id={ids.start}
                type="time"
                value={details.startTime ?? ''}
                onChange={(event) => set('startTime', event.target.value)}
                aria-invalid={errors.includes('startTime')}
                className={textField}
              />
            </div>
            <div>
              <label htmlFor={ids.end} className={fieldLabel}>
                Hora de fin <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input
                id={ids.end}
                type="time"
                value={details.endTime ?? ''}
                onChange={(event) => set('endTime', event.target.value)}
                aria-invalid={errors.includes('endTime')}
                className={textField}
              />
            </div>
            <div className="col-span-2 -mt-2">
              {errorFor('startTime')}
              {errorFor('endTime')}
            </div>
          </div>
        )}

        {mode !== 'duplicate' && !dateLocked && (
          <div>
            <p id={ids.repeat} className={fieldLabel}>
              Se repite
            </p>
            <div role="group" aria-labelledby={ids.repeat} className="flex flex-wrap gap-1.5">
              {[null, ...RECURRENCE_FREQUENCIES].map((frequency: RecurrenceFrequency | null) => {
                const selected = (details.recurrence?.frequency ?? null) === frequency;
                return (
                  <button
                    key={frequency ?? 'none'}
                    type="button"
                    onClick={() =>
                      set(
                        'recurrence',
                        frequency
                          ? { frequency, until: details.recurrence?.until ?? null, excludedDates: details.recurrence?.excludedDates ?? [] }
                          : null
                      )
                    }
                    aria-pressed={selected}
                    className={`${chipButton} normal-case tracking-normal ${selected ? chipOn : chipOff}`}
                  >
                    {selected && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />}
                    {frequency ? RECURRENCE_LABELS[frequency] : 'No se repite'}
                  </button>
                );
              })}
            </div>
            {details.recurrence && (
              <div className="mt-3 sm:max-w-[16rem]">
                <label htmlFor={ids.until} className={fieldLabel}>
                  Hasta <span className="font-normal text-slate-400">(opcional)</span>
                </label>
                <DatePicker
                  id={ids.until}
                  value={details.recurrence.until ?? ''}
                  min={details.date || undefined}
                  onChange={(value) => set('recurrence', { ...details.recurrence!, until: value || null })}
                  clearable
                  placeholder="Sin fecha de fin"
                />
                {errorFor('until')}
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  Los cambios se aplican a toda la serie.
                  {details.recurrence.frequency === 'monthly' && ' Los meses sin ese día no tienen actividad.'}
                </p>
              </div>
            )}
          </div>
        )}

        <div>
          <label htmlFor={ids.location} className={fieldLabel}>
            Lugar <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id={ids.location}
            type="text"
            value={details.location}
            maxLength={MAX_EVENT_LOCATION_LENGTH}
            onChange={(event) => set('location', event.target.value)}
            placeholder="Templo, salón parroquial…"
            className={textField}
          />
        </div>

        <div>
          <p className={`${sectionHeading} mb-2`}>Repertorio</p>
          <SetlistPickerList
            setlists={setlists}
            selectedId={details.setlistId}
            onSelect={(setlistId) => set('setlistId', setlistId)}
            todayIso={todayIso}
          />
        </div>

        {members.length > 0 && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className={sectionHeading}>Equipo</p>
              {setlistTeam.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    set('participantIds', [...setlistTeam]);
                    setTeamMessage(`Equipo del Setlist aplicado: ${setlistTeam.length} ${setlistTeam.length === 1 ? 'persona' : 'personas'}.`);
                  }}
                  className="inline-flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-11 px-2.5 rounded-lg text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10"
                >
                  <Users className="w-4 h-4" />
                  Usar equipo del Setlist
                </button>
              )}
            </div>
            <p role="status" aria-live="polite" className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              {teamMessage ||
                (details.participantIds.length === 0
                  ? 'Nadie convocado todavía.'
                  : `${details.participantIds.length} ${details.participantIds.length === 1 ? 'persona convocada' : 'personas convocadas'}.`)}
            </p>
            <MemberPicker
              label="Miembros convocados"
              groups={[{ members }]}
              selectedIds={details.participantIds}
              onToggle={(id) => {
                setTeamMessage('');
                set(
                  'participantIds',
                  details.participantIds.includes(id)
                    ? details.participantIds.filter((entry) => entry !== id)
                    : [...details.participantIds, id]
                );
              }}
            />
          </div>
        )}

        <div>
          <label htmlFor={ids.notes} className={fieldLabel}>
            Notas <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id={ids.notes}
            value={details.notes}
            rows={3}
            maxLength={MAX_EVENT_NOTES_LENGTH}
            onChange={(event) => set('notes', event.target.value)}
            placeholder="Llegar 30 minutos antes."
            className={`${textField} resize-y min-h-[4.5rem]`}
          />
        </div>
      </div>
    </Dialog>
  );
};
