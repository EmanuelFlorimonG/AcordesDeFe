import React from 'react';
import { Cross, ListMusic, ListOrdered, Heart, Tags, Users, UserRound, CalendarDays, History, ListPlus, LogIn, ShieldCheck, Sun, Moon, X, Quote } from 'lucide-react';
import { initialOf, nameOf, type AppSession } from '../../auth/session';

export type SidebarSection =
  | 'cancionero'
  | 'favoritas'
  | 'categorias'
  | 'autores'
  | 'listas'
  | 'setlists'
  | 'miembros'
  | 'calendario'
  | 'historial';

interface SidebarProps {
  activeSection: SidebarSection;
  onNavigate: (section: SidebarSection) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  isOpen: boolean;
  onClose: () => void;
  /**
   * Only for the editorial team, and only while their session is valid: the
   * way back into the panel without signing in again. Absent for everyone
   * else, which is almost everyone, and the songbook looks the same as ever.
   */
  onOpenAdmin?: () => void;
  /** Whoever signed in, or null. An account is optional: everything works without one. */
  session?: AppSession | null;
  /** A session is being restored: the row waits instead of saying the wrong thing */
  isSessionLoading?: boolean;
  onOpenAccount?: () => void;
}

const NAV_ITEMS: Array<{ id: SidebarSection; label: string; icon: React.ElementType }> = [
  { id: 'cancionero', label: 'Cancionero', icon: ListMusic },
  { id: 'calendario', label: 'Calendario', icon: CalendarDays },
  { id: 'setlists', label: 'Setlists', icon: ListOrdered },
  { id: 'historial', label: 'Historial', icon: History },
  { id: 'miembros', label: 'Miembros', icon: UserRound },
  { id: 'favoritas', label: 'Favoritas', icon: Heart },
  { id: 'categorias', label: 'Categorías', icon: Tags },
  { id: 'autores', label: 'Autores', icon: Users },
  { id: 'listas', label: 'Listas', icon: ListPlus },
];

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onNavigate,
  isDarkMode,
  onToggleDarkMode,
  isOpen,
  onClose,
  onOpenAdmin,
  session = null,
  isSessionLoading = false,
  onOpenAccount,
}) => {
  const content = (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center justify-between px-6 pt-7 pb-6">
        <button
          onClick={() => onNavigate('cancionero')}
          className="flex items-center gap-3 text-left focus:outline-none"
        >
          <div className="w-10 h-10 rounded-xl bg-[#2464ED] flex items-center justify-center flex-shrink-0">
            <Cross className="w-5 h-5 text-white" strokeWidth={2.25} />
          </div>
          <div>
            <span className="font-extrabold text-base tracking-tight text-[#10203A] dark:text-white leading-tight block">
              ACORDES DE FE
            </span>
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 leading-none mt-0.5">
              Ministerio
            </p>
          </div>
        </button>
        <button
          onClick={onClose}
          className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <nav className="flex flex-col gap-1 px-4">
        {NAV_ITEMS.map((item) => {
          const isActive = activeSection === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                isActive
                  ? 'bg-[#2464ED] text-white'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-800'
              }`}
            >
              <Icon className="w-[18px] h-[18px]" strokeWidth={2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto px-4 pb-6">
        <div className="rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-900 p-4 mb-4 overflow-hidden">
          <Quote className="w-4 h-4 text-slate-300 dark:text-dark-700 mb-1.5" strokeWidth={2.5} />
          <p className="text-sm italic text-slate-600 dark:text-slate-300 leading-relaxed">
            Canten al Señor un canto nuevo
          </p>
          <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 mt-2">
            Salmo 96, 1
          </p>
        </div>

        {onOpenAccount && (
          <button
            onClick={onOpenAccount}
            aria-label={session ? `Tu cuenta, ${nameOf(session)}` : isSessionLoading ? 'Comprobando tu sesión' : 'Iniciar sesión'}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 min-h-[44px] rounded-lg border border-slate-200 dark:border-dark-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            {session ? (
              <>
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#EAF1FF] dark:bg-blue-500/15 text-[11px] font-bold text-[#1D56D6] dark:text-sky-300"
                >
                  {initialOf(session)}
                </span>
                <span className="truncate">{nameOf(session)}</span>
              </>
            ) : isSessionLoading ? (
              <>
                <span aria-hidden="true" className="h-6 w-6 shrink-0 rounded-full bg-slate-100 dark:bg-dark-800" />
                <span aria-hidden="true" className="h-3 w-24 rounded bg-slate-100 dark:bg-dark-800" />
                <span className="sr-only">Comprobando tu sesión</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                Iniciar sesión
              </>
            )}
          </button>
        )}

        {onOpenAdmin && (
          <button
            onClick={onOpenAdmin}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 mb-2 rounded-lg border border-slate-200 dark:border-dark-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
          >
            <ShieldCheck className="w-4 h-4" />
            Panel editorial
          </button>
        )}

        <button
          onClick={onToggleDarkMode}
          className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-slate-200 dark:border-dark-700 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors"
        >
          <span className="flex items-center gap-2.5">
            {isDarkMode ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
            Modo oscuro
          </span>
          <span
            className={`relative w-9 h-5 rounded-full transition-colors ${
              isDarkMode ? 'bg-[#2464ED]' : 'bg-slate-300'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                isDarkMode ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 border-r border-slate-100 dark:border-dark-800 bg-white dark:bg-dark-950 print:hidden">
        {content}
      </aside>

      {/* Mobile drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-white dark:bg-dark-950 shadow-xl">
            {content}
          </aside>
        </div>
      )}
    </>
  );
};
