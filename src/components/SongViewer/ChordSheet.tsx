import React from 'react';
import type { ParsedLine, SectionHeader, ViewSettings } from '../../types/song';
import { groupIntoWords, parseSongSections } from '../../utils/chordParser';
import {
  isChordOnlyLine,
  isRefrainSection,
  isSectionShown,
  songHasChords,
} from '../../utils/songSections';

type FontSize = ViewSettings['fontSize'];

/**
 * "page": the song page. "stage": rehearsal mode, read from a music stand at
 * arm's length, so everything is larger and sections are spaced further apart.
 */
export type ChordSheetVariant = 'page' | 'stage';

interface ChordSheetProps {
  content: string;
  fontSize: FontSize;
  twoColumns: boolean;
  showChords: boolean;
  onChordClick?: (chord: string) => void;
  variant?: ChordSheetVariant;
}

interface SizeClasses {
  text: string;
  chord: string;
  lineGap: string;
  chordRowGap: string;
}

const PAGE_SIZE_CLASSES: Record<FontSize, SizeClasses> = {
  sm: { text: 'text-sm', chord: 'text-xs', lineGap: 'my-1', chordRowGap: 'gap-x-5' },
  base: { text: 'text-base', chord: 'text-sm', lineGap: 'my-1.5', chordRowGap: 'gap-x-5' },
  lg: { text: 'text-lg', chord: 'text-base', lineGap: 'my-2', chordRowGap: 'gap-x-5' },
  xl: { text: 'text-xl', chord: 'text-lg', lineGap: 'my-2.5', chordRowGap: 'gap-x-5' },
};

// Chords stay a step smaller than the words, so the lyric remains the main
// thing to read. Phones get one step less than tablets and up.
const STAGE_SIZE_CLASSES: Record<FontSize, SizeClasses> = {
  sm: { text: 'text-lg sm:text-xl', chord: 'text-sm sm:text-base', lineGap: 'my-1.5', chordRowGap: 'gap-x-6' },
  base: { text: 'text-xl sm:text-2xl', chord: 'text-base sm:text-lg', lineGap: 'my-2', chordRowGap: 'gap-x-7' },
  lg: { text: 'text-2xl sm:text-3xl', chord: 'text-lg sm:text-xl', lineGap: 'my-2.5', chordRowGap: 'gap-x-8' },
  xl: { text: 'text-3xl sm:text-4xl', chord: 'text-xl sm:text-2xl', lineGap: 'my-3', chordRowGap: 'gap-x-9' },
};

/**
 * Lyric text with the songbook's repeat marks ("//sung twice//") kept but
 * muted, so they guide without competing with the words.
 */
function renderLyricText(text: string): React.ReactNode {
  if (!text.includes('//')) return text;
  return text.split(/(\/\/)/).map((part, index) =>
    part === '//' ? (
      <span key={index} className="text-slate-300 dark:text-slate-600 print:text-slate-400">
        //
      </span>
    ) : (
      part
    )
  );
}

const ChordButton: React.FC<{
  chord: string;
  sizeClass: string;
  onChordClick?: (chord: string) => void;
}> = ({ chord, sizeClass, onChordClick }) => (
  <button
    type="button"
    onClick={() => onChordClick?.(chord)}
    className={`font-mono font-bold text-blue-600 dark:text-sky-400 print:text-blue-800 hover:text-blue-800 dark:hover:text-sky-300 hover:underline transition-colors select-none text-left tracking-tight cursor-pointer whitespace-nowrap ${sizeClass}`}
    title={`Ver diagrama de ${chord}`}
  >
    {chord}
  </button>
);

