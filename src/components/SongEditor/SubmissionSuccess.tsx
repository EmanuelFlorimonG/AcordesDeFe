import React, { useState } from 'react';
import { Check, CircleCheck, Copy, Plus, Search } from 'lucide-react';
import { primaryButton, secondaryButton } from '../Setlists/ui';

interface SubmissionSuccessProps {
  trackingCode: string;
  title: string;
  onCheckStatus: () => void;
  onBackToSongbook: () => void;
  /** Absent after a resubmission: the same proposal went back to review */
  onAddAnother?: () => void;
  resubmitted?: boolean;
  /** A suggested edit of a published song */
  edited?: boolean;
}

/** After a confirmed send: the tracking code, clearly, and where to go next. Never the edit token. */
export const SubmissionSuccess: React.FC<SubmissionSuccessProps> = ({ trackingCode, title, onCheckStatus, onBackToSongbook, onAddAnother, resubmitted = false, edited = false }) => {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(trackingCode);
      setCopied('yes');
    } catch {
      setCopied('no');
    }
  };

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-5 py-8 text-center shadow-sm sm:px-8">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
        <CircleCheck aria-hidden="true" className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
      </div>
      <h1 className="text-2xl font-extrabold tracking-tight text-[#10203A] dark:text-white">{resubmitted ? 'Propuesta reenviada' : edited ? 'Cambios enviados' : 'Canción enviada'}</h1>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
        {resubmitted
          ? `Tus cambios en «${title}» volvieron a revisión. El código de seguimiento es el mismo.`
          : edited
            ? `Tus cambios en «${title}» fueron enviados para revisión. La canción no cambia hasta que el equipo los apruebe.`
            : `Tu propuesta de «${title}» fue enviada para revisión. No se publica hasta que el equipo la apruebe.`}
      </p>

      <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Código de seguimiento</p>
      <p className="mt-1 select-all font-mono text-3xl font-bold tracking-wider text-[#10203A] dark:text-white">{trackingCode}</p>
      <button type="button" onClick={copy} className={`${secondaryButton} mt-3`}>
        {copied === 'yes' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        {copied === 'yes' ? 'Copiado' : 'Copiar código'}
      </button>
      <p role="status" aria-live="polite" className="mt-2 min-h-[1rem] text-xs text-slate-500 dark:text-slate-400">
        {copied === 'no' ? 'No se pudo copiar: selecciona el código y cópialo a mano.' : copied === 'yes' ? 'Código copiado.' : ''}
      </p>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        Guarda este código para consultar el estado. También queda anotado en este navegador.
      </p>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-center">
        <button type="button" onClick={onCheckStatus} className={primaryButton}>
          <Search className="w-4 h-4" />
          Consultar estado
        </button>
        <button type="button" onClick={onBackToSongbook} className={secondaryButton}>
          Volver al cancionero
        </button>
      </div>
      {onAddAnother && (
        <button type="button" onClick={onAddAnother} className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10">
          <Plus className="w-4 h-4" />
          Agregar otra canción
        </button>
      )}
    </div>
  );
};
