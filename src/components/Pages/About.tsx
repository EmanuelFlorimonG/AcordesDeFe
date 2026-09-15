import React from 'react';
import { ArrowLeft, BookOpen, Guitar, Users } from 'lucide-react';

interface AboutProps {
  onBack: () => void;
}

export const About: React.FC<AboutProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">Volver al cancionero</span>
      </button>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Acerca de Acordes de Fe</h1>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-8">
        Acordes de Fe es el cancionero de nuestro ministerio: un lugar donde reunir las letras y
        acordes que usamos en encuentros, jornadas, vigilias y misas, para que cualquiera pueda
        encontrarlos, transportarlos a su tono y tocarlos sin depender de una carpeta de papeles.
      </p>

      <div className="grid sm:grid-cols-3 gap-4 mb-10">
        <div className="p-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-900">
          <BookOpen className="w-5 h-5 text-blue-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Repertorio vivo</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            El cancionero crece con cada encuentro y se organiza por categoría, autor y ocasión.
          </p>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-900">
          <Guitar className="w-5 h-5 text-blue-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Hecho para tocar</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Transposición en vivo, diagramas de acordes y modo de lectura pensado para el escenario.
          </p>
        </div>
        <div className="p-4 rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-900">
          <Users className="w-5 h-5 text-blue-600 mb-2" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">Del ministerio</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Mantenido por y para el ministerio, sin cuentas ni datos personales de por medio.
          </p>
        </div>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-dark-800 pt-6">
        Esta sección se puede ampliar con la historia y misión propias de tu ministerio antes de publicar el sitio.
      </p>
    </div>
  );
};
