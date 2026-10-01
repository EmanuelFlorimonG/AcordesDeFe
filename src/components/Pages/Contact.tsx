import React from 'react';
import { ArrowLeft, AtSign, ExternalLink, Mail, Users } from 'lucide-react';

/**
 * A quién se escribe.
 *
 * Dos cosas distintas, y por eso van separadas: la comunidad, que vive en
 * Instagram y es donde se entera uno de lo que pasa, y quien programa la
 * aplicación, que es a quien se le cuenta un acorde equivocado o una idea.
 *
 * Aquí no hay nada de relleno. Lo que aparece es lo único que hay, y mientras
 * no haya más, no habrá más: un canal inventado es peor que ninguno, porque
 * alguien escribe y nadie contesta.
 */

interface ContactProps {
  onBack: () => void;
}

const INSTAGRAM = 'https://www.instagram.com/comgenesaret_claret/';
const HANDLE = '@comgenesaret_claret';
const DEVELOPER = 'Emanuel Florimon';
const EMAIL = 'eflorimon5@gmail.com';

const card =
  'rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-5 sm:p-6';
const link =
  'flex items-center gap-3 rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-950 px-4 py-3 [@media(pointer:coarse)]:py-3.5 transition-colors hover:border-[#2464ED] dark:hover:border-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 touch-manipulation';

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
        Conéctate con la comunidad y con quien programa Acordes de Fe.
      </p>

      <div className="space-y-4">
        <section className={card}>
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400">
              <Users aria-hidden className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Comunidad Genesaret</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Síguenos en Instagram para estar al día de las actividades, los encuentros y lo que va
            pasando en la comunidad.
          </p>
          <a
            href={INSTAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className={`${link} mt-4`}
          >
            <AtSign aria-hidden className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{HANDLE}</span>
              <span className="block text-xs text-slate-500 dark:text-slate-400">Ver en Instagram</span>
            </span>
            <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
          </a>
        </section>

        <section className={card}>
          <div className="flex items-center gap-3 mb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-sky-400">
              <Mail aria-hidden className="h-5 w-5" />
            </span>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Contacto del programador</h2>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Si encuentras un error, falta una canción o se te ocurre algo para el cancionero,
            escríbeme directamente.
          </p>
          <a href={`mailto:${EMAIL}`} className={`${link} mt-4`}>
            <Mail aria-hidden className="h-5 w-5 shrink-0 text-blue-600 dark:text-sky-400" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-slate-900 dark:text-white">{DEVELOPER}</span>
              <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{EMAIL}</span>
            </span>
            <ExternalLink aria-hidden className="h-4 w-4 shrink-0 text-slate-400" />
          </a>
        </section>
      </div>
    </div>
  );
};
