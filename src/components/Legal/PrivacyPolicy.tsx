import React from 'react';
import { ArrowLeft } from 'lucide-react';

/**
 * Qué pasa con los datos de quien usa Acordes de Fe.
 *
 * Escrita mirando el código, no de memoria: cada cosa que dice es algo que la
 * aplicación hace de verdad. Lo que no hace tampoco se promete al revés: no
 * hay analítica, no hay publicidad y no hay cookies de seguimiento, y eso se
 * dice porque es verdad, no porque quede bien.
 *
 * Es corta a propósito. Una política de diez páginas para un cancionero no la
 * lee nadie, y una que nadie lee no informa de nada.
 */

interface PrivacyPolicyProps {
  onBack: () => void;
}

const h2 = 'text-lg font-semibold text-slate-900 dark:text-white mb-2';
const linkClass = 'text-blue-600 dark:text-blue-400 hover:underline';

export const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onBack }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-12">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 hover:border-slate-300 transition-colors mb-5 sm:mb-8"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        <span className="text-sm font-medium">Volver al cancionero</span>
      </button>

      <h1 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Política de privacidad</h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-8">Última actualización: octubre de 2026</p>

      <div className="space-y-6 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
        <section>
          <h2 className={h2}>1. Lo que hace falta para usarla</h2>
          <p>
            Acordes de Fe se puede usar sin cuenta. El cancionero, las listas, los Setlists, el
            metrónomo y el modo en vivo funcionan tal cual, y lo que haces se guarda en tu
            dispositivo.
          </p>
        </section>

        <section>
          <h2 className={h2}>2. Lo que se guarda en tu dispositivo</h2>
          <p>
            La aplicación usa el almacenamiento del navegador para lo que preparas y para lo que
            prefieres: tus canciones favoritas, tus listas, tus Setlists, las personas del
            ministerio y las actividades que anotas, el modo oscuro y los ajustes de lectura. Se
            guarda también una copia del cancionero para que abra sin conexión.
          </p>
          <p className="mt-2">
            Todo eso vive en tu navegador y nadie más lo ve. Si borras los datos del sitio,
            desaparece.
          </p>
        </section>

        <section>
          <h2 className={h2}>3. La cuenta, si decides crearla</h2>
          <p>
            Crear una cuenta es opcional y sirve para una cosa: llevar tus Setlists de un
            dispositivo a otro. Para ello se guardan tu correo, el nombre que elijas y tus
            Setlists sincronizados en Supabase, que es quien aloja la base de datos y se encarga
            del inicio de sesión.
          </p>
          <p className="mt-2">
            Lo demás no sube: las listas, las favoritas, el historial, las personas del ministerio
            y las actividades se quedan en el dispositivo. Y sin sesión no se envía nada: tus
            Setlists siguen siendo tuyos y de este navegador.
          </p>
        </section>

        <section>
          <h2 className={h2}>4. Sin conexión</h2>
          <p>
            La aplicación guarda una copia de sí misma para abrir sin internet, y lo que escribes
            sin cobertura se queda en el dispositivo hasta que vuelva la conexión. Si tienes
            sesión, al recuperarla se intenta sincronizar tus Setlists. Cuando un mismo Setlist
            cambió en dos sitios, no se decide por ti: se te pregunta cuál conservar.
          </p>
        </section>

        <section>
          <h2 className={h2}>5. Compartir un Setlist</h2>
          <p>
            Puedes crear un enlace público para un Setlist que esté en tu cuenta. Quien tenga ese
            enlace podrá ver el Setlist sin registrarse, y sólo verlo: no puede cambiar nada ni
            llegar al resto de los tuyos. El enlace deja de funcionar en cuanto lo desactivas.
          </p>
          <p className="mt-2">
            Mientras esté activo, cualquiera con el enlace puede abrirlo, así que compártelo con
            quien quieras que lo vea.
          </p>
        </section>

        <section>
          <h2 className={h2}>6. Proponer una canción</h2>
          <p>
            Si envías una canción o una corrección, se guarda lo que propones junto al nombre y el
            correo que quieras dejar, los dos opcionales, para poder responderte. El envío pasa
            por una comprobación de Cloudflare Turnstile que distingue a una persona de un robot.
          </p>
        </section>

        <section>
          <h2 className={h2}>7. Reproducir música</h2>
          <p>
            Al abrir una canción con vídeo, la aplicación puede cargar el reproductor de YouTube
            y preparar el vídeo. La reproducción sólo comienza cuando decides reproducir.
            YouTube es un servicio externo con sus propias condiciones, y cargar su reproductor
            requiere conexión a internet.
          </p>
        </section>

        <section>
          <h2 className={h2}>8. Lo que no hay</h2>
          <p>
            No hay analítica, ni publicidad, ni cookies de seguimiento, ni perfilado, ni venta de
            datos a nadie. Las tipografías vienen dentro de la propia aplicación, así que tampoco
            se piden a ningún servicio externo.
          </p>
        </section>

        <section>
          <h2 className={h2}>9. Contenido musical</h2>
          <p>
            Las letras y acordes se recogen con fines educativos y de uso comunitario en contextos
            litúrgicos y de oración. Los derechos pertenecen a sus autores y compositores.
          </p>
        </section>

        <section>
          <h2 className={h2}>10. Tus datos y tus dudas</h2>
          <p>
            Puedes borrar tus datos locales vaciando los datos del sitio en tu navegador. Si tienes
            cuenta y quieres que la eliminemos, o te queda cualquier duda sobre esto, escríbenos
            desde{' '}
            <a href="#/contacto" className={linkClass}>
              Contacto
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
};
