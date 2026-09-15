import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 hover:border-slate-300 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">Volver al cancionero</span>
      </button>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Política de privacidad</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">Última actualización: septiembre 2026</p>

      <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Datos que recopilamos</h2>
          <p>
            Acordes de Fe es una aplicación web que funciona completamente en tu navegador. No recopilamos datos personales, no solicitamos registro de cuentas y no enviamos información a servidores externos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Almacenamiento local</h2>
          <p>
            La aplicación utiliza <code className="text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-1 py-0.5 rounded text-xs border border-blue-100 dark:border-blue-500/20">localStorage</code> del navegador para guardar tus preferencias: canciones favoritas, listas y modo oscuro. Estos datos permanecen exclusivamente en tu dispositivo y nunca son transmitidos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Cookies</h2>
          <p>
            No utilizamos cookies de seguimiento, cookies de terceros ni ningún mecanismo de rastreo. No se integran servicios de analítica ni publicidad.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Fuentes externas</h2>
          <p>
            La aplicación carga fuentes tipográficas (Inter y JetBrains Mono) desde Google Fonts. Consulta la <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">política de privacidad de Google</a> para información sobre ese servicio.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Contenido musical</h2>
          <p>
            Las letras y acordes incluidos se proporcionan con fines educativos y de uso comunitario en contextos litúrgicos y de oración. Los derechos de autor pertenecen a sus autores y compositores respectivos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Contacto</h2>
          <p>
            Si tienes preguntas sobre esta política de privacidad, puedes escribirnos desde la sección de <a href="#/contacto" className="text-blue-600 dark:text-blue-400 hover:underline">Contacto</a>.
          </p>
        </section>
      </div>
    </div>
  );
};
