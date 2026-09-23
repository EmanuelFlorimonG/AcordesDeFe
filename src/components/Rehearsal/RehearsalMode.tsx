import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Eye, Flag, ListMusic } from 'lucide-react';
import type { Instrument, Song } from '../../types/song';
import type { SetlistPlayback } from '../../types/setlist';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { AUTO_SCROLL_SPEEDS, DEFAULT_AUTO_SCROLL_SPEED, useAutoScroll } from '../../hooks/useAutoScroll';
import { useRehearsalShortcuts } from '../../hooks/useRehearsalShortcuts';
import { useArrangementReview } from '../../hooks/useArrangementReview';
import { songVersionOf } from '../../catalog/songRepository';
import { bindArrangement, playableArrangement, resolveArrangement, sectionShortLabel } from '../../utils/arrangement';
import { parseSongSections } from '../../utils/chordParser';
import { formatSongCount } from '../../utils/setlists';
import { getSectionShortLabel, isSectionShown, songHasChords } from '../../utils/songSections';
import {
  STAGE_FONT_LABELS,
  STAGE_SPEED_SCALE,
  changeStageFontSize,
  normalizeStageFontSize,
  type StageFontSize,
} from '../../utils/stageReading';
import { ChordSheet } from '../SongViewer/ChordSheet';
import { ArrangementPendingNotice } from '../Setlists/ArrangementPendingNotice';
import type { CompactPlayerState } from '../Player/MiniPlayer';
import { AutoScrollPausedNotice } from './RehearsalControls';
import { RehearsalDock, type DockPanel } from './RehearsalDock';
import { RehearsalHeader, type RehearsalKeyControls } from './RehearsalHeader';
import { SectionNavigator, type SectionNavItem } from './SectionNavigator';

type FontSize = StageFontSize;
type OpenPanel = DockPanel | 'header-metronome';

/** Breathing room above a section when jumping to it. */
const SECTION_SCROLL_OFFSET = 16;
/**
 * A section counts as "being read" once its title reaches the top of the view.
 * A fixed distance rather than a share of the height: with a proportional
 * line, a short intro would hand the highlight to the next section while the
 * intro is still the first thing on screen.
 */
const ACTIVE_SECTION_LINE_PX = SECTION_SCROLL_OFFSET + 48;

export interface RehearsalModeProps {
  song: Song;
  /** Song text already transposed for the selected instrument */
  content: string;
  showChords: boolean;
  keyControls: RehearsalKeyControls | null;
  capoFret: number | null;
  /** Null when the song has no chords */
  instrument: Instrument | null;
  onInstrumentChange: (instrument: Instrument) => void;
  metronome: MetronomeControls;
  player: CompactPlayerState | null;
  onChordClick: (chord: string) => void;
  isChordModalOpen: boolean;
  /** The existing chord detail modal, rendered inside this layer */
  chordModal: React.ReactNode;
  onExit: () => void;
  /** Set while rehearsing a setlist: where this song sits in it, and how to move on. */
  setlist?: SetlistPlayback | null;
}

/**
 * Rehearsal mode: the song as a music stand.
 *
 * Rendered in a portal above the whole app, with its own scrolling element.
 * That element is the one auto-scroll moves; the window never scrolls here.
 */
