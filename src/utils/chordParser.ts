import type { ChordLineSegment, ParsedLine, SongSection } from '../types/song';
import {
  isChordSymbol,
  normalizeStep,
  parseChordSymbol,
  transposeChordBetweenKeys,
  transposeKey,
} from './chordTransposer';
import { isMinorQuality, resolveChordQuality } from './chordQuality';
import { groupIntoSections, parseSectionHeader } from './songSections';

/**
 * Transposes all bracketed chords in the song content string, spelled for the
 * key they land in. From G up a semitone: [G] [D/F#] [Em] become [Ab] [Eb/G]
 * [Fm], never [G#] [D#/G] [Fm].
 *
 * `originalKey` is the key the song is written in. Without it, the first chord
 * stands in for the key.
 */
export function transposeSongContent(content: string, steps: number, originalKey?: string): string {
  if (normalizeStep(steps) === 0) return content;

  const fromKey = originalKey || inferKeyFromContent(content);
  if (!fromKey) return content;
  const toKey = transposeKey(fromKey, steps);

  return content.replace(/\[([A-G][b#]?[^\]]*)\]/g, (match, chord: string) =>
    // Labels such as [Estribillo] start with a note letter but aren't chords.
    isChordSymbol(chord) ? `[${transposeChordBetweenKeys(chord.trim(), fromKey, toKey)}]` : match
  );
}

/**
 * A key for a song that doesn't state one: songs almost always open on their
 * tonic, so the first chord (major or minor) is taken as the key.
 */
export function inferKeyFromContent(content: string): string | null {
  const first = extractUniqueChords(content)[0];
  const parsed = first ? parseChordSymbol(first) : null;
  if (!parsed) return null;
  const quality = resolveChordQuality(parsed.suffix);
  return `${parsed.root}${isMinorQuality(quality.key) ? 'm' : ''}`;
}

export interface LyricPiece {
  chord?: string;
  text: string;
}

/**
 * Splits a chord-and-lyric line into words that must never break across
 * lines. A chord that falls inside a word ("en[G/B]séñame") stays part of
 * that word, so the whole word wraps together and the chord keeps its
 * syllable. Lines can only wrap where the lyric itself has a space.
 */
export function groupIntoWords(segments: ChordLineSegment[]): LyricPiece[][] {
  const words: LyricPiece[][] = [];
  let current: LyricPiece[] = [];

  for (const segment of segments) {
    const tokens = segment.lyric.match(/\s+|\S+\s*/g) ?? [''];
    tokens.forEach((text, index) => {
      const piece: LyricPiece = index === 0 && segment.chord ? { chord: segment.chord, text } : { text };
      const previous = current[current.length - 1];
      const startsNewWord = previous !== undefined && (/\s$/.test(previous.text) || /^\s/.test(text));
      if (startsNewWord) {
        words.push(current);
        current = [];
      }
      current.push(piece);
    });
  }

  if (current.length > 0) words.push(current);
  return words;
}

/**
 * Extracts all unique chord names found inside square brackets in a song text
 */
export function extractUniqueChords(content: string): string[] {
  const chords = new Set<string>();
  for (const match of content.matchAll(/\[([A-G][b#]?[^\]]*)\]/g)) {
    const chord = match[1].trim();
    if (isChordSymbol(chord)) chords.add(chord);
  }
  return Array.from(chords);
}

/**
 * Parses a single bracketed line into segments of { chord?: string, lyric: string }
 * Example: "[G]Quiero levan[D/F#]tar mis [Em]manos"
 */
export function parseBracketLine(line: string): ChordLineSegment[] {
  const segments: ChordLineSegment[] = [];
  const regex = /\[([A-G][b#]?[^\]]*)\]([^\[]*)/g;
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  const firstBracket = line.indexOf('[');
  if (firstBracket > 0) {
    segments.push({
      lyric: line.slice(0, firstBracket)
    });
  } else if (firstBracket === -1) {
    return [{ lyric: line }];
  }

  while ((match = regex.exec(line)) !== null) {
    if (isChordSymbol(match[1])) {
      segments.push({
        chord: match[1],
        lyric: match[2] || ''
      });
    } else {
      // A bracketed word inside a lyric line is text, not a chord.
      segments.push({ lyric: `[${match[1]}]${match[2] || ''}` });
    }
    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length && firstBracket !== -1) {
    const remaining = line.slice(lastIndex);
    if (remaining.length > 0 && !remaining.startsWith('[')) {
      if (segments.length > 0) {
        segments[segments.length - 1].lyric += remaining;
      } else {
        segments.push({ lyric: remaining });
      }
    }
  }

  return segments;
}

/**
 * Parses full song content into structured lines for the ChordSheet component
 */
export function parseSongContent(content: string): ParsedLine[] {
  const lines = content.split('\n');
  const result: ParsedLine[] = [];

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed === '') {
      result.push({
        type: 'empty',
        raw: ''
      });
      continue;
    }

    // Check for Section Header
    const section = parseSectionHeader(trimmed);
    if (section) {
      result.push({
        type: 'section',
        raw: trimmed,
        sectionTitle: section.label,
        section
      });
      continue;
    }

    // Check for a performance note like "* Tocar suave". Lines starting with
    // "//" are not notes: in this songbook "//texto//" marks lyrics that are
    // sung twice, so they stay lyrics.
    if (trimmed.startsWith('*')) {
      result.push({
        type: 'comment',
        raw: trimmed
      });
      continue;
    }

    // Bracketed chord line
    if (rawLine.includes('[')) {
      result.push({
        type: 'chords-lyrics',
        raw: rawLine,
        segments: parseBracketLine(rawLine)
      });
      continue;
    }

    // Plain lyric line
    result.push({
      type: 'chords-lyrics',
      raw: rawLine,
      segments: [{ lyric: rawLine }]
    });
  }

  return result;
}

/**
 * Parses song content into sections: the structure the chord sheet renders.
 */
export function parseSongSections(content: string): SongSection[] {
  return groupIntoSections(parseSongContent(content));
}

/**
 * Strips chords from song content, keeping only the lyrics and section
 * headers, for a clean "letra sin acordes" copy/print output.
 */
export function stripChords(content: string): string {
  const parsedLines = parseSongContent(content);

  return parsedLines
    .map((line) => {
      if (line.type === 'empty') return '';
      // Keep the header exactly as the author wrote it ("Coro:", "[Verso 1]").
      if (line.type === 'section') return line.raw;
      if (line.type === 'comment') return line.raw;
      return line.segments?.map((segment) => segment.lyric).join('') ?? '';
    })
    .join('\n');
}
