import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Setlist, SetlistArrangement, SetlistItem } from '../../types/setlist';
import type { Instrument, Song } from '../../types/song';
import { AUTO_SCROLL_SPEEDS, DEFAULT_AUTO_SCROLL_SPEED } from '../../hooks/useAutoScroll';
import { useFullscreen } from '../../hooks/useFullscreen';
import { useLocalStorage } from '../../hooks/useLocalStorage';
import { useMassSession } from '../../hooks/useMassSession';
import { useMetronome } from '../../hooks/useMetronome';
import { useWakeLock } from '../../hooks/useWakeLock';
import { transposeSongContent } from '../../utils/chordParser';
import { getMassKey, getMassProgress, listMassStops } from '../../utils/massMode';
import { getTransitionToNext } from '../../utils/songTransition';
import {
  changeStageFontSize,
  normalizeStageFontSize,
  type StageFontSize,
} from '../../utils/stageReading';
import { ChordDetailModal } from '../SongViewer/ChordDetailModal';
import { ConfirmDialog } from '../Setlists/ConfirmDialog';
import { MassEndScreen } from './MassEndScreen';
import { MassMenu } from './MassMenu';
import { MassSetlistNavigator } from './MassSetlistNavigator';
import { MassSongScreen } from './MassSongScreen';
import { MassStartScreen } from './MassStartScreen';

interface MassModeProps {
  setlist: Setlist;
  songsById: Map<string, Song>;
  /**
   * Writes down that a block of an entry's arrangement needs someone to look
   * at it: Mass can be the first place that shows, opened straight from a link.
   */
  onArrangementNeedsReview?: (itemId: string, arrangement: SetlistArrangement) => void;
  isPlayable: (item: SetlistItem) => boolean;
  /** Leaves mass mode: back to where it was opened from */
  onExit: () => void;
  /** Where leaving goes, for the wording of the way back: the setlist unless said otherwise */
  returnsTo?: 'setlist' | 'activity';
  /**
   * Only when opened from a scheduled activity date: offered at the end, to
   * start closing it. Mass mode itself still only knows the setlist.
   */
  onFinishCelebration?: () => void;
  /** Opening a song during a celebration counts as opening it, like anywhere else */
  onSongOpened: (songId: string) => void;
  isDarkMode: boolean;
  onToggleDarkMode: () => void;
}

type Overlay = 'navigator' | 'menu' | 'exit' | null;

/**
 * Mass mode: the setlist as it is played, live.
 *
 * Rehearsal mode is for preparing — it has every control at hand. This one is
 * for the celebration itself: what is being sung, what comes next, and nothing
 * else. It plays what was prepared and decides nothing on its own; the
 * arrangement, the voices, the repeats and the transitions are read exactly as
 * they were written in the setlist.
 */
