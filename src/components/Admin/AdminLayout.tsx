import React, { useEffect, useRef, useState } from 'react';
import { BookOpen, Cross, Inbox, LayoutDashboard, LogOut, Menu, Moon, Music2, Sun, X } from 'lucide-react';
import type { EditorialRole } from '../../catalog/reviewContract';
import { ROLE_LABELS } from '../../admin/labels';
import { adminHash, type AdminSection } from '../../admin/routes';
import { iconButton } from '../Setlists/ui';

const NAV: Array<{ id: AdminSection; label: string; icon: React.ElementType; href: string }> = [
  { id: 'overview', label: 'Resumen', icon: LayoutDashboard, href: adminHash.overview() },
  { id: 'submissions', label: 'Propuestas', icon: Inbox, href: adminHash.submissions() },
  { id: 'songs', label: 'Canciones', icon: Music2, href: adminHash.songs() },
];

interface AdminLayoutProps {
  section: AdminSection | null;
  email: string | null;
  role: EditorialRole;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
  onSignOut: () => void;
  children: React.ReactNode;
}

/** Two letters for the account's avatar, from the email ("eflorimon5@…" -> "EF"). */
function initialsOf(email: string | null): string {
  const letters = (email ?? '').split('@')[0].replace(/[^a-zA-Z]/g, '');
  return (letters.slice(0, 2) || 'AF').toUpperCase();
}

const quietAction =
  'flex min-h-[42px] w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-800 dark:hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';

/**
 * The editorial tool's frame, apart from the songbook's: its own navigation
 * and a content column of comfortable width. Desktop: a sidebar. Phone and
 * tablet: a top bar and a drawer.
 */
export const AdminLayout: React.FC<AdminLayoutProps> = ({ section, email, role, isDarkMode, onToggleDarkMode, onSignOut, children }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  // Closing the drawer on navigation, and with Escape; focus goes in and comes back.
  useEffect(() => {
    if (!drawerOpen) return;
    const close = () => setDrawerOpen(false);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('hashchange', close);
    window.addEventListener('keydown', onKey);
    drawerRef.current?.querySelector<HTMLElement>('nav a')?.focus();
    const trigger = menuButtonRef.current;
    return () => {
      window.removeEventListener('hashchange', close);
      window.removeEventListener('keydown', onKey);
      trigger?.focus();
    };
  }, [drawerOpen]);

  const brand = (
    <a href={adminHash.overview()} className="flex items-center gap-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#2464ED] shadow-[0_2px_8px_rgba(36,100,237,0.25)]">
        <Cross aria-hidden="true" className="h-5 w-5 text-white" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block text-[15px] font-extrabold leading-tight tracking-tight text-[#10203A] dark:text-white">ACORDES DE FE</span>
        <span className="block text-xs font-medium text-slate-500 dark:text-slate-400">Panel editorial</span>
      </span>
    </a>
  );

  const navigation = (
    <nav aria-label="Panel editorial" className="px-3">
      <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Editorial</p>
      <ul className="space-y-0.5">
        {NAV.map((item) => {
          const active = section === item.id;
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <a
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                  active
                    ? 'bg-[#EAF1FF] text-[#1D56D6] dark:bg-sky-400/10 dark:text-sky-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-dark-800 dark:hover:text-white'
                }`}
              >
                {active && <span aria-hidden="true" className="absolute inset-y-2 left-0 w-[3px] rounded-r bg-[#2464ED] dark:bg-sky-400" />}
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" />
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const footer = (
    <div className="mt-auto px-3 pb-4 pt-4">
      <div className="mb-2 flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50 px-3 py-2.5 dark:border-dark-800 dark:bg-dark-950/60">
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2464ED] text-xs font-bold text-white">
          {initialsOf(email)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100" title={email ?? undefined}>
            {email ?? 'Sesión iniciada'}
          </span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">{ROLE_LABELS[role]}</span>
        </span>
      </div>
      <button type="button" onClick={onToggleDarkMode} className={quietAction}>
        {isDarkMode ? <Sun aria-hidden="true" className="h-[18px] w-[18px]" /> : <Moon aria-hidden="true" className="h-[18px] w-[18px]" />}
        {isDarkMode ? 'Modo claro' : 'Modo oscuro'}
      </button>
      <a href="#/" className={quietAction}>
        <BookOpen aria-hidden="true" className="h-[18px] w-[18px]" />
        Ver el cancionero
      </a>
      <button type="button" onClick={onSignOut} className={quietAction}>
        <LogOut aria-hidden="true" className="h-[18px] w-[18px]" />
        Cerrar sesión
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-dark-950 lg:flex">
      <aside className="sticky top-0 hidden h-screen w-[17rem] shrink-0 flex-col border-r border-slate-200/80 bg-white dark:border-dark-800 dark:bg-dark-900 lg:flex">
        <div className="px-6 pb-7 pt-7">{brand}</div>
        {navigation}
        {footer}
      </aside>

      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200/80 bg-white/90 px-2 backdrop-blur dark:border-dark-800 dark:bg-dark-900/90 lg:hidden">
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir el menú del panel"
          aria-expanded={drawerOpen}
          className={iconButton}
        >
          <Menu aria-hidden="true" className="h-5 w-5" />
        </button>
        {brand}
      </header>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button type="button" aria-label="Cerrar el menú" tabIndex={-1} onClick={() => setDrawerOpen(false)} className="absolute inset-0 bg-slate-900/40 dark:bg-black/60" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Menú del panel"
            className="absolute inset-y-0 left-0 flex w-[18rem] max-w-[85vw] flex-col bg-white shadow-xl dark:bg-dark-900"
          >
            <div className="flex items-center justify-between px-5 pb-6 pt-5">
              {brand}
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Cerrar el menú" className={iconButton}>
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>
            {navigation}
            {footer}
          </div>
        </div>
      )}

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 sm:py-9 lg:px-10 xl:px-12">
        <div className="mx-auto w-full max-w-[72rem]">{children}</div>
      </main>
    </div>
  );
};
