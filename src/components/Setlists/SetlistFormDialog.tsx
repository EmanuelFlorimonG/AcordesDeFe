import React, { useId, useState } from 'react';
import { Church, Flame, Heart, Sunrise, type LucideIcon } from 'lucide-react';
import type { SetlistDetails, SetlistKind } from '../../types/setlist';
import { isWeddingKind, momentsFor } from '../../utils/setlists';
import { Dialog } from './Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from './ui';
import { DatePicker } from '../ui/DatePicker';

export type SetlistFormMode = 'create' | 'edit' | 'duplicate';

const COPY: Record<SetlistFormMode, { title: string; description?: string; submit: string }> = {
  create: {
    title: 'Nuevo Setlist',
    description: 'Prepara una Misa, una Adoración, un Rosario de la Aurora o una Boda con las canciones en el orden en que se cantan.',
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
const KINDS: Array<{ kind: SetlistKind; label: string; note: string; icon: LucideIcon }> = [
  { kind: 'misa', label: 'Misa', note: 'Entrada, Ofertorio, Santo, Comunión…', icon: Church },
  { kind: 'adoracion', label: 'Adoración', note: 'Alabanza, peticiones, procesión…', icon: Flame },
  { kind: 'rosario-aurora', label: 'Rosario de la Aurora', note: 'Llegada del Señor, cinco misterios y salida.', icon: Sunrise },
  { kind: 'boda', label: 'Boda', note: 'Entrada, votos, firmadera, ramo a la Virgen…', icon: Heart },
];

/**
 * Las dos bodas.
 *
 * La tarjeta es una sola —se prepara «una boda»— y esto dice cuál de las dos:
 * lo que las separa son las partes eucarísticas, así que elegirlo aquí evita
 * que alguien tenga que borrar media plantilla después.
 */
const WEDDING_MODES: Array<{ kind: SetlistKind; label: string }> = [
  { kind: 'boda', label: 'Con misa' },
  { kind: 'boda-sin-misa', label: 'Sin misa' },
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
  const modeId = useId();
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
      size={mode === 'create' ? 'lg' : 'md'}
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
            <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4" role="radiogroup" aria-labelledby={kindId}>
              {KINDS.map((option, index) => {
                // La tarjeta de Boda queda elegida con cualquiera de sus dos
                // modalidades: por debajo son dos tipos, en pantalla es una.
                const selected = option.kind === 'boda' ? isWeddingKind(kind) : kind === option.kind;
                return (
                <button
                  key={option.kind}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setKind(option.kind)}
                  onKeyDown={(event) => {
                    const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
                      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
                    if (!delta && event.key !== 'Home' && event.key !== 'End') return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? KINDS.length - 1
                      : (index + delta + KINDS.length) % KINDS.length;
                    setKind(KINDS[next].kind);
                    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
                  }}
                  className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 text-left sm:flex-col sm:gap-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                    selected
                      ? 'border-[#2464ED] bg-[#EAF1FF] dark:border-sky-400 dark:bg-blue-500/10'
                      : 'border-slate-200 bg-white hover:bg-slate-50 dark:border-dark-700 dark:bg-dark-900 dark:hover:bg-dark-800'
                  }`}
                >
                  <option.icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${selected ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{option.label}</span>
                    <span className="block text-xs text-slate-500 dark:text-slate-400">{option.note}</span>
                  </span>
                </button>
                );
              })}
            </div>

            {isWeddingKind(kind) && (
              <div className="mt-3 rounded-xl border border-[#2464ED]/30 bg-[#F6F9FF] p-3 dark:border-sky-400/30 dark:bg-blue-500/5">
                <p className={fieldLabel} id={modeId}>
                  ¿Cómo se celebra?
                </p>
                <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-labelledby={modeId}>
                  {WEDDING_MODES.map((mode) => (
                    <button
                      key={mode.kind}
                      type="button"
                      role="radio"
                      aria-checked={kind === mode.kind}
                      onClick={() => setKind(mode.kind)}
                      className={`inline-flex min-h-11 items-center rounded-lg border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                        kind === mode.kind
                          ? 'border-[#2464ED] bg-[#2464ED] text-white'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-[#2464ED] hover:text-[#2464ED] dark:border-dark-700 dark:bg-dark-900 dark:text-slate-300 dark:hover:text-sky-400'
                      }`}
                    >
                      {mode.label}
                    </button>
                  ))}
                </div>
                {/* Qué se va a encontrar al crearlo. Son el punto de partida:
                    después se renombran, se mueven, se añaden y se quitan. */}
                <p className="mt-2.5 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  Empieza con {momentsFor(kind).length} secciones: {momentsFor(kind).join(' · ')}. Puedes
                  renombrarlas, moverlas, añadir y quitar.
                </p>
              </div>
            )}
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
            placeholder={
              isWeddingKind(kind)
                ? 'Boda de María y José'
                : kind === 'rosario-aurora'
                  ? 'Rosario de la Aurora'
                  : 'Misa del domingo'
            }
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
