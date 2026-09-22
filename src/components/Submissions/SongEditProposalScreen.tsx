import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CloudOff, EyeOff, LoaderCircle, RotateCcw } from 'lucide-react';
import { getSongEditSource } from '../../catalog/services';
import { songToDraft } from '../../catalog/songDraft';
import type { SongForEdit } from '../../catalog/supabaseSongRepository';
import { SongEditorScreen } from '../SongEditor/SongEditorScreen';
import { secondaryButton } from '../Setlists/ui';

interface SongEditProposalScreenProps {
  songId: string;
  /** The catalog's categories, offered by the editor */
  categories: string[];
  /** Back to the song's page */
  onBack: () => void;
  onCheckStatus: (trackingCode: string) => void;
}

type Load =
  | { state: 'loading' }
  | { state: 'ready'; found: SongForEdit }
  /** Hidden, or it never existed: nothing to edit */
  | { state: 'missing' }
  | { state: 'error' }
  /** This build can't take edits (no backend, or bundled songs only) */
  | { state: 'unavailable' };

/**
 * "Agregar acordes" / "Sugerir edición": the song is read again from Supabase,
 * as it is published now and with its version, and the editor opens on it.
 * The cached catalog is never the starting point: an edit must be made on the
 * version it says it was made on.
 */
export const SongEditProposalScreen: React.FC<SongEditProposalScreenProps> = ({ songId, categories, onBack, onCheckStatus }) => {
  const source = useMemo(() => getSongEditSource(), []);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>(() => (source ? { state: 'loading' } : { state: 'unavailable' }));

  useEffect(() => {
    if (!source) return;
    const controller = new AbortController();
    setLoad({ state: 'loading' });
    source
      .getSongForEdit(songId, { signal: controller.signal })
      .then((found) => setLoad(found ? { state: 'ready', found } : { state: 'missing' }))
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: 'error' });
      });
    return () => controller.abort();
  }, [source, songId, attempt]);

  if (load.state === 'ready') {
    const { song, version } = load.found;
    return (
      <SongEditorScreen
        // A new version is a new starting point: the editor starts again on it.
        key={`${song.id}:${version}`}
        categories={categories}
        onBackToSongbook={onBack}
        backLabel="Volver a la canción"
        onCheckStatus={onCheckStatus}
        edit={{ songId: song.id, published: songToDraft(song), baseVersion: version }}
        onReloadPublished={() => setAttempt((value) => value + 1)}
      />
    );
  }

  const message =
    load.state === 'missing'
      ? {
          icon: EyeOff,
          title: 'Esta canción no está publicada',
          text: 'Puede que se haya retirado del cancionero. No se pueden proponer cambios sobre ella.',
        }
      : load.state === 'unavailable'
        ? {
            icon: CloudOff,
            title: 'No disponible aquí',
            text: 'Sugerir cambios necesita el catálogo en línea, y esta versión de la app no lo usa.',
          }
        : {
            icon: CloudOff,
            title: 'No se pudo abrir la canción',
            text: 'Para sugerir cambios se parte de la versión publicada ahora, y no se pudo consultar. Revisa la conexión y vuelve a intentarlo.',
          };
  const Icon = message.icon;

  return (
    <div className="w-full px-5 py-6 sm:px-10 sm:py-8">
      <button
        type="button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 px-3 py-1.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
      >
        <ArrowLeft className="w-4 h-4 text-blue-600" />
        Volver a la canción
      </button>
      {load.state === 'loading' ? (
        <p role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500 dark:text-slate-400">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" />
          Abriendo la versión publicada…
        </p>
      ) : (
        <div className="mx-auto max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-dark-700 dark:bg-dark-900">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-500 dark:bg-dark-800 dark:text-slate-400">
            <Icon aria-hidden="true" className="h-5 w-5" />
          </span>
          <h1 className="text-lg font-bold text-[#10203A] dark:text-white">{message.title}</h1>
          <p role="alert" className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {message.text}
          </p>
          {load.state === 'error' && (
            <button type="button" onClick={() => setAttempt((value) => value + 1)} className={`${secondaryButton} mt-5`}>
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              Reintentar
            </button>
          )}
        </div>
      )}
    </div>
  );
};
