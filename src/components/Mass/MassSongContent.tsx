import React, { useMemo } from 'react';
import { StickyNote } from 'lucide-react';
import type { SetlistItem } from '../../types/setlist';
import { resolveArrangement } from '../../utils/arrangement';
import { parseSongSections } from '../../utils/chordParser';
import type { StageFontSize } from '../../utils/stageReading';
import { ChordSheet } from '../SongViewer/ChordSheet';

interface MassSongContentProps {
  /** Song text already transposed for this entry and instrument */
  content: string;
  item: SetlistItem;
  fontSize: StageFontSize;
  showChords: boolean;
  onChordClick: (chord: string) => void;
}

/**
 * The song as it will be played: the arrangement of this setlist when there is
 * one, and the song as it is written when there isn't.
 *
 * The arrangement is not resolved again here in any special way — it is the
 * same resolver rehearsal mode uses, so what was prepared is exactly what is
 * played.
 */
export const MassSongContent: React.FC<MassSongContentProps> = ({
  content,
  item,
  fontSize,
  showChords,
  onChordClick,
}) => {
  const sections = useMemo(() => parseSongSections(content), [content]);
  const arrangement = useMemo(
    () => (item.arrangement ? resolveArrangement(sections, item.arrangement) : null),
    [sections, item.arrangement]
  );

  return (
    <>
      {item.notes && (
        <p className="mb-7 flex items-start gap-2.5 border-l-2 border-[#2464ED]/60 pl-3.5 text-sm sm:text-base leading-relaxed whitespace-pre-line text-slate-600 dark:text-slate-300">
          <StickyNote aria-hidden="true" className="mt-0.5 w-4 h-4 shrink-0 text-slate-400 dark:text-slate-500" />
          {item.notes}
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
    </>
  );
};
