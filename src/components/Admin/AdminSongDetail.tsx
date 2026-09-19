import React, { useState } from 'react';
import { ArrowLeft, Hash, KeyRound, Layers } from 'lucide-react';
import { songToDraft } from '../../catalog/songDraft';
import type { EditorialRepository } from '../../admin/editorialRepository';
import { formatDateTime } from '../../admin/format';
import { adminHash } from '../../admin/routes';
import { useLoad } from '../../admin/useLoad';
import { SongPreview } from '../SongEditor/SongPreviewPanel';
import { AdminError, AdminLoading, AdminSectionTitle, adminCard } from './AdminNotice';
import { SongFacts } from './SongFacts';

/**
 * An official song and its versions. Each version is the immutable snapshot
 * written when it was published; picking one shows exactly that. There is no
 * rollback here: republishing an old version would be a new, reviewed version.
 */
export const AdminSongDetail: React.FC<{ repository: EditorialRepository; id: string; userId: string }> = ({ repository, id, userId }) => {
  const loaded = useLoad(async () => {
    const [song, versions] = await Promise.all([repository.getSong(id), repository.listVersions(id)]);
    return { song, versions };
  }, `song:${id}`);
  const [picked, setPicked] = useState<number | null>(null);

  if (loaded.state === 'loading') return <AdminLoading />;
  if (loaded.state === 'error') return <AdminError message={loaded.error.message} onRetry={loaded.reload} />;
  const { song, versions } = loaded.value;
  const back = (
    <a
      href={adminHash.songs()}
      className="mb-4 inline-flex items-center gap-1.5 rounded text-sm font-semibold text-slate-500 hover:text-[#2464ED] dark:text-slate-400 dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Canciones
    </a>
  );
  if (!song) {
    return (
      <>
        {back}
        <AdminError message="No existe ninguna canción con ese identificador en el servidor." />
      </>
    );
  }

  const current = versions[0]?.version ?? null;
  const selected = versions.find((version) => version.version === (picked ?? current)) ?? null;
  const shown = selected?.song ?? song;

  return (
    <>
      {back}
      <header className={`${adminCard} mb-5 p-5 sm:p-6`}>
        <h1 className="break-words text-[1.625rem] font-extrabold leading-tight tracking-tight text-[#10203A] dark:text-white sm:text-[1.875rem]">{song.title}</h1>
        <p className={`mt-1 text-[15px] ${song.artist ? 'text-slate-600 dark:text-slate-300' : 'italic text-slate-400 dark:text-slate-500'}`}>{song.artist ?? 'Artista sin indicar'}</p>
        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5 font-mono">
            <Hash aria-hidden="true" className="h-3.5 w-3.5" />
            {song.id}
          </span>
          {song.originalKey && (
            <span className="inline-flex items-center gap-1.5">
              <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
              Tonalidad {song.originalKey}
            </span>
          )}
          {current !== null && (
            <span className="inline-flex items-center gap-1.5">
              <Layers aria-hidden="true" className="h-3.5 w-3.5" />
              Versión actual {current}
            </span>
          )}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          <SongPreview
            key={selected?.version ?? 'actual'}
            song={shown}
            heading={selected && selected.version !== current ? `Versión ${selected.version}` : 'Versión actual'}
            subtitle={selected ? `Tal como se publicó en la versión ${selected.version}.` : 'Tal como está publicada.'}
          />
        </div>
        <aside className="min-w-0 space-y-4">
          <section aria-labelledby="versiones" className={`${adminCard} p-4 sm:p-5`}>
            <AdminSectionTitle id="versiones">Versiones</AdminSectionTitle>
            {versions.length === 0 ? (
              <p className="text-sm italic text-slate-500 dark:text-slate-400">Sin versiones registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {versions.map((version) => {
                  const active = version.version === (picked ?? current);
                  return (
                    <li key={version.version}>
                      <button
                        type="button"
                        onClick={() => setPicked(version.version)}
                        aria-pressed={active}
                        className={`w-full rounded-xl border px-3 py-2.5 text-left text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
                          active
                            ? 'border-[#2464ED]/40 bg-[#EAF1FF] dark:border-sky-400/30 dark:bg-sky-400/10'
                            : 'border-slate-200 hover:border-[#2464ED]/40 hover:bg-slate-50 dark:border-dark-700 dark:hover:bg-dark-800/60'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-100">Versión {version.version}</span>
                          {version.version === current && (
                            <span className="rounded-md bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#1D56D6] ring-1 ring-[#2464ED]/20 dark:bg-dark-900 dark:text-sky-300 dark:ring-sky-400/20">
                              Actual
                            </span>
                          )}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
                          {formatDateTime(version.publishedAt)}
                          {version.publishedBy === userId ? ' · por ti' : version.publishedBy ? ' · por el equipo' : ''}
                          {!version.submissionId && ' · sin propuesta asociada'}
                        </span>
                      </button>
                      {active && version.submissionId && (
                        <a href={adminHash.submission(version.submissionId)} className="mt-1 inline-block px-1 text-xs font-semibold text-[#2464ED] hover:underline dark:text-sky-400">
                          Ver la propuesta que la publicó
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <SongFacts draft={songToDraft(shown)} layout="list" heading={selected ? `Información · versión ${selected.version}` : 'Información musical'} />
        </aside>
      </div>
    </>
  );
};
