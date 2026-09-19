import type { LiturgicalSeasonId } from '../data/liturgicalSeasons';
import type { SectionKind, Song } from '../types/song';
import { extractUniqueChords, parseSongSections } from '../utils/chordParser';
import { isLiturgicalSeasonId } from '../utils/liturgicalSeasons';

/**
 * The canonical, serializable form of a song: what an editor edits, what a
 * submission carries, and what a published version stores.
 *
 * It is the Song itself minus its id, with every optional field made explicit
 * (null instead of missing), so it survives JSON and a database exactly.
 * The music stays in `content`, the bracket notation the whole app already
 * reads: the parser, the transposer, the chord sheet, repeated sections and
 * arrangements all derive from that text. Keeping it whole is what makes
 * Song → Draft → Submission → Song lossless; splitting it into rows would add
 * a second, lossy source of truth.
 */

export const SONG_DRAFT_SCHEMA_VERSION = 1;

export type SongDifficulty = NonNullable<Song['difficulty']>;
export const SONG_DIFFICULTIES: SongDifficulty[] = ['Fácil', 'Intermedio', 'Avanzado'];

export interface SongDraft {
  schemaVersion: typeof SONG_DRAFT_SCHEMA_VERSION;
  title: string;
  artist: string | null;
  originalKey: string | null;
  recommendedCapo: number | null;
  timeSignature: string | null;
  tempo: number | null;
  rhythmPattern: string | null;
  categories: string[];
  /** Null means "not classified yet", which is not the same as an empty list */
  liturgicalSeasons: LiturgicalSeasonId[] | null;
  tags: string[];
  /** Lyrics and chords in bracket notation, exactly as written */
  content: string;
  chordsUsed: string[];
  difficulty: SongDifficulty | null;
  year: string | null;
  youtubeId: string | null;
}

export function emptySongDraft(): SongDraft {
  return {
    schemaVersion: SONG_DRAFT_SCHEMA_VERSION,
    title: '',
    artist: null,
    originalKey: null,
    recommendedCapo: null,
    timeSignature: null,
    tempo: null,
    rhythmPattern: null,
    categories: [],
    liturgicalSeasons: null,
    tags: [],
    content: '',
    chordsUsed: [],
    difficulty: null,
    year: null,
    youtubeId: null,
  };
}

/** A published song as a draft: the starting point of a correction. Nothing is lost or reformatted. */
export function songToDraft(song: Song): SongDraft {
  return {
    schemaVersion: SONG_DRAFT_SCHEMA_VERSION,
    title: song.title,
    artist: song.artist ?? null,
    originalKey: song.originalKey ?? null,
    recommendedCapo: song.recommendedCapo ?? null,
    timeSignature: song.timeSignature ?? null,
    tempo: song.tempo ?? null,
    rhythmPattern: song.rhythmPattern ?? null,
    categories: [...song.categories],
    liturgicalSeasons: song.liturgicalSeasons ? [...song.liturgicalSeasons] : null,
    tags: [...song.tags],
    content: song.content,
    chordsUsed: [...song.chordsUsed],
    difficulty: song.difficulty ?? null,
    year: song.year ?? null,
    youtubeId: song.youtubeId ?? null,
  };
}

/** The draft as a Song again, with the id it is (or will be) published under. */
export function draftToSong(draft: SongDraft, id: string): Song {
  const song: Song = {
    id,
    title: draft.title,
    categories: [...draft.categories],
    tags: [...draft.tags],
    content: draft.content,
    chordsUsed: [...draft.chordsUsed],
  };
  // Optional fields only when present, exactly like the bundled catalog writes them.
  if (draft.artist !== null) song.artist = draft.artist;
  if (draft.originalKey !== null) song.originalKey = draft.originalKey;
  if (draft.recommendedCapo !== null) song.recommendedCapo = draft.recommendedCapo;
  if (draft.timeSignature !== null) song.timeSignature = draft.timeSignature;
  if (draft.tempo !== null) song.tempo = draft.tempo;
  if (draft.rhythmPattern !== null) song.rhythmPattern = draft.rhythmPattern;
  if (draft.liturgicalSeasons !== null) song.liturgicalSeasons = [...draft.liturgicalSeasons];
  if (draft.difficulty !== null) song.difficulty = draft.difficulty;
  if (draft.year !== null) song.year = draft.year;
  if (draft.youtubeId !== null) song.youtubeId = draft.youtubeId;
  return reorderLikeCatalog(song);
}

