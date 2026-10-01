import React, { useId, useState } from 'react';
import type { SetlistDetails, SetlistKind } from '../../types/setlist';
import { Dialog } from './Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from './ui';
import { DatePicker } from '../ui/DatePicker';

export type SetlistFormMode = 'create' | 'edit' | 'duplicate';

const COPY: Record<SetlistFormMode, { title: string; description?: string; submit: string }> = {
  create: {
    title: 'Nuevo Setlist',
    description: 'Una misa, un ensayo, un retiro: las canciones de ese día en el orden en que se cantan.',
    submit: 'Crear Setlist',
  },
  edit: { title: 'Editar Setlist', submit: 'Guardar cambios' },
  duplicate: {
    title: 'Duplicar Setlist',
    description: 'Se copian las canciones, el orden, los tonos, los momentos y las notas.',
    submit: 'Crear copia',
  },
};

/**
 * Lo único que cambia entre una y otra es cómo se llaman sus partes, y eso es
 * exactamente lo que dice cada opción. Nada más se comporta distinto.
 */
const KINDS: Array<{ kind: SetlistKind; label: string; note: string }> = [
  { kind: 'misa', label: 'Misa', note: 'Entrada, Ofertorio, Santo, Comunión…' },
  { kind: 'adoracion', label: 'Adoración', note: 'Alabanza, peticiones, procesión…' },
];

interface SetlistFormDialogProps {
  mode: SetlistFormMode;
  initialDetails?: Partial<SetlistDetails>;
  onSubmit: (details: SetlistDetails) => void;
  onClose: () => void;
}

/** Name, date and description of a setlist: the whole form is these three fields. */
export const SetlistFormDialog: React.FC<SetlistFormDialogProps> = ({
  mode,
  initialDetails,
  onSubmit,
  onClose,
}) => {
  const [name, setName] = useState(initialDetails?.name ?? '');
  // Sólo se elige al crear. Después no: cambiarlo renombraría los momentos ya
  // escritos, y eso no lo decide un desplegable.
  const [kind, setKind] = useState<SetlistKind>(initialDetails?.kind ?? 'misa');
  const [date, setDate] = useState(initialDetails?.date ?? '');
  const [description, setDescription] = useState(initialDetails?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];
  const nameId = useId();
  const kindId = useId();
  const dateId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Escribe un nombre para el Setlist.');
      return;
    }
    onSubmit(mode === 'create' ? { name, date, description, kind } : { name, date, description });
  };

  return (
    <Dialog
      title={copy.title}
      description={copy.description}
      onClose={onClose}
      onSubmit={handleSubmit}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            {copy.submit}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {mode === 'create' && (
          <fieldset>
            <legend className={fieldLabel} id={kindId}>
              ¿Qué se prepara?
            </legend>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={kindId}>
              {KINDS.map((option) => (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={kind === option.kind}
                  onClick={() => setKind(option.kind)}
                  className={`flex-1 min-w-[9rem] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                    kind === option.kind
                      ? 'border-[#2464ED] bg-[#EAF1FF] dark:border-sky-400 dark:bg-blue-500/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-dark-700 dark:bg-dark-900 dark:hover:bg-dark-800'
                  }`}
                >
                  <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option.label}</span>
                  <span className="block text-xs text-slate-500 dark:text-slate-400">{option.note}</span>
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div>
          <label htmlFor={nameId} className={fieldLabel}>
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id={nameId}
            data-autofocus=""
            type="text"
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
              if (error) setError(null);
            }}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            placeholder="Misa del domingo"
            className={`${textField} ${error ? 'border-red-400 focus:border-red-500 focus:ring-red-500/15' : ''}`}
          />
          {error && (
            <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div>
          <label htmlFor={dateId} className={fieldLabel}>
            Fecha <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <div className="sm:max-w-[22rem]">
            <DatePicker id={dateId} value={date} onChange={setDate} clearable placeholder="Sin fecha" />
          </div>
        </div>

        <div>
          <label htmlFor={descriptionId} className={fieldLabel}>
            Descripción <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id={descriptionId}
            value={description}
            maxLength={1000}
            rows={3}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Coro juvenil, parroquia San José. Ensayo el viernes a las 8."
            className={`${textField} resize-y min-h-[4.5rem]`}
          />
        </div>
      </div>
    </Dialog>
  );
};
