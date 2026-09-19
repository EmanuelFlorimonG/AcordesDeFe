import React from 'react';
import { ArrowLeft, Cross } from 'lucide-react';

/** The frame of the screens before the panel opens (sign-in, no access, errors): the brand, a card, a way back. */
export const AdminCentered: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-slate-50 dark:bg-dark-950 px-4 py-10 sm:py-16">
    <main className="mx-auto w-full max-w-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2464ED]">
          <Cross aria-hidden="true" className="h-5 w-5 text-white" strokeWidth={2.25} />
        </div>
        <div>
          <span className="block text-base font-extrabold leading-tight tracking-tight text-[#10203A] dark:text-white">ACORDES DE FE</span>
          <span className="block text-[11px] font-medium leading-none text-slate-500 dark:text-slate-400">Equipo editorial</span>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-dark-800 bg-white dark:bg-dark-900 p-6 shadow-sm sm:p-7">{children}</div>
      <a
        href="#/"
        className="mt-5 inline-flex items-center gap-1.5 rounded-md px-1 py-1 text-sm font-semibold text-slate-500 hover:text-[#2464ED] dark:text-slate-400 dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Volver al cancionero
      </a>
    </main>
  </div>
);