/** Same key order as the bundled catalog, so a round trip is identical even when printed. */
function reorderLikeCatalog(song: Song): Song {
  const order: Array<keyof Song> = [
    'id',
    'title',
    'artist',
    'youtubeId',
    'originalKey',
    'recommendedCapo',
    'timeSignature',
    'tempo',
    'rhythmPattern',
    'categories',
    'liturgicalSeasons',
    'tags',
    'chordsUsed',
    'difficulty',
    'year',
    'content',
  ];
  return Object.fromEntries(order.filter((key) => key in song).map((key) => [key, song[key]])) as unknown as Song;
}

/** The chords a content uses, as the catalog lists them: for a new song, derived rather than typed. */
export function withDerivedChords(draft: SongDraft): SongDraft {
  return { ...draft, chordsUsed: extractUniqueChords(draft.content) };
}

// ---------------------------------------------------------------------------
// Reading a draft back from JSON (local storage, a submission, a version)
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const stringOrNull = (value: unknown) => (typeof value === 'string' ? value : null);
const numberOrNull = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []);

/**
 * A draft from untrusted JSON, or null when it isn't one. Types are checked
 * and wrong ones dropped; valid values are kept exactly as they are (nothing
 * is trimmed or reformatted here: that is validation's job, which reports
 * instead of silently changing).
 */
export function parseSongDraft(value: unknown): SongDraft | null {
  if (!isRecord(value) || value.schemaVersion !== SONG_DRAFT_SCHEMA_VERSION) return null;
  if (typeof value.title !== 'string' || typeof value.content !== 'string') return null;
  const difficulty = SONG_DIFFICULTIES.includes(value.difficulty as SongDifficulty) ? (value.difficulty as SongDifficulty) : null;
  return {
    schemaVersion: SONG_DRAFT_SCHEMA_VERSION,
    title: value.title,
    artist: stringOrNull(value.artist),
    originalKey: stringOrNull(value.originalKey),
    recommendedCapo: numberOrNull(value.recommendedCapo),
    timeSignature: stringOrNull(value.timeSignature),
    tempo: numberOrNull(value.tempo),
    rhythmPattern: stringOrNull(value.rhythmPattern),
    categories: strings(value.categories),
    liturgicalSeasons: Array.isArray(value.liturgicalSeasons) ? value.liturgicalSeasons.filter(isLiturgicalSeasonId) : null,
    tags: strings(value.tags),
    content: value.content,
    chordsUsed: strings(value.chordsUsed),
    difficulty,
    year: stringOrNull(value.year),
    youtubeId: stringOrNull(value.youtubeId),
  };
}

// ---------------------------------------------------------------------------
// A form to compare two versions (the diff of phase 6C builds on this)
// ---------------------------------------------------------------------------

export interface ComparableChord {
  /** Position in the line's text (without chords) where the chord sits */
  at: number;
  chord: string;
}

export interface ComparableLine {
  kind: 'lyrics' | 'comment';
  /** The words, without chords */
  text: string;
  chords: ComparableChord[];
}

export interface ComparableSection {
  /** "Coro#2": the header's name and which appearance of that name it is, stable across edits elsewhere */
  key: string;
  label: string;
  kind: SectionKind | null;
  /** For a bare cue ("Coro") that repeats an earlier section: the key of that section, and no lines of its own */
  repeats: string | null;
  lines: ComparableLine[];
}

export type ComparableMetadata = Record<Exclude<keyof SongDraft, 'content' | 'schemaVersion'>, string>;

export interface ComparableSong {
  metadata: ComparableMetadata;
  sections: ComparableSection[];
}