const SectionHeading: React.FC<{
  header: SectionHeader;
  isRepeat: boolean;
  isStage: boolean;
}> = ({ header, isRepeat, isStage }) => {
  const isRefrain = isRefrainSection(header.kind);
  return (
    <div
      className={`flex items-center [break-after:avoid] ${isStage ? 'gap-3 mb-3 sm:mb-4' : 'gap-2.5 mb-2.5'}`}
    >
      <h3
        className={`shrink-0 font-semibold uppercase ${
          isStage ? 'text-xs sm:text-[13px] tracking-[0.18em]' : 'text-[11px] tracking-[0.14em]'
        } ${isRefrain ? 'text-blue-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {header.label}
      </h3>
      {header.note && (
        <span className="text-xs italic text-slate-400 dark:text-slate-500">{header.note}</span>
      )}
      {header.repeat && (
        <span
          className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 px-1.5 rounded border border-slate-200 dark:border-dark-700"
          title={`Se canta ${header.repeat} veces`}
        >
          ×{header.repeat}
        </span>
      )}
      {isRepeat && <span className="text-xs text-slate-400 dark:text-slate-500">se repite</span>}
      <span aria-hidden="true" className="h-px flex-1 bg-slate-100 dark:bg-dark-800" />
    </div>
  );
};

function renderLine(
  line: ParsedLine,
  key: number,
  sizes: SizeClasses,
  renderChords: boolean,
  isStage: boolean,
  onChordClick?: (chord: string) => void
): React.ReactNode {
  if (line.type === 'empty') {
    return <div key={key} className={`${isStage ? 'h-5' : 'h-3'} w-full`} />;
  }

  if (line.type === 'comment') {
    return (
      <div
        key={key}
        className="text-xs text-slate-500 dark:text-slate-400 italic pl-2 py-0.5 border-l-2 border-slate-300 dark:border-dark-700 my-1 font-mono"
      >
        {line.raw}
      </div>
    );
  }

  if (isChordOnlyLine(line)) {
    if (!renderChords) return null;
    return (
      <div
        key={key}
        className={`flex flex-wrap items-center gap-y-1 ${sizes.chordRowGap} ${sizes.lineGap} break-inside-avoid`}
      >
        {line.segments?.map((segment, segIdx) =>
          segment.chord ? (
            <ChordButton key={segIdx} chord={segment.chord} sizeClass={sizes.chord} onChordClick={onChordClick} />
          ) : null
        )}
      </div>
    );
  }

  // Lyrics-only line (chords hidden)
  if (!renderChords) {
    const text = line.segments?.map((segment) => segment.lyric).join('') ?? '';
    return (
      <p
        key={key}
        className={`font-lyric text-slate-900 dark:text-slate-100 print:text-slate-900 break-inside-avoid ${sizes.text} ${sizes.lineGap}`}
      >
        {text.trim() ? renderLyricText(text) : ' '}
      </p>
    );
  }

  // Chords + Lyrics Line: a row of whole words that wraps only between words.
  return (
    <div
      key={key}
      className={`flex flex-wrap items-end ${sizes.lineGap} break-inside-avoid leading-none ${
        isStage ? '' : 'min-h-[2.5rem]'
      }`}
    >
      {groupIntoWords(line.segments ?? []).map((word, wordIndex) => (
        // A word is one unbreakable unit, however many chords sit inside it.
        <span key={wordIndex} data-lyric-word="" className="inline-flex items-end max-w-full">
          {word.map((piece, pieceIndex) => (
            <span key={pieceIndex} className="inline-flex flex-col justify-end">
              {/* Chord display row: the chord sits above the start of its syllable */}
              {piece.chord ? (
                <span className="pr-1.5">
                  <ChordButton chord={piece.chord} sizeClass={sizes.chord} onChordClick={onChordClick} />
                </span>
              ) : (
                <span className={`font-mono font-bold select-none opacity-0 ${sizes.chord}`} aria-hidden="true">
                  &nbsp;
                </span>
              )}

              {/* Lyrics row. Each piece is at most one word plus its spaces,
                  so keeping its spacing exact never forces an overflow. */}
              <span
                className={`font-lyric text-slate-900 dark:text-slate-100 print:text-slate-900 tracking-normal whitespace-pre pb-0.5 ${sizes.text}`}
              >
                {piece.text ? renderLyricText(piece.text) : ' '}
              </span>
            </span>
          ))}
        </span>
      ))}
    </div>
  );
}

export const ChordSheet: React.FC<ChordSheetProps> = ({
  content,
  fontSize,
  twoColumns,
  showChords,
  onChordClick,
  variant = 'page',
}) => {
  const sections = React.useMemo(() => parseSongSections(content), [content]);
  const isStage = variant === 'stage';
  const sizes = (isStage ? STAGE_SIZE_CLASSES : PAGE_SIZE_CLASSES)[fontSize];

  // A song with no chords yet reads as plain lyrics, instead of reserving an
  // empty chord row above every line.
  const hasAnyChord = React.useMemo(() => songHasChords(sections), [sections]);
  const renderChords = showChords && hasAnyChord;

  return (
    <div
      className={`w-full transition-all select-text ${
        twoColumns ? 'columns-1 md:columns-2 gap-8 [column-fill:balance]' : ''
      }`}
    >
      {sections.map((section) => {
        if (!isSectionShown(section, renderChords)) return null;

        const isRefrain = section.header ? isRefrainSection(section.header.kind) : false;

        return (
          <section
            key={section.id}
            data-section-id={section.id}
            data-section-kind={section.header?.kind}
            className={isStage ? 'mt-10 sm:mt-14 first:mt-0' : 'mt-8 first:mt-0'}
          >
            {section.header && (
              <SectionHeading
                header={section.header}
                isRepeat={Boolean(section.repeatOf)}
                isStage={isStage}
              />
            )}

            {section.lines.length > 0 && (
              <div
                className={
                  isRefrain
                    ? isStage
                      ? 'border-l-[3px] border-blue-100 dark:border-blue-500/25 pl-4 sm:pl-6'
                      : 'border-l-2 border-blue-100 dark:border-blue-500/25 pl-3 sm:pl-4'
                    : undefined
                }
              >
                {section.lines.map((line, index) =>
                  renderLine(line, index, sizes, renderChords, isStage, onChordClick)
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
