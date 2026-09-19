import React, { useDeferredValue, useId, useState } from 'react';
import { ChevronRight, EyeOff, Music2, Search } from 'lucide-react';
import type { EditorialRepository } from '../../admin/editorialRepository';
import { adminHash } from '../../admin/routes';
import { normalizeForSearch } from '../../admin/search';
import { useLoad } from '../../admin/useLoad';
import { secondaryButton, textField } from '../Setlists/ui';
import { AdminEmpty, AdminError, AdminLoading, AdminPageHeader, adminCard } from './AdminNotice';

/** How many rows appear at first, and with each "Mostrar más". */
const PAGE = 40;

/**
 * The official songs stored in Supabase. Built for a long catalog: one
 * compact row per song, a search over title, artist and id, and the list
 * shown in batches instead of all at once.
 */
export const AdminSongs: React.FC<{ repository: EditorialRepository }> = ({ repository }) => {
  const searchId = useId();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const deferredQuery = useDeferredValue(query);
  const list = useLoad(() => repository.listSongs(), 'songs');
  const words = normalizeForSearch(deferredQuery).split(' ').filter(Boolean);
  const matching =
    list.state === 'ready'
      ? list.value.filter((song) => {
          const haystack = normalizeForSearch(`${song.title} ${song.artist ?? ''} ${song.id}`);
          return words.every((word) => haystack.includes(word));
        })
      : [];
  const visible = matching.slice(0, limit);

  return (
    <>
      <AdminPageHeader title="Canciones" description="El catálogo oficial guardado en el servidor." />

      <div className={`${adminCard} mb-5 p-2`}>
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">
            Buscar por título, artista o identificador
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setLimit(PAGE);
            }}
            placeholder="Buscar canción, artista o id"
            className={`${textField} border-transparent bg-slate-50 pl-9 dark:border-transparent dark:bg-dark-950`}
          />
        </div>
      </div>

      {list.state === 'loading' && <AdminLoading rows={6} />}
      {list.state === 'error' && <AdminError message={list.error.message} onRetry={list.reload} />}
      {list.state === 'ready' &&
        (list.value.length === 0 ? (
          <AdminEmpty title="Todavía no hay canciones en el servidor." icon={Music2}>
            Aparecerán aquí al aprobar propuestas o al importar el catálogo.
          </AdminEmpty>
        ) : matching.length === 0 ? (
          <AdminEmpty title="Ninguna canción coincide con la búsqueda." icon={Search} />
        ) : (
          <>
            <p role="status" aria-live="polite" className="mb-3 px-1 text-sm text-slate-500 dark:text-slate-400">
              {matching.length === list.value.length ? `${list.value.length} canciones` : `${matching.length} de ${list.value.length} canciones`}
            </p>
            <div className={`${adminCard} overflow-hidden`}>
              <div
                aria-hidden="true"
                className="hidden grid-cols-[minmax(0,1fr)_5rem_5.5rem_1rem] items-center gap-4 border-b border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:border-dark-800 dark:bg-dark-950/40 dark:text-slate-500 md:grid"
              >
                <span>Canción</span>
                <span>Tonalidad</span>
                <span>Versión</span>
                <span />
              </div>
              <ul className="divide-y divide-slate-100 dark:divide-dark-800">
                {visible.map((song) => (
                  <li key={song.id}>
                    <a
                      href={adminHash.song(song.id)}
                      className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-4 py-3 transition-colors duration-150 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2464ED]/40 dark:hover:bg-dark-800/60 dark:focus-visible:bg-dark-800/60 sm:px-5 md:grid-cols-[minmax(0,1fr)_5rem_5.5rem_1rem]"
                    >
                      <span className="min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-[#10203A] dark:text-white">{song.title}</span>
                          {song.status === 'hidden' && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:border-dark-700 dark:bg-dark-800 dark:text-slate-300">
                              <EyeOff aria-hidden="true" className="h-3 w-3" />
                              Oculta
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">
                          {song.artist ?? 'Artista sin indicar'}
                          <span className="md:hidden">
                            {song.originalKey && ` · ${song.originalKey}`} · v{song.currentVersion}
                          </span>
                        </span>
                      </span>
                      <span className="hidden font-mono text-sm font-semibold text-slate-700 dark:text-slate-200 md:block">
                        {song.originalKey ?? <span className="font-sans text-xs font-normal italic text-slate-400">Sin indicar</span>}
                      </span>
                      <span className="hidden text-sm text-slate-600 dark:text-slate-300 md:block">Versión {song.currentVersion}</span>
                      <ChevronRight
                        aria-hidden="true"
                        className="h-4 w-4 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-[#2464ED] dark:text-slate-600 dark:group-hover:text-sky-400"
                      />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
            {matching.length > visible.length && (
              <div className="mt-4 flex flex-col items-center gap-2">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mostrando {visible.length} de {matching.length}
                </p>
                <button type="button" onClick={() => setLimit((value) => value + PAGE)} className={secondaryButton}>
                  Mostrar más
                </button>
              </div>
            )}
          </>
        ))}
    </>
  );
};
