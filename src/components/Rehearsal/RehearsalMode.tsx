import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye } from 'lucide-react';
import type { Instrument, Song, ViewSettings } from '../../types/song';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { AUTO_SCROLL_SPEEDS, DEFAULT_AUTO_SCROLL_SPEED, useAutoScroll } from '../../hooks/useAutoScroll';
import { useRehearsalShortcuts } from '../../hooks/useRehearsalShortcuts';
import { parseSongSections } from '../../utils/chordParser';
import { getSectionShortLabel, isSectionShown, songHasChords } from '../../utils/songSections';
import { ChordSheet } from '../SongViewer/ChordSheet';
import type { CompactPlayerState } from '../Player/MiniPlayer';
import { AutoScrollPausedNotice } from './RehearsalControls';
import { RehearsalDock, type DockPanel } from './RehearsalDock';
import { RehearsalHeader, type RehearsalKeyControls } from './RehearsalHeader';
import { SectionNavigator, type SectionNavItem } from './SectionNavigator';

type FontSize = ViewSettings['fontSize'];
type OpenPanel = DockPanel | 'header-metronome';

const FONT_SIZES: FontSize[] = ['sm', 'base', 'lg', 'xl'];
const FONT_LABELS: Record<FontSize, string> = {
  sm: 'Pequeño',
  base: 'Normal',
  lg: 'Grande',
  xl: 'Extra grande',
};

/**
 * Bigger text makes the song taller, so at the same pixels per second it would
 * feel slower. Scaling keeps "1x" at roughly the same pace in lines.
 */
const SPEED_SCALE: Record<FontSize, number> = { sm: 0.85, base: 1, lg: 1.2, xl: 1.45 };

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
  /** Ready for setlists: not wired to anything yet. */
  previousSong?: Song | null;
  nextSong?: Song | null;
  onNavigateSong?: (song: Song) => void;
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
  previousSong,
  nextSong,
  onNavigateSong,
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
  const fontSize = FONT_SIZES.includes(storedFontSize) ? storedFontSize : 'base';
  const speedIndex = Number.isInteger(storedSpeed)
    ? Math.min(Math.max(storedSpeed, 0), AUTO_SCROLL_SPEEDS.length - 1)
    : DEFAULT_AUTO_SCROLL_SPEED;

  const [isCleanScreen, setIsCleanScreen] = useState(false);
  const [openPanel, setOpenPanel] = useState<OpenPanel | null>(null);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);

  const autoScroll = useAutoScroll(scrollRef, { speedIndex, speedScale: SPEED_SCALE[fontSize] });

  const sections = useMemo(() => parseSongSections(content), [content]);
  const navItems = useMemo<SectionNavItem[]>(() => {
    const renderChords = showChords && songHasChords(sections);
    return sections.flatMap((section) =>
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
  }, [sections, showChords]);

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
  }, [content, fontSize, showChords, isCleanScreen]);

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
    const index = Math.min(Math.max(FONT_SIZES.indexOf(fontSize) + delta, 0), FONT_SIZES.length - 1);
    if (FONT_SIZES[index] === fontSize) return;
    captureReadingPosition();
    setStoredFontSize(FONT_SIZES[index]);
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
    if (openPanel) setOpenPanel(null);
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
          previousSong={previousSong}
          nextSong={nextSong}
          onNavigateSong={onNavigateSong}
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
          <ChordSheet
            variant="stage"
            content={content}
            fontSize={fontSize}
            twoColumns={false}
            showChords={showChords}
            onChordClick={onChordClick}
          />
          <div
            aria-hidden="true"
            className="mt-16 flex items-center justify-center gap-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-300 dark:text-dark-600"
          >
            <span className="h-px w-10 bg-current" />
            Fin
            <span className="h-px w-10 bg-current" />
          </div>
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
            label: FONT_LABELS[fontSize],
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

      {chordModal}
    </div>,
    document.body
  );
};
