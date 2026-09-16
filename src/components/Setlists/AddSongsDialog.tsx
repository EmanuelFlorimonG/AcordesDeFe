import React, { useMemo, useRef, useState } from 'react';
import { Check, Plus, Search, X } from 'lucide-react';
import type { Setlist } from '../../types/setlist';
import type { Song } from '../../types/song';
import { normalizeText } from '../../utils/normalizeText';
import { formatSongCount, listSongCategories } from '../../utils/setlists';
import type { SpecificSeasonId } from '../../data/liturgicalSeasons';
import {
  SEASON_FILTER_OPTIONS,
  filterSongsBySeason,
  getLiturgicalSeason,
  songFitsSeason,
} from '../../utils/liturgicalSeasons';
import { LiturgicalSeasonSelect } from '../Liturgy/LiturgicalSeasonSelect';
import { CoverTile } from '../Dashboard/CoverTile';
import { LiturgicalSeasonChips } from '../Liturgy/LiturgicalSeasonChips';
import { Dialog } from './Dialog';
import { primaryButton, textField } from './ui';

interface AddSongsDialogProps {
  songs: Song[];
  setlist: Setlist;
  /** `moment` is the part of the Mass the song was chosen from, if any */
  onAdd: (song: Song, moment: string) => void;
  onClose: () => void;
}

/** How well a song answers the query; 0 means it doesn't. */
function matchScore(song: Song, query: string, rawQuery: string): number {
  const title = normalizeText(song.title);
  if (title.startsWith(query)) return 4;
  if (title.includes(query)) return 3;
  // A bare key ("G", "Em") looks for songs in that key, not for the letter.
  if (song.originalKey && song.originalKey.toLowerCase() === rawQuery) return 2;
  if (normalizeText(song.artist ?? '').includes(query)) return 2;
  if (song.categories.some((category) => normalizeText(category).includes(query))) return 1;
  return 0;
}