export const RehearsalMode: React.FC<RehearsalModeProps> = ({
  song,
  content,
  showChords,
  keyControls,
  capoFret,
  instrument,
  onInstrumentChange,
  metronome,
  player,
  onChordClick,
  isChordModalOpen,
  chordModal,
  onExit,
  setlist,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Stage preferences, remembered between songs and visits.
  const [storedFontSize, setStoredFontSize] = useLocalStorage<FontSize>(
    'genesaret_rehearsal_font_size',
    'base'
  );
  const [storedSpeed, setStoredSpeed] = useLocalStorage<number>(
    'genesaret_autoscroll_speed',
    DEFAULT_AUTO_SCROLL_SPEED
  );
  // Values from storage may be stale or edited by hand; never trust them blindly.
  const fontSize = normalizeStageFontSize(storedFontSize);
  const speedIndex = Number.isInteger(storedSpeed)
    ? Math.min(Math.max(storedSpeed, 0), AUTO_SCROLL_SPEEDS.length - 1)
    : DEFAULT_AUTO_SCROLL_SPEED;

  const [isCleanScreen, setIsCleanScreen] = useState(false);
  // Shown on reaching the end of the last song of a setlist.
  const [isSetlistFinished, setIsSetlistFinished] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const autoScroll = useAutoScroll(scrollRef, { speedIndex, speedScale: STAGE_SPEED_SCALE[fontSize] });

  const sections = useMemo(() => parseSongSections(content), [content]);

  // Opened from a setlist whose entry has an arrangement, the song is read in
  // that order, with its repeats and voices. Opened normally, it is read as it
  // is written. An arrangement made on another version of the song that can't
  // be matched without doubt is not played: the song is read as written.
  const storedArrangement = setlist?.item.arrangement;
  const songVersion = songVersionOf(song);
  const binding = useMemo(() => bindArrangement(sections, storedArrangement, songVersion), [sections, storedArrangement, songVersion]);
  const arrangement = useMemo(() => {
    const playable = playableArrangement(binding);
    return playable ? resolveArrangement(sections, playable) : null;
  }, [sections, binding]);
  // Rehearsal can be the first place this is noticed (opened straight from a link).
  useArrangementReview(binding, storedArrangement, setlist?.onArrangementNeedsReview);

  const navItems = useMemo<SectionNavItem[]>(() => {
    // Every block of an arrangement is its own place to jump to, so a chorus
    // sung three times reads "Coro 1 · Coro 2 · Coro 3".
    if (arrangement) {
      return arrangement.map((entry) => ({
        id: entry.id,
        label:
          entry.occurrences > 1
            ? `${sectionShortLabel(entry.section, entry.label)} ${entry.occurrence}`
            : sectionShortLabel(entry.section, entry.label),
        kind: entry.section?.header?.kind ?? 'otro',
        isRepeat: entry.occurrences > 1,
      }));
    }
    const renderChords = showChords && songHasChords(sections);
    const shown = sections.flatMap((section) =>
      section.header && isSectionShown(section, renderChords)
        ? [
            {
              id: section.id,
              label: getSectionShortLabel(section.header),
              kind: section.header.kind,
              isRepeat: Boolean(section.repeatOf),
            },
          ]
        : []
    );
    // A chorus sung several times is several places to go: "Coro 1 · Coro 2".
    const totals = new Map<string, number>();
    for (const item of shown) totals.set(item.label, (totals.get(item.label) ?? 0) + 1);
    const seen = new Map<string, number>();
    return shown.map((item) => {
      if ((totals.get(item.label) ?? 0) < 2) return item;
      const occurrence = (seen.get(item.label) ?? 0) + 1;
      seen.set(item.label, occurrence);
      return { ...item, label: `${item.label} ${occurrence}` };
    });
  }, [arrangement, sections, showChords]);

  // Keyboard scrolling (Page Down, arrows in the browser) works right away.
  useEffect(() => {
    scrollRef.current?.focus({ preventScroll: true });
  }, []);

  // Which section is being read: the last titled section whose title has
  // reached the top of the view (the first one, before any has).
  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    let frame = 0;

    const update = () => {
      frame = 0;
      const containerTop = container.getBoundingClientRect().top;
      const titled = Array.from(
        container.querySelectorAll<HTMLElement>('[data-section-id][data-section-kind]')
      );
      let current: string | null = titled[0]?.dataset.sectionId ?? null;
      for (const element of titled) {
        if (element.getBoundingClientRect().top - containerTop <= ACTIVE_SECTION_LINE_PX) {
          current = element.dataset.sectionId ?? null;
        } else {
          break;
        }
      }
      // At the very end, the last section is the current one even if its title
      // never reaches the threshold.
      const atEnd = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
      if (atEnd && titled.length > 0) current = titled[titled.length - 1].dataset.sectionId ?? current;
      setActiveSectionId((previous) => (previous === current ? previous : current));
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    schedule();
    container.addEventListener('scroll', schedule, { passive: true });
    return () => {
      container.removeEventListener('scroll', schedule);
      cancelAnimationFrame(frame);
    };
  }, [content, fontSize, showChords, isCleanScreen, arrangement]);

  // When text size or the visible chrome changes, the song reflows. Keep the
  // part being read at the same height on screen instead of letting it jump.
  const anchorRef = useRef<{ id: string | null; offset: number; ratio: number } | null>(null);

  const captureReadingPosition = () => {
    const container = scrollRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const firstVisible = Array.from(container.querySelectorAll<HTMLElement>('[data-section-id]')).find(
      (element) => element.getBoundingClientRect().bottom > containerTop
    );
    anchorRef.current = {
      id: firstVisible?.dataset.sectionId ?? null,
      offset: firstVisible ? firstVisible.getBoundingClientRect().top - containerTop : 0,
      ratio: container.scrollHeight > 0 ? container.scrollTop / container.scrollHeight : 0,
    };
  };

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const container = scrollRef.current;
    if (!anchor || !container) return;
    anchorRef.current = null;

    const element = anchor.id
      ? container.querySelector<HTMLElement>(`[data-section-id="${anchor.id}"]`)
      : null;
    if (element) {
      const offset = element.getBoundingClientRect().top - container.getBoundingClientRect().top;
      container.scrollTop += offset - anchor.offset;
    } else {
      container.scrollTop = anchor.ratio * container.scrollHeight;
    }
  }, [fontSize, isCleanScreen]);

  const changeFontSize = (delta: number) => {
    const next = changeStageFontSize(fontSize, delta);
    if (next === fontSize) return;
    captureReadingPosition();
    setStoredFontSize(next);
  };

  const changeSpeed = (delta: number) => {
    setStoredSpeed(Math.min(Math.max(speedIndex + delta, 0), AUTO_SCROLL_SPEEDS.length - 1));
  };

  const enterCleanScreen = () => {
    captureReadingPosition();
    setOpenPanel(null);
    setIsCleanScreen(true);
  };

  const exitCleanScreen = () => {
    captureReadingPosition();
    setIsCleanScreen(false);
  };

  const scrollToSection = (id: string) => {
    const container = scrollRef.current;
    const element = container?.querySelector<HTMLElement>(`[data-section-id="${id}"]`);
    if (!container || !element) return;
    const top =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      SECTION_SCROLL_OFFSET;
    autoScroll.scrollTo(top);
  };

  // Esc steps back one level at a time: panel, then clean screen, then exit.
  const handleEscape = () => {
    if (isSetlistFinished) setIsSetlistFinished(false);
    else if (openPanel) setOpenPanel(null);
    else if (isCleanScreen) exitCleanScreen();
    else onExit();
  };

  useRehearsalShortcuts(
    {
      onToggleAutoScroll: autoScroll.toggle,
      onSpeedUp: () => changeSpeed(1),
      onSpeedDown: () => changeSpeed(-1),
      onTransposeUp: () => keyControls?.onTranspose(1),
      onTransposeDown: () => keyControls?.onTranspose(-1),
      onToggleMetronome: metronome.toggle,
      onGuitar: () => {
        if (instrument) onInstrumentChange('guitarra');
      },
      onPiano: () => {
        if (instrument) onInstrumentChange('piano');
      },
      onEscape: handleEscape,
    },
    // The chord modal has its own Esc and must not also exit rehearsal mode.
    !isChordModalOpen
  );

  // A tap anywhere outside a panel closes it.
  useEffect(() => {
    if (!openPanel) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest('[data-rehearsal-popover]')) {
        setOpenPanel(null);
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [openPanel]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modo ensayo: ${song.title}`}
      className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-dark-950 text-slate-900 dark:text-slate-100 font-sans"
    >
      {!isCleanScreen && (
        <RehearsalHeader
          song={song}
          keyControls={keyControls}
          capoFret={capoFret}
          metronome={metronome}
          instrument={instrument}
          onInstrumentChange={onInstrumentChange}
          isMetronomeOpen={openPanel === 'header-metronome'}
          onToggleMetronome={() =>
            setOpenPanel((panel) => (panel === 'header-metronome' ? null : 'header-metronome'))
          }
          onEnterCleanScreen={enterCleanScreen}
          onExit={onExit}
          setlist={setlist}
          onFinishSetlist={() => setIsSetlistFinished(true)}
        >
          <SectionNavigator items={navItems} activeId={activeSectionId} onSelect={scrollToSection} />
        </RehearsalHeader>
      )}

      <div
        ref={scrollRef}
        tabIndex={-1}
        data-rehearsal-scroll=""
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain focus:outline-none"
      >
        <div
          className={`mx-auto w-full max-w-4xl px-4 sm:px-8 lg:px-12 pt-6 sm:pt-10 ${
            isCleanScreen ? 'pb-24' : 'pb-48'
          }`}
        >
          {binding.state === 'pending' && <ArrangementPendingNotice where="stage" />}

          {arrangement && (
            <p className="mb-5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#2464ED] dark:text-sky-400">
              <ListMusic aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
              Arreglo de {setlist?.setlistName ?? 'este Setlist'}
            </p>
          )}

          {setlist?.item.notes && (
            <p className="mb-7 border-l-2 border-[#2464ED]/60 pl-3.5 text-sm sm:text-base leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-300">
              {setlist.item.notes}
            </p>
          )}

          <ChordSheet
            variant="stage"
            content={content}
            fontSize={fontSize}
            twoColumns={false}
            showChords={showChords}
            onChordClick={onChordClick}
            arrangement={arrangement}
          />

          {setlist ? (
            <div className="mt-14 flex flex-col items-center gap-3 text-center">
              <span aria-hidden="true" className="h-px w-16 bg-slate-200 dark:bg-dark-700" />
              {setlist.next ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Siguiente
                  </p>
                  <button
                    type="button"
                    onClick={setlist.next.onSelect}
                    className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-sm font-semibold text-slate-800 dark:text-slate-100 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400 transition-colors touch-manipulation"
                  >
                    {setlist.next.moment && (
                      <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#2464ED] dark:text-sky-400">
                        {setlist.next.moment}
                      </span>
                    )}
                    <span className="truncate max-w-[14rem]">{setlist.next.title}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
                    Fin del Setlist
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {setlist.setlistName} · {formatSongCount(setlist.total)}
                  </p>
                  <button
                    type="button"
                    onClick={setlist.onBackToSetlist}
                    className="inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation"
                  >
                    Volver al Setlist
                  </button>
                </>
              )}
            </div>
          ) : (
            <div
              aria-hidden="true"
              className="mt-16 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300 dark:text-dark-600"
            >
              <span className="h-px w-10 bg-current" />
              Fin
              <span className="h-px w-10 bg-current" />
            </div>
          )}
        </div>
      </div>

      {isCleanScreen ? (
        <>
          <button
            type="button"
            onClick={exitCleanScreen}
            title="Mostrar controles (Esc)"
            aria-label="Mostrar controles"
            className="fixed right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-20 w-11 h-11 flex items-center justify-center rounded-full border border-slate-200/70 dark:border-dark-700 bg-white/70 dark:bg-dark-900/70 text-slate-400 shadow-sm backdrop-blur-sm opacity-60 hover:opacity-100 hover:text-slate-900 dark:hover:text-white focus-visible:opacity-100 transition-opacity touch-manipulation"
          >
            <Eye className="w-4 h-4" />
          </button>
          {autoScroll.isInterrupted && (
            <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="pointer-events-auto">
                <AutoScrollPausedNotice onResume={autoScroll.toggle} />
              </div>
            </div>
          )}
        </>
      ) : (
        <RehearsalDock
          autoScroll={{
            isRunning: autoScroll.isRunning,
            isInterrupted: autoScroll.isInterrupted,
            speedLabel: AUTO_SCROLL_SPEEDS[speedIndex].label,
            canSpeedUp: speedIndex < AUTO_SCROLL_SPEEDS.length - 1,
            canSpeedDown: speedIndex > 0,
            onToggle: autoScroll.toggle,
            onSpeedUp: () => changeSpeed(1),
            onSpeedDown: () => changeSpeed(-1),
            onScrollToTop: autoScroll.scrollToTop,
          }}
          font={{
            label: STAGE_FONT_LABELS[fontSize],
            canIncrease: fontSize !== 'xl',
            canDecrease: fontSize !== 'sm',
            onIncrease: () => changeFontSize(1),
            onDecrease: () => changeFontSize(-1),
          }}
          keyControls={keyControls}
          instrument={instrument}
          onInstrumentChange={onInstrumentChange}
          metronome={metronome}
          player={player}
          openPanel={openPanel === 'header-metronome' ? null : openPanel}
          onOpenPanelChange={setOpenPanel}
        />
      )}

      {isSetlistFinished && setlist && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Fin del Setlist"
          className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-white/85 dark:bg-dark-950/90 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 p-6 text-center shadow-2xl animate-dialog-in">
            <div className="mx-auto mb-4 w-12 h-12 rounded-xl bg-[#EAF1FF] dark:bg-blue-500/10 flex items-center justify-center">
              <Flag className="w-6 h-6 text-[#2464ED]" />
            </div>
            <h2 className="text-lg font-bold text-[#10203A] dark:text-white">Fin del Setlist</h2>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {setlist.setlistName} · {formatSongCount(setlist.total)}. Esta era la última.
            </p>
            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                autoFocus
                onClick={setlist.onBackToSetlist}
                className="h-11 rounded-lg bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors touch-manipulation"
              >
                Volver al Setlist
              </button>
              <button
                type="button"
                onClick={() => setIsSetlistFinished(false)}
                className="h-11 rounded-lg border border-slate-200 dark:border-dark-700 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-dark-800 transition-colors touch-manipulation"
              >
                Quedarme en esta canción
              </button>
            </div>
          </div>
        </div>
      )}

      {chordModal}
    </div>,
    document.body
  );
};
