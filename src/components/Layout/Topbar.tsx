import React, { useEffect } from 'react';
import { Search, Menu, X } from 'lucide-react';

interface TopbarProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenSidebar: () => void;
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
  onGoToCancionero,
  onGoToAbout,
  onGoToContact,
  activePage,
  inputRef,
  searchAccessory,
}) => {
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
        onClick={onOpenSidebar}
        className="lg:hidden p-2 -ml-1 rounded-md text-slate-500 dark:text-slate-400"
      >
        <Menu className="w-5 h-5" />
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
          className="w-full pl-10 pr-9 lg:pr-16 py-2.5 bg-slate-50 dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED] focus:ring-1 focus:ring-[#2464ED] transition-shadow text-[#10203A] dark:text-slate-100"
        />
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

        <div
          className="w-9 h-9 rounded-full bg-[#EAF1FF] dark:bg-blue-500/10 text-[#2464ED] flex items-center justify-center font-bold text-sm border border-[#2464ED]/10 flex-shrink-0"
          title="Ministerio Acordes de Fe"
        >
          A
        </div>
      </nav>
    </header>
  );
};
