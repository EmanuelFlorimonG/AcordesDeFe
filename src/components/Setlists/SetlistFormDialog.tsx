import React, { useId, useState } from 'react';
import type { SetlistDetails } from '../../types/setlist';
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
  const [date, setDate] = useState(initialDetails?.date ?? '');
  const [description, setDescription] = useState(initialDetails?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const copy = COPY[mode];
  const nameId = useId();
  const dateId = useId();
  const descriptionId = useId();
  const errorId = useId();

  const handleSubmit = () => {
    if (!name.trim()) {
      setError('Escribe un nombre para el Setlist.');
      return;
    }
    onSubmit({ name, date, description });
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