export const MassMode: React.FC<MassModeProps> = ({
  setlist,
  songsById,
  onArrangementNeedsReview,
  isPlayable,
  onExit,
  returnsTo = 'setlist',
  onFinishCelebration,
  onSongOpened,
  isDarkMode,
  onToggleDarkMode,
}) => {
  const exitLabel = returnsTo === 'activity' ? 'Volver a la actividad' : 'Volver al Setlist';
  const session = useMassSession({ setlist, isPlayable });
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [selectedChord, setSelectedChord] = useState<string | null>(null);
  const [showChords, setShowChords] = useState(true);

  // Read on a music stand, further away than a rehearsal: its own size, kept
  // between celebrations. The pace of auto-scroll is the app's single setting.
  const [storedFontSize, setStoredFontSize] = useLocalStorage<StageFontSize>(
    'genesaret_mass_font_size',
    'lg'
  );
  const [storedSpeed, setStoredSpeed] = useLocalStorage<number>(
    'genesaret_autoscroll_speed',
    DEFAULT_AUTO_SCROLL_SPEED
  );
  const [instrument, setInstrument] = useLocalStorage<Instrument>('genesaret_instrument', 'guitarra');

  const fontSize = normalizeStageFontSize(storedFontSize);
  const speedIndex = Number.isInteger(storedSpeed)
    ? Math.min(Math.max(storedSpeed, 0), AUTO_SCROLL_SPEEDS.length - 1)
    : DEFAULT_AUTO_SCROLL_SPEED;

  const { position } = session;
  const item = position?.item ?? null;
  const song = item ? songsById.get(item.songId) ?? null : null;
  const isPiano = instrument === 'piano';
  const hasChords = (song?.chordsUsed.length ?? 0) > 0;

  const metronome = useMetronome(song?.tempo, song?.timeSignature);
  const isPlaying = session.phase === 'playing';
  const wakeLock = useWakeLock(isPlaying);
  const fullscreen = useFullscreen();

  // A capo makes the guitar sound higher than what is written; a piano has no
  // capo, so its chords are moved up instead. Same rule as the song page.
  const transposedContent = useMemo(() => {
    if (!song || !item) return '';
    return transposeSongContent(
      song.content,
      item.transposeSteps + (isPiano ? item.capoFret : 0),
      song.originalKey
    );
  }, [song, item, isPiano]);

  const keyInfo = song && item ? getMassKey(song, item, isPiano) : null;
  const nextItem = position?.next ?? null;
  const nextSong = nextItem ? songsById.get(nextItem.songId) ?? null : null;
  const transition = getTransitionToNext(item, Boolean(nextItem));
  const stops = useMemo(() => listMassStops(setlist, isPlayable), [setlist, isPlayable]);

  // The effects below react to the song changing, not to functions being
  // recreated, so they read the current ones from here.
  const latest = useRef({ metronome, onSongOpened, session });
  useEffect(() => {
    latest.current = { metronome, onSongOpened, session };
  });

  const currentItemId = session.currentItemId;
  const currentSongId = song?.id ?? null;

  // The metronome of the previous song never keeps ticking into the next one;
  // the rest of the screen is mounted again per song, so it starts clean.
  useEffect(() => {
    if (!isPlaying) return;
    latest.current.metronome.stop();
    latest.current.metronome.resetBpm();
  }, [currentItemId, isPlaying]);

  // Opening a song here counts as opening it, exactly like the song page.
  useEffect(() => {
    if (isPlaying && currentSongId) latest.current.onSongOpened(currentSongId);
  }, [currentSongId, isPlaying]);

  const isBusy = overlay !== null || selectedChord !== null;
  const isBusyRef = useRef(isBusy);
  useEffect(() => {
    isBusyRef.current = isBusy;
  }, [isBusy]);

  // Left and right move through the setlist; Esc asks before leaving, because
  // pressing it by accident in the middle of a celebration would be bad.
  useEffect(() => {
    if (!isPlaying) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }
      // A dialog is open: it has its own keys, including Esc to close.
      if (isBusyRef.current) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        latest.current.session.goNext();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        latest.current.session.goPrevious();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        setOverlay('exit');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying]);

  const leave = () => {
    session.clear();
    onExit();
  };

  const changeFontSize = (delta: number) => setStoredFontSize(changeStageFontSize(fontSize, delta));
  const changeSpeed = (delta: number) =>
    setStoredSpeed(Math.min(Math.max(speedIndex + delta, 0), AUTO_SCROLL_SPEEDS.length - 1));

  const renderBody = () => {
    if (session.phase === 'start') {
      return (
        <MassStartScreen
          setlistName={setlist.name}
          date={setlist.date}
          stops={stops}
          songsById={songsById}
          firstItemId={session.currentItemId}
          onStart={(itemId) => session.start(itemId)}
          onExit={leave}
          exitLabel={exitLabel}
        />
      );
    }

    if (session.phase === 'finished') {
      return (
        <MassEndScreen
          setlistName={setlist.name}
          total={position?.total ?? stops.filter((stop) => stop.isPlayable).length}
          onBackToSetlist={leave}
          exitLabel={exitLabel}
          onFinishCelebration={
            onFinishCelebration
              ? () => {
                  // The celebration is over: its saved place in the setlist goes, as when leaving.
                  session.clear();
                  onFinishCelebration();
                }
              : undefined
          }
          onResume={() => session.currentItemId && session.goTo(session.currentItemId)}
        />
      );
    }

    if (!item || !song || !position) {
      return (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ninguna de las canciones de este Setlist está en el cancionero ahora mismo.
          </p>
          <button
            type="button"
            onClick={leave}
            className="h-11 px-4 rounded-xl bg-[#2464ED] text-sm font-semibold text-white hover:bg-[#1D56D6] transition-colors"
          >
            {exitLabel}
          </button>
        </div>
      );
    }

    return (
      <MassSongScreen
        // Each song is mounted on its own: it starts at the first line, with
        // auto-scroll stopped and its own scrolling element.
        key={item.id}
        song={song}
        item={item}
        onArrangementNeedsReview={onArrangementNeedsReview}
        position={position}
        keyInfo={keyInfo}
        content={transposedContent}
        showChords={showChords && hasChords}
        next={
          nextItem
            ? {
                title: nextSong?.title ?? 'Canción no disponible',
                moment: nextItem.moment,
                keyInfo: getMassKey(nextSong ?? undefined, nextItem, isPiano),
              }
            : null
        }
        transition={transition}
        setlistName={setlist.name}
        fontSize={fontSize}
        onChangeFontSize={changeFontSize}
        speedIndex={speedIndex}
        onChangeSpeed={changeSpeed}
        onChordClick={setSelectedChord}
        onPrevious={session.goPrevious}
        onNext={session.goNext}
        onFinish={session.finish}
        onOpenNavigator={() => setOverlay('navigator')}
        onOpenMenu={() => setOverlay('menu')}
        onRequestExit={() => setOverlay('exit')}
      />
    );
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modo Misa: ${setlist.name}`}
      className="fixed inset-0 z-[60] flex flex-col bg-white dark:bg-dark-950 text-slate-900 dark:text-slate-100 font-sans"
    >
      {/* Progress is announced once per song, not on every scroll. */}
      <p role="status" aria-live="polite" className="sr-only">
        {isPlaying && song && position
          ? `${song.title}, canción ${position.index + 1} de ${position.total}`
          : ''}
      </p>

      {renderBody()}

      {overlay === 'navigator' && position && (
        <MassSetlistNavigator
          setlistName={setlist.name}
          stops={stops}
          songsById={songsById}
          currentItemId={position.item.id}
          currentPosition={position.index + 1}
          isPiano={isPiano}
          onSelect={(itemId) => {
            session.goTo(itemId);
            setOverlay(null);
          }}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay === 'menu' && (
        <MassMenu
          metronome={metronome}
          instrument={hasChords ? instrument : null}
          onInstrumentChange={setInstrument}
          showChords={showChords}
          onShowChordsChange={setShowChords}
          wakeLock={wakeLock}
          fullscreen={fullscreen}
          isDarkMode={isDarkMode}
          onToggleDarkMode={onToggleDarkMode}
          onExit={() => setOverlay('exit')}
          onClose={() => setOverlay(null)}
        />
      )}

      {overlay === 'exit' && (
        <ConfirmDialog
          title="¿Salir del Modo Misa?"
          message={`Se cierra la celebración en curso y vuelves ${
            returnsTo === 'activity' ? 'a la actividad' : 'al Setlist'
          }. Nada de lo que preparaste se pierde.`}
          confirmLabel="Salir"
          tone="normal"
          onConfirm={leave}
          onClose={() => setOverlay(null)}
        />
      )}

      {selectedChord && (
        <ChordDetailModal
          key={`${selectedChord}-${instrument}`}
          chord={selectedChord}
          instrument={instrument}
          onClose={() => setSelectedChord(null)}
        />
      )}

      {/* Mass mode keeps the progress bar's percentage honest for screen readers. */}
      <span className="sr-only">{Math.round(getMassProgress(position) * 100)}%</span>
    </div>,
    document.body
  );
};
