import React, { useId, useState } from 'react';
import type { MinistryMemberDetails, MinistryRole } from '../../types/ministry';
import {
  INSTRUMENT_LABELS,
  MAX_MEMBER_NAME_LENGTH,
  MAX_MEMBER_NOTES_LENGTH,
  MINISTRY_INSTRUMENTS,
  MINISTRY_ROLES,
  PRIMARY_ROLES,
  ROLE_LABELS,
  VOCAL_PARTS,
  VOCAL_PART_LABELS,
  cleanMemberName,
} from '../../utils/ministryMembers';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from '../Setlists/ui';
import { ChoiceChips } from './ChoiceChips';

interface MemberFormDialogProps {
  mode: 'create' | 'edit';
  initialDetails?: Partial<MinistryMemberDetails>;
  onSubmit: (details: MinistryMemberDetails) => void;
  onClose: () => void;
}

const EMPTY: MinistryMemberDetails = {
  name: '',
  roles: [],
  instruments: [],
  vocalParts: [],
  notes: '',
  isActive: true,
};

/**
 * A member's details. Only the name is required: a singer need not play, a
 * musician need not sing, and nothing is ever inferred from a name.
 */
export const MemberFormDialog: React.FC<MemberFormDialogProps> = ({ mode, initialDetails, onSubmit, onClose }) => {
  const [details, setDetails] = useState<MinistryMemberDetails>({ ...EMPTY, ...initialDetails });
  const [showError, setShowError] = useState(false);
  const [showAllRoles, setShowAllRoles] = useState(() =>
    (initialDetails?.roles ?? []).some((role) => !PRIMARY_ROLES.includes(role))
  );
  const nameId = useId();
  const nameErrorId = useId();
  const notesId = useId();
  const activeId = useId();

  const set = <K extends keyof MinistryMemberDetails>(key: K, value: MinistryMemberDetails[K]) =>
    setDetails((current) => ({ ...current, [key]: value }));

  const nameIsEmpty = cleanMemberName(details.name) === '';
  const roles: MinistryRole[] = showAllRoles ? MINISTRY_ROLES : PRIMARY_ROLES;
  // Parts are offered to singers, and kept visible if someone already has one.
  const showVocalParts = details.roles.includes('singer') || details.vocalParts.length > 0;

  const submit = () => {
    if (nameIsEmpty) {
      setShowError(true);
      return;
    }
    onSubmit(details);
  };

  return (
    <Dialog
      title={mode === 'create' ? 'Añadir miembro' : 'Editar miembro'}
      description="Una persona del ministerio. No es una cuenta: nadie inicia sesión con ella."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            {mode === 'create' ? 'Añadir' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label htmlFor={nameId} className={fieldLabel}>
            Nombre <span className="text-red-500">*</span>
          </label>
          <input
            id={nameId}
            data-autofocus=""
            type="text"
            value={details.name}
            maxLength={MAX_MEMBER_NAME_LENGTH}
            onChange={(event) => {
              set('name', event.target.value);
              setShowError(false);
            }}
            aria-invalid={showError && nameIsEmpty}
            aria-describedby={showError && nameIsEmpty ? nameErrorId : undefined}
            placeholder="María Rodríguez"
            className={textField}
          />
          {showError && nameIsEmpty && (
            <p id={nameErrorId} role="alert" className="mt-1.5 text-xs font-semibold text-red-600 dark:text-red-400">
              Escribe el nombre de la persona.
            </p>
          )}
        </div>

        <div>
          <p className={fieldLabel}>Roles</p>
          <ChoiceChips label="Roles" options={roles} labels={ROLE_LABELS} selected={details.roles} onChange={(value) => set('roles', value)} />
          {!showAllRoles && (
            <button
              type="button"
              onClick={() => setShowAllRoles(true)}
              className="mt-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400"
            >
              Más roles
            </button>
          )}
        </div>

        <div>
          <p className={fieldLabel}>Instrumentos</p>
          <ChoiceChips
            label="Instrumentos"
            options={MINISTRY_INSTRUMENTS}
            labels={INSTRUMENT_LABELS}
            selected={details.instruments}
            onChange={(value) => set('instruments', value)}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">Opcional: no hace falta tocar nada.</p>
        </div>

        {showVocalParts && (
          <div>
            <p className={fieldLabel}>Parte vocal</p>
            <ChoiceChips
              label="Parte vocal"
              options={VOCAL_PARTS}
              labels={VOCAL_PART_LABELS}
              selected={details.vocalParts}
              onChange={(value) => set('vocalParts', value)}
            />
            <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
              La parte que suele cantar. Es solo una referencia para el director.
            </p>
          </div>
        )}

        <div>
          <label htmlFor={notesId} className={fieldLabel}>
            Notas <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id={notesId}
            value={details.notes}
            rows={3}
            maxLength={MAX_MEMBER_NOTES_LENGTH}
            onChange={(event) => set('notes', event.target.value)}
            placeholder="Disponible los domingos por la tarde."
            className={`${textField} resize-y min-h-[4.5rem]`}
          />
        </div>

        <label htmlFor={activeId} className="flex items-start gap-3 cursor-pointer">
          <input
            id={activeId}
            type="checkbox"
            checked={details.isActive}
            onChange={(event) => set('isActive', event.target.checked)}
            className="mt-0.5 w-5 h-5 rounded accent-[#2464ED]"
          />
          <span>
            <span className="block text-sm font-semibold text-slate-700 dark:text-slate-200">Activo</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Quien no está activo no se ofrece para nuevos equipos, pero sigue donde ya estaba.
            </span>
          </span>
        </label>
      </div>
    </Dialog>
  );
};
