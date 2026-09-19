import { emptySongDraft, parseSongDraft, SONG_DRAFT_SCHEMA_VERSION, type SongDraft } from '../catalog/songDraft';
import type { SectionKind } from '../types/song';
import { extractUniqueChords, parseBracketLine, parseSongSections } from '../utils/chordParser';
import { isChordSymbol } from '../utils/chordTransposer';
import { createId, type IdFactory } from '../utils/createId';
import { isChordOnlyLine, parseSectionHeader } from '../utils/songSections';

/**
 * The song as the editor works with it: sections of lines, each line with its
 * words and the chords placed on them.
 *
 * It is only a working shape. Its one output is `content` in the bracket
 * notation the whole app already reads ("[G]Señor, quiero [D/F#]caminar"),
 * produced by editorToContent: the parser, the transposer, the chord sheet,
 * repeated sections, arrangements, rehearsal and Mass mode all read that text
 * and nothing else. There is no format of the editor's own.
 *
 * Decisions
 * - A chord is anchored to a character position of its line's text (a JS
 *   string index, after Unicode NFC normalisation so "ñ" or "á" are always
 *   one position). The position means "the chord sounds at this character";
 *   position === text.length is a chord at the end of the line.
 * - When the words change, anchors are moved by remapAnchors: the edit is
 *   located (common prefix and suffix, or the caret), anchors before it stay,
 *   anchors after it shift by the change in length, and an anchor whose
 *   character was deleted stays at the start of the edit. So typing before a
 *   word carries its chord along with it.
 * - A section's label is its truth ("Verso 2", "Coro", "Estribillo final").
 *   Its kind is what the app's parser reads from that label, never a second
 *   vocabulary.
 * - Duplicating copies a section: new, independent lines. Repeating adds a
 *   section that points at an earlier one: it is written as that section's
 *   name with nothing under it, which is exactly how the songbook already
 *   repeats a chorus, and the parser resolves it the same way everywhere.
 */

export const EDITOR_SCHEMA_VERSION = 1;

export interface ChordAnchor {
  id: string;
  /** As typed: shown as a warning when the app can't read it, never deleted */
  chord: string;
  /** Character index in the line's text; text.length means "at the end" */
  position: number;
}

export interface EditorLine {
  id: string;
  text: string;
  /** Sorted by position (then by entry order for an instrumental line) */
  chords: ChordAnchor[];
  /** Only chords, played in order ("[G]  [D]  [Em]"): no words to sit on */
  instrumental: boolean;
}

export interface EditorSection {
  id: string;
  /** The name written as the section's header: "Intro", "Verso 1", "Coro" */
  label: string;
  /** Set when this appearance repeats an earlier section; its own lines are then unused */
  repeatOf: string | null;
  lines: EditorLine[];
}

/** Everything about the song except the words and chords, exactly the fields of SongDraft. */
export type SongMeta = Omit<SongDraft, 'content' | 'chordsUsed'>;

export interface EditorDocument {
  schemaVersion: typeof EDITOR_SCHEMA_VERSION;
  meta: SongMeta;
  sections: EditorSection[];
}

// ---------------------------------------------------------------------------
// Section kinds: the parser's own vocabulary
// ---------------------------------------------------------------------------

export type EditorSectionKind = Exclude<SectionKind, 'otro'> | 'custom';

/** The names the editor offers; each one is read back by the parser as its kind (tested). */
export const SECTION_KIND_OPTIONS: Array<{ kind: EditorSectionKind; name: string; numbered: boolean }> = [
  { kind: 'intro', name: 'Intro', numbered: false },
  { kind: 'verso', name: 'Verso', numbered: true },
  { kind: 'precoro', name: 'Pre-coro', numbered: false },
  { kind: 'coro', name: 'Coro', numbered: false },
  { kind: 'postcoro', name: 'Post-coro', numbered: false },
  { kind: 'puente', name: 'Puente', numbered: false },
  { kind: 'instrumental', name: 'Instrumental', numbered: false },
  { kind: 'interludio', name: 'Interludio', numbered: false },
  { kind: 'solo', name: 'Solo', numbered: false },
  { kind: 'final', name: 'Final', numbered: false },
  { kind: 'custom', name: 'Personalizada', numbered: false },
];

