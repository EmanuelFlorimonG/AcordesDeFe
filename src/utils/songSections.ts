import type { ParsedLine, SectionHeader, SectionKind, SongSection } from '../types/song';
import { isChordSymbol } from './chordTransposer';
import { normalizeText } from './normalizeText';

/**
 * Song sections: recognising headers in song text and grouping lines under
 * them. Songs keep being written as plain text; nothing here requires the
 * existing songs to change.
 *
 * The songbook mixes two ways of writing sections, and each header's form
 * decides what it covers (see SectionHeaderForm):
 *
 *   [Verso 1]  [Pre-Coro]  [Hombres]   bracket: until the next header
 *   Coro:      Final suave:            label:   only the stanza below it
 *   Coro       Puente...   Coro (x2)   cue:     nothing; "sing it here"
 *
 * In the choir's PDF songs, "Coro:" introduces the chorus text once, and a bare
 * "Coro" later marks where it is sung again, followed by the next verse.
 */

/** Longer names first, so "pre coro" is tried before "coro". */
const SECTION_NAMES: Array<{ kind: SectionKind; names: string[] }> = [
  {
    kind: 'precoro',
    names: ['pre-coro', 'pre coro', 'precoro', 'pre-estribillo', 'pre estribillo', 'pre-chorus', 'prechorus'],
  },
  { kind: 'postcoro', names: ['post-coro', 'post coro', 'postcoro', 'post-chorus', 'postchorus'] },
  { kind: 'intro', names: ['intro', 'introduccion'] },
  { kind: 'verso', names: ['verso', 'estrofa', 'verse'] },
  { kind: 'coro', names: ['coro', 'estribillo', 'chorus', 'refran'] },
  { kind: 'puente', names: ['puente', 'bridge'] },
  { kind: 'instrumental', names: ['instrumental'] },
  { kind: 'interludio', names: ['interludio', 'interlude'] },
  { kind: 'solo', names: ['solo'] },
  { kind: 'final', names: ['final', 'outro', 'coda'] },
];

const NAME_TO_KIND = new Map<string, SectionKind>(
  SECTION_NAMES.flatMap(({ kind, names }) => names.map((name) => [name, kind] as const))
);

/** Sections sung as a refrain; the sheet gives them a subtle visual anchor. */
export function isRefrainSection(kind: SectionKind): boolean {
  return kind === 'coro';
}

/** A line of chords with no words under them, like an intro: "G  D  Em  C". */
export function isChordOnlyLine(line: ParsedLine): boolean {
  return (
    line.type === 'chords-lyrics' &&
    Boolean(line.segments?.some((segment) => segment.chord)) &&
    Boolean(line.segments?.every((segment) => !segment.lyric.trim()))
  );
}

export function sectionHasWords(section: SongSection): boolean {
  return section.lines.some(
    (line) =>
      line.type === 'comment' ||
      (line.type === 'chords-lyrics' && Boolean(line.segments?.some((segment) => segment.lyric.trim())))
  );
}

export function songHasChords(sections: SongSection[]): boolean {
  return sections.some((section) =>
    section.lines.some((line) => line.segments?.some((segment) => segment.chord))
  );
}

/**
 * Whether the chord sheet draws a section. With chords hidden, a purely
 * instrumental section (an intro of chords only) has nothing to show.
 */
export function isSectionShown(section: SongSection, renderChords: boolean): boolean {
  return renderChords || section.lines.length === 0 || sectionHasWords(section);
}

/** Short name for compact navigation: "V1", "Coro", "Pre-coro", "Puente"… */
export function getSectionShortLabel(header: SectionHeader): string {
  switch (header.kind) {
    case 'verso':
      return header.number !== undefined ? `V${header.number}` : 'Verso';
    case 'precoro':
      return 'Pre-coro';
    case 'postcoro':
      return 'Post-coro';
    default:
      return header.label;
  }
}

const TERMINATOR = /\s*(?::|\.{2,}|…)\s*$/;
const REPEAT = /\s*(?:[([]\s*(?:x|×)\s*(\d+)\s*[)\]]|(?:x|×)(\d+)|\((bis)\))\s*$/i;

/** Longest note allowed after a section name ("Final muy suave:"). */
const MAX_NOTE_WORDS = 3;

function stripTrailing(text: string, pattern: RegExp): { text: string; match: RegExpMatchArray | null } {
  const match = text.match(pattern);
  return match ? { text: text.slice(0, match.index).trim(), match } : { text, match: null };
}

/**
 * Reads "Name [number] [note] [(xN)] [:]". A note after the name is only
 * accepted when the line ends in ":" or "..." (or is bracketed), which is what
 * separates the header "Final suave:" from the lyric "Solo Tú".
 */
