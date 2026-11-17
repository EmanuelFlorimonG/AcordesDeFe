import React, { useId, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import { MAX_MOMENT_LENGTH, backupMomentOf, countSectionItems, sectionsOf } from '../../utils/setlists';
import { Dialog } from './Dialog';
import { fieldLabel, primaryButton, secondaryButton, textField } from './ui';

/**
 * Las secciones de una celebración: renombrarlas, moverlas, añadir y quitar.
 *
 * Empiezan siendo las de su tipo —el orden de una boda, el de un rosario— y a
 * partir del primer cambio son las de este Setlist concreto, que es lo que
 * pasa siempre: dos bodas no se celebran igual.
 *
 * Cada cambio se guarda al hacerlo, sin un botón de guardar al final. Es lo
 * mismo que hace el resto del Setlist, y evita que alguien reordene diez
 * secciones y las pierda al cerrar la ventana.
 */

interface SetlistSectionsDialogProps {
  setlist: Setlist;
  onAdd: (name: string) => void;
  onRename: (from: string, to: string) => void;
  onMove: (name: string, delta: number) => void;
  onRemove: (name: string) => void;
  onClose: () => void;
}

export const SetlistSectionsDialog: React.FC<SetlistSectionsDialogProps> = ({
  setlist,
  onAdd,
  onRename,
  onMove,
  onRemove,
  onClose,
}) => {
  const sections = sectionsOf(setlist);
  const [draft, setDraft] = useState('');
  // Qué fila se está renombrando y con qué texto. Una sola a la vez: el resto
  // enseña el nombre guardado, que es el que vale.
  const [editing, setEditing] = useState<{ name: string; value: string } | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const newId = useId();

  const commitRename = () => {
    if (!editing) return;
    const value = editing.value.trim();
    if (value && value !== editing.name) onRename(editing.name, value);
    setEditing(null);
  };

  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onAdd(value);
    setDraft('');
  };

  return (
    <Dialog
      size="lg"
      title="Secciones del Setlist"
      description="El orden de la celebración. Cámbialas a tu gusto: lo que se guarda es esta lista, no la plantilla."
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} className={primaryButton}>
          Listo
        </button>
      }
    >
      <ul className="divide-y divide-slate-200/70 dark:divide-dark-700">
        {sections.map((name, index) => {
          const count = countSectionItems(setlist, name);
          const isBackup = name === backupMomentOf(setlist);
          if (confirming === name) {
            return (
              <li key={name} className="flex flex-wrap items-center gap-2 py-3">
                <p className="min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200">
                  ¿Quitar «{name}»?{' '}
                  {count > 0 && (
                    <span className="text-slate-500 dark:text-slate-400">
                      Sus {count === 1 ? 'canción se queda' : `${count} canciones se quedan`} en el Setlist, sin sección.
                    </span>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onRemove(name);
                    setConfirming(null);
                  }}
                  className="inline-flex min-h-11 items-center rounded-lg bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  Quitar
                </button>
                <button type="button" onClick={() => setConfirming(null)} className={secondaryButton}>
                  Cancelar
                </button>
              </li>
            );
          }
          return (
            <li key={name} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2">
              <span aria-hidden="true" className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-400">
                {String(index + 1).padStart(2, '0')}
              </span>
              {/* El nombre manda: mientras quepan 11rem va en la misma fila que
                  los botones, y cuando no, se queda con la fila entera y los
                  botones bajan. Así a 320px se escribe un nombre largo sin
                  leerlo por una rendija. */}
              <span className="min-w-0 flex-1 basis-44">
                <input
                  type="text"
                  aria-label={`Nombre de la sección ${name}`}
                  value={editing?.name === name ? editing.value : name}
                  maxLength={MAX_MOMENT_LENGTH}
                  onChange={(event) => setEditing({ name, value: event.target.value })}
                  onFocus={() => setEditing({ name, value: name })}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                      event.currentTarget.blur();
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      setEditing(null);
                    }
                  }}
                  className={`${textField} h-11 w-full`}
                />
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                  {count === 0 ? 'Sin canciones' : `${count} ${count === 1 ? 'canción' : 'canciones'}`}
                  {isBackup && ' · Reserva: no entra en el recorrido de la celebración'}
                  {isBackup && count > 0 && ', aunque la renombres'}
                </span>
              </span>
              <span className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  aria-label={`Subir ${name}`}
                  disabled={index === 0}
                  onClick={() => onMove(name, -1)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  <ArrowUp aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${name}`}
                  disabled={index === sections.length - 1}
                  onClick={() => onMove(name, 1)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
                >
                  <ArrowDown aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${name}`}
                  disabled={sections.length === 1}
                  onClick={() => setConfirming(name)}
                  className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-red-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40"
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </button>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-slate-200/70 pt-4 dark:border-dark-700">
        <label htmlFor={newId} className={fieldLabel}>
          Añadir una sección
        </label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          <input
            id={newId}
            type="text"
            value={draft}
            maxLength={MAX_MOMENT_LENGTH}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                add();
              }
            }}
            placeholder="Bendición de las arras"
            className={`${textField} min-w-0 flex-1 sm:max-w-xs`}
          />
          <button type="button" onClick={add} disabled={!draft.trim()} className={secondaryButton}>
            <Plus aria-hidden="true" className="h-4 w-4" />
            Añadir
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Se añade al final; desde ahí la mueves a donde vaya.
        </p>
      </div>
    </Dialog>
  );
};