export const AddSongsDialog: React.FC<AddSongsDialogProps> = ({ songs, setlist, onAdd, onClose }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [season, setSeason] = useState<SpecificSeasonId | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  // Which row just flashed "Añadida".
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const flashTimer = useRef<number | null>(null);

  const categories = useMemo(() => listSongCategories(songs), [songs]);
  // How many songs each season would show, "Todo el año" included.
  const seasonCounts = useMemo(() => {
    const counts = { all: songs.length } as Record<SpecificSeasonId | 'all', number>;
    for (const option of SEASON_FILTER_OPTIONS) {
      const id = option.id as SpecificSeasonId;
      counts[id] = filterSongsBySeason(songs, id).length;
    }
    return counts;
  }, [songs]);
  const selectedCategory = categories.find((entry) => entry.name === category) ?? null;
  // Songs picked from a part of the Mass enter the setlist already marked with it.
  const presetMoment = selectedCategory?.isMassMoment ? selectedCategory.name : '';

  const countsBySongId = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of setlist.items) counts.set(item.songId, (counts.get(item.songId) ?? 0) + 1);
    return counts;
  }, [setlist.items]);

  const results = useMemo(() => {
    const inCategory = songs.filter(
      (song) => (!category || song.categories.includes(category)) && songFitsSeason(song, season)
    );
    const byTitle = [...inCategory].sort((a, b) => a.title.localeCompare(b.title, 'es'));
    const rawQuery = query.trim().toLowerCase();
    const normalized = normalizeText(query.trim());
    if (!normalized) return byTitle;
    return byTitle
      .map((song) => ({ song, score: matchScore(song, normalized, rawQuery) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.song.title.localeCompare(b.song.title, 'es'))
      .map((entry) => entry.song);
  }, [songs, query, category, season]);

  const handleAdd = (song: Song) => {
    onAdd(song, presetMoment);
    setAddedCount((count) => count + 1);
    setJustAdded(song.id);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setJustAdded(null), 1400);
  };

  const chipClass = (isSelected: boolean) =>
    `shrink-0 inline-flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-10 px-3 rounded-lg border text-[13px] font-semibold whitespace-nowrap transition-colors touch-manipulation ${
      isSelected
        ? 'border-[#2464ED] bg-[#2464ED] text-white'
        : 'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400'
    }`;

  const lastMassMomentIndex = categories.reduce(
    (last, entry, index) => (entry.isMassMoment ? index : last),
    -1
  );

  return (
    <Dialog
      size="lg"
      title="Añadir canciones"
      description="Se añaden al final del Setlist. Puedes añadir varias sin cerrar esta ventana."
      onClose={onClose}
      footer={
        <>
          <p className="mr-auto text-sm text-slate-500 dark:text-slate-400" role="status">
            {addedCount === 0
              ? 'Ninguna canción añadida todavía'
              : `${formatSongCount(addedCount)} ${addedCount === 1 ? 'añadida' : 'añadidas'}`}
          </p>
          <button type="button" onClick={onClose} className={primaryButton}>
            Listo
          </button>
        </>
      }
    >
      <div className="sticky top-0 z-10 -mx-5 sm:-mx-6 px-5 sm:px-6 pb-3 bg-white dark:bg-dark-900">
        <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 w-4 h-4 -translate-y-1/2 text-slate-400" />
          <input
            data-autofocus=""
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por título, autor, categoría o tono"
            aria-label="Buscar canciones"
            className={`${textField} pl-10 pr-10`}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Borrar la búsqueda"
              className="absolute right-2 top-1/2 w-8 h-8 -translate-y-1/2 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <LiturgicalSeasonSelect
          value={season}
          onChange={setSeason}
          counts={seasonCounts}
          className="w-full sm:w-52 shrink-0"
        />
        </div>

        {/* Parts of the Mass first, in the order they are sung; then themes. */}
        <div
          role="group"
          aria-label="Filtrar por momento de la misa o categoría"
          className="mt-2.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none sm:flex-wrap sm:overflow-visible"
        >
          <button
            type="button"
            onClick={() => setCategory(null)}
            aria-pressed={category === null}
            className={chipClass(category === null)}
          >
            Todas
          </button>
          {categories.map((entry, index) => (
            <React.Fragment key={entry.name}>
              <button
                type="button"
                onClick={() => setCategory(entry.name === category ? null : entry.name)}
                aria-pressed={entry.name === category}
                className={chipClass(entry.name === category)}
              >
                {entry.name}
                <span className={entry.name === category ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}>
                  {entry.count}
                </span>
              </button>
              {index === lastMassMomentIndex && (
                <>
                  {/* Phones: a divider in the sliding row. Wider screens: themes start a new line. */}
                  <span aria-hidden="true" className="sm:hidden shrink-0 w-px h-6 bg-slate-200 dark:bg-dark-700 mx-0.5" />
                  <span aria-hidden="true" className="hidden sm:block basis-full h-0" />
                </>
              )}
            </React.Fragment>
          ))}
        </div>

        {season && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Canciones para {getLiturgicalSeason(season).label} y las de Todo el año.
          </p>
        )}

        {presetMoment && (
          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Las canciones que añadas quedarán marcadas como{' '}
            <span className="font-semibold text-[#2464ED] dark:text-sky-400">{presetMoment}</span>. Puedes
            cambiarlo después en cada canción.
          </p>
        )}
      </div>

      {results.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
          {query.trim()
            ? `Ninguna canción${category ? ` de ${category}` : ''} coincide con «${query.trim()}».`
            : season
              ? `Ninguna canción${category ? ` de ${category}` : ''} está clasificada para ${getLiturgicalSeason(season).label}.`
              : 'Todavía no hay canciones en esta categoría.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-dark-800">
          {results.map((song) => {
            const count = countsBySongId.get(song.id) ?? 0;
            const isFlashing = justAdded === song.id;
            return (
              <li key={song.id} className="flex items-center gap-3 py-2.5">
                <CoverTile category={song.categories[0]} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#10203A] dark:text-white">{song.title}</p>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {[song.artist, ...song.categories].filter(Boolean).join(' · ')}
                  </p>
                  <LiturgicalSeasonChips song={song} size="xs" compact className="mt-1" />
                  {count > 0 && (
                    <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[#2464ED] dark:text-sky-400">
                      <Check className="w-3 h-3" />
                      En el Setlist{count > 1 ? ` (${count} veces)` : ''}
                    </p>
                  )}
                </div>
                {song.originalKey && (
                  <span className="hidden sm:block shrink-0 w-10 text-right font-mono text-sm font-semibold text-slate-400 dark:text-slate-500">
                    {song.originalKey}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleAdd(song)}
                  aria-label={
                    count > 0
                      ? `Añadir ${song.title} otra vez${presetMoment ? ` como ${presetMoment}` : ''}`
                      : `Añadir ${song.title}${presetMoment ? ` como ${presetMoment}` : ''}`
                  }
                  className={`shrink-0 inline-flex items-center justify-center gap-1.5 h-10 [@media(pointer:coarse)]:h-11 px-3 rounded-lg border text-sm font-semibold transition-colors touch-manipulation ${
                    isFlashing
                      ? 'border-[#2464ED] bg-[#2464ED] text-white'
                      : 'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10'
                  }`}
                >
                  {isFlashing ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  <span className="hidden sm:inline">{isFlashing ? 'Añadida' : count > 0 ? 'Otra vez' : 'Añadir'}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Dialog>
  );
};
