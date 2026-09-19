import React, { useId, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { Song } from '../../types/song';
import { isSameKey, keyOptionsFor } from '../../utils/keyPreferences';
import { normalizeText } from '../../utils/normalizeText';
import { Dialog } from '../Setlists/Dialog';
import { SearchField } from '../ui/SearchField';
import { chipButton, chipOff, chipOn, fieldLabel, primaryButton, secondaryButton } from '../Setlists/ui';

interface KeyPreferenceDialogProps {
  memberName: string;
  songs: Song[];
  /** Set when editing the key of a song already chosen */
  initialSongId?: string;
  initialKey?: string;
  onSave: (songId: string, key: string) => void;
  onClose: () => void;
}

const MAX_RESULTS = 30;

/**
 * "When she sings this song, we usually take it in…": one song, one key.
 * Keys are offered in the song's own mode and spelled by the music engine, so
 * a preference is always something the setlist can actually be moved to.
 */
export const KeyPreferenceDialog: React.FC<KeyPreferenceDialogProps> = ({
  memberName,
  songs,
  initialSongId,
  initialKey,
  onSave,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [songId, setSongId] = useState<string | null>(initialSongId ?? null);
  const [key, setKey] = useState<string | null>(initialKey ?? null);
  const keysId = useId();

  // Only songs with a key can have a preferred one: there is nothing to move from otherwise.
  const withKey = useMemo(() => songs.filter((song) => song.originalKey), [songs]);
  const song = withKey.find((candidate) => candidate.id === songId) ?? null;
  const results = useMemo(() => {
    const typed = normalizeText(query.trim());
    return withKey
      .filter((candidate) => !typed || normalizeText(`${candidate.title} ${candidate.artist ?? ''}`).includes(typed))
      .slice(0, MAX_RESULTS);
  }, [withKey, query]);

  return (
    <Dialog
      title={initialSongId ? 'Cambiar tonalidad' : 'Añadir tonalidad'}
      description={`La tonalidad en la que ${memberName} suele cantar una canción.`}
      onClose={onClose}
      onSubmit={() => {
        if (song && key) onSave(song.id, key);
      }}
      footer={
        <>
          <button type="button" onClick={onClose} className={secondaryButton}>
            Cancelar
          </button>
          <button type="submit" disabled={!song || !key} className={primaryButton}>
            Guardar
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {!initialSongId && (
          <div>
            <p className={fieldLabel}>Canción</p>
            <SearchField
              label="Buscar canción"
              value={query}
              onChange={setQuery}
              placeholder="Buscar canción…"
              autoFocusInDialog
            />
            <ul
              aria-label="Canciones"
              className="mt-2 max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-dark-700 divide-y divide-slate-100 dark:divide-dark-800"
            >
              {results.map((candidate) => {
                const isSelected = candidate.id === songId;
                return (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSongId(candidate.id);
                        setKey(null);
                      }}
                      aria-pressed={isSelected}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors ${
                        isSelected
                          ? 'bg-[#EAF1FF] dark:bg-blue-500/10 font-semibold text-[#10203A] dark:text-white'
                          : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800'
                      }`}
                    >
                      <span className="min-w-0 flex-1 truncate">{candidate.title}</span>
                      <span className="shrink-0 font-mono text-xs font-bold text-slate-400">{candidate.originalKey}</span>
                      {isSelected && <Check aria-hidden="true" className="w-4 h-4 shrink-0 text-[#2464ED]" />}
                    </button>
                  </li>
                );
              })}
              {results.length === 0 && (
                <li className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">Ninguna canción coincide.</li>
              )}
            </ul>
          </div>
        )}

        {song && (
          <div>
            <p id={keysId} className={fieldLabel}>
              Tonalidad para «{song.title}»
            </p>
            <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
              Original: <span className="font-mono font-semibold">{song.originalKey}</span>
            </p>
            <div role="group" aria-labelledby={keysId} className="flex flex-wrap gap-1.5">
              {keyOptionsFor(song.originalKey).map((option) => {
                // A key saved in another spelling (C# instead of Db) still shows as chosen.
                const isSelected = key !== null && isSameKey(option, key);
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setKey(option)}
                    aria-pressed={isSelected}
                    className={`${chipButton} min-w-[3rem] justify-center font-mono normal-case tracking-normal ${
                      isSelected ? chipOn : chipOff
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
};
