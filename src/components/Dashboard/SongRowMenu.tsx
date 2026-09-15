import React, { useEffect, useRef, useState } from 'react';
import type { Playlist, Song } from '../../types/song';
import { MoreVertical, Share2, ListPlus, Check, Plus } from 'lucide-react';

interface SongRowMenuProps {
  song: Song;
  playlists: Playlist[];
  onToggleInPlaylist: (playlistId: string, songId: string) => void;
  onCreatePlaylist: (name: string, songId: string) => void;
  onShare: (song: Song) => void;
}

export const SongRowMenu: React.FC<SongRowMenuProps> = ({
  song,
  playlists,
  onToggleInPlaylist,
  onCreatePlaylist,
  onShare,
}) => {
  const [open, setOpen] = useState(false);
  const [newListName, setNewListName] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const handleCreate = () => {
    const name = newListName.trim();
    if (!name) return;
    onCreatePlaylist(name, song.id);
    setNewListName('');
  };

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-full text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
        title="Más opciones"
      >
        <MoreVertical className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-lg shadow-lg z-20 py-2">
          <button
            onClick={() => {
              onShare(song);
              setOpen(false);
            }}
            className="w-full flex items-center gap-2 px-3.5 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800"
          >
            <Share2 className="w-4 h-4" />
            <span>Compartir enlace</span>
          </button>

          <div className="px-3.5 py-2 border-t border-slate-100 dark:border-dark-800 mt-1">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <ListPlus className="w-3.5 h-3.5" />
              Añadir a lista
            </p>

            {playlists.length > 0 && (
              <div className="max-h-32 overflow-y-auto mb-2">
                {playlists.map((pl) => {
                  const included = pl.songIds.includes(song.id);
                  return (
                    <button
                      key={pl.id}
                      onClick={() => onToggleInPlaylist(pl.id, song.id)}
                      className="w-full flex items-center justify-between gap-2 px-1.5 py-1.5 rounded text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800"
                    >
                      <span className="truncate">{pl.name}</span>
                      {included && <Check className="w-3.5 h-3.5 text-[#2464ED] flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                placeholder="Nueva lista..."
                className="flex-grow min-w-0 px-2 py-1.5 text-xs bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 rounded text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED]"
              />
              <button
                onClick={handleCreate}
                className="p-1.5 rounded bg-[#2464ED] text-white flex-shrink-0 disabled:opacity-40"
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
