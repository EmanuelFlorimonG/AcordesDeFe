import React, { useState } from 'react';
import { AlertTriangle, Cloud, Loader2, Smartphone } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import { compareSetlistVersions, type VersionField } from '../../utils/setlistVersions';
import { Dialog } from './Dialog';
import { primaryButton, secondaryButton } from './ui';

/**
 * The same setlist changed here and in the account. Somebody chooses which one
 * to keep, having seen both.
 *
 * Nothing is decided for them and nothing is merged: one version survives, the
 * other is replaced, and the dialog says which is which in those words before
 * either button is pressed. What it shows is what a person recognises about
 * their own music — the name, the day, the songs, the order, the keys, the
 * arrangements — and never how any of it is stored.
 */

interface SetlistConflictDialogProps {
  /** This device's version. */
  mine: Setlist;
  /** The account's version, as it was read a moment ago. */
  theirs: Setlist;
  songsById: Map<string, Song>;
  /** `keep` is the version that survives; the other is replaced. */
  onResolve: (keep: 'local' | 'remote') => void;
  onClose: () => void;
  /** While the choice is being carried out, so it cannot be made twice. */
  busy?: boolean;
}

const MINE = 'Esta versión';
const THEIRS = 'Versión de mi cuenta';

const columnHead = 'text-[11px] font-semibold uppercase tracking-[0.12em]';

/** One line of the comparison, with both sides under their own heading. */
const Row: React.FC<{ field: VersionField; compact?: boolean }> = ({ field, compact = false }) => (
  <div
    className={`rounded-lg px-3 py-2 ${
      field.differs ? 'bg-amber-50 dark:bg-amber-500/10' : 'bg-slate-50 dark:bg-dark-900'
    }`}
  >
    <p className={`${columnHead} ${compact ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500 dark:text-slate-400'}`}>
      {field.label}
      {field.differs && <span className="ml-1.5 normal-case tracking-normal text-amber-700 dark:text-amber-400">distinto</span>}
    </p>
    <dl className="mt-1 grid gap-x-4 gap-y-2 sm:grid-cols-2">
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
          {MINE}
        </dt>
        <dd className="text-sm text-slate-900 dark:text-slate-100">{field.mine}</dd>
      </div>
      <div>
        <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
          {THEIRS}
        </dt>
        <dd className="text-sm text-slate-900 dark:text-slate-100">{field.theirs}</dd>
      </div>
    </dl>
  </div>
);

export const SetlistConflictDialog: React.FC<SetlistConflictDialogProps> = ({
  mine,
  theirs,
  songsById,
  onResolve,
  onClose,
  busy = false,
}) => {
  // What is about to be replaced, said plainly, before it happens. Choosing in
  // the dialog does not carry anything out: it asks once more, naming which
  // version disappears.
  const [confirming, setConfirming] = useState<'local' | 'remote' | null>(null);

  const comparison = compareSetlistVersions(mine, theirs, (songId) => songsById.get(songId)?.title ?? 'Canción');

  if (confirming) {
    const keepsMine = confirming === 'local';
    return (
      <Dialog
        role="alertdialog"
        size="sm"
        title={keepsMine ? `Conservar ${MINE.toLowerCase()}` : `Usar la ${THEIRS.toLowerCase()}`}
        onClose={() => setConfirming(null)}
        footer={
          <>
            <button type="button" onClick={() => setConfirming(null)} className={secondaryButton} disabled={busy}>
              Volver a comparar
            </button>
            <button type="button" onClick={() => onResolve(confirming)} className={primaryButton} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {busy ? 'Guardando…' : keepsMine ? 'Sí, conservar esta' : 'Sí, usar la de mi cuenta'}
            </button>
          </>
        }
      >
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          {keepsMine ? (
            <>
              Se guardará <strong className="font-semibold text-slate-900 dark:text-white">esta versión</strong> en tu
              cuenta y sustituirá a la que hay allí. La versión de tu cuenta se perderá.
            </>
          ) : (
            <>
              Se traerá la <strong className="font-semibold text-slate-900 dark:text-white">versión de tu cuenta</strong>{' '}
              y sustituirá a la de este dispositivo. Los cambios que hiciste aquí se perderán.
            </>
          )}
        </p>
        {!keepsMine && (
          <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Las personas que elegiste aquí para cada canción se mantienen: eso no viaja entre dispositivos.
          </p>
        )}
      </Dialog>
    );
  }

  return (
    <Dialog
      size="lg"
      title={`«${mine.name}» cambió en dos sitios`}
      description="Cambió aquí y también en tu cuenta. No se ha guardado nada para no perder ninguna de las dos versiones: elige cuál quieres conservar."
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton} disabled={busy}>
            Decidir más tarde
          </button>
          <button type="button" onClick={() => setConfirming('remote')} className={secondaryButton} disabled={busy}>
            <Cloud className="w-4 h-4" />
            Usar la versión de mi cuenta
          </button>
          <button
            type="button"
            data-autofocus=""
            onClick={() => setConfirming('local')}
            className={primaryButton}
            disabled={busy}
          >
            <Smartphone className="w-4 h-4" />
            Conservar esta versión
          </button>
        </>
      }
    >
      {comparison.identical && (
        <p className="mb-3 flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-dark-900 px-3 py-2 text-sm text-slate-600 dark:text-slate-300">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-amber-500" />
          Las dos versiones se leen igual, aunque se guardaron por separado. Puedes conservar cualquiera de las dos.
        </p>
      )}

      <div className="space-y-2">
        {comparison.fields.map((field) => (
          <Row key={field.label} field={field} />
        ))}
      </div>

      {comparison.songs.length > 0 && (
        <>
          <p className="mt-5 mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
            Canciones, en orden
          </p>
          <ol className="space-y-2">
            {comparison.songs.map((song) => (
              <li
                key={song.position}
                className={`rounded-lg border px-3 py-2 ${
                  song.differs
                    ? 'border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/5'
                    : 'border-slate-200 dark:border-dark-700'
                }`}
              >
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500">Canción {song.position}</p>
                <dl className="mt-1 grid gap-x-4 gap-y-2 sm:grid-cols-2">
                  <div>
                    <dt className={`${columnHead} text-slate-400 dark:text-slate-500`}>
                      <Smartphone className="inline w-3 h-3 mr-1 -mt-0.5" />
                      {MINE}
                    </dt>
                    <dd className="text-sm text-slate-900 dark:text-slate-100">
                      {song.mine ?? <span className="text-slate-400 dark:text-slate-500">No está</span>}
                    </dd>
                  </div>
                  <div>
                    <dt className={`${columnHead} text-slate-400 dark:text-slate-500`}>
                      <Cloud className="inline w-3 h-3 mr-1 -mt-0.5" />
                      {THEIRS}
                    </dt>
                    <dd className="text-sm text-slate-900 dark:text-slate-100">
                      {song.theirs ?? <span className="text-slate-400 dark:text-slate-500">No está</span>}
                    </dd>
                  </div>
                </dl>
                {song.details.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {song.details.map((field) => (
                      <Row key={field.label} field={field} compact />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
    </Dialog>
  );
};
