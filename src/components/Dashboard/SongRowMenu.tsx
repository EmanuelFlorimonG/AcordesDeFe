import React, { useEffect, useId, useRef, useState } from 'react';
import type { Playlist, Song } from '../../types/song';
import type { Setlist } from '../../types/setlist';
import { Check, ListOrdered, ListPlus, MoreVertical, Plus, Share2 } from 'lucide-react';
import { groupSetlistsByDate, toLocalIsoDate } from '../../utils/setlists';

interface SongRowMenuProps {
  song: Song;
  playlists: Playlist[];
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
  /** When given, the menu can add the song to a setlist */
  setlists?: Setlist[];
  onAddToSetlist?: (setlistId: string, song: Song) => void;
  onCreateSetlistWithSong?: (name: string, song: Song) => void;
}

const MENU_ESTIMATED_HEIGHT = 420;

export const SongRowMenu: React.FC<SongRowMenuProps> = ({
  song,
  playlists,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
  setlists,
  onAddToSetlist,
  onCreateSetlistWithSong,
}) => {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const [newListName, setNewListName] = useState('');
  const [isCreatingSetlist, setIsCreatingSetlist] = useState(false);
  const [newSetlistName, setNewSetlistName] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const setlistInputRef = useRef<HTMLInputElement>(null);
  const menuId = useId();

  const canUseSetlists = Boolean(setlists && onAddToSetlist && onCreateSetlistWithSong);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (isCreatingSetlist) setlistInputRef.current?.focus();
  }, [isCreatingSetlist]);

  const toggleOpen = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setOpensUp(rect.bottom + MENU_ESTIMATED_HEIGHT > window.innerHeight && rect.top > MENU_ESTIMATED_HEIGHT);
    }
    setIsCreatingSetlist(false);
    setOpen((v) => !v);
  };

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) return;
    onCreatePlaylist(name, song.id);
    setNewListName('');
  };

  const handleCreateSetlist = () => {
    const name = newSetlistName.trim();
    if (!name || !onCreateSetlistWithSong) return;
    onCreateSetlistWithSong(name, song);
    setNewSetlistName('');
    setIsCreatingSetlist(false);
    close();
  };

  // Upcoming celebrations first, then the rest, as on the Setlists page.
  const orderedSetlists = (() => {
    if (!setlists) return [];
    const { upcoming, recent } = groupSetlistsByDate(setlists, toLocalIsoDate(new Date()));
    return [...upcoming, ...recent];
  })();

  const sectionTitle =
    'text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5';

  return (
    <div
      className="relative"
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`Más opciones de ${song.title}`}
        className="w-9 h-9 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40"
        title="Más opciones"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div
          id={menuId}
          role="group"
          aria-label={`Opciones de ${song.title}`}
          className={`absolute right-0 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl shadow-xl z-30 py-2 animate-dialog-in ${
            opensUp ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              onShare(song);
              close();
            }}
            className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-dark-800"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir enlace</span>
          </button>

          {canUseSetlists && (
            <div className="px-3.5 pt-2 pb-2 border-t border-slate-100 dark:border-dark-800 mt-1">
              <p className={sectionTitle}>
                <ListOrdered className="w-3.5 h-3.5" />
                Añadir a Setlist
              </p>

              {orderedSetlists.length > 0 && (
                <div className="max-h-40 overflow-y-auto mb-1.5 -mx-1.5">
                  {orderedSetlists.map((setlist) => {
                    const count = setlist.items.filter((item) => item.songId === song.id).length;
                    return (
                      <button
                        key={setlist.id}
                        type="button"
                        onClick={() => {
                          onAddToSetlist?.(setlist.id, song);
                          close();
                        }}
                        className="w-full flex items-center justify-between gap-2 px-1.5 py-1.5 rounded-md text-left text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-dark-800"
                      >
                        <span className="truncate">{setlist.name}</span>
                        {count > 0 && (
                          <span className="shrink-0 flex items-center gap-1 text-[11px] font-medium text-[#2464ED] dark:text-sky-400">
                            <Check className="w-3 h-3" />
                            Ya está
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {isCreatingSetlist ? (
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleCreateSetlist();
                  }}
                >
                  <input
                    ref={setlistInputRef}
                    type="text"
                    value={newSetlistName}
                    maxLength={120}
                    onChange={(e) => setNewSetlistName(e.target.value)}
                    onKeyDown={(e) => {
                      // Handled here as well as by the form, like the playlist field below.
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateSetlist();
                      } else if (e.key === 'Escape') {
                        e.stopPropagation();
                        setIsCreatingSetlist(false);
                      }
                    }}
                    placeholder="Nombre del Setlist"
                    aria-label="Nombre del nuevo Setlist"
                    className="flex-grow min-w-0 px-2 py-1.5 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED]"
                  />
                  <button
                    type="submit"
                    disabled={!newSetlistName.trim()}
                    className="px-2.5 py-1.5 rounded-md bg-[#2464ED] text-white text-xs font-semibold flex-shrink-0 disabled:opacity-40"
                  >
                    Crear
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsCreatingSetlist(true)}
                  className="w-full flex items-center gap-2 px-1.5 -mx-1.5 py-1.5 rounded-md text-sm font-medium text-[#2464ED] dark:text-sky-400 hover:bg-[#EAF1FF] dark:hover:bg-blue-500/10 focus-visible:outline-none focus-visible:bg-[#EAF1FF] dark:focus-visible:bg-blue-500/10"
                >
                  <Plus className="w-4 h-4" />
                  Nuevo Setlist
                </button>
              )}
            </div>
          )}

          <div className="px-3.5 pt-2 border-t border-slate-100 dark:border-dark-800 mt-1">
            <p className={sectionTitle}>
              <ListPlus className="w-3.5 h-3.5" />
              Añadir a lista
            </p>

            {playlists.length > 0 && (
              <div className="max-h-32 overflow-y-auto mb-2 -mx-1.5">
                {playlists.map((pl) => {
                  const included = pl.songIds.includes(song.id);
                  return (
                    <button
                      key={pl.id}
                      type="button"
                      onClick={() => onToggleInPlaylist(pl.id, song.id)}
                      aria-pressed={included}
                      className="w-full flex items-center justify-between gap-2 px-1.5 py-1.5 rounded-md text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800 focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-dark-800"
                    >
                      <span className="truncate">{pl.name}</span>
                      {included && <Check className="w-3.5 h-3.5 text-[#2464ED] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 pb-1">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Nueva lista..."
                aria-label="Nombre de la nueva lista"
                className="flex-grow min-w-0 px-2 py-1.5 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded-md text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED]"
              />
              <button
                type="button"
                onClick={handleCreate}
                aria-label="Crear lista"
                className="p-1.5 rounded-md bg-[#2464ED] text-white flex-shrink-0 disabled:opacity-40"
                disabled={!newListName.trim()}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
