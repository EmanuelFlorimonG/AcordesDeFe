import React, { useRef } from 'react';
import type { SetlistItem, SetlistSongTransition } from '../../types/setlist';
import type { Song } from '../../types/song';
import { songVersionOf } from '../../catalog/songRepository';
import { AUTO_SCROLL_SPEEDS, useAutoScroll } from '../../hooks/useAutoScroll';
import type { MassKeyInfo, MassPosition } from '../../utils/massMode';
import { STAGE_FONT_LABELS, STAGE_SPEED_SCALE, type StageFontSize } from '../../utils/stageReading';
import { AutoScrollPausedNotice } from '../Rehearsal/RehearsalControls';
import { MassControls } from './MassControls';
import { MassHeader } from './MassHeader';
import { MassNextCard, type MassNextSong } from './MassNextCard';
import { MassSongContent } from './MassSongContent';

interface MassSongScreenProps {
  song: Song;
  item: SetlistItem;
  position: MassPosition;
  keyInfo: MassKeyInfo | null;
  /** Song text already transposed for this entry and instrument */
  content: string;
  showChords: boolean;
  next: MassNextSong | null;
  transition: SetlistSongTransition | null;
  setlistName: string;
  fontSize: StageFontSize;
  onChangeFontSize: (delta: number) => void;
  speedIndex: number;
  onChangeSpeed: (delta: number) => void;
  onChordClick: (chord: string) => void;
  onPrevious: () => void;
  onNext: () => void;
  onFinish: () => void;
  onOpenNavigator: () => void;
  onOpenMenu: () => void;
  onRequestExit: () => void;
}

/**
 * One song, while it is being played.
 *
 * It is mounted per song on purpose: each one starts at its first line, with
 * auto-scroll stopped, and the scrolling element exists from the first render
 * so reading by hand always pauses it.
 */
export const MassSongScreen: React.FC<MassSongScreenProps> = ({
  song,
  item,
  position,
  keyInfo,
  content,
  showChords,
  next,
  transition,
  setlistName,
  fontSize,
  onChangeFontSize,
  speedIndex,
  onChangeSpeed,
  onChordClick,
  onPrevious,
  onNext,
  onFinish,
  onOpenNavigator,
  onOpenMenu,
  onRequestExit,
}) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const autoScroll = useAutoScroll(scrollRef, {
    speedIndex,
    speedScale: STAGE_SPEED_SCALE[fontSize],
  });

  return (
    <>
      <MassHeader
        moment={item.moment}
        title={song.title}
        artist={song.artist}
        position={position.index + 1}
        total={position.total}
        keyInfo={keyInfo}
        tempo={song.tempo}
        isLast={position.isLast}
        onOpenNavigator={onOpenNavigator}
        onOpenMenu={onOpenMenu}
        onExit={onRequestExit}
      />

      <div
        ref={scrollRef}
        tabIndex={-1}
        data-mass-scroll=""
        className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain focus:outline-none"
      >
        <div className="mx-auto w-full max-w-4xl px-4 sm:px-8 lg:px-12 pt-6 sm:pt-8 pb-16">
          <MassSongContent
            content={content}
            item={item}
            songVersion={songVersionOf(song)}
            fontSize={fontSize}
            showChords={showChords}
            onChordClick={onChordClick}
          />

          <MassNextCard
            next={next}
            currentTitle={song.title}
            currentMoment={item.moment}
            currentKeyInfo={keyInfo}
            transition={transition}
            setlistName={setlistName}
            total={position.total}
            onNext={onNext}
            onFinish={onFinish}
          />
        </div>
      </div>

      {autoScroll.isInterrupted && (
        <div className="pointer-events-none absolute inset-x-0 bottom-20 z-20 flex justify-center px-4">
          <div className="pointer-events-auto">
            <AutoScrollPausedNotice onResume={autoScroll.toggle} />
          </div>
        </div>
      )}

      <MassControls
        canGoPrevious={Boolean(position.previous)}
        canGoNext={Boolean(position.next)}
        onPrevious={onPrevious}
        onNext={onNext}
        autoScroll={{
          isRunning: autoScroll.isRunning,
          speedLabel: AUTO_SCROLL_SPEEDS[speedIndex].label,
          canSpeedUp: speedIndex < AUTO_SCROLL_SPEEDS.length - 1,
          canSpeedDown: speedIndex > 0,
          onToggle: autoScroll.toggle,
          onSpeedUp: () => onChangeSpeed(1),
          onSpeedDown: () => onChangeSpeed(-1),
        }}
        font={{
          label: STAGE_FONT_LABELS[fontSize],
          canIncrease: fontSize !== 'xl',
          canDecrease: fontSize !== 'sm',
          onIncrease: () => onChangeFontSize(1),
          onDecrease: () => onChangeFontSize(-1),
        }}
      />
    </>
  );
};
