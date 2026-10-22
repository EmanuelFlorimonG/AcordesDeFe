import React from 'react';
import type { SetlistItem } from '../../types/setlist';
import { describeTransition } from '../../utils/setlistVersions';

/**
 * Lo que se dijo para esta canción y este día: cómo se toca por dentro y cómo
 * se sale de ella.
 *
 * Va debajo de la fila, en la página que se reparte por enlace, porque quien
 * la abre está de pie con el móvil y no tiene a mano el Modo Ensayo donde
 * esto se ve al tocar. En la página de quien lo prepara no hace falta: ahí se
 * entra a la canción y se edita.
 *
 * Solo se lee. Y si no se dijo nada, no se escribe nada: una canción sin
 * arreglo ni transición no estrena una caja vacía.
 */

interface SetlistItemDetailsProps {
  item: SetlistItem;
  /** La última no tiene a dónde ir, así que no se habla de su transición */
  isLast: boolean;
}

export const SetlistItemDetails: React.FC<SetlistItemDetailsProps> = ({ item, isLast }) => {
  const blocks = item.arrangement?.sections ?? [];
  const transition = !isLast && item.transitionToNext ? describeTransition(item.transitionToNext) : null;
  if (blocks.length === 0 && !transition) return null;

  return (
    <div className="pb-3 pl-9 pr-3 sm:pl-12 sm:pr-4">
      {blocks.length > 0 && (
        <div className="rounded-lg bg-slate-50 dark:bg-dark-950 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
            Arreglo
          </p>
          <ol className="mt-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
            {blocks.map((block) => (
              <li key={block.id}>
                {block.label}
                {block.repeatCount > 1 && ` ×${block.repeatCount}`}
                {block.transition.type === 'jump' && ' · vuelve atrás'}
                {block.transition.type === 'end' && ' · final'}
                {block.instruction && `. ${block.instruction}`}
              </li>
            ))}
          </ol>
        </div>
      )}

      {transition && (
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Al terminar: {transition}</p>
      )}
    </div>
  );
};
