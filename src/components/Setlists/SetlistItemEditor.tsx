import React, { useId, useMemo, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import type {
  SetlistArrangement,
  SetlistItem,
  SetlistSongTransition,
  SongTransitionType,
} from '../../types/setlist';
import type { Song } from '../../types/song';
import { songVersionOf } from '../../catalog/songRepository';
import {
  bindArrangement,
  matchesSongStructure,
  rebindArrangementSection,
  removeArrangementSection,
  stampArrangement,
} from '../../utils/arrangement';
import { keySettingsForKey, keySuggestionsFor } from '../../utils/keyPreferences';
import { useMinistryData } from '../../hooks/ministryContext';
import {
  MAX_TRANSITION_INSTRUCTION_LENGTH,
  SONG_TRANSITION_HINTS,
  SONG_TRANSITION_LABELS,
  SONG_TRANSITION_TYPES,
  cleanTransitionInstruction,
} from '../../utils/songTransition';
import { parseSongSections } from '../../utils/chordParser';
import { normalizeText } from '../../utils/normalizeText';
import { MAX_CAPO, MAX_MOMENT_LENGTH, MAX_NOTES_LENGTH, SUGGESTED_MOMENTS } from '../../utils/setlists';
import { describeKey, moveCapoBy, transposeBy, type KeySettings } from '../../utils/keySettings';
import { Stepper } from '../Rehearsal/RehearsalControls';
import { ArrangementEditor } from './ArrangementEditor';
import { Dialog } from './Dialog';
import {
  chipButton,
  chipOff,
  chipOn,
  fieldLabel,
  primaryButton,
  secondaryButton,
  sectionHeading,
  textField,
} from './ui';

export interface SetlistItemDraft {
  moment: string;
  notes: string;
  transposeSteps: number;
  capoFret: number;
  /** Null when the song is played exactly as it is written. */
  arrangement: SetlistArrangement | null;
  /**
   * How this song goes into the next one: null clears it, and undefined leaves
   * what was stored untouched (this entry is the last one right now).
   */
  transitionToNext: SetlistSongTransition | null | undefined;
  /** People assigned from outside the team, who join it when this is saved */
  newParticipantIds: string[];
}

interface SetlistItemEditorProps {
  song: Song;
  item: SetlistItem;
  /**
   * Title of the song that comes after this one right now, or null when this
   * is the last one. It is derived from the order, never stored, so moving
   * songs around keeps the transition meaningful.
   */
  nextSongTitle: string | null;
  /** The team of the setlist, offered first when assigning people to sections */
  participantIds?: string[];
  onSave: (changes: SetlistItemDraft) => void;
  onClose: () => void;
}

const MAX_SUGGESTIONS = 8;

/**
 * Everything that belongs to one song *in this setlist*: when it is sung, in
 * what key, with what capo, and what the choir should remember. None of it
 * touches the song in the songbook.
 */
export const SetlistItemEditor: React.FC<SetlistItemEditorProps> = ({
  song,
  item,
  nextSongTitle,
  participantIds = [],
  onSave,
  onClose,
}) => {
  const [newParticipantIds, setNewParticipantIds] = useState<string[]>([]);
  const [moment, setMoment] = useState(item.moment);
  const [notes, setNotes] = useState(item.notes);
  const [key, setKey] = useState<KeySettings>({ transposeSteps: item.transposeSteps, capoFret: item.capoFret });
  // The song as it is written: the arrangement points at these sections and
  // never copies them. Transposing changes the chords, not the structure.
  const songSections = useMemo(() => parseSongSections(song.content), [song.content]);
  const songVersion = songVersionOf(song);
  // An arrangement made on another version of the song opens re-pointed where
  // there is no doubt, with the doubtful blocks marked for someone to choose.
  const [binding] = useState(() => bindArrangement(songSections, item.arrangement, songVersion));
  const [arrangement, setArrangement] = useState(binding.state === 'none' ? undefined : binding.arrangement);
  const [pendingIds, setPendingIds] = useState(binding.state === 'pending' ? binding.pendingIds : []);
  const [transition, setTransition] = useState<SetlistSongTransition | null>(
    item.transitionToNext ?? null
  );
  const momentId = useId();
  const notesId = useId();
  const transitionId = useId();
  const transitionInstructionId = useId();

  const recommendedCapo = song.recommendedCapo ?? 0;
  const keyDescription = describeKey(song.originalKey, key, recommendedCapo);

  // The keys the people singing this song usually take it in, when they differ
  // from how it sounds now. Shown, never applied on their own.
  const { membersById, keyPreferences } = useMinistryData();
  const keySuggestions = keySuggestionsFor(
    song,
    { arrangement },
    key,
    keyPreferences,
    new Set(membersById.keys())
  );

  const suggestions = SUGGESTED_MOMENTS.filter((suggestion) => {
    const typed = normalizeText(moment.trim());
    return !typed || (normalizeText(suggestion).includes(typed) && normalizeText(suggestion) !== typed);
  }).slice(0, MAX_SUGGESTIONS);

  return (
    <Dialog
      title={song.title}
      description={song.artist}
      size="lg"
      onClose={onClose}
      onSubmit={() =>
        onSave({
          moment,
          notes,
          ...key,
          // An arrangement that is still the song's own structure is not stored:
          // nothing was actually decided for this occasion. One with every block
          // checked against this version of the song is stamped with it; while
          // a block is still pending it keeps its old version, so it stays on
          // hold (and is not played) until someone chooses.
          arrangement:
            arrangement && !matchesSongStructure(songSections, arrangement)
              ? pendingIds.length === 0
                ? stampArrangement(arrangement, songVersion, songSections)
                : arrangement
              : null,
          // While this entry is the last one there is nothing to go into, so
          // whatever it had stays stored, untouched, for when it isn't.
          transitionToNext: nextSongTitle ? transition : undefined,
          newParticipantIds,
        })
      }
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

              {keySuggestions.length > 0 && (
                <ul
                  aria-label="Tonalidades preferidas de quienes cantan"
                  className="space-y-1.5 border-t border-slate-200/80 dark:border-dark-700 pt-3"
                >
                  {keySuggestions.map((suggestion) => {
                    const member = membersById.get(suggestion.memberId);
                    if (!member) return null;
                    const target = keySettingsForKey(song, key, suggestion.key);
                    return (
                      <li key={suggestion.memberId} className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-slate-600 dark:text-slate-300">
                          Preferencia de <span className="font-semibold">{member.name}</span>:{' '}
                          <span className="font-mono font-bold text-blue-600 dark:text-sky-400">{suggestion.key}</span>
                        </p>
                        {target && (
                          <button
                            type="button"
                            onClick={() => setKey(target)}
                            className="inline-flex items-center h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-xs font-semibold text-[#2464ED] dark:text-sky-400 hover:border-[#2464ED] transition-colors"
                          >
                            Usar {suggestion.key}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Esta canción todavía no tiene una tonalidad registrada, así que se canta tal como está escrita.
            </p>
          )}
        </div>

        <ArrangementEditor
          songSections={songSections}
          arrangement={arrangement}
          onChange={(next) => {
            setArrangement(next);
            // Reset to the song's structure, or a pending block taken out from its menu.
            setPendingIds((ids) => (next ? ids.filter((id) => next.sections.some((entry) => entry.id === id)) : []));
          }}
          pendingIds={pendingIds}
          onResolvePending={(id, source) => {
            setArrangement((current) =>
              current && (source ? rebindArrangementSection(current, id, source) : removeArrangementSection(current, id))
            );
            setPendingIds((ids) => ids.filter((pendingId) => pendingId !== id));
          }}
          participantIds={[...participantIds, ...newParticipantIds]}
          onAddParticipants={(ids) =>
            setNewParticipantIds((current) => [...current, ...ids.filter((id) => !current.includes(id))])
          }
        />

        <div>
          <p className={`${sectionHeading} mb-2.5`} id={transitionId}>
            Transición a la siguiente canción
          </p>
          {nextSongTitle ? (
            <>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Después de esta viene <span className="font-semibold">{nextSongTitle}</span>. Lo que
                escribas aquí es una indicación para los músicos.
              </p>
              <div role="group" aria-labelledby={transitionId} className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setTransition(null)}
                  aria-pressed={transition === null}
                  className={`${chipButton} normal-case tracking-normal ${
                    transition === null ? chipOn : chipOff
                  }`}
                >
                  Sin indicar
                </button>
                {SONG_TRANSITION_TYPES.map((type: SongTransitionType) => {
                  const selected = transition?.type === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() =>
                        setTransition((current) => ({ type, instruction: current?.instruction ?? '' }))
                      }
                      aria-pressed={selected}
                      className={`${chipButton} normal-case tracking-normal ${selected ? chipOn : chipOff}`}
                    >
                      {selected && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />}
                      {SONG_TRANSITION_LABELS[type]}
                    </button>
                  );
                })}
              </div>

              {transition ? (
                <>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {SONG_TRANSITION_HINTS[transition.type]}
                  </p>
                  <label htmlFor={transitionInstructionId} className={`${fieldLabel} mt-3`}>
                    Indicación (opcional)
                  </label>
                  <input
                    id={transitionInstructionId}
                    type="text"
                    value={transition.instruction}
                    maxLength={MAX_TRANSITION_INSTRUCTION_LENGTH}
                    onChange={(event) =>
                      setTransition((current) =>
                        current
                          ? { ...current, instruction: cleanTransitionInstruction(event.target.value) }
                          : current
                      )
                    }
                    placeholder="Terminar en G y mantener 2 compases"
                    className={textField}
                  />
                </>
              ) : (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Sin indicar: no se muestra nada entre las dos canciones.
                </p>
              )}
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-slate-200 dark:border-dark-700 px-3.5 py-3 text-sm text-slate-500 dark:text-slate-400">
              Es la última canción del Setlist, así que no hay ninguna transición que preparar.
              {item.transitionToNext &&
                ' La que guardaste se conserva por si vuelve a tener una canción detrás.'}
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
