import React, { useEffect, useState } from 'react';
import { Link2Off, Loader2, RotateCcw } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import type { SharedSetlistRead } from '../../storage/setlistShares';
import { SharedSetlistPlayer } from './SharedSetlistPlayer';
import { formatSetlistDate, liveModeName } from '../../utils/setlists';
import { SetlistHeading } from './SetlistHeading';
import { SetlistItemDetails } from './SetlistItemDetails';
import { SetlistSongList } from './SetlistSongList';
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
 *
 * Es la misma página que ve quien lo prepara —la misma cabecera, las mismas
 * filas, el mismo tono y la misma cejilla—, porque es el mismo Setlist y
 * quien abre el enlace en el móvil espera reconocerlo.
 *
 * No lleva ninguna etiqueta ni ninguna nota que lo anuncie: se abre y se lee,
 * como cualquier página. Que no se pueda cambiar nada no se dice, se nota,
 * porque no hay nada que tocar.
 *
 * Lo que no es igual son las capacidades. A la lista de canciones no se le
 * entrega ninguna función de editar, mover ni quitar, así que no hay menú ni
 * asa de arrastre: no es una pantalla con los botones apagados, es una
 * pantalla que no los tiene. Tampoco se enseña el equipo: los nombres de
 * quienes tocan no eligieron salir en un enlace público.
 */
export const SharedSetlistView: React.FC<{
  onOpenSong?: (itemId: string) => void;
  onRehearsal?: () => void;
  onLive?: () => void;
  setlist: Setlist;
  songsById: Map<string, Song>;
  onGoToSongbook: () => void;
}> = ({ setlist, songsById, onGoToSongbook, onOpenSong, onRehearsal, onLive }) => {
  const hayCanciones = setlist.items.some((item) => songsById.has(item.songId));

  return (
    <div className="w-full max-w-5xl mx-auto px-5 sm:px-10 py-6 sm:py-8">
      <header className="mb-6">
        <SetlistHeading setlist={setlist} dateLabel={formatSetlistDate(setlist.date, 'long')} />

        {setlist.description && (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {setlist.description}
          </p>
        )}

        {hayCanciones && (onRehearsal || onLive) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {onRehearsal && (
              <button type="button" className={secondaryButton} onClick={onRehearsal}>
                Modo Ensayo
              </button>
            )}
            {onLive && (
              <button type="button" className={primaryButton} onClick={onLive}>
                {liveModeName(setlist.kind)}
              </button>
            )}
          </div>
        )}
      </header>

      {setlist.items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 dark:border-dark-700 px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          Todavía no tiene canciones.
        </p>
      ) : (
        <SetlistSongList
          items={setlist.items}
          songsById={songsById}
          onOpenItem={(item) => onOpenSong?.(item.id)}
          // Aquí sí se enseña lo que se dijo para cada canción: quien abre el
          // enlace no tiene otro sitio donde consultarlo.
          renderDetails={(item, at) => (
            <SetlistItemDetails item={item} isLast={at === setlist.items.length - 1} />
          )}
        />
      )}

      {/* Al final, una salida y nada más: quien quiera seguir mirando tiene
          a dónde ir, y quien venía a leer el Setlist ya terminó. */}
      <div className="mt-8 text-center">
        <button type="button" onClick={onGoToSongbook} className={secondaryButton}>
          Ver el cancionero
        </button>
      </div>
    </div>
  );
};