function parseNamedSection(text: string, isBracketed: boolean): SectionHeader | null {
  let rest = text.trim();

  const terminated = stripTrailing(rest, TERMINATOR);
  rest = terminated.text;
  let terminator = terminated.match ? terminated.match[0].trim() : null;

  const repeated = stripTrailing(rest, REPEAT);
  rest = repeated.text;
  const repeatMatch = repeated.match;
  const repeat = repeatMatch
    ? repeatMatch[3]
      ? 2
      : Number(repeatMatch[1] ?? repeatMatch[2])
    : undefined;

  // Allow both "Coro (x2):" and "Coro: (x2)".
  const terminatedAgain = stripTrailing(rest, TERMINATOR);
  rest = terminatedAgain.text;
  terminator = terminator ?? (terminatedAgain.match ? terminatedAgain.match[0].trim() : null);
  const hasTerminator = terminator !== null;

  const words = rest.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;

  for (const nameLength of [2, 1]) {
    if (words.length < nameLength) continue;
    const kind = NAME_TO_KIND.get(normalizeText(words.slice(0, nameLength).join(' ')));
    if (!kind) continue;

    let consumed = nameLength;
    let number: number | undefined;
    if (words[consumed] && /^\d+$/.test(words[consumed])) {
      number = Number(words[consumed]);
      consumed++;
    }

    const noteWords = words.slice(consumed);
    if (noteWords.length > 0 && (!(hasTerminator || isBracketed) || noteWords.length > MAX_NOTE_WORDS)) {
      return null;
    }

    return {
      kind,
      form: isBracketed ? 'bracket' : terminator === ':' ? 'label' : 'cue',
      label: words.slice(0, consumed).join(' '),
      ...(number !== undefined && { number }),
      ...(noteWords.length > 0 && { note: noteWords.join(' ') }),
      ...(repeat !== undefined && { repeat }),
    };
  }

  return null;
}

/** Recognises a section header line, or returns null for any other line. */
export function parseSectionHeader(rawLine: string): SectionHeader | null {
  const line = rawLine.trim();
  if (!line) return null;

  const bracketed = line.match(/^\[([^[\]]+)\]$/);
  if (bracketed) {
    const inner = bracketed[1].trim();
    // "[C]" alone on a line is a chord, not a section called "C".
    if (isChordSymbol(inner)) return null;
    return parseNamedSection(inner, true) ?? { kind: 'otro', form: 'bracket', label: inner };
  }

  return parseNamedSection(line, false);
}

/** Drops blank lines at the edges of a section and collapses runs of them. */
function tidyLines(lines: ParsedLine[]): ParsedLine[] {
  const tidy: ParsedLine[] = [];
  for (const line of lines) {
    const previous = tidy[tidy.length - 1];
    if (line.type === 'empty' && (!previous || previous.type === 'empty')) continue;
    tidy.push(line);
  }
  while (tidy.length > 0 && tidy[tidy.length - 1].type === 'empty') tidy.pop();
  return tidy;
}

/** Groups parsed lines under their section headers. */
export function groupIntoSections(lines: ParsedLine[]): SongSection[] {
  const sections: SongSection[] = [];
  let counter = 0;
  let current: SongSection = { id: `section-${counter}`, header: null, lines: [] };

  const flush = () => {
    const tidy = tidyLines(current.lines);
    if (current.header || tidy.length > 0) sections.push({ ...current, lines: tidy });
  };

  const startSection = (header: SongSection['header']) => {
    flush();
    counter++;
    current = { id: `section-${counter}`, header, lines: [] };
  };

  for (const line of lines) {
    if (line.type === 'section' && line.section) {
      startSection(line.section);
      continue;
    }

    const form = current.header?.form;

    // A cue has no body: what follows it is the next, unlabelled stanza.
    if (form === 'cue') {
      if (line.type === 'empty') continue;
      startSection(null);
    }

    // A label covers one stanza: the first blank line after its text ends it.
    if (form === 'label' && line.type === 'empty' && current.lines.some((l) => l.type !== 'empty')) {
      startSection(null);
      continue;
    }

    current.lines.push(line);
  }
  flush();

  // A header with nothing under it points back at the section it repeats.
  return sections.map((section, index) => {
    const { header } = section;
    if (!header || header.kind === 'otro' || section.lines.length > 0) return section;

    const original = sections
      .slice(0, index)
      .reverse()
      .find(
        (candidate) =>
          candidate.lines.length > 0 &&
          candidate.header?.kind === header.kind &&
          (header.number === undefined || candidate.header.number === header.number)
      );
    return original ? { ...section, repeatOf: original.id } : section;
  });
}
