import React, { useEffect, useState } from 'react';
import { CalendarDays, Eye, Link2Off, ListOrdered, Loader2, Music, RotateCcw } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import type { SharedSetlistRead } from '../../storage/setlistShares';
import { SharedSetlistPlayer } from './SharedSetlistPlayer';
import { formatSetlistDate, formatSongCount, liveModeName } from '../../utils/setlists';
import { describeCapo, describeTranspose, describeTransition } from '../../utils/setlistVersions';
import { primaryButton, secondaryButton } from './ui';

/**
 * Un Setlist abierto desde un enlace compartido.
 *
 * Quien llega aquí puede no tener cuenta, puede no haber usado nunca esta
 * aplicación, y probablemente está de pie con el móvil en la mano diez
 * minutos antes de empezar. Así que la página enseña lo que hace falta para
 * tocar —qué se canta, en qué orden, en qué tono— y nada más.
 *
 * De sólo lectura, y se nota: no hay un botón de editar escondido ni un menú
 * que lleve a los Setlists de nadie. Lo dice además en voz alta, porque quien
 * lo recibe tiene que saber que lo que ve es de otra persona y que sus
 * cambios no irían a ninguna parte.
 */

interface SharedSetlistScreenProps {
  token: string;
  route?: string;
  onPerformanceChange?: (active: boolean) => void;
  songsById: Map<string, Song>;
  /** Lee el enlace. Se pasa para poder probar esta pantalla sin red. */
  load: (token: string) => Promise<SharedSetlistRead | { state: 'unconfigured' }>;
  /** Lleva al cancionero, que sí es público y sí es de quien mira. */
  onGoToSongbook: () => void;
}

type Screen =
  | { state: 'loading' }
  | { state: 'setlist'; setlist: Setlist }
  | { state: 'gone' }
  | { state: 'error' };

const GONE = 'Este Setlist ya no está disponible.';

export const SharedSetlistScreen: React.FC<SharedSetlistScreenProps> = ({
  token,
  route = `#/shared/setlist/${token}`,
  onPerformanceChange,
  songsById,
  load,
  onGoToSongbook,
}) => {
  const [screen, setScreen] = useState<Screen>({ state: 'loading' });
  // Cada pulsación de "Reintentar" es un intento, y uno solo: se vuelve a
  // pedir lo mismo con la misma función. Nada se reintenta por su cuenta.
  const [attempt, setAttempt] = useState(0);
  // Otro enlace es otra pantalla. Se vuelve a "abriendo" durante el render, no
  // en un efecto, para que nadie vea un instante del Setlist anterior.
  const [openedFor, setOpenedFor] = useState<string | null>(token);
  if (openedFor !== token) {
    setOpenedFor(token);
    setScreen({ state: 'loading' });
  }

  useEffect(() => {
    let current = true;
    void load(token)
      .then((read) => {
        if (!current) return;
        if (read.state === 'setlist') setScreen({ state: 'setlist', setlist: read.setlist });
        // Un enlace desactivado y uno que nunca existió se responden igual:
        // para quien mira son lo mismo, y distinguirlos sólo serviría para
        // averiguar qué enlaces hubo.
        else if (read.state === 'gone') setScreen({ state: 'gone' });
        else setScreen({ state: 'error' });
      })
      .catch(() => {
        if (current) setScreen({ state: 'error' });
      });
    return () => {
      current = false;
    };
  }, [token, load, attempt]);

  if (screen.state === 'loading') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <Loader2 className="w-6 h-6 mx-auto animate-spin text-slate-400" />
        <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">Abriendo el Setlist…</p>
      </div>
    );
  }

  if (screen.state !== 'setlist') {
    const gone = screen.state === 'gone';
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <span className="inline-flex w-12 h-12 items-center justify-center rounded-xl bg-slate-100 dark:bg-dark-800">
          <Link2Off className="w-5 h-5 text-slate-400" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">
          {gone ? GONE : 'No se pudo abrir este Setlist.'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {gone
            ? 'Puede que quien lo compartió haya desactivado el enlace, o que el enlace esté incompleto. Pídele uno nuevo.'
            : 'Comprueba tu conexión e inténtalo otra vez.'}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {/* Un enlace desactivado no se arregla insistiendo; un fallo de red, a
              veces sí. Por eso sólo se ofrece cuando puede servir de algo. */}
          {!gone && (
            <button
              type="button"
              onClick={() => {
                setScreen({ state: 'loading' });
                setAttempt((veces) => veces + 1);
              }}
              className={primaryButton}
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Reintentar
            </button>
          )}
          <button type="button" onClick={onGoToSongbook} className={gone ? primaryButton : secondaryButton}>
            Ir al cancionero
          </button>
        </div>
      </div>
    );
  }

  return <SharedSetlistPlayer token={token} route={route} setlist={screen.setlist} songsById={songsById} onGoToSongbook={onGoToSongbook} onPerformanceChange={onPerformanceChange} />;
};

