import React from 'react';
import { CalendarDays } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import {
  formatDurationSummary,
  formatSongCount,
  isBackupItem,
  summarizeSetlistDuration,
} from '../../utils/setlists';

/**
 * La cabecera de un Setlist: cuándo es, cómo se llama y qué tiene dentro.
 *
 * La misma en la página de quien lo prepara y en el enlace que reparte, porque
 * es el mismo Setlist y quien lo abre en el móvil diez minutos antes de
 * empezar espera verlo igual que lo vio al prepararlo.
 *
 * Lo que cambia entre una y otra no es el aspecto, son las capacidades: el
 * menú de opciones solo aparece donde hay algo que hacer, y la duración solo
 * se promete donde se conoce.
 */

const capitalize = (value: string) => (value ? value.charAt(0).toUpperCase() + value.slice(1) : value);

interface SetlistHeadingProps {
  setlist: Setlist;
  /** La fecha ya escrita en largo, que cada pantalla formatea a su manera */
  dateLabel: string;
  /**
   * Las duraciones que este navegador ha ido aprendiendo. Sin ellas no se
   * dice cuánto dura: un visitante no las tiene y no se le inventa un tiempo.
   */
  durations?: Record<string, number>;
  /** Lo que va a la derecha del título: el menú, donde haya algo que hacer */
  action?: React.ReactNode;
}

export const SetlistHeading: React.FC<SetlistHeadingProps> = ({
  setlist,
  dateLabel,
  durations,
  action,
}) => {
  const summary = summarizeSetlistDuration(setlist, durations ?? {});
  // La reserva se nombra aparte: no es parte de lo que dura la celebración.
  const backupCount = setlist.items.filter(isBackupItem).length;
  const durationLabel = durations ? formatDurationSummary(summary) : '';

  const encabezado = (
    <div className="min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        <CalendarDays className="w-3.5 h-3.5" />
        {dateLabel ? capitalize(dateLabel) : 'Sin fecha'}
      </p>
      <h1 className="mt-1.5 text-2xl sm:text-3xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words">
        {setlist.name}
      </h1>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {formatSongCount(summary.songCount)}
        {backupCount > 0 && ` · ${backupCount} de reserva`}
        {durationLabel && ` · ${durationLabel}`}
      </p>
    </div>
  );

  // Sin nada al lado no se estrena una fila: la columna va sola.
  if (!action) return encabezado;
  return (
    <div className="flex items-start justify-between gap-3">
      {encabezado}
      {action}
    </div>
  );
};
