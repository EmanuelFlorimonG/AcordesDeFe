import React, { useEffect, useId, useRef, useState } from 'react';
import { Search, Menu, X } from 'lucide-react';
import { Avatar } from '../Account/Avatar';
import { initialOf, nameOf, type AppSession } from '../../auth/session';

interface TopbarProps {
  session?: AppSession | null;
  avatarUrl?: string | null;
  onOpenAccount?: () => void;
  onSignOut?: () => Promise<void>;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSidebar: () => void;
  /** Para que el botón diga si lo que abre está abierto. */
  isSidebarOpen?: boolean;
  onGoToCancionero: () => void;
  onGoToAbout: () => void;
  onGoToContact: () => void;
  activePage: 'app' | 'about' | 'contact';
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Shown next to the search box, e.g. the filters button on the songbook */
  searchAccessory?: React.ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({
  searchQuery,
  onSearchChange,
  onOpenSidebar,
  isSidebarOpen = false,
  onGoToCancionero,
  onGoToAbout,
  onGoToContact,
  activePage,
  inputRef,
  searchAccessory,
  session = null,
  avatarUrl = null,
  onOpenAccount,
  onSignOut,
}) => {
  const accountId = useId();
  const accountButton = useRef<HTMLButtonElement>(null);
  const accountMenu = useRef<HTMLDivElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const signOutPending = useRef(false);
  const closeAccount = () => accountMenu.current?.hidePopover();
  const openAccount = () => {
    closeAccount();
    onOpenAccount?.();
  };
  const signOut = async () => {
    if (signOutPending.current || !onSignOut) return;
    signOutPending.current = true;
    setSigningOut(true);
    closeAccount();
    try { await onSignOut(); }
    finally {
      signOutPending.current = false;
      setSigningOut(false);
    }
  };
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [inputRef]);

  const linkClass = (isActive: boolean) =>
    `hidden lg:inline text-sm font-semibold transition-colors ${
      isActive
        ? 'text-[#2464ED]'
        : 'text-slate-500 dark:text-slate-400 hover:text-[#2464ED]'
    }`;

  return (
    <header className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-dark-800 bg-white dark:bg-dark-950 print:hidden">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Abrir el menú"
        aria-expanded={isSidebarOpen}
        className="lg:hidden p-2 -ml-1 rounded-md text-slate-500 dark:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
      >
        <Menu aria-hidden="true" className="w-5 h-5" />
      </button>

      <div className="flex flex-grow min-w-0 max-w-2xl items-center gap-2">
      <div className="relative flex-grow min-w-0">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          ref={inputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar canciones, artistas, momentos…"
          aria-label="Buscar canciones"
          className="w-full pl-10 pr-9 lg:pr-16 py-2.5 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg text-sm placeholder:text-transparent sm:placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED] focus:ring-1 focus:ring-[#2464ED] transition-shadow text-[#10203A] dark:text-slate-100"
        />
        {!searchQuery && (
          <span aria-hidden="true" className="sm:hidden pointer-events-none absolute left-10 right-3 top-1/2 -translate-y-1/2 truncate text-sm text-slate-400">
            Buscar canciones
          </span>
        )}
        {searchQuery ? (
          <button
            onClick={() => onSearchChange('')}
            aria-label="Borrar la búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        ) : (
          <kbd className="hidden lg:inline absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-slate-400 bg-white dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded px-1.5 py-0.5">
            Ctrl + K
          </kbd>
        )}
      </div>
      {searchAccessory}
      </div>

      <nav className="flex items-center gap-4 sm:gap-6 ml-auto flex-shrink-0">
        <button onClick={onGoToCancionero} className={linkClass(activePage === 'app')}>
          Cancionero
        </button>
        <button onClick={onGoToAbout} className={linkClass(activePage === 'about')}>
          Acerca de
        </button>
        <button onClick={onGoToContact} className={linkClass(activePage === 'contact')}>
          Contacto
        </button>

        <button
          ref={accountButton}
          type="button"
          popoverTarget={accountId}
          aria-haspopup="dialog"
          aria-expanded={accountOpen}
          aria-controls={accountId}
          aria-label={session ? `Abrir menú de cuenta de ${nameOf(session)}` : 'Abrir menú de cuenta'}
          title={session ? nameOf(session) : 'Ministerio Acordes de Fe'}
          className="w-9 h-9 rounded-full bg-[#EAF1FF] dark:bg-blue-500/10 text-[#2464ED] flex items-center justify-center font-bold text-sm border border-[#2464ED]/10 flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
        >
          <Avatar url={session ? avatarUrl : null} initial={session ? initialOf(session) : 'A'} />
        </button>
        <div
          ref={accountMenu}
          id={accountId}
          popover="auto"
          role="dialog"
          aria-label="Cuenta"
          onBeforeToggle={(event) => {
            if (event.newState !== 'open') return;
            const rect = accountButton.current?.getBoundingClientRect();
            if (!rect) return;
            Object.assign(event.currentTarget.style, {
              top: `${rect.bottom + 8}px`,
              right: `${Math.max(16, document.documentElement.clientWidth - rect.right)}px`,
            });
          }}
          onToggle={(event) => {
            const open = event.newState === 'open';
            setAccountOpen(open);
            if (open) event.currentTarget.querySelector<HTMLButtonElement>('button')?.focus();
            else if (event.currentTarget.contains(document.activeElement)) accountButton.current?.focus();
          }}
          className="fixed left-auto bottom-auto m-0 w-64 max-w-[calc(100vw-2rem)] p-2 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-[#10203A] dark:text-slate-100 shadow-lg text-sm"
        >
          {session && (
            <div className="flex items-center gap-2 px-3 py-2 mb-1 border-b border-slate-100 dark:border-dark-700">
              <span aria-hidden="true" className="w-9 h-9 shrink-0 rounded-full bg-[#EAF1FF] text-[#2464ED] flex items-center justify-center font-bold"><Avatar url={avatarUrl} initial={initialOf(session)} /></span>
              <div className="min-w-0">
              {session.displayName?.trim() && <p className="font-semibold break-words">{session.displayName.trim()}</p>}
              {session.email && <p className="text-xs text-slate-500 dark:text-slate-400 break-all">{session.email}</p>}
              </div>
            </div>
          )}
          <button type="button" onClick={openAccount} className="w-full min-h-11 px-3 py-2 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40">
            {session ? 'Ver mi cuenta' : 'Iniciar sesión'}
          </button>
          {session && <button type="button" disabled={signingOut} onClick={() => void signOut()} className="w-full min-h-11 px-3 py-2 text-left rounded-lg hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 disabled:opacity-50">Cerrar sesión</button>}
        </div>
      </nav>
    </header>
  );
};
