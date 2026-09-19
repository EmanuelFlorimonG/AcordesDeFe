import React, { useId, useMemo, useState } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import type { Instrument } from '../../types/song';
import { draftToSong } from '../../catalog/songDraft';
import { PREVIEW_SONG_ID, buildSongPreview } from '../../editor/preview';
import { editorToSongDraft, type EditorDocument } from '../../editor/songEditorModel';
import type { Song } from '../../types/song';
import { MAX_TRANSPOSE, MIN_TRANSPOSE } from '../../utils/keySettings';
import { formatTransposeDisplay } from '../../utils/chordTransposer';
import { ChordDetailModal } from '../SongViewer/ChordDetailModal';
import { ChordSheet } from '../SongViewer/ChordSheet';
import { InstrumentToggle } from '../SongViewer/InstrumentToggle';
import { sectionHeading } from '../Setlists/ui';

/** The editor's preview: the document as the Song it would publish. */
export const SongPreviewPanel: React.FC<{ doc: EditorDocument }> = ({ doc }) => {
  const song = useMemo(() => draftToSong(editorToSongDraft(doc), PREVIEW_SONG_ID), [doc]);
  return <SongPreview song={song} />;
};

/**
 * A song as it looks once published: the same Song, the same transposition
 * and the same ChordSheet as the song viewer. Trying another key here never
 * changes the song. Used by the editor and by the review screens.
 */
export const SongPreview: React.FC<{ song: Song; heading?: string; subtitle?: string }> = ({
  song,
  heading = 'Vista previa',
  subtitle = 'Así se verá la canción publicada.',
}) => {
  const [steps, setSteps] = useState(0);
  const [instrument, setInstrument] = useState<Instrument>('guitarra');
  const [chord, setChord] = useState<string | null>(null);
  const headingId = useId();
  const preview = useMemo(() => buildSongPreview(song, steps), [song, steps]);
  const hasContent = preview.content.trim().length > 0;

  return (
    <section aria-labelledby={headingId} className="rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 dark:border-dark-800 px-4 py-3">
        <div>
          <h2 id={headingId} className={sectionHeading}>
            {heading}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <InstrumentToggle value={instrument} onChange={setInstrument} />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 dark:border-dark-800 px-4 py-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Probar tonalidad</span>
        <button
          type="button"
          onClick={() => setSteps((value) => Math.max(MIN_TRANSPOSE, value - 1))}
          aria-label="Bajar un semitono"
          className={stepButton}
        >
          <Minus className="w-4 h-4" />
        </button>
        <span role="status" aria-live="polite" className="min-w-[5.5rem] text-center font-mono text-sm font-semibold text-slate-800 dark:text-slate-100">
          {preview.key ?? 'Sin tonalidad'}
          {steps !== 0 && <span className="ml-1 text-xs font-normal text-slate-500 dark:text-slate-400">({formatTransposeDisplay(steps)})</span>}
        </span>
        <button
          type="button"
          onClick={() => setSteps((value) => Math.min(MAX_TRANSPOSE, value + 1))}
          aria-label="Subir un semitono"
          className={stepButton}
        >
          <Plus className="w-4 h-4" />
        </button>
        {steps !== 0 && (
          <button type="button" onClick={() => setSteps(0)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10">
            <RotateCcw className="w-3.5 h-3.5" />
            Original
          </button>
        )}
      </div>

      <div className="px-4 py-5 sm:px-6">
        {preview.song.title.trim() && (
          <div className="mb-4">
            <p className="text-xl font-extrabold tracking-tight text-[#10203A] dark:text-white break-words">{preview.song.title}</p>
            {preview.song.artist && <p className="text-sm text-slate-500 dark:text-slate-400">{preview.song.artist}</p>}
          </div>
        )}
        {hasContent ? (
          <ChordSheet content={preview.content} fontSize="base" twoColumns={false} showChords onChordClick={setChord} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">La vista previa aparece al escribir la letra.</p>
        )}
        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Toca un acorde para ver cómo se toca en {instrument === 'piano' ? 'piano' : 'guitarra'}.</p>
      </div>

      {chord && <ChordDetailModal key={`${chord}-${instrument}`} chord={chord} instrument={instrument} onClose={() => setChord(null)} />}
    </section>
  );
};

const stepButton =
  'w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex items-center justify-center rounded-lg border border-slate-200 dark:border-dark-700 text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';
