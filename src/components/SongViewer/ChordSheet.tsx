import React from 'react';
import type { ParsedLine, SectionHeader } from '../../types/song';
import { parseSongSections } from '../../utils/chordParser';
import { isRefrainSection } from '../../utils/songSections';

interface ChordSheetProps {
  content: string;
  fontSize: 'sm' | 'base' | 'lg' | 'xl';
  twoColumns: boolean;
  showChords: boolean;
  onChordClick?: (chord: string) => void;
}

// Dynamic text size classes
const SIZE_CLASSES = {
  sm: { text: 'text-sm', chord: 'text-xs', lineGap: 'my-1' },
  base: { text: 'text-base', chord: 'text-sm', lineGap: 'my-1.5' },
  lg: { text: 'text-lg', chord: 'text-base', lineGap: 'my-2' },
  xl: { text: 'text-xl', chord: 'text-lg', lineGap: 'my-2.5' },
} as const;

type SizeClasses = (typeof SIZE_CLASSES)[keyof typeof SIZE_CLASSES];

/** A line of chords with no words under them, like an intro: "G  D  Em  C". */
function isChordOnlyLine(line: ParsedLine): boolean {
  return (
    line.type === 'chords-lyrics' &&
    Boolean(line.segments?.some((segment) => segment.chord)) &&
    Boolean(line.segments?.every((segment) => !segment.lyric.trim()))
  );
}

function hasWords(lines: ParsedLine[]): boolean {
  return lines.some(
    (line) =>
      line.type === 'comment' ||
      (line.type === 'chords-lyrics' && line.segments?.some((segment) => segment.lyric.trim()))
  );
}

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
    className={`font-mono font-bold text-blue-600 dark:text-sky-400 print:text-blue-800 hover:text-blue-800 dark:hover:text-sky-300 hover:underline transition-colors select-none text-left tracking-tight cursor-pointer ${sizeClass}`}
    title={`Ver diagrama de ${chord}`}
  >
    {chord}
  </button>
);

const SectionHeading: React.FC<{ header: SectionHeader; isRepeat: boolean }> = ({
  header,
  isRepeat,
}) => {
  const isRefrain = isRefrainSection(header.kind);
  return (
    <div className="flex items-center gap-2.5 mb-2.5 [break-after:avoid]">
      <h3
        className={`shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] ${
          isRefrain ? 'text-blue-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'
        }`}
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
  showChords: boolean,
  onChordClick?: (chord: string) => void
): React.ReactNode {
  if (line.type === 'empty') {
    return <div key={key} className="h-3 w-full" />;
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
    if (!showChords) return null;
    return (
      <div key={key} className={`flex flex-wrap items-center gap-x-5 gap-y-1 ${sizes.lineGap} break-inside-avoid`}>
        {line.segments?.map((segment, segIdx) =>
          segment.chord ? (
            <ChordButton key={segIdx} chord={segment.chord} sizeClass={sizes.chord} onChordClick={onChordClick} />
          ) : null
        )}
      </div>
    );
  }

  // Lyrics-only line (chords hidden)
  if (!showChords) {
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

  // Chords + Lyrics Line
  return (
    <div
      key={key}
      className={`flex flex-wrap items-end ${sizes.lineGap} break-inside-avoid leading-none min-h-[2.5rem]`}
    >
      {line.segments?.map((segment, segIdx) => (
        <span key={segIdx} className="inline-flex flex-col justify-end align-bottom mr-0.5 max-w-full group">
          {/* Chord display row */}
          {segment.chord ? (
            <ChordButton chord={segment.chord} sizeClass={sizes.chord} onChordClick={onChordClick} />
          ) : (
            <span className={`font-mono font-bold select-none opacity-0 ${sizes.chord}`} aria-hidden="true">
              &nbsp;
            </span>
          )}

          {/* Lyrics row */}
          <span
            // pre-wrap keeps the spacing that aligns chords, but still lets a
            // long line wrap on a narrow screen instead of overflowing.
            className={`font-lyric text-slate-900 dark:text-slate-100 print:text-slate-900 tracking-normal whitespace-pre-wrap pb-0.5 ${sizes.text}`}
          >
            {segment.lyric ? renderLyricText(segment.lyric) : ' '}
          </span>
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
}) => {
  const sections = React.useMemo(() => parseSongSections(content), [content]);
  const sizes = SIZE_CLASSES[fontSize];

  // A song with no chords yet reads as plain lyrics, instead of reserving an
  // empty chord row above every line.
  const hasAnyChord = React.useMemo(
    () =>
      sections.some((section) =>
        section.lines.some((line) => line.segments?.some((segment) => segment.chord))
      ),
    [sections]
  );
  const renderChords = showChords && hasAnyChord;

  return (
    <div
      className={`w-full transition-all select-text ${
        twoColumns ? 'columns-1 md:columns-2 gap-8 [column-fill:balance]' : ''
      }`}
    >
      {sections.map((section) => {
        // With chords hidden, a purely instrumental section has nothing to show.
        if (!renderChords && section.lines.length > 0 && !hasWords(section.lines)) return null;

        const isRefrain = section.header ? isRefrainSection(section.header.kind) : false;

        return (
          <section
            key={section.id}
            data-section-id={section.id}
            data-section-kind={section.header?.kind}
            className="mt-8 first:mt-0"
          >
            {section.header && (
              <SectionHeading header={section.header} isRepeat={Boolean(section.repeatOf)} />
            )}

            {section.lines.length > 0 && (
              <div
                className={
                  isRefrain ? 'border-l-2 border-blue-100 dark:border-blue-500/25 pl-3 sm:pl-4' : undefined
                }
              >
                {section.lines.map((line, index) =>
                  renderLine(line, index, sizes, renderChords, onChordClick)
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
};
