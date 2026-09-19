import React, { useId, useState } from 'react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import { describeKey } from '../../utils/keySettings';
import { MAX_PERFORMANCE_NOTES_LENGTH, describeCapoShapes, recordableItems } from '../../utils/performanceHistory';
import { useSongAvailability } from '../../catalog/useCatalog';
import { Dialog } from '../Setlists/Dialog';
import { fieldLabel, primaryButton, secondaryButton, sectionHeading, textField } from '../Setlists/ui';

interface ClosePerformanceDialogProps {
  /** "Misa de Jóvenes · Domingo 20 de septiembre" */
  subtitle: string;
  setlist: Setlist;
  songsById: Map<string, Song>;
  /**
   * 'complete' closes a scheduled date and records it; 'record' only records a
   * date that is already Realizada.
   */
  mode: 'complete' | 'record';
  onSubmit: (performedItemIds: string[], notes: string) => void;
  onClose: () => void;
}

/**
 * The short closing of a celebration: which of the prepared songs were
 * actually sung. Everything starts ticked; unticking is the only work. No
 * lyrics, nothing to reorder: the order is the setlist's.
 */
export const ClosePerformanceDialog: React.FC<ClosePerformanceDialogProps> = ({
  subtitle,
  setlist,
  songsById,
  mode,
  onSubmit,
  onClose,
}) => {
  const items = recordableItems(setlist, songsById);
  const missing = setlist.items.length - items.length;
  const availability = useSongAvailability();
  // Songs not in the catalog shown that may still exist (no connection to check):
  // recording now would leave them out of the history for good, so it waits.
  const unverified = setlist.items.filter((item) => !songsById.has(item.songId) && availability(item.songId) !== 'missing').length;
  const [performed, setPerformed] = useState<string[]>(() => items.map((item) => item.id));
  const [notes, setNotes] = useState('');
  const notesId = useId();
  const listId = useId();
  const count = performed.length;

  const toggle = (itemId: string) =>
    setPerformed((current) => (current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]));

  const submitLabel =
    mode === 'record' ? 'Guardar registro' : count > 0 ? 'Guardar y marcar realizada' : 'Marcar realizada sin canciones';

  return (
    <Dialog
      title={mode === 'record' ? 'Registrar interpretación' : 'Marcar como realizada'}
      description={subtitle}
      size="lg"
      onClose={onClose}
      onSubmit={() => {
        if (unverified > 0) return;
        if (mode === 'record' && count === 0) return;
        // Setlist order, whatever order the boxes were ticked in.
        onSubmit(
          items.filter((item) => performed.includes(item.id)).map((item) => item.id),
          notes
        );
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={mode === 'record' && count === 0} className={primaryButton}>
            {submitLabel}
          </button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={listId} className={sectionHeading}>
          Repertorio preparado
        </h3>
        <p role="status" aria-live="polite" className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          {count} de {items.length} interpretadas
        </p>
      </div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">¿Qué canciones se interpretaron?</p>

      <ul aria-labelledby={listId} className="rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800">
        {items.map((item, index) => {
          const song = songsById.get(item.songId) as Song;
          const key = describeKey(song.originalKey, item, song.recommendedCapo ?? 0);
          const shapes = key ? describeCapoShapes({ chordKey: key.shape, capoFret: item.capoFret }) : '';
          const checked = performed.includes(item.id);
          return (
            <li key={item.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 min-h-[48px] hover:bg-slate-50 dark:hover:bg-dark-800">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(item.id)}
                  className="w-5 h-5 shrink-0 rounded accent-[#2464ED]"
                />
                <span className="w-6 shrink-0 text-xs font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="min-w-0 flex-1">
                  {item.moment && (
                    <span className="block truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400 dark:text-slate-500">
                      {item.moment}
                    </span>
                  )}
                  <span
                    className={`block truncate text-sm font-semibold ${
                      checked ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500 line-through'
                    }`}
                  >
                    {song.title}
                  </span>
                  {shapes && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{shapes}</span>}
                </span>
                {key && (
                  <span className="shrink-0 font-mono text-sm font-semibold text-slate-700 dark:text-slate-200">{key.sounding}</span>
                )}
              </label>
            </li>
          );
        })}
      </ul>

      {unverified > 0 && (
        <p role="alert" className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {unverified === 1
            ? '1 canción del Setlist no se puede comprobar sin conexión.'
            : `${unverified} canciones del Setlist no se pueden comprobar sin conexión.`}{' '}
          Vuelve a intentarlo con internet para que queden en el historial.
        </p>
      )}
      {missing > unverified && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {missing - unverified === 1
            ? '1 canción del Setlist ya no está en el cancionero y no se registra.'
            : `${missing - unverified} canciones del Setlist ya no están en el cancionero y no se registran.`}
        </p>
      )}
      {mode === 'complete' && count === 0 && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Sin canciones marcadas, la actividad queda como realizada sin registro musical.
        </p>
      )}

      <div className="mt-5">
        <label htmlFor={notesId} className={fieldLabel}>
          Notas del registro <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <textarea
          id={notesId}
          value={notes}
          maxLength={MAX_PERFORMANCE_NOTES_LENGTH}
          onChange={(event) => setNotes(event.target.value)}
          rows={3}
          placeholder="Por ejemplo, se omitió el Ofertorio por falta de tiempo."
          className={textField}
        />
      </div>
    </Dialog>
  );
};
