import React, { useId, useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { LITURGICAL_SEASONS, type LiturgicalSeasonId } from '../../data/liturgicalSeasons';
import { MAX_SONG_ARTIST_LENGTH, MAX_SONG_TITLE_LENGTH, MAX_TEMPO, MIN_TEMPO } from '../../catalog/validateSongDraft';
import type { SongMeta } from '../../editor/songEditorModel';
import { parseYouTubeId } from '../../editor/youtube';
import { PRACTICAL_MAJOR_KEYS, PRACTICAL_MINOR_KEYS } from '../../utils/keyPreferences';
import { chipButton, chipOff, chipOn, fieldLabel, textField } from '../Setlists/ui';

interface SongMetaFormProps {
  meta: SongMeta;
  /** The categories the catalog already uses; a new one is allowed and reviewed */
  categories: string[];
  onChange: (meta: SongMeta) => void;
}

const TIME_SIGNATURES = ['2/4', '3/4', '4/4', '6/8', '9/8', '12/8'];

/**
 * What the song is, with the catalog's own fields. Nothing is filled in on
 * the author's behalf: an empty field stays empty ("sin indicar").
 */
export const SongMetaForm: React.FC<SongMetaFormProps> = ({ meta, categories, onChange }) => {
  const ids = { title: useId(), artist: useId(), key: useId(), tempo: useId(), meter: useId(), rhythm: useId(), youtube: useId(), youtubeHint: useId(), newCategory: useId() };
  const [youtubeInput, setYoutubeInput] = useState(meta.youtubeId ?? '');
  const [newCategory, setNewCategory] = useState('');
  const set = <K extends keyof SongMeta>(key: K, value: SongMeta[K]) => onChange({ ...meta, [key]: value });
  const text = (value: string) => (value.trim() ? value : null);

  const youtubeId = youtubeInput.trim() ? parseYouTubeId(youtubeInput) : null;
  const allCategories = [...categories, ...meta.categories.filter((category) => !categories.includes(category))];
  const toggleCategory = (category: string) =>
    set('categories', meta.categories.includes(category) ? meta.categories.filter((entry) => entry !== category) : [...meta.categories, category]);
  const seasons = meta.liturgicalSeasons ?? [];
  const toggleSeason = (id: LiturgicalSeasonId) => {
    const next = seasons.includes(id) ? seasons.filter((entry) => entry !== id) : [...seasons, id];
    set('liturgicalSeasons', next.length > 0 ? next : null);
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <label htmlFor={ids.title} className={fieldLabel}>
          Título <span className="text-red-500">*</span>
        </label>
        <input
          id={ids.title}
          value={meta.title}
          maxLength={MAX_SONG_TITLE_LENGTH}
          onChange={(event) => set('title', event.target.value)}
          className={textField}
        />
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={ids.artist} className={fieldLabel}>
          Artista <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id={ids.artist}
          value={meta.artist ?? ''}
          maxLength={MAX_SONG_ARTIST_LENGTH}
          onChange={(event) => set('artist', text(event.target.value))}
          className={textField}
        />
      </div>

      <div>
        <label htmlFor={ids.key} className={fieldLabel}>
          Tonalidad original
        </label>
        <select
          id={ids.key}
          value={meta.originalKey ?? ''}
          onChange={(event) => set('originalKey', event.target.value || null)}
          className={textField}
        >
          <option value="">Sin indicar</option>
          {/* A key kept from a draft with another spelling stays selectable, never rewritten. */}
          {meta.originalKey && ![...PRACTICAL_MAJOR_KEYS, ...PRACTICAL_MINOR_KEYS].includes(meta.originalKey) && (
            <option value={meta.originalKey}>{meta.originalKey}</option>
          )}
          <optgroup label="Mayores">
            {PRACTICAL_MAJOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </optgroup>
          <optgroup label="Menores">
            {PRACTICAL_MINOR_KEYS.map((key) => (
              <option key={key} value={key}>
                {key}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={ids.tempo} className={fieldLabel}>
            BPM
          </label>
          <input
            id={ids.tempo}
            type="number"
            inputMode="numeric"
            min={MIN_TEMPO}
            max={MAX_TEMPO}
            value={meta.tempo ?? ''}
            onChange={(event) => set('tempo', event.target.value === '' ? null : Math.round(Number(event.target.value)))}
            placeholder="Sin indicar"
            className={textField}
          />
        </div>
        <div>
          <label htmlFor={ids.meter} className={fieldLabel}>
            Compás
          </label>
          <select id={ids.meter} value={meta.timeSignature ?? ''} onChange={(event) => set('timeSignature', event.target.value || null)} className={textField}>
            <option value="">Sin indicar</option>
            {meta.timeSignature && !TIME_SIGNATURES.includes(meta.timeSignature) && <option value={meta.timeSignature}>{meta.timeSignature}</option>}
            {TIME_SIGNATURES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="sm:col-span-2">
        <label htmlFor={ids.rhythm} className={fieldLabel}>
          Patrón rítmico <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id={ids.rhythm}
          value={meta.rhythmPattern ?? ''}
          maxLength={120}
          onChange={(event) => set('rhythmPattern', text(event.target.value))}
          placeholder="Por ejemplo: abajo, abajo-arriba, arriba-abajo-arriba"
          className={textField}
        />
      </div>

      <fieldset className="sm:col-span-2">
        <legend className={fieldLabel}>Categorías</legend>
        <div className="flex flex-wrap gap-1.5">
          {allCategories.map((category) => {
            const on = meta.categories.includes(category);
            return (
              <button key={category} type="button" aria-pressed={on} onClick={() => toggleCategory(category)} className={`${chipButton} normal-case tracking-normal ${on ? chipOn : chipOff}`}>
                {on && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
                {category}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex gap-2">
          <label htmlFor={ids.newCategory} className="sr-only">
            Otra categoría
          </label>
          <input
            id={ids.newCategory}
            value={newCategory}
            maxLength={40}
            onChange={(event) => setNewCategory(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                const name = newCategory.trim();
                if (name && !meta.categories.includes(name)) set('categories', [...meta.categories, name]);
                setNewCategory('');
              }
            }}
            placeholder="Otra categoría"
            className={`${textField} max-w-xs`}
          />
          <button
            type="button"
            disabled={!newCategory.trim()}
            onClick={() => {
              const name = newCategory.trim();
              if (name && !meta.categories.includes(name)) set('categories', [...meta.categories, name]);
              setNewCategory('');
            }}
            aria-label="Añadir categoría"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-slate-200 dark:border-dark-700 text-slate-600 dark:text-slate-300 hover:border-[#2464ED] disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
      </fieldset>

      <fieldset className="sm:col-span-2">
        <legend className={fieldLabel}>Tiempos litúrgicos</legend>
        <div className="flex flex-wrap gap-1.5">
          {LITURGICAL_SEASONS.map((season) => {
            const on = seasons.includes(season.id);
            return (
              <button key={season.id} type="button" aria-pressed={on} onClick={() => toggleSeason(season.id)} className={`${chipButton} normal-case tracking-normal ${on ? chipOn : chipOff}`}>
                {on && <Check aria-hidden="true" className="w-3.5 h-3.5" />}
                {season.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">Sin marcar, la canción queda sin clasificar.</p>
      </fieldset>

      <div className="sm:col-span-2">
        <label htmlFor={ids.youtube} className={fieldLabel}>
          YouTube <span className="font-normal text-slate-400">(opcional)</span>
        </label>
        <input
          id={ids.youtube}
          value={youtubeInput}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setYoutubeInput(event.target.value);
            const id = event.target.value.trim() ? parseYouTubeId(event.target.value) : null;
            // Only a recognised id is stored; anything else stays in the field to be corrected.
            set('youtubeId', id);
          }}
          aria-describedby={ids.youtubeHint}
          aria-invalid={Boolean(youtubeInput.trim()) && !youtubeId}
          placeholder="Enlace de YouTube o identificador del vídeo"
          className={textField}
        />
        <p id={ids.youtubeHint} role="status" aria-live="polite" className={`mt-1.5 text-xs ${youtubeInput.trim() && !youtubeId ? 'font-semibold text-amber-700 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>
          {!youtubeInput.trim()
            ? 'Pega el enlace del vídeo. No se busca ni se reproduce nada automáticamente.'
            : youtubeId
              ? `Vídeo reconocido: ${youtubeId}`
              : 'No se reconoce como enlace de YouTube. Revisa que sea de youtube.com o youtu.be.'}
        </p>
      </div>
    </div>
  );
};