/**
 * El Setlist, pintado. Sin red y sin estado: lo que entra es un Setlist y lo
 * que sale es una página que sólo se lee.
 */
export const SharedSetlistView: React.FC<{
  onOpenSong?: (itemId: string) => void;
  onRehearsal?: () => void;
  onLive?: () => void;
  setlist: Setlist;
  songsById: Map<string, Song>;
  onGoToSongbook: () => void;
}> = ({ setlist, songsById, onGoToSongbook, onOpenSong, onRehearsal, onLive }) => {
  const date = formatSetlistDate(setlist.date, 'long');

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 sm:py-8">
      <p className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-dark-800 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">
        <Eye className="w-3.5 h-3.5" aria-hidden="true" />
        Setlist compartido · sólo lectura
      </p>

      <h1 className="mt-3 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{setlist.name}</h1>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        {date && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="w-4 h-4" aria-hidden="true" />
            {date}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <ListOrdered className="w-4 h-4" aria-hidden="true" />
          {formatSongCount(setlist.items.length)}
        </span>
      </div>

      {setlist.description && (
        <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {setlist.description}
        </p>
      )}

      {setlist.items.some(item => songsById.has(item.songId)) && <div className="mt-4 flex flex-wrap gap-2">
        {onRehearsal && <button className={secondaryButton} onClick={onRehearsal}>Modo Ensayo</button>}
        {onLive && <button className={primaryButton} onClick={onLive}>{liveModeName(setlist.kind)}</button>}
      </div>}
      {setlist.items.length === 0 ? (
        <p className="mt-8 rounded-xl border border-slate-200 dark:border-dark-700 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Todavía no tiene canciones.
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {setlist.items.map((item, at) => {
            const song = songsById.get(item.songId);
            const blocks = item.arrangement?.sections ?? [];
            const settings = [
              item.transposeSteps === 0 ? null : describeTranspose(item.transposeSteps),
              item.capoFret > 0 ? describeCapo(item.capoFret) : null,
            ].filter(Boolean) as string[];

            return (
              <li
                key={item.id}
                className="rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-4 py-3"
              >
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 w-7 h-7 shrink-0 flex items-center justify-center rounded-lg bg-slate-100 dark:bg-dark-800 text-xs font-semibold text-slate-500 dark:text-slate-400"
                  >
                    {at + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    {item.moment && (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#2464ED] dark:text-sky-400">
                        {item.moment}
                      </p>
                    )}
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {song && onOpenSong ? <button className="text-left hover:underline" onClick={() => onOpenSong(item.id)}>{song.title}</button> : song?.title ?? 'Canción no disponible'}
                    </p>
                    {song?.artist && <p className="text-sm text-slate-500 dark:text-slate-400">{song.artist}</p>}

                    {settings.length > 0 && (
                      <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
                        <Music className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                        {settings.join(' · ')}
                      </p>
                    )}

                    {item.notes && (
                      <p className="mt-1.5 whitespace-pre-line text-sm text-slate-600 dark:text-slate-300">
                        {item.notes}
                      </p>
                    )}

                    {blocks.length > 0 && (
                      <div className="mt-2 rounded-lg bg-slate-50 dark:bg-dark-950 px-3 py-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500">
                          Arreglo
                        </p>
                        <ol className="mt-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-300">
                          {blocks.map((block) => (
                            <li key={block.id}>
                              {block.label}
                              {block.repeatCount > 1 && ` ×${block.repeatCount}`}
                              {block.transition.type === 'jump' && ' · vuelve atrás'}
                              {block.transition.type === 'end' && ' · final'}
                              {block.instruction && `. ${block.instruction}`}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}

                    {item.transitionToNext && at < setlist.items.length - 1 && (
                      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                        Al terminar: {describeTransition(item.transitionToNext)}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div className="mt-8 rounded-xl border border-slate-200 dark:border-dark-700 px-4 py-4 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Esto es una copia para leer, así que aquí no se puede cambiar nada. Lo que se ve es lo que tenga guardado quien lo compartió.
        </p>
        <button type="button" onClick={onGoToSongbook} className={`${primaryButton} mt-3`}>
          Ver el cancionero
        </button>
      </div>
    </div>
  );
};
