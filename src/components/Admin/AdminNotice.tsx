import React from 'react';
import { RotateCcw } from 'lucide-react';
import { secondaryButton } from '../Setlists/ui';

/** The panel's card surface: white on the page, one hairline border, a shadow you barely notice. */
export const adminCard =
  'rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(16,32,58,0.04)] dark:border-dark-800 dark:bg-dark-900 dark:shadow-none';

/** A clickable card: the same surface, a quiet lift on hover and a clear focus ring. */
export const adminCardLink = `${adminCard} transition-[border-color,box-shadow] duration-150 hover:border-[#2464ED]/40 hover:shadow-[0_4px_16px_rgba(16,32,58,0.07)] dark:hover:border-sky-400/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40`;

/** Loading as the shape of what is coming: a few quiet rows. Screen readers hear "Cargando…" once. */
export const AdminLoading: React.FC<{ label?: string; rows?: number }> = ({ label = 'Cargando…', rows = 3 }) => (
  <div role="status" aria-live="polite">
    <span className="sr-only">{label}</span>
    <div aria-hidden="true" className="space-y-2.5 motion-safe:animate-pulse">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={`${adminCard} flex items-center gap-4 px-4 py-4`}>
          <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 dark:bg-dark-800" />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-2/5 rounded bg-slate-100 dark:bg-dark-800" />
            <div className="h-3 w-3/5 rounded bg-slate-100 dark:bg-dark-800" />
          </div>
        </div>
      ))}
    </div>
  </div>
);

export const AdminError: React.FC<{ message: string; onRetry?: () => void }> = ({ message, onRetry }) => (
  <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
    <p>{message}</p>
    {onRetry && (
      <button type="button" onClick={onRetry} className={`${secondaryButton} mt-3`}>
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        Reintentar
      </button>
    )}
  </div>
);

export const AdminEmpty: React.FC<{ title: string; icon?: React.ElementType; children?: React.ReactNode }> = ({ title, icon: Icon, children }) => (
  <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center dark:border-dark-700 dark:bg-dark-900/40">
    {Icon && (
      <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-dark-800 dark:text-slate-500">
        <Icon aria-hidden="true" className="h-5 w-5" />
      </span>
    )}
    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
    {children && <div className="mx-auto mt-1 max-w-sm text-sm text-slate-500 dark:text-slate-400">{children}</div>}
  </div>
);

export const AdminPageHeader: React.FC<{ title: string; description?: React.ReactNode; actions?: React.ReactNode }> = ({
  title,
  description,
  actions,
}) => (
  <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
    <div className="min-w-0">
      <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight text-[#10203A] dark:text-white sm:text-[2rem]">{title}</h1>
      {description && <p className="mt-1.5 max-w-2xl text-[15px] text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
    {actions}
  </div>
);

/** A titled block inside a screen (Requieren revisión, Validación, Colaborador…). */
export const AdminSectionTitle: React.FC<{ children: React.ReactNode; id?: string; aside?: React.ReactNode }> = ({ children, id, aside }) => (
  <div className="mb-3 flex items-center justify-between gap-3">
    <h2 id={id} className="text-[15px] font-bold text-[#10203A] dark:text-white">
      {children}
    </h2>
    {aside}
  </div>
);
