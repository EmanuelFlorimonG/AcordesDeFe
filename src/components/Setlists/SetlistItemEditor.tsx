import React, { useId, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import type { SetlistItem } from '../../types/setlist';
import type { Song } from '../../types/song';
import { normalizeText } from '../../utils/normalizeText';
import { MAX_CAPO, MAX_MOMENT_LENGTH, MAX_NOTES_LENGTH, SUGGESTED_MOMENTS } from '../../utils/setlists';
import { describeKey, moveCapoBy, transposeBy, type KeySettings } from '../../utils/keySettings';
import { Stepper } from '../Rehearsal/RehearsalControls';
import { Dialog } from './Dialog';
import { fieldLabel, primaryButton, secondaryButton, sectionHeading, textField } from './ui';

export interface SetlistItemDraft {
  moment: string;
  notes: string;
  transposeSteps: number;
  capoFret: number;
}

interface SetlistItemEditorProps {
  song: Song;
  item: SetlistItem;
  onSave: (changes: SetlistItemDraft) => void;
  onClose: () => void;
}

const MAX_SUGGESTIONS = 8;

/**
 * Everything that belongs to one song *in this setlist*: when it is sung, in
 * what key, with what capo, and what the choir should remember. None of it
 * touches the song in the songbook.
 */
export const SetlistItemEditor: React.FC<SetlistItemEditorProps> = ({ song, item, onSave, onClose }) => {
  const [moment, setMoment] = useState(item.moment);
  const [notes, setNotes] = useState(item.notes);
  const [key, setKey] = useState<KeySettings>({ transposeSteps: item.transposeSteps, capoFret: item.capoFret });
  const momentId = useId();
  const notesId = useId();

  const recommendedCapo = song.recommendedCapo ?? 0;
  const keyDescription = describeKey(song.originalKey, key, recommendedCapo);

  const suggestions = SUGGESTED_MOMENTS.filter((suggestion) => {
    const typed = normalizeText(moment.trim());
    return !typed || (normalizeText(suggestion).includes(typed) && normalizeText(suggestion) !== typed);
  }).slice(0, MAX_SUGGESTIONS);

  return (
    <Dialog
      title={song.title}
      description={song.artist}
      onClose={onClose}
      onSubmit={() => onSave({ moment, notes, ...key })}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" className={primaryButton}>
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-6">
        <div>
          <label htmlFor={momentId} className={fieldLabel}>
            Momento
          </label>
          <input
            id={momentId}
            data-autofocus=""
            type="text"
            value={moment}
            maxLength={MAX_MOMENT_LENGTH}
            onChange={(event) => setMoment(event.target.value)}
            placeholder="Entrada, Comunión, Adoración"
            className={`${textField} sm:max-w-[18rem]`}
          />
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setMoment(suggestion)}
                  className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors touch-manipulation"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          <p className={`${sectionHeading} mb-2.5`}>Tonalidad para este Setlist</p>
          {keyDescription ? (
            <div className="rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-50/70 dark:bg-dark-800/40 p-3.5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tono</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Original: <span className="font-mono font-semibold">{song.originalKey}</span>
                    {recommendedCapo > 0 && ` · cejilla ${recommendedCapo}`}
                  </p>
                </div>
                <Stepper
                  size="lg"
                  label="Tono para este Setlist"
                  value={<span className="font-mono">{keyDescription.shape ?? keyDescription.sounding}</span>}
                  onDecrease={() => setKey((current) => transposeBy(current, -1))}
                  onIncrease={() => setKey((current) => transposeBy(current, 1))}
                  decreaseTitle="Bajar medio tono"
                  increaseTitle="Subir medio tono"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200/80 dark:border-dark-700 pt-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Cejilla</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {key.capoFret === 0 ? 'Sin cejilla' : `Traste ${key.capoFret}`}
                    {recommendedCapo > 0 && key.capoFret !== recommendedCapo && ` · recomendada: ${recommendedCapo}`}
                  </p>
                </div>
                <Stepper
                  size="lg"
                  label="Cejilla para este Setlist"
                  value={<span className="font-mono">{key.capoFret}</span>}
                  onDecrease={() => setKey((current) => moveCapoBy(current, -1))}
                  onIncrease={() => setKey((current) => moveCapoBy(current, 1))}
                  canDecrease={key.capoFret > 0}
                  canIncrease={key.capoFret < MAX_CAPO}
                  decreaseTitle="Bajar la cejilla un traste"
                  increaseTitle="Subir la cejilla un traste"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 dark:border-dark-700 pt-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Suena en{' '}
                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                    {keyDescription.sounding}
                  </span>
                  {keyDescription.original && ` · el original suena en ${keyDescription.original}`}
                </p>
                {keyDescription.isModified && (
                  <button
                    type="button"
                    onClick={() => setKey({ transposeSteps: 0, capoFret: recommendedCapo })}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Volver al tono original
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Esta canción todavía no tiene una tonalidad registrada, así que se canta tal como está escrita.
            </p>
          )}
        </div>

        <div>
          <label htmlFor={notesId} className={fieldLabel}>
            Nota del coro
          </label>
          <textarea
            id={notesId}
            value={notes}
            rows={3}
            maxLength={MAX_NOTES_LENGTH}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Intro solo piano. El último coro, dos veces."
            className={`${textField} resize-y min-h-[4.5rem]`}
          />
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            Se ve al abrir la canción y durante el ensayo, solo en este Setlist.
          </p>
        </div>
      </div>
    </Dialog>
  );
};
