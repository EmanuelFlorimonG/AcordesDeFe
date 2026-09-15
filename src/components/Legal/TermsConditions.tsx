import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface TermsConditionsProps {
  onBack: () => void;
}

export const TermsConditions: React.FC<TermsConditionsProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 hover:border-slate-300 transition-colors mb-8"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">Volver al cancionero</span>
      </button>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Condiciones de uso</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">Última actualización: septiembre 2026</p>

      <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">1. Uso de la aplicación</h2>
          <p>
            Acordes de Fe es una herramienta gratuita de cancionero diseñada para facilitar el acompañamiento musical en encuentros comunitarios, jornadas, vigilias y liturgias. Puedes utilizar la aplicación libremente para buscar canciones, transponer acordes y practicar con tu instrumento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">2. Propiedad intelectual</h2>
          <p>
            Las letras y composiciones musicales incluidas en este cancionero son propiedad de sus autores y compositores originales. Esta aplicación las presenta con fines educativos y de uso litúrgico comunitario sin ánimo de lucro. Si eres titular de derechos y deseas solicitar la retirada de algún contenido, contacta al equipo responsable.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">3. Precisión del contenido</h2>
          <p>
            Los acordes y cifrados se proporcionan como referencia y pueden variar respecto a las versiones originales grabadas. La transposición de acordes se calcula matemáticamente y es precisa en términos cromáticos, pero la elección de posiciones en el mástil queda a criterio del intérprete.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">4. Disponibilidad</h2>
          <p>
            La aplicación se ofrece tal cual, sin garantías de disponibilidad continua. Nos reservamos el derecho de modificar, actualizar o descontinuar funcionalidades en cualquier momento.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">5. Uso aceptable</h2>
          <p>
            No está permitido redistribuir el código fuente de la aplicación con fines comerciales ni presentar el contenido como propio. El uso está limitado a contextos educativos, litúrgicos y comunitarios.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">6. Limitación de responsabilidad</h2>
          <p>
            El equipo de Acordes de Fe no se responsabiliza por la precisión de los cifrados, la disponibilidad del servicio ni por cualquier daño derivado del uso de la aplicación.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">7. Contacto</h2>
          <p>
            Para consultas sobre estas condiciones de uso, escríbenos desde la sección de <a href="#/contacto" className="text-blue-600 dark:text-blue-400 hover:underline">Contacto</a>.
          </p>
        </section>
      </div>
    </div>
  );
};
