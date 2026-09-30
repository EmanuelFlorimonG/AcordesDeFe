import React from 'react';
import type { Song } from '../../types/song';
import type { Setlist } from '../../types/setlist';
import { buildSetlistDocument, type SetlistDocument, type SetlistDocumentEntry } from '../../utils/setlistExport';
import { formatSongCount } from '../../utils/setlists';
import { ChordSheet } from '../SongViewer/ChordSheet';

/**
 * La hoja del músico: el Setlist entero para tocar desde el papel.
 *
 * Sigue la plantilla de siempre del ministerio —los momentos en orden, el
 * título y el tono— y le añade lo único que la hoja de quien canta no
 * necesita: los acordes encima de la letra, la cejilla, y lo que diga el
 * arreglo de esta ocasión.
 *
 * Está pensada para un atril, no para una pantalla: una sola columna, para
 * que un acorde caiga siempre sobre su sílaba, y cortes de página que nunca
 * parten una sección por la mitad ni dejan un título solo al pie.
 *
 * Lo que pinta sale de `buildSetlistDocument`, que es también de donde saldrá
 * la hoja de quien canta: lo que las dos comparten se decide una vez y allí.
 */

interface SetlistPrintSheetProps {
  sheet: SetlistDocument;
}

/** Cómo suena y cómo se toca, en una línea. */
function keyLines(entry: SetlistDocumentEntry): string[] {
  const parts: string[] = [];
  if (entry.key) {
    parts.push(`Tono: ${entry.key.sounding}`);
    // Con cejilla, lo que suena y lo que se toca no son lo mismo, y el músico
    // necesita las dos cosas: la forma es la que tienen los dedos.
    if (entry.key.shape) parts.push(`Formas de ${entry.key.shape}`);
    if (entry.key.original) parts.push(`Escrita en ${entry.key.original}`);
  }
  if (entry.capoFret > 0) parts.push(`Cejilla en el traste ${entry.capoFret}`);
  if (entry.tempo) parts.push(`${entry.tempo} BPM`);
  if (entry.timeSignature) parts.push(entry.timeSignature);
  return parts;
}

const SongEntry: React.FC<{ entry: SetlistDocumentEntry; position: number }> = ({ entry, position }) => {
  const settings = keyLines(entry);

  return (
    <article className="mt-10 first:mt-0 break-before-page first:break-before-auto">
      {/* La cabecera nunca se queda sola al pie de una página. */}
      <header className="[break-after:avoid] border-b border-slate-200 pb-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {entry.moment ? `${position}. ${entry.moment}` : `${position}.`}
        </p>
        <h2 className="mt-1 text-xl font-bold text-slate-900">{entry.title}</h2>
        {entry.artist && <p className="text-sm text-slate-500">{entry.artist}</p>}

        {settings.length > 0 && (
          <p className="mt-2 text-sm font-semibold text-slate-700">{settings.join(' · ')}</p>
        )}
        {entry.notes && <p className="mt-1.5 text-sm italic text-slate-600">{entry.notes}</p>}
      </header>

      {!entry.missing && !entry.hasChords && (
        <p className="mt-3 text-sm italic text-slate-500">
          Esta canción todavía no tiene acordes en el cancionero: aquí va sólo la letra.
        </p>
      )}

      {entry.missing ? (
        <p className="mt-4 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500">
          Esta canción no está en el cancionero de este dispositivo, así que no se pudo imprimir su letra.
        </p>
      ) : (
        <div className="mt-4">
          <ChordSheet
            content={entry.content}
            fontSize="sm"
            twoColumns={false}
            showChords
            arrangement={entry.arrangement}
          />
        </div>
      )}

      {entry.transitionToNext && (
        <p className="mt-4 border-t border-slate-200 pt-2 text-sm text-slate-600 [break-before:avoid]">
          Al terminar: {entry.transitionToNext}
        </p>
      )}
    </article>
  );
};

export const SetlistPrintSheet: React.FC<SetlistPrintSheetProps> = ({ sheet }) => (
  <div className="mx-auto max-w-[190mm] bg-white text-slate-900 print:max-w-none">
    <header className="[break-after:avoid] border-b-2 border-slate-900 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{sheet.ministry}</p>
      <h1 className="mt-1 text-2xl font-bold text-slate-900">{sheet.title}</h1>
      <p className="mt-1 text-sm text-slate-600">
        {[sheet.date, formatSongCount(sheet.entries.length)].filter(Boolean).join(' · ')}
      </p>
      {sheet.description && (
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{sheet.description}</p>
      )}
    </header>

    {sheet.entries.length === 0 ? (
      <p className="mt-10 text-sm text-slate-500">Este Setlist todavía no tiene canciones.</p>
    ) : (
      sheet.entries.map((entry, at) => <SongEntry key={entry.itemId} entry={entry} position={at + 1} />)
    )}
  </div>
);

/** El mismo papel, armado directamente desde un Setlist. */
export const SetlistPrintSheetFor: React.FC<{ setlist: Setlist; songsById: Map<string, Song> }> = ({
  setlist,
  songsById,
}) => <SetlistPrintSheet sheet={buildSetlistDocument(setlist, songsById)} />;