/** How the app will read this label: its kind, or 'custom' for a name that isn't a standard section. */
export function sectionKindOf(label: string): EditorSectionKind {
  const header = parseSectionHeader(`[${label.trim()}]`);
  return !header || header.kind === 'otro' ? 'custom' : header.kind;
}

/** The label a kind gets when chosen: "Verso 3" counts the verses before it. */
export function defaultLabelFor(kind: EditorSectionKind, sections: EditorSection[], beforeIndex = sections.length): string {
  const option = SECTION_KIND_OPTIONS.find((entry) => entry.kind === kind);
  if (!option || kind === 'custom') return '';
  if (!option.numbered) return option.name;
  const count = sections.slice(0, beforeIndex).filter((section) => !section.repeatOf && sectionKindOf(section.label) === kind).length;
  return `${option.name} ${count + 1}`;
}

// ---------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------

export function createLine(makeId: IdFactory = createId, text = ''): EditorLine {
  return { id: makeId(), text, chords: [], instrumental: false };
}

export function createSection(label: string, makeId: IdFactory = createId): EditorSection {
  return { id: makeId(), label, repeatOf: null, lines: [createLine(makeId)] };
}

export function emptySongMeta(): SongMeta {
  const { content: _content, chordsUsed: _chords, ...meta } = emptySongDraft();
  return meta;
}

/** A new song: one verse to start writing in. */
export function createEditorDocument(makeId: IdFactory = createId): EditorDocument {
  return { schemaVersion: EDITOR_SCHEMA_VERSION, meta: emptySongMeta(), sections: [createSection('Verso 1', makeId)] };
}

// ---------------------------------------------------------------------------
// Words and chords of one line
// ---------------------------------------------------------------------------

/** Brackets write chords in the song text, so words can't contain them; they become parentheses. */
export function cleanLyricText(text: string): string {
  return text.normalize('NFC').replace(/\r?\n/g, ' ').replace(/\[/g, '(').replace(/\]/g, ')');
}

/** A chord as typed, without what would break the notation (brackets, line breaks, outer spaces). */
export function cleanChordText(chord: string): string {
  return chord.normalize('NFC').replace(/[[\]\r\n]/g, '').trim();
}

export function isRecognizedChord(chord: string): boolean {
  return isChordSymbol(cleanChordText(chord));
}

function sortAnchors(chords: ChordAnchor[]): ChordAnchor[] {
  return chords
    .map((anchor, index) => ({ anchor, index }))
    .sort((a, b) => a.anchor.position - b.anchor.position || a.index - b.index)
    .map((entry) => entry.anchor);
}

/**
 * The chords of a line after its words changed from `before` to `after`.
 * `caret` (where the cursor ended up) pins down where the edit happened when
 * the text alone is ambiguous ("aa" → "aaa").
 */