/** Metadata as plain strings, so any two values compare with ===. */
function comparableMetadata(draft: SongDraft): ComparableMetadata {
  const value = (entry: unknown) => (entry === null ? '' : Array.isArray(entry) ? entry.join(' | ') : String(entry));
  return {
    title: value(draft.title),
    artist: value(draft.artist),
    originalKey: value(draft.originalKey),
    recommendedCapo: value(draft.recommendedCapo),
    timeSignature: value(draft.timeSignature),
    tempo: value(draft.tempo),
    rhythmPattern: value(draft.rhythmPattern),
    categories: value(draft.categories),
    liturgicalSeasons: value(draft.liturgicalSeasons),
    tags: value(draft.tags),
    chordsUsed: value(draft.chordsUsed),
    difficulty: value(draft.difficulty),
    year: value(draft.year),
    youtubeId: value(draft.youtubeId),
  };
}

/**
 * The song as sections of lines with their chords placed on the words, built
 * with the same parser the chord sheet uses. Two versions in this form can be
 * compared line by line: a changed chord, a changed word, a section added,
 * removed or moved.
 */
export function toComparableSong(draft: SongDraft): ComparableSong {
  const sections = parseSongSections(draft.content.replace(/\r\n?/g, '\n'));
  const seen = new Map<string, number>();
  const keys = new Map<string, string>();
  const comparable = sections.map((section): ComparableSection => {
    const label = section.header?.label ?? '';
    const count = (seen.get(label) ?? 0) + 1;
    seen.set(label, count);
    const key = `${label}#${count}`;
    keys.set(section.id, key);
    const repeats = section.repeatOf ? keys.get(section.repeatOf) ?? null : null;
    return {
      key,
      label,
      kind: section.header?.kind ?? null,
      repeats,
      lines: repeats
        ? []
        : section.lines.flatMap((line): ComparableLine[] => {
            if (line.type === 'comment') return [{ kind: 'comment', text: line.raw, chords: [] }];
            if (line.type !== 'chords-lyrics') return [];
            let text = '';
            const chords: ComparableChord[] = [];
            for (const segment of line.segments ?? []) {
              if (segment.chord) chords.push({ at: text.length, chord: segment.chord });
              text += segment.lyric;
            }
            return [{ kind: 'lyrics', text: text.trimEnd(), chords }];
          }),
    };
  });
  return { metadata: comparableMetadata(draft), sections: comparable };
}

export interface SongChangeSummary {
  metadata: Array<keyof ComparableMetadata>;
  sectionsAdded: string[];
  sectionsRemoved: string[];
  /** Sections present in both whose words changed */
  lyricsChanged: string[];
  /** Sections present in both whose chords changed (words may be the same) */
  chordsChanged: string[];
  /** The sections both versions share are in a different order */
  orderChanged: boolean;
}

/** What changed between two versions, section by section. Only a summary: the detailed view is phase 6C. */
export function summarizeSongChanges(current: SongDraft, proposed: SongDraft): SongChangeSummary {
  const before = toComparableSong(current);
  const after = toComparableSong(proposed);
  const metadata = (Object.keys(before.metadata) as Array<keyof ComparableMetadata>).filter(
    (field) => before.metadata[field] !== after.metadata[field]
  );
  const beforeByKey = new Map(before.sections.map((section) => [section.key, section]));
  const afterByKey = new Map(after.sections.map((section) => [section.key, section]));
  const shared = before.sections.filter((section) => afterByKey.has(section.key)).map((section) => section.key);
  const sharedAfter = after.sections.filter((section) => beforeByKey.has(section.key)).map((section) => section.key);
  const lyricsChanged: string[] = [];
  const chordsChanged: string[] = [];
  for (const key of shared) {
    const a = beforeByKey.get(key) as ComparableSection;
    const b = afterByKey.get(key) as ComparableSection;
    if (JSON.stringify(a.lines.map((line) => line.text)) !== JSON.stringify(b.lines.map((line) => line.text)) || a.repeats !== b.repeats) {
      lyricsChanged.push(key);
    }
    if (JSON.stringify(a.lines.map((line) => line.chords)) !== JSON.stringify(b.lines.map((line) => line.chords))) {
      chordsChanged.push(key);
    }
  }
  return {
    metadata,
    sectionsAdded: after.sections.filter((section) => !beforeByKey.has(section.key)).map((section) => section.key),
    sectionsRemoved: before.sections.filter((section) => !afterByKey.has(section.key)).map((section) => section.key),
    lyricsChanged,
    chordsChanged,
    orderChanged: shared.join('\n') !== sharedAfter.join('\n'),
  };
}
