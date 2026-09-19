import React from 'react';

interface FooterProps {
  onNavigate: (hash: string) => void;
}

export const Footer: React.FC<FooterProps> = ({ onNavigate }) => {
  return (
    <footer className="w-full bg-white dark:bg-dark-950 border-t border-slate-100 dark:border-dark-800 py-6 px-6 sm:px-10 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto print:hidden">
      <span className="text-[11px] text-slate-400 font-medium">
        © Ministerio Acordes de Fe
      </span>

      <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
        <a
          href="#/nosotros"
          onClick={(e) => { e.preventDefault(); onNavigate('#/nosotros'); }}
          className="text-[11px] text-slate-400 hover:text-[#2464ED] transition-colors font-medium"
        >
          Acerca de
        </a>
        <a
          href="#/propuesta"
          onClick={(e) => { e.preventDefault(); onNavigate('#/propuesta'); }}
          className="text-[11px] text-slate-400 hover:text-[#2464ED] transition-colors font-medium"
        >
          Consultar propuesta
        </a>
        <a
          href="#/contacto"
          onClick={(e) => { e.preventDefault(); onNavigate('#/contacto'); }}
          className="text-[11px] text-slate-400 hover:text-[#2464ED] transition-colors font-medium"
        >
          Contacto
        </a>
        <a
          href="#/privacidad"
          onClick={(e) => { e.preventDefault(); onNavigate('#/privacidad'); }}
          className="text-[11px] text-slate-400 hover:text-[#2464ED] transition-colors font-medium"
        >
          Política de privacidad
        </a>
        <a
          href="#/terminos"
          onClick={(e) => { e.preventDefault(); onNavigate('#/terminos'); }}
          className="text-[11px] text-slate-400 hover:text-[#2464ED] transition-colors font-medium"
        >
          Condiciones de uso
        </a>
      </nav>
    </footer>
  );
};
