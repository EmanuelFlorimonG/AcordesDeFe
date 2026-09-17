import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, SlidersHorizontal } from 'lucide-react';
import type { SpecificSeasonId } from '../../data/liturgicalSeasons';
import {
  EMPTY_FILTERS,
  countActiveFilters,
  toggleFilterValue,
  type FilterGroup,
  type FilterOption,
  type FilterOptions,
  type SongFilters,
} from '../../utils/songSearch';
import { LiturgicalSeasonDot } from '../Liturgy/LiturgicalSeasonChips';
import { Dialog } from '../Setlists/Dialog';
import { ghostButton, primaryButton, sectionHeading } from '../Setlists/ui';

interface SongFiltersControlProps {
  filters: SongFilters;
  options: FilterOptions;
  /** Songs shown with the current search and filters */
  resultCount: number;
  onChange: (filters: SongFilters) => void;
}

const WIDE_SCREEN = '(min-width: 640px)';
const PANEL_WIDTH = 460;

const songCountLabel = (count: number) => (count === 1 ? 'Ver 1 canción' : `Ver ${count} canciones`);

/**
 * The "Filtros" button and its panel. On wider screens the panel drops down
 * from the button; on phones it opens as a sheet from the bottom. Filters
 * apply as they are chosen, and every option shows how many songs it leads to.
 */
