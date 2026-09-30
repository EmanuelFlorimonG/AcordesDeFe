import React from 'react';
import { CornerUpLeft, Square, TriangleAlert } from 'lucide-react';
import type { ParsedLine, SectionHeader, ViewSettings } from '../../types/song';
import { groupIntoWords, parseSongSections } from '../../utils/chordParser';
import {
  formatVoices,
  resolvedSectionName,
  type ResolvedArrangementSection,
} from '../../utils/arrangement';
import { memberNames, useMinistryData } from '../../hooks/ministryContext';
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
 * "print": paper, where the air a screen can afford is pages nobody wants to
 * carry — same size of letter, everything else tighter.
 */
export type ChordSheetVariant = 'page' | 'stage' | 'print';

interface ChordSheetProps {
  content: string;
  fontSize: FontSize;
  twoColumns: boolean;
  showChords: boolean;
  onChordClick?: (chord: string) => void;
  variant?: ChordSheetVariant;
  /**
   * The arrangement of this song for one occasion: its sections in the order
   * they will be played, with their voices, repeats and instructions. Without
   * it the song is shown exactly as it is written.
   */
  arrangement?: ResolvedArrangementSection[] | null;
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

/**
 * Papel. Las mismas letras que en pantalla —11pt es lo que lleva el
 * documento del ministerio de siempre— y todo lo demás apretado: quien
 * reparte doce copias antes de una misa cuenta las hojas.
 */
const PRINT_SIZE_CLASSES: Record<FontSize, SizeClasses> = {
  sm: { text: 'text-[11pt] leading-[1.25]', chord: 'text-[9.5pt]', lineGap: 'my-0', chordRowGap: 'gap-x-4' },
  base: { text: 'text-[11pt] leading-[1.25]', chord: 'text-[9.5pt]', lineGap: 'my-0', chordRowGap: 'gap-x-4' },
  lg: { text: 'text-[12pt] leading-[1.3]', chord: 'text-[10pt]', lineGap: 'my-0', chordRowGap: 'gap-x-4' },
  xl: { text: 'text-[13pt] leading-[1.3]', chord: 'text-[11pt]', lineGap: 'my-0.5', chordRowGap: 'gap-x-5' },
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
  isPrint?: boolean;
}> = ({ chord, sizeClass, onChordClick, isPrint = false }) =>
  // En papel un acorde no se pulsa: es texto, y en negro, para que la
  // fotocopia en blanco y negro se lea igual de bien que el original.
  isPrint ? (
    <span className={`font-mono font-bold text-slate-900 tracking-tight whitespace-nowrap ${sizeClass}`}>
      {chord}
    </span>
  ) : (
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
  isStage: boolean;
  isPrint?: boolean;
}> = ({ header, isStage, isPrint = false }) => {
  const isRefrain = isRefrainSection(header.kind);
  return (
    <div
      className={`flex items-center [break-after:avoid] ${
        isStage ? 'gap-3 mb-3 sm:mb-4' : isPrint ? 'gap-2 mb-0.5' : 'gap-2.5 mb-2.5'
      }`}
    >
      <h3
        className={`shrink-0 font-semibold uppercase ${
          isStage
            ? 'text-xs sm:text-[13px] tracking-[0.18em]'
            : isPrint
              ? 'text-[9.5pt] tracking-[0.08em] text-slate-900'
              : 'text-[11px] tracking-[0.14em]'
        } ${isPrint ? '' : isRefrain ? 'text-blue-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {header.label}
      </h3>
      {header.note && (
        <span className={isPrint ? 'text-[9pt] italic text-slate-700' : 'text-xs italic text-slate-400 dark:text-slate-500'}>
          {isPrint ? `- ${header.note}` : header.note}
        </span>
      )}
      {header.repeat &&
        (isPrint ? (
          <span className="text-[9pt] font-semibold text-slate-900">x{header.repeat}</span>
        ) : (
          <span
            className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 px-1.5 rounded border border-slate-200 dark:border-dark-700"
            title={`Se canta ${header.repeat} veces`}
          >
            ×{header.repeat}
          </span>
        ))}
      {!isPrint && <span aria-hidden="true" className="h-px flex-1 bg-slate-100 dark:bg-dark-800" />}
    </div>
  );
};

/**
 * The heading of a block of the arrangement: its name, how many times it is
 * sung, who sings it and what to remember. The lyric stays the main thing on
 * the page, so all of it is one quiet line.
 */
const ArrangementHeading: React.FC<{
  entry: ResolvedArrangementSection;
  isStage: boolean;
  isPrint?: boolean;
}> = ({ entry, isStage, isPrint = false }) => {
  const isRefrain = entry.section?.header ? isRefrainSection(entry.section.header.kind) : false;
  // Names come from the member as it is now: renaming someone renames them here.
  const { membersById } = useMinistryData();
  const names = memberNames(entry.assignedMemberIds, membersById);
  return (
    <div
      className={`flex flex-wrap items-center [break-after:avoid] ${
        isStage ? 'gap-x-3 gap-y-1 mb-3 sm:mb-4' : isPrint ? 'gap-x-2 mb-0.5' : 'gap-x-2.5 gap-y-1 mb-2.5'
      }`}
    >
      <h3
        className={`shrink-0 font-semibold uppercase ${
          isStage
            ? 'text-xs sm:text-[13px] tracking-[0.18em]'
            : isPrint
              ? 'text-[9.5pt] tracking-[0.08em] text-slate-900'
              : 'text-[11px] tracking-[0.14em]'
        } ${isPrint ? '' : isRefrain ? 'text-blue-600 dark:text-sky-400' : 'text-slate-500 dark:text-slate-400'}`}
      >
        {resolvedSectionName(entry)}
      </h3>
      {entry.repeatCount > 1 &&
        (isPrint ? (
          <span className="shrink-0 text-[9pt] font-semibold text-slate-900">x{entry.repeatCount}</span>
        ) : (
          <span
            className="shrink-0 text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400 px-1.5 rounded border border-slate-200 dark:border-dark-700"
            title={`Se canta ${entry.repeatCount} veces`}
          >
            ×{entry.repeatCount}
          </span>
        ))}
      {entry.voices.length > 0 && (
        <span
          className={`shrink-0 font-semibold uppercase ${
            isPrint
              ? 'text-[9pt] text-slate-700'
              : `tracking-[0.1em] text-blue-600 dark:text-sky-400 ${isStage ? 'text-[11px] sm:text-xs' : 'text-[10px]'}`
          }`}
        >
          {isPrint ? '- ' : ''}
          {formatVoices(entry.voices)}
        </span>
      )}
      {names.length > 0 && (
        <span
          className={`min-w-0 font-semibold ${
            isPrint ? 'text-[9pt] text-slate-700' : `text-slate-700 dark:text-slate-200 ${isStage ? 'text-xs sm:text-sm' : 'text-xs'}`
          }`}
        >
          <span className="sr-only">Canta: </span>
          {isPrint ? '- ' : ''}
          {names.join(' · ')}
        </span>
      )}
      {entry.instruction && (
        <span
          className={`italic ${
            isPrint ? 'text-[9pt] text-slate-700' : `text-slate-400 dark:text-slate-500 ${isStage ? 'text-xs sm:text-sm' : 'text-xs'}`
          }`}
        >
          {isPrint ? '- ' : ''}
          {entry.instruction}
        </span>
      )}
      {!isPrint && <span aria-hidden="true" className="h-px flex-1 min-w-[1.5rem] bg-slate-100 dark:bg-dark-800" />}
    </div>
  );
};

/** What the musicians do when this block ends. It is read, never executed. */
const TransitionNote: React.FC<{ entry: ResolvedArrangementSection; isStage: boolean; isPrint?: boolean }> = ({
  entry,
  isStage,
  isPrint = false,
}) => {
  if (entry.transition.type === 'continue') return null;
  const isEnd = entry.transition.type === 'end';
  const says = isEnd ? 'Terminar aquí' : `Volver a ${entry.transitionTargetLabel ?? 'otra sección'}`;
  // En papel no hay iconos: es una indicación escrita, como en un cancionero.
  if (isPrint) return <p className="mt-0.5 text-[9pt] italic text-slate-700">{says}</p>;
  const Icon = isEnd ? Square : CornerUpLeft;
  return (
    <p
      className={`mt-3 flex items-center gap-2 font-semibold text-slate-500 dark:text-slate-400 ${
        isStage ? 'text-xs sm:text-sm' : 'text-xs'
      }`}
    >
      <Icon aria-hidden="true" className={`w-3.5 h-3.5 shrink-0 ${isEnd ? 'fill-current' : ''}`} />
      {says}
    </p>
  );
};

function renderLine(
  line: ParsedLine,
  key: number,
  sizes: SizeClasses,
  renderChords: boolean,
  isStage: boolean,
  onChordClick?: (chord: string) => void,
  isPrint = false
): React.ReactNode {
  if (line.type === 'empty') {
    return <div key={key} className={`${isStage ? 'h-5' : isPrint ? 'h-2' : 'h-3'} w-full`} />;
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
            <ChordButton
              key={segIdx}
              chord={segment.chord}
              sizeClass={sizes.chord}
              onChordClick={onChordClick}
              isPrint={isPrint}
            />
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
        isStage || isPrint ? '' : 'min-h-[2.5rem]'
      }`}
    >
      {groupIntoWords(line.segments ?? []).map((word, wordIndex) => (
        // A word is one unbreakable unit, however many chords sit inside it.
        <span key={wordIndex} data-lyric-word="" className="inline-flex items-end max-w-full">
          {word.map((piece, pieceIndex) => (
            <span key={pieceIndex} className="inline-flex flex-col justify-end">
              {/* Chord display row: the chord sits above the start of its syllable */}
              {piece.chord ? (
                <span className={isPrint ? 'pr-1.5 leading-[0.85]' : 'pr-1.5'}>
                  <ChordButton
                    chord={piece.chord}
                    sizeClass={sizes.chord}
                    onChordClick={onChordClick}
                    isPrint={isPrint}
                  />
                </span>
              ) : (
                // En pantalla la sílaba sin acorde reserva el hueco de uno,
                // para que la letra no baile al cambiar de tono. En papel no:
                // las palabras se alinean por su base, así que una línea que
                // envuelve sin llevar acordes no arrastra una fila vacía — y
                // eso, en un cancionero, son páginas enteras.
                !isPrint && (
                  <span className={`font-mono font-bold select-none opacity-0 ${sizes.chord}`} aria-hidden="true">
                    &nbsp;
                  </span>
                )
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
  arrangement = null,
}) => {
  const sections = React.useMemo(() => parseSongSections(content), [content]);
  const isStage = variant === 'stage';
  const isPrint = variant === 'print';
  const sizes = (isStage ? STAGE_SIZE_CLASSES : isPrint ? PRINT_SIZE_CLASSES : PAGE_SIZE_CLASSES)[fontSize];

  // A song with no chords yet reads as plain lyrics, instead of reserving an
  // empty chord row above every line.
  const hasAnyChord = React.useMemo(() => songHasChords(sections), [sections]);
  const renderChords = showChords && hasAnyChord;

  /**
   * What to draw, in order. Each block carries its own identity: with an
   * arrangement it is the identity of that appearance, so a chorus sung three
   * times is three blocks, each one its own anchor on the page.
   */
  const blocks = React.useMemo(
    () =>
      arrangement
        ? arrangement.map((entry) => ({ id: entry.id, section: entry.section, entry }))
        : sections.map((section) => ({
            id: section.id,
            section,
            entry: null as ResolvedArrangementSection | null,
          })),
    [arrangement, sections]
  );

  return (
    <div
      className={`w-full transition-all select-text ${
        twoColumns ? 'columns-1 md:columns-2 gap-8 [column-fill:balance]' : ''
      }`}
    >
      {blocks.map(({ id, section, entry }) => {
        // A block the arrangement asks for is always drawn: someone decided it
        // is played there. Without an arrangement, the song's own rules apply.
        if (!entry && (!section || !isSectionShown(section, renderChords))) return null;

        const isRefrain = section?.header ? isRefrainSection(section.header.kind) : false;
        const lines = section && (!entry || isSectionShown(section, renderChords)) ? section.lines : [];

        return (
          <section
            key={id}
            data-section-id={id}
            data-section-kind={entry ? (section?.header?.kind ?? 'otro') : section?.header?.kind}
            className={
              isStage
                ? 'mt-10 sm:mt-14 first:mt-0'
                : isPrint
                  ? 'mt-2 first:mt-0'
                  : 'mt-8 first:mt-0'
            }
          >
            {entry ? (
              <ArrangementHeading entry={entry} isStage={isStage} isPrint={isPrint} />
            ) : (
              section?.header && (
                <SectionHeading header={section.header} isStage={isStage} isPrint={isPrint} />
              )
            )}

            {entry &&
              !section &&
              (isPrint ? (
                <p className="text-[9pt] italic text-slate-700">Esta sección ya no está en la letra.</p>
              ) : (
                <p className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 dark:border-amber-500/40 px-3 py-2 text-xs sm:text-sm text-amber-700 dark:text-amber-400">
                  <TriangleAlert aria-hidden="true" className="w-4 h-4 shrink-0" />
                  Esta sección ya no está en la letra de la canción.
                </p>
              ))}

            {lines.length > 0 && (
              <div
                className={
                  !isRefrain || isPrint
                    ? undefined
                    : isStage
                      ? 'border-l-[3px] border-blue-100 dark:border-blue-500/25 pl-4 sm:pl-6'
                      : 'border-l-2 border-blue-100 dark:border-blue-500/25 pl-3 sm:pl-4'
                }
              >
                {lines.map((line, index) =>
                  renderLine(line, index, sizes, renderChords, isStage, onChordClick, isPrint)
                )}
              </div>
            )}

            {entry && <TransitionNote entry={entry} isStage={isStage} isPrint={isPrint} />}
          </section>
        );
      })}
    </div>
  );
};
