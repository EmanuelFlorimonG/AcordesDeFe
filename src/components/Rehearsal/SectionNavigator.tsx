import React, { useEffect, useRef } from 'react';
import type { SectionKind } from '../../types/song';
import { isRefrainSection } from '../../utils/songSections';

export interface SectionNavItem {
  id: string;
  label: string;
  kind: SectionKind;
  isRepeat: boolean;
}

interface SectionNavigatorProps {
  items: SectionNavItem[];
  /** The section being read right now */
  activeId: string | null;
  onSelect: (id: string) => void;
}

/**
 * "Intro · V1 · Coro · V2 · Coro · Puente", generated from the song's sections.
 * The section being read is highlighted, so a glance tells you where you are.
 */
export const SectionNavigator: React.FC<SectionNavigatorProps> = ({ items, activeId, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted section visible when the list is wider than the screen.
  useEffect(() => {
    const list = listRef.current;
    if (!list || !activeId) return;
    const button = list.querySelector<HTMLElement>(`[data-nav-id="${activeId}"]`);
    if (!button) return;
    const left = button.offsetLeft;
    const right = left + button.offsetWidth;
    if (left < list.scrollLeft || right > list.scrollLeft + list.clientWidth) {
      list.scrollTo({ left: left - (list.clientWidth - button.offsetWidth) / 2, behavior: 'smooth' });
    }
  }, [activeId]);

  if (items.length < 2) return null;

  return (
    <nav aria-label="Secciones de la canción" className="border-t border-slate-100 dark:border-dark-800/80">
      <div
        ref={listRef}
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-none px-2 sm:px-5 py-1.5 [@media(max-height:480px)]:py-0.5"
      >
        {items.map((item, index) => {
          const isActive = item.id === activeId;
          const isRefrain = isRefrainSection(item.kind);
          return (
            <React.Fragment key={item.id}>
              {index > 0 && (
                <span aria-hidden="true" className="shrink-0 text-xs text-slate-300 dark:text-dark-600">
                  ·
                </span>
              )}
              <button
                type="button"
                data-nav-id={item.id}
                onClick={() => onSelect(item.id)}
                aria-current={isActive ? 'location' : undefined}
                title={item.isRepeat ? `${item.label} (se repite)` : item.label}
                className={`shrink-0 h-9 sm:h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg text-[13px] font-semibold whitespace-nowrap transition-colors touch-manipulation ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : isRefrain
                      ? 'text-blue-600 dark:text-sky-400 hover:bg-blue-50 dark:hover:bg-blue-500/10'
                      : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {item.label}
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};