export const SongFiltersControl: React.FC<SongFiltersControlProps> = ({ filters, options, resultCount, onChange }) => {
  const [mode, setMode] = useState<'closed' | 'popover' | 'sheet'>('closed');
  const [position, setPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const activeCount = countActiveFilters(filters);

  const place = () => {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
    const left = Math.min(Math.max(8, rect.right - width), window.innerWidth - width - 8);
    const top = rect.bottom + 8;
    setPosition({ top, left, width, maxHeight: Math.max(280, window.innerHeight - top - 16) });
  };

  const open = () => {
    if (window.matchMedia(WIDE_SCREEN).matches) {
      place();
      setMode('popover');
    } else {
      setMode('sheet');
    }
  };

  const close = () => {
    setMode('closed');
    triggerRef.current?.focus();
  };

  useLayoutEffect(() => {
    if (mode === 'popover') panelRef.current?.querySelector<HTMLElement>('button:not([disabled])')?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'popover') return;
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (!panelRef.current?.contains(target) && !triggerRef.current?.contains(target)) setMode('closed');
    };
    const handleResize = () => setMode('closed');
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('resize', handleResize);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mode]);

  const footer = (
    <>
      <button
        type="button"
        onClick={() => onChange(EMPTY_FILTERS)}
        disabled={activeCount === 0}
        className={`${ghostButton} mr-auto`}
      >
        Limpiar filtros
      </button>
      <button type="button" onClick={close} className={primaryButton}>
        {songCountLabel(resultCount)}
      </button>
    </>
  );

  const content = <FilterPanelContent filters={filters} options={options} onChange={onChange} />;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (mode === 'closed' ? open() : close())}
        aria-haspopup="dialog"
        aria-expanded={mode !== 'closed'}
        aria-controls={mode === 'popover' ? panelId : undefined}
        aria-label={activeCount > 0 ? `Filtros, ${activeCount} activos` : 'Filtros'}
        className={`relative shrink-0 inline-flex items-center justify-center gap-2 h-[42px] w-[42px] sm:w-auto sm:px-3.5 rounded-lg border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 ${
          activeCount > 0 || mode !== 'closed'
            ? 'border-[#2464ED]/40 bg-[#EAF1FF] dark:bg-blue-500/10 text-[#1D4ED8] dark:text-sky-300'
            : 'border-slate-200 dark:border-dark-700 bg-slate-50 dark:bg-dark-900 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-dark-600'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span className="hidden sm:inline">Filtros</span>
        {activeCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 sm:static min-w-[20px] h-5 px-1 rounded-md bg-[#2464ED] text-white text-[11px] font-bold leading-5 tabular-nums">
            {activeCount}
          </span>
        )}
      </button>

      {mode === 'popover' &&
        position &&
        createPortal(
          <div
            ref={panelRef}
            id={panelId}
            role="dialog"
            aria-label="Filtros de canciones"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.stopPropagation();
                close();
              }
            }}
            style={{ top: position.top, left: position.left, width: position.width, maxHeight: position.maxHeight }}
            className="fixed z-[75] flex flex-col rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-900 dark:text-slate-100 shadow-[0_24px_60px_-16px_rgba(15,23,42,0.4)] animate-dialog-in"
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2">
              <h2 className="text-base font-bold text-[#10203A] dark:text-white">Filtros</h2>
              <span className="text-xs text-slate-400 dark:text-slate-500">Se aplican al momento</span>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{content}</div>
            <div className="flex items-center gap-2 border-t border-slate-100 dark:border-dark-800 px-5 py-3">{footer}</div>
          </div>,
          document.body
        )}

      {mode === 'sheet' && (
        <Dialog title="Filtros" onClose={close} footer={footer}>
          {content}
        </Dialog>
      )}
    </>
  );
};

interface FilterPanelContentProps {
  filters: SongFilters;
  options: FilterOptions;
  onChange: (filters: SongFilters) => void;
}

const FilterPanelContent: React.FC<FilterPanelContentProps> = ({ filters, options, onChange }) => {
  const toggle = (group: FilterGroup, value: string) => onChange(toggleFilterValue(filters, group, value));
  const isSelected = (group: FilterGroup, value: string) => (filters[group] as string[]).includes(value);

  const lastMassMoment = options.categories.reduce((last, option, index) => (option.isMassMoment ? index : last), -1);

  return (
    <div className="space-y-5">
      <FilterSection title="Momento o categoría">
        {options.categories.map((option, index) => (
          <React.Fragment key={option.value}>
            <FilterChip option={option} selected={isSelected('categories', option.value)} onToggle={() => toggle('categories', option.value)} />
            {index === lastMassMoment && <span aria-hidden="true" className="basis-full h-0" />}
          </React.Fragment>
        ))}
      </FilterSection>

      <FilterSection title="Tiempo litúrgico" note="Cada tiempo incluye también las canciones de Todo el año.">
        {options.seasons.map((option) => (
          <FilterChip
            key={option.value}
            option={option}
            selected={isSelected('seasons', option.value)}
            onToggle={() => toggle('seasons', option.value)}
            leading={<LiturgicalSeasonDot id={option.value as SpecificSeasonId} />}
          />
        ))}
      </FilterSection>

      <FilterSection title="Tonalidad">
        {options.keys.map((option) => (
          <FilterChip
            key={option.value}
            option={option}
            selected={isSelected('keys', option.value)}
            onToggle={() => toggle('keys', option.value)}
            mono
          />
        ))}
      </FilterSection>

      <FilterSection title="Artista">
        {options.artists.map((option) => (
          <FilterChip
            key={option.value}
            option={option}
            selected={isSelected('artists', option.value)}
            onToggle={() => toggle('artists', option.value)}
          />
        ))}
      </FilterSection>
    </div>
  );
};

const FilterSection: React.FC<{ title: string; note?: string; children: React.ReactNode }> = ({
  title,
  note,
  children,
}) => {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId}>
      <h3 id={headingId} className={`${sectionHeading} mb-2`}>
        {title}
      </h3>
      <div role="group" aria-labelledby={headingId} className="flex flex-wrap gap-1.5">
        {children}
      </div>
      {note && <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500">{note}</p>}
    </section>
  );
};

const FilterChip: React.FC<{
  option: FilterOption;
  selected: boolean;
  onToggle: () => void;
  leading?: React.ReactNode;
  mono?: boolean;
}> = ({ option, selected, onToggle, leading, mono = false }) => {
  // An option that would show nothing can't be added, but can always be removed.
  const unavailable = !selected && option.count === 0;
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={unavailable}
      aria-pressed={selected}
      aria-label={`${option.label}, ${option.count} ${option.count === 1 ? 'canción' : 'canciones'}`}
      className={`inline-flex items-center gap-1.5 h-8 [@media(pointer:coarse)]:h-10 px-2.5 rounded-lg border text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 disabled:opacity-40 disabled:cursor-not-allowed ${
        selected
          ? 'border-[#2464ED] bg-[#2464ED] text-white'
          : 'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-700 dark:text-slate-200 enabled:hover:border-[#2464ED]/60'
      }`}
    >
      {selected && <Check aria-hidden="true" className="w-3.5 h-3.5 -ml-0.5" />}
      {leading}
      <span className={mono ? 'font-mono font-semibold' : ''}>{option.label}</span>
      <span
        aria-hidden="true"
        className={`text-[11px] tabular-nums ${selected ? 'text-white/75' : 'text-slate-400 dark:text-slate-500'}`}
      >
        {option.count}
      </span>
    </button>
  );
};
