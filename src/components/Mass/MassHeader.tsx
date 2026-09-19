import React from 'react';
import { ListOrdered, MoreHorizontal, X } from 'lucide-react';
import type { MassKeyInfo } from '../../utils/massMode';

interface MassHeaderProps {
  moment: string;
  title: string;
  artist?: string;
  /** 1-based, among the songs that can be played */
  position: number;
  total: number;
  keyInfo: MassKeyInfo | null;
  tempo?: number;
  isLast: boolean;
  onOpenNavigator: () => void;
  onOpenMenu: () => void;
  onExit: () => void;
}

const headerButton =
  'w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 touch-manipulation';

/**
 * What is being played, in one glance: the moment of the celebration, where we
 * are in the setlist, the song and the key it sounds in. Nothing else: the
 * controls live at the bottom, out of the way of the words.
 */
export const MassHeader: React.FC<MassHeaderProps> = ({
  moment,
  title,
  artist,
  position,
  total,
  keyInfo,
  tempo,
  isLast,
  onOpenNavigator,
  onOpenMenu,
  onExit,
}) => (
  <header className="shrink-0 border-b border-slate-100 dark:border-dark-800 bg-white/95 dark:bg-dark-950/95 backdrop-blur-sm">
    {/* Held sideways the screen is short, so the header gives its room to the song. */}
    <div className="mx-auto w-full max-w-4xl px-4 sm:px-8 lg:px-12 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2.5 [@media(max-height:480px)]:pt-1 [@media(max-height:480px)]:pb-1">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 pt-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold uppercase tracking-[0.16em]">
            {moment && <span className="text-[#2464ED] dark:text-sky-400">{moment}</span>}
            <span className="tabular-nums text-slate-400 dark:text-slate-500">
              {position} / {total}
            </span>
            {isLast && <span className="text-slate-300 dark:text-dark-600">última</span>}
          </p>

          <h1 className="mt-0.5 text-lg sm:text-2xl [@media(max-height:480px)]:text-base font-bold leading-tight tracking-tight text-[#10203A] dark:text-white break-words">
            {title}
          </h1>

          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            {keyInfo && (
              <span className="font-mono font-bold text-blue-600 dark:text-sky-400">
                {keyInfo.displayed}
              </span>
            )}
            {keyInfo?.sounding && <span>suena {keyInfo.sounding}</span>}
            {keyInfo && keyInfo.capoFret > 0 && <span>Cejilla {keyInfo.capoFret}</span>}
            {tempo ? <span className="tabular-nums">{tempo} BPM</span> : null}
            {artist && <span className="truncate max-w-[12rem] [@media(max-height:480px)]:hidden">{artist}</span>}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onOpenNavigator}
            aria-haspopup="dialog"
            aria-label="Ver el Setlist"
            title="Ver el Setlist"
            className={headerButton}
          >
            <ListOrdered className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={onOpenMenu}
            aria-haspopup="dialog"
            aria-label="Opciones del Modo Misa"
            title="Opciones"
            className={headerButton}
          >
            <MoreHorizontal className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            onClick={onExit}
            aria-label="Salir del Modo Misa"
            title="Salir del Modo Misa"
            className={headerButton}
          >
            <X className="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
    </div>

    {/* How much of the setlist is behind us, as thin as it can be read. */}
    <div aria-hidden="true" className="h-0.5 w-full bg-slate-100 dark:bg-dark-800">
      <div
        className="h-full bg-[#2464ED] dark:bg-sky-500 transition-[width] duration-500"
        style={{ width: `${total > 0 ? (position / total) * 100 : 0}%` }}
      />
    </div>
  </header>
);
