import React, { useEffect, useMemo } from 'react';
import {
  ArrowDown,
  ArrowUp,
  GripVertical,
  ListMusic,
  MoreVertical,
  Music4,
  Pencil,
  Play,
  StickyNote,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import type { SetlistArrangement, SetlistItem } from '../../types/setlist';
import type { ArrangementBinding } from '../../utils/arrangement';
import type { Song } from '../../types/song';
import { useReorderList } from '../../hooks/useReorderList';
import { describeKey } from '../../utils/keySettings';
import { ActionMenu } from './ActionMenu';
import { iconButton } from './ui';
import { unavailableText } from '../../catalog/catalogStore';
import { useSongAvailability } from '../../catalog/useCatalog';
import { songVersionOf } from '../../catalog/songRepository';
import { arrangementVersionOf, bindArrangement, withReviewNeeded } from '../../utils/arrangement';
import { parseSongSections } from '../../utils/chordParser';
import { ARRANGEMENT_PENDING_TEXT } from './ArrangementPendingNotice';

interface SetlistSongListProps {
  items: SetlistItem[];
  songsById: Map<string, Song>;
  onOpenItem: (item: SetlistItem) => void;
  onEditItem: (item: SetlistItem) => void;
  onRemoveItem: (item: SetlistItem) => void;
  /** Moves an entry to a position (drag and drop) */
  onMoveItem: (itemId: string, toIndex: number) => void;
  /** Moves an entry one place up or down (keyboard and menu) */
  onMoveItemBy: (itemId: string, delta: number) => void;
  /**
   * An arrangement whose blocks can no longer say what they play, written
   * down so the obligation to review them isn't forgotten if a later version
   * of the song happens to match again.
   */
  onArrangementNeedsReview?: (itemId: string, arrangement: SetlistArrangement) => void;
}

/**
 * The songs of a setlist, in playing order.
 *
 * They can be reordered by dragging the handle (mouse, pen or finger) or, for
 * anyone not using a pointer, with the arrow keys on that same handle and from
 * each row's menu. Reordering is announced out loud for screen readers.
 */
export const SetlistSongList: React.FC<SetlistSongListProps> = ({
  items,
  songsById,
  onOpenItem,
  onEditItem,
  onRemoveItem,
  onMoveItem,
  onMoveItemBy,
  onArrangementNeedsReview,
}) => {
  const availability = useSongAvailability();
  // Entries whose arrangement waits for review because the song changed.
  // Only a song at another version than its arrangement is parsed.
  const pending = useMemo(() => {
    const waiting = new Map<string, ArrangementBinding>();
    for (const item of items) {
      const song = songsById.get(item.songId);
      if (!song || !item.arrangement) continue;
      const version = songVersionOf(song);
      if (arrangementVersionOf(item.arrangement) === version && !item.arrangement.sections.some((section) => section.needsReview)) continue;
      const binding = bindArrangement(parseSongSections(song.content), item.arrangement, version);
      if (binding.state === 'pending') waiting.set(item.id, binding);
    }
    return waiting;
  }, [items, songsById]);

  // Noticing it is what records it: a block that needed someone keeps needing
  // them, even if a later version of the song says again what it recorded.
  useEffect(() => {
    if (!onArrangementNeedsReview) return;
    for (const [itemId, binding] of pending) {
      const hardened = withReviewNeeded(items.find((item) => item.id === itemId)?.arrangement, binding);
      if (hardened) onArrangementNeedsReview(itemId, hardened);
    }
  }, [pending, items, onArrangementNeedsReview]);
  const {
    announcement,
    draggingId,
    recentlyMovedId,
    attachList,
    attachRow,
    rowStyle,
    handleProps,
    moveBy,
  } = useReorderList({
    ids: items.map((item) => item.id),
    onMove: onMoveItem,
    onMoveBy: onMoveItemBy,
    describeMove: (itemId, toIndex, total) => {
      const item = items.find((entry) => entry.id === itemId);
      const song = item ? songsById.get(item.songId) : null;
      return `${song?.title ?? 'Canción'} en la posición ${toIndex + 1} de ${total}`;
    },
  });

  return (
    <>
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol
        ref={attachList}
        className={`border-y border-slate-100 dark:border-dark-800 ${draggingId ? 'select-none' : ''}`}
      >
        {items.map((item, index) => {
          const song = songsById.get(item.songId);
          const isDragged = draggingId === item.id;
          const keyDescription = song ? describeKey(song.originalKey, item, song.recommendedCapo ?? 0) : null;
          const position = String(index + 1).padStart(2, '0');

          return (
            <li
              key={item.id}
              ref={attachRow(item.id)}
              style={rowStyle(index, item.id)}
              className={`relative flex items-center gap-1 sm:gap-2 pl-2 pr-1 sm:pr-2 border-b border-slate-100 dark:border-dark-800 last:border-b-0 ${
                isDragged
                  ? 'z-10 rounded-lg bg-white dark:bg-dark-900 shadow-[0_16px_40px_-16px_rgba(15,23,42,0.45)] ring-1 ring-[#2464ED]/30'
                  : recentlyMovedId === item.id
                    ? 'bg-[#EAF1FF] dark:bg-blue-500/10 transition-colors duration-500'
                    : 'transition-colors hover:bg-[#EAF1FF]/40 dark:hover:bg-dark-900/60'
              }`}
            >
              <span
                aria-hidden="true"
                className="w-7 sm:w-9 shrink-0 text-center font-mono text-xs sm:text-sm font-bold tabular-nums text-slate-300 dark:text-dark-600"
              >
                {position}
              </span>

              <span className="hidden md:block w-28 shrink-0 truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                {item.moment}
              </span>

              {song ? (
                <button
                  type="button"
                  onClick={() => onOpenItem(item)}
                  className="min-w-0 flex-1 py-2.5 sm:py-3 pr-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 rounded-lg"
                >
                  <span className="sr-only">{`Canción ${index + 1} de ${items.length}: `}</span>
                  {item.moment && (
                    <span className="md:hidden block truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                      {item.moment}
                    </span>
                  )}
                  <span className="block truncate text-sm font-semibold text-[#10203A] dark:text-white">
                    {song.title}
                  </span>
                  {song.artist && (
                    <span className="hidden sm:block truncate text-xs text-slate-500 dark:text-slate-400">
                      {song.artist}
                    </span>
                  )}
                  {pending.has(item.id) ? (
                    <span className="flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                      <TriangleAlert aria-hidden="true" className="w-3 h-3 shrink-0" />
                      {ARRANGEMENT_PENDING_TEXT}
                    </span>
                  ) : (
                    item.arrangement && (
                      <span className="hidden sm:flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-[#2464ED] dark:text-sky-400">
                        <ListMusic aria-hidden="true" className="w-3 h-3 shrink-0" />
                        Arreglo personalizado
                      </span>
                    )
                  )}
                  <span className="sm:hidden mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {keyDescription && (
                      <span
                        className={`font-mono font-bold ${
                          keyDescription.isModified ? 'text-[#2464ED] dark:text-sky-400' : ''
                        }`}
                      >
                        {keyDescription.shape ?? keyDescription.sounding}
                      </span>
                    )}
                    {item.capoFret > 0 && <span>Cej. {item.capoFret}</span>}
                    {song.tempo && <span>{song.tempo} BPM</span>}
                    {item.notes && <StickyNote aria-hidden="true" className="w-3 h-3 text-slate-400" />}
                    {item.arrangement && (
                      <>
                        <ListMusic
                          aria-hidden="true"
                          className="w-3 h-3 text-[#2464ED] dark:text-sky-400"
                        />
                        <span className="sr-only">Con arreglo personalizado</span>
                      </>
                    )}
                  </span>
                </button>
              ) : (
                <span className="min-w-0 flex-1 py-3 pr-1">
                  <span className="block text-sm font-semibold text-slate-400 dark:text-slate-500">
                    Canción no disponible
                  </span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                    {unavailableText(availability(item.songId)) ?? item.songId}
                  </span>
                </span>
              )}

              {keyDescription && (
                <span
                  title={`Original: ${song?.originalKey}`}
                  className={`hidden sm:block w-12 shrink-0 text-right font-mono text-sm font-bold ${
                    keyDescription.isModified ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {keyDescription.shape ?? keyDescription.sounding}
                </span>
              )}
              {item.capoFret > 0 && (
                <span className="hidden lg:block w-14 shrink-0 text-right text-xs text-slate-400 dark:text-slate-500">
                  Cej. {item.capoFret}
                </span>
              )}
              <span className="hidden lg:block w-16 shrink-0 text-right text-xs tabular-nums text-slate-400 dark:text-slate-500">
                {song?.tempo ? `${song.tempo} BPM` : ''}
              </span>
              <span className="hidden xl:flex min-w-0 max-w-[13rem] shrink-0 items-center gap-1.5 pl-2 text-xs italic text-slate-500 dark:text-slate-400">
                {item.notes && (
                  <>
                    <StickyNote className="w-3.5 h-3.5 shrink-0 text-slate-300 dark:text-dark-600" />
                    <span className="truncate" title={item.notes}>
                      {item.notes}
                    </span>
                  </>
                )}
              </span>

              <ActionMenu
                label={`Opciones de ${song?.title ?? 'la canción'}`}
                icon={MoreVertical}
                triggerClassName={iconButton}
                items={[
                  ...(song
                    ? [
                        { label: 'Abrir canción', icon: Play, onSelect: () => onOpenItem(item) },
                        { label: 'Tono, momento y arreglo', icon: Pencil, onSelect: () => onEditItem(item) },
                      ]
                    : []),
                  {
                    label: 'Mover arriba',
                    icon: ArrowUp,
                    disabled: index === 0,
                    separated: Boolean(song),
                    onSelect: () => moveBy(item.id, index, -1),
                  },
                  {
                    label: 'Mover abajo',
                    icon: ArrowDown,
                    disabled: index === items.length - 1,
                    onSelect: () => moveBy(item.id, index, 1),
                  },
                  {
                    label: 'Quitar del Setlist',
                    icon: Trash2,
                    danger: true,
                    separated: true,
                    onSelect: () => onRemoveItem(item),
                  },
                ]}
              />

              <button
                type="button"
                {...handleProps(item.id, index)}
                aria-label={`Reordenar ${song?.title ?? 'la canción'}, posición ${index + 1} de ${items.length}. Usa las flechas arriba y abajo.`}
                title="Arrastra para reordenar, o usa las flechas"
                className={`${iconButton} touch-none cursor-grab active:cursor-grabbing ${
                  isDragged ? 'text-[#2464ED] dark:text-sky-400' : 'text-slate-300 dark:text-dark-600'
                } disabled:cursor-default`}
              >
                <GripVertical className="w-[18px] h-[18px]" />
              </button>
            </li>
          );
        })}
      </ol>

      {items.every((item) => !songsById.has(item.songId)) && items.length > 0 && (
        <p className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
          <Music4 className="w-4 h-4 text-slate-300" />
          Ninguna de estas canciones está en el cancionero ahora mismo.
        </p>
      )}
    </>
  );
};
