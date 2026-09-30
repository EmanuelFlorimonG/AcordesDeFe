import React from 'react';
import type { Song, SongSection } from '../../types/song';
import type { Setlist } from '../../types/setlist';
import { formatVoices, resolvedSectionName, type ResolvedArrangementSection } from '../../utils/arrangement';
import { sectionHasWords } from '../../utils/songSections';
import { buildSetlistDocument, type SetlistDocument, type SetlistDocumentEntry } from '../../utils/setlistExport';

/**
 * La hoja de quien canta: el cancionero de la misa, sin una sola cifra.
 *
 * Es el documento que el ministerio reparte al coro desde siempre, y ahora
 * sale del Setlist en vez de escribirse a mano. La misma maqueta que la hoja
 * del músico —Letter, dos columnas que fluyen, el momento en mayúsculas, la
 * canción con su tono entre paréntesis, la letra debajo— porque es el mismo
 * documento; lo que cambia es lo que lleva dentro.
 *
 * Y lo que lleva dentro es sólo lo que hace falta para cantar. Nada de
 * acordes, ni cejilla, ni compás, ni tempo, ni «formas de Re», ni la
 * indicación de dejar sonar la guitarra mientras se acerca la ofrenda: eso es
 * del que toca. De un arreglo se conserva lo que se canta —el orden de las
 * partes, cuántas veces, y quién canta cada una— y se deja fuera lo demás.
 *
 * El tono sí se queda, aunque nadie vaya a pulsarlo: está en las hojas de
 * siempre, y quien canta lo usa para saber por dónde entra.
 *
 * Es un renderizador aparte del de los músicos a propósito. Los dos leen el
 * mismo documento (buildSetlistDocument), así que las canciones, el orden,
 * los momentos y los tonos se resuelven una sola vez; pero tocar esta hoja no
 * puede cambiar aquélla, que ya está aprobada y repartiéndose.
 */

interface SetlistSingersSheetProps {
  sheet: SetlistDocument;
}

/** Las partes de una canción, en el orden en que se cantan. */
interface SungPart {
  key: string;
  /** "CORO", "VERSO 1"… Vacío para lo que va sin nombre. */
  name: string;
  /** Cuántas veces seguidas se canta, cuando es más de una. */
  repeat: number;
  /** Quién la canta: "Mujeres", "Todos", "Solista"… Vacío si no se dijo. */
  voices: string;
  lines: string[];
}

/** Las líneas con palabras de una sección, sin los acordes. */
function wordsOf(section: SongSection): string[] {
  const lines: string[] = [];
  for (const line of section.lines) {
    if (line.type === 'empty') {
      // Una línea en blanco separa estrofas, pero nunca abre ni cierra.
      if (lines.length > 0 && lines[lines.length - 1] !== '') lines.push('');
      continue;
    }
    // Un comentario es una indicación para quien toca, no algo que se cante.
    if (line.type !== 'chords-lyrics') continue;
    const text = (line.segments ?? []).map((segment) => segment.lyric).join('').trim();
    if (text) lines.push(text);
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

const nameOf = (section: SongSection): string => section.header?.label ?? '';

/**
 * Lo que se canta de una canción, con arreglo o sin él.
 *
 * Con arreglo manda el arreglo: es el orden de ese día. Sin él, la canción
 * tal como está escrita. En los dos casos se salta lo que no tiene palabras
 * —una intro de guitarra, un interludio—, que en una hoja de cantar sólo
 * sería un título suelto sin nada debajo.
 */
function partsOf(entry: SetlistDocumentEntry): SungPart[] {
  const fromArrangement = (block: ResolvedArrangementSection, at: number): SungPart | null => {
    if (!block.section || !sectionHasWords(block.section)) return null;
    return {
      key: `${block.id}-${at}`,
      name: resolvedSectionName(block),
      repeat: block.repeatCount,
      // Quién canta sí es asunto de quien canta. La indicación del bloque
      // ("Entrar suave", "Sólo guitarra") no lo es.
      voices: block.voices.length > 0 ? formatVoices(block.voices) : '',
      lines: wordsOf(block.section),
    };
  };

  if (entry.arrangement) {
    return entry.arrangement.map(fromArrangement).filter((part): part is SungPart => part !== null);
  }

  return entry.sections
    .filter((section) => sectionHasWords(section))
    .map((section, at) => ({
      key: `${section.id}-${at}`,
      name: nameOf(section),
      repeat: section.header?.repeat ?? 1,
      voices: '',
      lines: wordsOf(section),
    }));
}

const SongEntry: React.FC<{ entry: SetlistDocumentEntry }> = ({ entry }) => {
  const parts = partsOf(entry);
  const key = entry.latinKey ? ` (${entry.latinKey})` : '';

  return (
    <div className="mt-3 first:mt-1.5">
      {/* El título no se queda nunca solo al final de una columna. */}
      <p className="[break-after:avoid] break-inside-avoid text-[11.5pt] font-bold leading-tight text-slate-900">
        {entry.title}
        {key}
      </p>

      {entry.missing ? (
        <p className="mt-1 text-[10pt] italic text-slate-700">No está en el cancionero de este dispositivo.</p>
      ) : parts.length === 0 ? (
        <p className="mt-1 text-[10pt] italic text-slate-700">Sin letra en el cancionero.</p>
      ) : (
        parts.map((part) => (
          <div key={part.key} className="mt-1.5 first:mt-1">
            {(part.name || part.voices || part.repeat > 1) && (
              <p className="[break-after:avoid] text-[9.5pt] font-semibold uppercase tracking-[0.08em] text-slate-900">
                {part.name}
                {part.repeat > 1 && ` x${part.repeat}`}
                {part.voices && <span className="font-normal normal-case"> - {part.voices}</span>}
              </p>
            )}
            {part.lines.map((line, at) =>
              line === '' ? (
                <div key={at} className="h-2" />
              ) : (
                <p key={at} className="text-[11pt] leading-[1.25] text-slate-900">
                  {line}
                </p>
              )
            )}
          </div>
        ))
      )}
    </div>
  );
};

export const SetlistSingersSheet: React.FC<SetlistSingersSheetProps> = ({ sheet }) => (
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
      // Dos columnas, y el reparto lo hace el navegador: cada página es un
      // trozo de este bloque. Fijar `column-fill` haría que el bloque midiera
      // lo que todo el contenido en una sola columna, y sobrarían páginas.
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
export const SetlistSingersSheetFor: React.FC<{ setlist: Setlist; songsById: Map<string, Song> }> = ({
  setlist,
  songsById,
}) => <SetlistSingersSheet sheet={buildSetlistDocument(setlist, songsById)} />;