export function remapAnchors(before: string, after: string, chords: ChordAnchor[], caret?: number): ChordAnchor[] {
  if (before === after) return chords;
  const shorter = Math.min(before.length, after.length);
  let suffix = 0;
  let prefix = 0;
  if (caret !== undefined && caret >= 0 && caret <= after.length) {
    suffix = Math.min(after.length - caret, shorter);
    // The caret's claim only holds if that much of the end really is unchanged.
    while (suffix > 0 && before.slice(before.length - suffix) !== after.slice(after.length - suffix)) suffix--;
    while (prefix < shorter - suffix && before[prefix] === after[prefix]) prefix++;
  } else {
    // Without a caret, the edit is taken to be as late as possible (typing at the end is the usual case).
    while (prefix < shorter && before[prefix] === after[prefix]) prefix++;
    while (suffix < shorter - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  }

  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  return sortAnchors(
    chords.map((anchor) => {
      if (anchor.position < prefix) return anchor;
      if (anchor.position >= oldEnd) return { ...anchor, position: Math.min(after.length, anchor.position + delta) };
      // Its character was replaced or deleted: it stays where the edit began.
      return { ...anchor, position: prefix };
    })
  );
}

/** New words for a line, carrying its chords along. */
export function setLineText(line: EditorLine, text: string, caret?: number): EditorLine {
  const clean = cleanLyricText(text);
  return { ...line, text: clean, chords: remapAnchors(line.text, clean, line.chords, caret) };
}

/** A chord at a position; one already there is replaced rather than stacked. */
export function placeChord(line: EditorLine, position: number, chord: string, makeId: IdFactory = createId): EditorLine {
  const clean = cleanChordText(chord);
  if (!clean) return line;
  if (line.instrumental) {
    return { ...line, chords: [...line.chords, { id: makeId(), chord: clean, position: 0 }] };
  }
  const at = Math.max(0, Math.min(line.text.length, Math.round(position)));
  const existing = line.chords.find((anchor) => anchor.position === at);
  if (existing) return { ...line, chords: line.chords.map((anchor) => (anchor === existing ? { ...anchor, chord: clean } : anchor)) };
  return { ...line, chords: sortAnchors([...line.chords, { id: makeId(), chord: clean, position: at }]) };
}

export function changeChord(line: EditorLine, anchorId: string, chord: string): EditorLine {
  const clean = cleanChordText(chord);
  if (!clean) return removeChord(line, anchorId);
  return { ...line, chords: line.chords.map((anchor) => (anchor.id === anchorId ? { ...anchor, chord: clean } : anchor)) };
}

export function removeChord(line: EditorLine, anchorId: string): EditorLine {
  return { ...line, chords: line.chords.filter((anchor) => anchor.id !== anchorId) };
}

/**
 * Moves a chord to another character. On an instrumental line it moves one
 * place in the sequence instead. A chord never lands on another one.
 */
export function moveChord(line: EditorLine, anchorId: string, delta: number): EditorLine {
  const index = line.chords.findIndex((anchor) => anchor.id === anchorId);
  if (index < 0 || delta === 0) return line;
  if (line.instrumental) {
    const target = index + Math.sign(delta);
    if (target < 0 || target >= line.chords.length) return line;
    const chords = [...line.chords];
    [chords[index], chords[target]] = [chords[target], chords[index]];
    return { ...line, chords };
  }
  const taken = new Set(line.chords.filter((anchor) => anchor.id !== anchorId).map((anchor) => anchor.position));
  let position = line.chords[index].position;
  const step = Math.sign(delta);
  for (let moved = 0; moved < Math.abs(delta); ) {
    const next = position + step;
    if (next < 0 || next > line.text.length) break;
    position = next;
    if (!taken.has(position)) moved++;
  }
  // Landed on another chord at the edge of the line: step back to the nearest free place.
  while (taken.has(position) && position !== line.chords[index].position) position -= step;
  return { ...line, chords: sortAnchors(line.chords.map((anchor) => (anchor.id === anchorId ? { ...anchor, position } : anchor))) };
}

/** The start of the next (or previous) word from a position: where a chord usually goes. */
export function wordBoundary(text: string, position: number, direction: 1 | -1): number {
  const isWord = (char: string | undefined) => char !== undefined && /\S/.test(char);
  let at = position;
  if (direction > 0) {
    while (at < text.length && isWord(text[at])) at++;
    while (at < text.length && !isWord(text[at])) at++;
    return at;
  }
  if (at > 0) at--;
  while (at > 0 && !isWord(text[at])) at--;
  while (at > 0 && isWord(text[at - 1])) at--;
  return at;
}

export function setInstrumental(line: EditorLine, instrumental: boolean): EditorLine {
  if (line.instrumental === instrumental) return line;
  return instrumental
    ? { ...line, instrumental: true, text: '', chords: line.chords.map((anchor) => ({ ...anchor, position: 0 })) }
    : { ...line, instrumental: false, chords: line.chords.map((anchor) => ({ ...anchor, position: 0 })) };
}

/** Enter in the middle of a line: the words after the caret, and their chords, go to a new line. */
export function splitLine(line: EditorLine, caret: number, makeId: IdFactory = createId): [EditorLine, EditorLine] {
  if (line.instrumental) return [line, createLine(makeId)];
  const at = Math.max(0, Math.min(line.text.length, caret));
  return [
    { ...line, text: line.text.slice(0, at), chords: line.chords.filter((anchor) => anchor.position < at) },
    {
      id: makeId(),
      text: line.text.slice(at),
      instrumental: false,
      chords: line.chords.filter((anchor) => anchor.position >= at).map((anchor) => ({ ...anchor, position: anchor.position - at })),
    },
  ];
}

/** Backspace at the start of a line: it joins the one above, chords included. */
export function mergeLines(first: EditorLine, second: EditorLine): EditorLine {
  if (first.instrumental || second.instrumental) {
    return { ...first, chords: [...first.chords, ...second.chords.map((anchor) => ({ ...anchor, position: 0 }))], instrumental: true, text: '' };
  }
  const offset = first.text.length;
  return {
    ...first,
    text: first.text + second.text,
    chords: sortAnchors([...first.chords, ...second.chords.map((anchor) => ({ ...anchor, position: anchor.position + offset }))]),
  };
}

/**
 * A line written in the songbook's notation ("[G]Señor, [D/F#]quiero"), read
 * by the app's own line parser: pasting a chord sheet keeps its chords.
 */
export function lineFromNotation(raw: string, makeId: IdFactory = createId): EditorLine {
  const trimmedEnd = raw.replace(/\s+$/, '');
  if (!trimmedEnd.includes('[')) return createLine(makeId, cleanLyricText(trimmedEnd));
  const segments = parseBracketLine(trimmedEnd.normalize('NFC'));
  const chordOnly = segments.some((segment) => segment.chord) && segments.every((segment) => !segment.lyric.trim());
  if (chordOnly) {
    return {
      id: makeId(),
      text: '',
      instrumental: true,
      chords: segments.filter((segment) => segment.chord).map((segment) => ({ id: makeId(), chord: segment.chord as string, position: 0 })),
    };
  }
  let text = '';
  const chords: ChordAnchor[] = [];
  for (const segment of segments) {
    if (segment.chord) chords.push({ id: makeId(), chord: segment.chord, position: text.length });
    text += segment.lyric;
  }
  // Brackets that weren't chords stay as the words they are, without breaking the notation.
  return { id: makeId(), text: cleanLyricText(text), chords, instrumental: false };
}

/** One line in the songbook's notation. */
export function lineToNotation(line: EditorLine): string {
  if (line.instrumental) return line.chords.map((anchor) => `[${cleanChordText(anchor.chord)}]`).join('  ');
  let result = '';
  let cursor = 0;
  for (const anchor of sortAnchors(line.chords)) {
    const chord = cleanChordText(anchor.chord);
    if (!chord) continue;
    const at = Math.max(cursor, Math.min(line.text.length, anchor.position));
    result += line.text.slice(cursor, at) + `[${chord}]`;
    cursor = at;
  }
  return (result + line.text.slice(cursor)).replace(/\s+$/, '');
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export function updateSection(doc: EditorDocument, sectionId: string, change: (section: EditorSection) => EditorSection): EditorDocument {
  return { ...doc, sections: doc.sections.map((section) => (section.id === sectionId ? change(section) : section)) };
}

export function addSection(doc: EditorDocument, label: string, makeId: IdFactory = createId, atIndex = doc.sections.length): EditorDocument {
  const sections = [...doc.sections];
  sections.splice(atIndex, 0, createSection(label, makeId));
  return { ...doc, sections };
}

/** An independent copy, right after the original: new ids, same words and chords. */
export function duplicateSection(doc: EditorDocument, sectionId: string, makeId: IdFactory = createId): EditorDocument {
  const index = doc.sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return doc;
  const source = doc.sections[index];
  const copy: EditorSection = {
    id: makeId(),
    label: source.label,
    repeatOf: source.repeatOf,
    lines: source.lines.map((line) => ({ ...line, id: makeId(), chords: line.chords.map((anchor) => ({ ...anchor, id: makeId() })) })),
  };
  const sections = [...doc.sections];
  sections.splice(index + 1, 0, copy);
  return { ...doc, sections };
}

/** A later appearance of an earlier section ("Coro" again), placed at the end or at a given index. */
export function repeatSection(doc: EditorDocument, targetId: string, makeId: IdFactory = createId, atIndex = doc.sections.length): EditorDocument {
  const target = doc.sections.find((section) => section.id === targetId);
  if (!target || target.repeatOf) return doc;
  const sections = [...doc.sections];
  sections.splice(atIndex, 0, { id: makeId(), label: target.label, repeatOf: target.id, lines: [] });
  return { ...doc, sections };
}

/** Removing a section also removes the appearances that repeat it: they would have nothing to repeat. */
export function removeSection(doc: EditorDocument, sectionId: string): EditorDocument {
  return { ...doc, sections: doc.sections.filter((section) => section.id !== sectionId && section.repeatOf !== sectionId) };
}

export function repeatsOf(doc: EditorDocument, sectionId: string): EditorSection[] {
  return doc.sections.filter((section) => section.repeatOf === sectionId);
}

export function moveSection(doc: EditorDocument, sectionId: string, toIndex: number): EditorDocument {
  const from = doc.sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return doc;
  const sections = [...doc.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(Math.max(0, Math.min(sections.length, toIndex)), 0, moved);
  return { ...doc, sections };
}

export function moveSectionBy(doc: EditorDocument, sectionId: string, delta: number): EditorDocument {
  const from = doc.sections.findIndex((section) => section.id === sectionId);
  return from < 0 ? doc : moveSection(doc, sectionId, from + delta);
}

/** The label shown and written for a section; a repeat always carries its target's current name. */
export function effectiveLabel(doc: EditorDocument, section: EditorSection): string {
  if (!section.repeatOf) return section.label.trim();
  return doc.sections.find((entry) => entry.id === section.repeatOf)?.label.trim() ?? section.label.trim();
}

// ---------------------------------------------------------------------------
// To and from the songbook's notation
// ---------------------------------------------------------------------------

/** The song text, as the whole app reads it. */
export function editorToContent(doc: EditorDocument): string {
  const blocks = doc.sections.map((section) => {
    const label = effectiveLabel(doc, section);
    if (section.repeatOf) return repeatHeader(label);
    const header = label ? `[${label}]` : '';
    const lines = section.lines.map(lineToNotation);
    while (lines.length > 0 && !lines[lines.length - 1].trim()) lines.pop();
    while (lines.length > 0 && !lines[0].trim()) lines.shift();
    return [header, ...lines].filter((line, index) => index > 0 || line !== '').join('\n');
  });
  return blocks.filter((block) => block.trim()).join('\n\n');
}

/**
 * A repeat is written the way the songbook writes one: the section's name on
 * its own ("Coro"), a cue that covers nothing, so any words after it start a
 * section of their own. Names the parser wouldn't read bare (a custom name, a
 * name with a note) are bracketed instead.
 */
function repeatHeader(label: string): string {
  if (!label) return '';
  return parseSectionHeader(label)?.form === 'cue' ? label : `[${label}]`;
}

/** The draft that is validated, previewed and sent. */
export function editorToSongDraft(doc: EditorDocument): SongDraft {
  const content = editorToContent(doc);
  return { ...doc.meta, schemaVersion: SONG_DRAFT_SCHEMA_VERSION, content, chordsUsed: extractUniqueChords(content) };
}

/**
 * Song text into the editor, read by the app's parser. Used to reopen a text
 * and by the tests that prove the editor writes what the parser reads.
 */
export function contentToEditor(content: string, meta: SongMeta = emptySongMeta(), makeId: IdFactory = createId): EditorDocument {
  const parsed = parseSongSections(content.replace(/\r\n?/g, '\n'));
  const ids = new Map<string, string>();
  const sections = parsed.map((section): EditorSection => {
    const id = makeId();
    ids.set(section.id, id);
    const label = section.header?.label ?? '';
    const fullLabel = section.header ? rebuildLabel(section.header) : label;
    if (section.repeatOf) return { id, label: fullLabel, repeatOf: ids.get(section.repeatOf) ?? null, lines: [] };
    return {
      id,
      label: fullLabel,
      repeatOf: null,
      lines: section.lines.map((line) => {
        if (line.type === 'empty') return createLine(makeId);
        if (line.type === 'comment') return createLine(makeId, cleanLyricText(line.raw));
        if (isChordOnlyLine(line)) {
          return {
            id: makeId(),
            text: '',
            instrumental: true,
            chords: (line.segments ?? []).filter((segment) => segment.chord).map((segment) => ({ id: makeId(), chord: segment.chord as string, position: 0 })),
          };
        }
        return lineFromNotation(line.raw, makeId);
      }),
    };
  });
  return { schemaVersion: EDITOR_SCHEMA_VERSION, meta, sections };
}

/** The header as the author wrote it: name, number, note and repeat mark. */
function rebuildLabel(header: NonNullable<ReturnType<typeof parseSectionHeader>>): string {
  return [header.label, header.note, header.repeat ? `(x${header.repeat})` : ''].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// Checks only the editor can make (the song itself is checked by validateSongDraft)
// ---------------------------------------------------------------------------

export type EditorIssueCode =
  | 'label-required'
  | 'label-is-chord'
  | 'section-empty'
  | 'repeat-before-target'
  | 'repeat-target-missing'
  | 'repeat-unresolved'
  | 'chord-unrecognized'
  | 'line-reads-as-header';

export interface EditorIssue {
  code: EditorIssueCode;
  severity: 'error' | 'warning';
  sectionId: string;
  lineId?: string;
  anchorId?: string;
  message: string;
}

/**
 * Problems tied to a place in the editor. Repeats are verified with the real
 * parser: what the editor means by "repeat Coro" must be what the chord sheet,
 * rehearsal and Mass mode will show.
 */
export function validateEditorDocument(doc: EditorDocument): EditorIssue[] {
  const issues: EditorIssue[] = [];
  const indexOf = new Map(doc.sections.map((section, index) => [section.id, index]));
  const content = editorToContent(doc);
  const parsed = parseSongSections(content);

  // Each editor section is found among the parsed ones by its header, in
  // order, so a lyric line that happens to read as a header can't shift them.
  const normalize = (label: string) => label.trim().replace(/\s+/g, ' ').toLowerCase();
  const parsedIdByEditorId = new Map<string, string>();
  let cursor = 0;
  for (const section of doc.sections) {
    const label = normalize(effectiveLabel(doc, section));
    if (!label) continue;
    while (cursor < parsed.length) {
      const candidate = parsed[cursor++];
      // Content sections are written bracketed and repeats as cues; a lyric line
      // that happens to read as a header is skipped by requiring that form.
      const expected = section.repeatOf ? parseSectionHeader(repeatHeader(effectiveLabel(doc, section)))?.form : 'bracket';
      if (candidate.header && candidate.header.form === expected && normalize(rebuildLabel(candidate.header)) === label) {
        parsedIdByEditorId.set(section.id, candidate.id);
        break;
      }
    }
  }

  doc.sections.forEach((section, index) => {
    const label = effectiveLabel(doc, section);
    if (section.repeatOf) {
      const targetIndex = indexOf.get(section.repeatOf);
      if (targetIndex === undefined) {
        issues.push({ code: 'repeat-target-missing', severity: 'error', sectionId: section.id, message: 'La sección que se repetía ya no existe.' });
        return;
      }
      if (targetIndex > index) {
        issues.push({ code: 'repeat-before-target', severity: 'error', sectionId: section.id, message: `La repetición de «${label}» tiene que ir después de la sección original.` });
        return;
      }
      const parsedSelf = parsed.find((entry) => entry.id === parsedIdByEditorId.get(section.id));
      if (!parsedSelf || parsedSelf.repeatOf !== parsedIdByEditorId.get(section.repeatOf)) {
        issues.push({
          code: 'repeat-unresolved',
          severity: 'error',
          sectionId: section.id,
          message: `No se puede saber qué «${label}» se repite. Usa un nombre único para la sección original (por ejemplo «Coro» y «Coro 2»).`,
        });
      }
      return;
    }

    if (!label && index > 0) {
      issues.push({ code: 'label-required', severity: 'error', sectionId: section.id, message: 'Ponle nombre a esta sección.' });
    } else if (label && isChordSymbol(label)) {
      issues.push({ code: 'label-is-chord', severity: 'error', sectionId: section.id, message: `«${label}» se leería como un acorde. Elige otro nombre.` });
    }
    if (!section.lines.some((line) => lineToNotation(line).trim())) {
      issues.push({
        code: 'section-empty',
        severity: 'error',
        sectionId: section.id,
        message: `«${label || 'Sección'}» está vacía. Escribe su letra o conviértela en una repetición.`,
      });
    }
    for (const line of section.lines) {
      for (const anchor of line.chords) {
        if (!isRecognizedChord(anchor.chord)) {
          issues.push({
            code: 'chord-unrecognized',
            severity: 'warning',
            sectionId: section.id,
            lineId: line.id,
            anchorId: anchor.id,
            message: `«${anchor.chord}» no se reconoce como acorde: se mostrará como texto.`,
          });
        }
      }
      if (!line.instrumental && line.chords.length === 0 && parseSectionHeader(line.text)) {
        issues.push({
          code: 'line-reads-as-header',
          severity: 'warning',
          sectionId: section.id,
          lineId: line.id,
          message: `La línea «${line.text.trim()}» se leerá como el nombre de una sección, no como letra.`,
        });
      }
    }
  });
  return issues;
}

// ---------------------------------------------------------------------------
// Reading a stored document back (local drafts)
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** A document from untrusted JSON; broken parts are dropped, never guessed. Null if it isn't one. */
export function parseEditorDocument(value: unknown, makeId: IdFactory = createId): EditorDocument | null {
  if (!isRecord(value) || value.schemaVersion !== EDITOR_SCHEMA_VERSION || !Array.isArray(value.sections) || !isRecord(value.meta)) {
    return null;
  }
  const metaDraft = { ...value.meta, schemaVersion: SONG_DRAFT_SCHEMA_VERSION, content: '', chordsUsed: [] };
  // Reuse the draft reader for the metadata: same checks as a submission.
  const parsedMeta = parseMeta(metaDraft);
  if (!parsedMeta) return null;
  const text = (entry: unknown) => (typeof entry === 'string' ? entry : '');
  const sections = value.sections.filter(isRecord).map((section): EditorSection => ({
    id: text(section.id) || makeId(),
    label: text(section.label),
    repeatOf: typeof section.repeatOf === 'string' ? section.repeatOf : null,
    lines: (Array.isArray(section.lines) ? section.lines : []).filter(isRecord).map((line) => {
      const lineText = cleanLyricText(text(line.text));
      return {
        id: text(line.id) || makeId(),
        text: lineText,
        instrumental: line.instrumental === true,
        chords: sortAnchors(
          (Array.isArray(line.chords) ? line.chords : []).filter(isRecord).flatMap((anchor) => {
            const chord = cleanChordText(text(anchor.chord));
            const position = typeof anchor.position === 'number' && Number.isFinite(anchor.position) ? Math.round(anchor.position) : 0;
            return chord ? [{ id: text(anchor.id) || makeId(), chord, position: Math.max(0, Math.min(lineText.length, position)) }] : [];
          })
        ),
      };
    }),
  }));
  const known = new Set(sections.map((section) => section.id));
  return {
    schemaVersion: EDITOR_SCHEMA_VERSION,
    meta: parsedMeta,
    sections: sections.map((section) => (section.repeatOf && !known.has(section.repeatOf) ? { ...section, repeatOf: null } : section)),
  };
}

function parseMeta(value: Record<string, unknown>): SongMeta | null {
  const draft = parseSongDraft(value);
  if (!draft) return null;
  const { content: _content, chordsUsed: _chords, ...meta } = draft;
  return meta;
}

/** True when the song has anything worth keeping as a draft. */
export function hasEditorContent(doc: EditorDocument): boolean {
  return Boolean(doc.meta.title.trim()) || doc.sections.some((section) => section.lines.some((line) => line.text.trim() || line.chords.length > 0));
}

/**
 * Pasting into a line, at a selection: one pasted line is merged in place;
 * several become several lines, the first joined to the words before the
 * selection and the last to the words after it. Pasted text in the
 * songbook's notation keeps its chords.
 */
export function pasteIntoLine(line: EditorLine, start: number, end: number, rawLines: string[], makeId: IdFactory = createId): EditorLine[] {
  const pasted = (rawLines.length > 0 ? rawLines : ['']).map((raw) => lineFromNotation(raw, makeId));
  if (line.instrumental) return [line, ...pasted];
  const from = Math.max(0, Math.min(line.text.length, start));
  const to = Math.max(from, Math.min(line.text.length, end));
  const before: EditorLine = { ...line, text: line.text.slice(0, from), chords: line.chords.filter((anchor) => anchor.position < from) };
  const after: EditorLine = {
    id: makeId(),
    text: line.text.slice(to),
    instrumental: false,
    chords: line.chords.filter((anchor) => anchor.position >= to).map((anchor) => ({ ...anchor, position: anchor.position - to })),
  };
  const keep = (entry: EditorLine) => entry.text.length > 0 || entry.chords.length > 0;
  const lines = [...pasted];
  // A chords-only line can't absorb words: the words around it stay lines of their own.
  const head: EditorLine[] = [];
  const tail: EditorLine[] = [];
  if (lines[0].instrumental) {
    if (keep(before)) head.push(before);
  } else {
    lines[0] = mergeLines(before, lines[0]);
  }
  const last = lines.length - 1;
  if (lines[last].instrumental) {
    if (keep(after)) tail.push(after);
  } else {
    lines[last] = mergeLines(lines[last], after);
  }
  // The line being edited keeps its identity (and so its focus).
  const result = [...head, ...lines, ...tail];
  result[0] = { ...result[0], id: line.id };
  return result;
}
