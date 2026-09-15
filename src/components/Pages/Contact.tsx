import React from 'react';
import { ArrowLeft, Mail, MessageCircle } from 'lucide-react';

interface ContactProps {
  onBack: () => void;
}

export const Contact: React.FC<ContactProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">Volver al cancionero</span>
      </button>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Contacto</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
        ¿Falta una canción, encontraste un acorde equivocado, o quieres proponer algo para el
        cancionero? Escríbenos.
      </p>

      <div className="space-y-3 max-w-sm">
        <a
          href="mailto:contacto@acordesdefe.org"
          className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 hover:border-blue-300 dark:hover:border-blue-500/40 transition-colors"
        >
          <Mail className="w-5 h-5 text-blue-600 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-white">Correo</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">contacto@acordesdefe.org</p>
          </div>
        </a>

        <div className="flex items-center gap-3 p-4 rounded-lg border border-dashed border-slate-200 dark:border-dark-700">
          <MessageCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">WhatsApp / redes</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Añade aquí el canal real de tu ministerio</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-dark-800 pt-6 mt-10">
        Reemplaza el correo y añade los canales reales de contacto de tu ministerio antes de publicar el sitio.
      </p>
    </div>
  );
};
