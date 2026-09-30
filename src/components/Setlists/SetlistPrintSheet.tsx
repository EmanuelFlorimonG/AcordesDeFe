import React from 'react';
import type { Song } from '../../types/song';
import type { Setlist } from '../../types/setlist';
import { buildSetlistDocument, type SetlistDocument, type SetlistDocumentEntry } from '../../utils/setlistExport';
import { ChordSheet } from '../SongViewer/ChordSheet';

/**
 * La hoja del músico: el cancionero de la misa, con acordes.
 *
 * Es el documento que el ministerio reparte desde siempre. Esa hoja está
 * maquetada como un cancionero: dos columnas por página, el momento en
 * mayúsculas, la canción con su tono entre paréntesis, la letra debajo, y
 * todo seguido — cuando una canción termina, la siguiente empieza ahí mismo.
 * Si no cabe, continúa en la columna de al lado, y después en la página
 * siguiente. Nada empieza arriba porque sí, y no se deja media hoja en
 * blanco porque cambie el momento.
 *
 * Eso es exactamente lo que hace `columns-2`: el navegador reparte el flujo
 * entre las dos columnas y, al imprimir, sigue en la página siguiente. No hay
 * nada que calcular aquí.
 *
 * Lo único que se añade a la hoja de siempre son los acordes sobre la letra y
 * cuatro indicaciones para quien toca. Van en pequeño y en su sitio: si se
 * les quitaran, debería quedar el mismo documento de antes.
 *
 * Por eso aquí no hay ni un componente de la aplicación: ni chips, ni cajas,
 * ni barras de color, ni iconos. Un cancionero es tinta negra sobre papel
 * blanco, y tiene que leerse igual de bien fotocopiado.
 */

interface SetlistPrintSheetProps {
  sheet: SetlistDocument;
}

/**
 * Lo que hace falta para tocarla, en una línea pequeña bajo el título: la
 * cejilla, con qué formas, el compás, el tempo, y de dónde salió si alguien
 * la movió. Sin etiquetas: quien lo lee sabe leerlo.
 */
function playingLine(entry: SetlistDocumentEntry): string {
  const parts: string[] = [];
  if (entry.capoFret > 0) parts.push(`Capo ${entry.capoFret}`);
  if (entry.key?.shape) parts.push(`formas de ${entry.key.shape}`);
  if (entry.timeSignature) parts.push(entry.timeSignature);
  if (entry.tempo) parts.push(`${entry.tempo} BPM`);
  if (entry.key?.original) parts.push(`escrita en ${entry.key.original}`);
  return parts.join(' · ');
}

const SongEntry: React.FC<{ entry: SetlistDocumentEntry }> = ({ entry }) => {
  const playing = playingLine(entry);
  // El tono va pegado al título, como en la hoja de siempre.
  const key = entry.latinKey ? ` (${entry.latinKey})` : '';

  return (
    <div className="mt-3 first:mt-1.5">
      {/* El título no se queda nunca solo al final de una columna. */}
      <div className="[break-after:avoid] break-inside-avoid">
        <p className="text-[11.5pt] font-bold leading-tight text-slate-900">
          {entry.title}
          {key}
        </p>
        {playing && <p className="text-[9pt] leading-tight text-slate-700">{playing}</p>}
        {entry.notes && <p className="text-[9pt] italic leading-tight text-slate-700">{entry.notes}</p>}
      </div>

      {entry.missing ? (
        <p className="mt-1 text-[10pt] italic text-slate-700">No está en el cancionero de este dispositivo.</p>
      ) : (
        <>
          {!entry.hasChords && <p className="text-[9pt] italic text-slate-700">Todavía sin acordes.</p>}
          <div className="mt-1">
            <ChordSheet
              content={entry.content}
              fontSize="sm"
              twoColumns={false}
              showChords
              variant="print"
              arrangement={entry.arrangement}
            />
          </div>
        </>
      )}

      {entry.transitionToNext && (
        <p className="mt-1 text-[9pt] italic text-slate-700">Al terminar: {entry.transitionToNext}</p>
      )}
    </div>
  );
};

export const SetlistPrintSheet: React.FC<SetlistPrintSheetProps> = ({ sheet }) => (
  <div className="bg-white text-slate-900">
    {/* El encabezado cruza las dos columnas y sale una sola vez, arriba. */}
    <header className="[column-span:all] [break-after:avoid] mb-3 text-center">
      <h1 className="text-[18pt] font-bold leading-tight tracking-[0.04em] text-slate-900">
        {sheet.ministry.toLocaleUpperCase('es')}
      </h1>
      {(sheet.title || sheet.date) && (
        <p className="text-[9.5pt] leading-tight text-slate-700">
          {[sheet.title, sheet.date].filter(Boolean).join(' · ')}
        </p>
      )}
    </header>

    {sheet.moments.length === 0 ? (
      <p className="text-[11pt] text-slate-700">Este Setlist todavía no tiene canciones.</p>
    ) : (
      // Dos columnas, y el reparto lo hace el navegador. En papel cada página
      // es un trozo de este bloque: llena las dos columnas, pasa a la hoja
      // siguiente, y equilibra la última. `column-fill: auto` parecía lo
      // suyo —llenar de arriba abajo— pero fuera de una altura acotada hace
      // que el bloque mida lo que todo el contenido en una sola columna, y
      // entonces se reservan páginas que salen en blanco.
      <div className="columns-2 gap-[10mm]">
        {sheet.moments.map((moment, at) => (
          <section key={`${moment.moment}-${at}`} className="mt-4 first:mt-0">
            {moment.moment && (
              <h2 className="[break-after:avoid] text-[11.5pt] font-bold uppercase tracking-[0.06em] text-slate-900">
                {moment.moment}:
              </h2>
            )}
            {moment.entries.map((entry) => (
              <SongEntry key={entry.itemId} entry={entry} />
            ))}
          </section>
        ))}
      </div>
    )}
  </div>
);

/** El mismo papel, armado directamente desde un Setlist. */
export const SetlistPrintSheetFor: React.FC<{ setlist: Setlist; songsById: Map<string, Song> }> = ({
  setlist,
  songsById,
}) => <SetlistPrintSheet sheet={buildSetlistDocument(setlist, songsById)} />;
