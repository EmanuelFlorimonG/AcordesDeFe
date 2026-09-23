import type { SectionKind, SongSection } from '../types/song';
import type {
  ArrangementSection,
  ArrangementTransition,
  SetlistArrangement,
  VoiceRole,
} from '../types/setlist';
import { createId, type IdFactory } from './createId';
import { getSectionShortLabel } from './songSections';
import { CHOIR_PART_NAMES } from './voiceParts';

/**
 * Musical arrangements, as pure data.
 *
 * A song in the songbook is the version as it was written. An arrangement is
 * how it will be played on one occasion: in what order the sections come, how
 * many times each one is sung, who sings it, what the musicians should
 * remember and where to go afterwards. It lives on the setlist entry and only
 * ever *refers* to the song's sections, so editing an arrangement can never
 * change a song, and the same song can be arranged differently in every
 * setlist.
 *
 * Nothing here executes anything: a jump is an instruction for the musicians,
 * written down, never a player that moves the screen on its own.
 */

export const MIN_REPEAT_COUNT = 1;
export const MAX_REPEAT_COUNT = 4;
export const MAX_INSTRUCTION_LENGTH = 120;
/** A guard against hand-edited or corrupt data, never a limit anyone will hit. */
export const MAX_ARRANGEMENT_SECTIONS = 80;

/** The name shown for a block of lines the author left untitled. */
export const UNTITLED_SECTION_LABEL = 'Sin título';

export const VOICE_ROLES: VoiceRole[] = [
  'all',
  'men',
  'women',
  'soloist',
  'choir',
  'soprano',
  'alto',
  'tenor',
  'bass',
];

/** Offered first: what a parish choir uses every Sunday. */
export const PRIMARY_VOICE_ROLES: VoiceRole[] = ['all', 'men', 'women', 'soloist', 'choir'];

/** Behind "Más voces": the four parts, for choirs that sing in harmony. */
export const ADVANCED_VOICE_ROLES: VoiceRole[] = ['soprano', 'alto', 'tenor', 'bass'];

export const VOICE_LABELS: Record<VoiceRole, string> = {
  all: 'Todos',
  men: 'Hombres',
  women: 'Mujeres',
  soloist: 'Solista',
  choir: 'Coro',
  soprano: CHOIR_PART_NAMES.soprano.plural,
  alto: CHOIR_PART_NAMES.alto.plural,
  tenor: CHOIR_PART_NAMES.tenor.plural,
  bass: CHOIR_PART_NAMES.bass.plural,
};

const VOICE_ORDER = new Map(VOICE_ROLES.map((role, index) => [role, index]));

export function isVoiceRole(value: unknown): value is VoiceRole {
  return typeof value === 'string' && VOICE_ORDER.has(value as VoiceRole);
}

/** Only real roles, each one once, always in the same order. */
export function normalizeVoices(value: unknown): VoiceRole[] {
  if (!Array.isArray(value)) return [];
  const roles = new Set<VoiceRole>();
  for (const entry of value) if (isVoiceRole(entry)) roles.add(entry);
  return [...roles].sort((a, b) => (VOICE_ORDER.get(a) ?? 0) - (VOICE_ORDER.get(b) ?? 0));
}

/** "Todos y Mujeres" reads badly; "Todos · Mujeres" is what a musician scans. */
export function formatVoices(voices: VoiceRole[]): string {
  return voices.map((role) => VOICE_LABELS[role]).join(' · ');
}

export function clampRepeatCount(value: unknown): number {
  const count =
    typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : MIN_REPEAT_COUNT;
  return Math.min(Math.max(count, MIN_REPEAT_COUNT), MAX_REPEAT_COUNT);
}

export function cleanInstruction(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_INSTRUCTION_LENGTH) : '';
}

// ---------------------------------------------------------------------------
// The sections of a song, as an arrangement sees them
// ---------------------------------------------------------------------------

/** True for a section that puts something on the page. */
function hasContent(section: SongSection): boolean {
  return section.lines.some((line) => line.type !== 'empty');
}

export function sectionLabel(section: SongSection): string {
  return section.header?.label.trim() || UNTITLED_SECTION_LABEL;
}

/** The compact name used in the section navigator: "V1", "Coro", "Pre-coro". */
export function sectionShortLabel(section: SongSection | null, fallback: string): string {
  return section?.header ? getSectionShortLabel(section.header) : fallback;
}

export interface ArrangementSource {
  /** Id of the section in the song text that holds the lines to sing */
  sectionId: string;
  label: string;
  kind: SectionKind | null;
  /** What this section says, to recognise it again in another version (see sectionSignature) */
  signature: string;
}

/**
 * What a section is, written down: its name and the lines it puts on the
 * page, with their chords, exactly as the song has them. It is not its
 * position and it is not only its name, so it can be looked for again in
 * another version of the song without guessing: two sections match only when
 * they say the same thing.
 *
 * A bare "Coro" that repeats the chorus is the chorus: it signs as the
 * section it repeats.
 */
export function sectionSignature(section: SongSection, sections: SongSection[]): string {
  const played = section.repeatOf ? sections.find((entry) => entry.id === section.repeatOf) ?? section : section;
  return JSON.stringify([
    sectionLabel(played),
    played.header?.kind ?? null,
    played.lines.filter((line) => line.type !== 'empty').map((line) => line.raw.trimEnd()),
  ]);
}

/**
 * The sections a song offers to an arrangement, in the order they are written.
 *
 * A bare "Coro" written after the chorus (a cue) is not offered again: it is
 * the same section, and adding it once more is what repeating an entry means.
 */
export function listArrangementSources(sections: SongSection[]): ArrangementSource[] {
  return sections
    .filter((section) => !section.repeatOf && (section.header !== null || hasContent(section)))
    .map((section) => ({
      sectionId: section.id,
      label: sectionLabel(section),
      kind: section.header?.kind ?? null,
      signature: sectionSignature(section, sections),
    }));
}

function newSection(source: ArrangementSource, makeId: IdFactory, songVersion?: number): ArrangementSection {
  return {
    id: makeId(),
    sourceSectionId: source.sectionId,
    // Chosen from the song as it is now: that is what this block plays.
    ...(songVersion === undefined ? {} : { source: { signature: source.signature, version: songVersion } }),
    label: source.label,
    repeatCount: MIN_REPEAT_COUNT,
    voices: [],
    assignedMemberIds: [],
    instruction: '',
    transition: { type: 'continue' },
  };
}

/**
 * The arrangement a song starts from: its own structure, in its own order,
 * sung once, by everybody, with nothing added. Every appearance of a section
 * is its own entry pointing at its own place in the song — a chorus written
 * once and then called again with a bare "Coro" is two entries, and the
 * second one already carries the chorus's words.
 */
export function createArrangement(
  sections: SongSection[],
  makeId: IdFactory = createId,
  songVersion?: number
): SetlistArrangement {
  const entries: ArrangementSection[] = [];
  for (const section of sections) {
    if (section.header === null && !hasContent(section)) continue;
    entries.push(
      newSection(
        { sectionId: section.id, label: sectionLabel(section), kind: null, signature: sectionSignature(section, sections) },
        makeId,
        songVersion
      )
    );
  }
  return { sections: entries, ...(songVersion === undefined ? {} : { songVersion }) };
}

/**
 * True when an arrangement is still the song's own structure: same sections,
 * same order, nothing repeated, no voices, no instructions, no jumps. Ids are
 * not compared, only what is actually played.
 */
export function matchesSongStructure(
  sections: SongSection[],
  arrangement: SetlistArrangement | undefined
): boolean {
  if (!arrangement) return true;
  let index = 0;
  const original = createArrangement(sections, () => `check-${index++}`);
  if (original.sections.length !== arrangement.sections.length) return false;
  // A repeated chorus can be referred to by its own place or by the chorus it
  // repeats (arrangements saved before repeats carried their words did that):
  // both play the same lines, so both count as the original.
  const canonical = new Map(sections.map((section) => [section.id, section.repeatOf ?? section.id]));
  const same = (a: string, b: string) => (canonical.get(a) ?? a) === (canonical.get(b) ?? b);
  return arrangement.sections.every((entry, position) => {
    const source = original.sections[position];
    return (
      same(entry.sourceSectionId, source.sourceSectionId) &&
      entry.repeatCount === MIN_REPEAT_COUNT &&
      entry.voices.length === 0 &&
      (entry.assignedMemberIds ?? []).length === 0 &&
      entry.instruction === '' &&
      entry.transition.type === 'continue'
    );
  });
}

// ---------------------------------------------------------------------------
// Editing an arrangement (every function returns a new arrangement)
// ---------------------------------------------------------------------------

/** Turns jumps that point at a section that is no longer there into "continue". */
function withoutBrokenJumps(sections: ArrangementSection[]): ArrangementSection[] {
  const ids = new Set(sections.map((section) => section.id));
  return sections.map((section) =>
    section.transition.type === 'jump' &&
    (!ids.has(section.transition.targetId) || section.transition.targetId === section.id)
      ? { ...section, transition: { type: 'continue' as const } }
      : section
  );
}

export function moveArrangementSection(
  arrangement: SetlistArrangement,
  id: string,
  toIndex: number
): SetlistArrangement {
  const from = arrangement.sections.findIndex((section) => section.id === id);
  if (from < 0) return arrangement;
  const target = Math.max(0, Math.min(arrangement.sections.length - 1, Math.round(toIndex)));
  if (target === from) return arrangement;
  const sections = [...arrangement.sections];
  const [moved] = sections.splice(from, 1);
  sections.splice(target, 0, moved);
  return { ...arrangement, sections };
}

export function moveArrangementSectionBy(
  arrangement: SetlistArrangement,
  id: string,
  delta: number
): SetlistArrangement {
  const from = arrangement.sections.findIndex((section) => section.id === id);
  return from < 0 ? arrangement : moveArrangementSection(arrangement, id, from + delta);
}

/**
 * A second, independent appearance of the same section, right after this one:
 * "Coro (todos)" and then "Coro (mujeres)" are two entries, not one sung twice.
 */
export function duplicateArrangementSection(
  arrangement: SetlistArrangement,
  id: string,
  makeId: IdFactory = createId
): SetlistArrangement {
  const index = arrangement.sections.findIndex((section) => section.id === id);
  if (index < 0 || arrangement.sections.length >= MAX_ARRANGEMENT_SECTIONS) return arrangement;
  const source = arrangement.sections[index];
  const copy: ArrangementSection = {
    ...source,
    id: makeId(),
    voices: [...source.voices],
    assignedMemberIds: [...(source.assignedMemberIds ?? [])],
    transition: { ...source.transition },
  };
  const sections = [...arrangement.sections];
  sections.splice(index + 1, 0, copy);
  return { ...arrangement, sections };
}

/**
 * Takes a section out of this arrangement. The song keeps it, so it can be
 * added again, and any jump that led here goes back to simply continuing.
 */
export function removeArrangementSection(
  arrangement: SetlistArrangement,
  id: string
): SetlistArrangement {
  if (!arrangement.sections.some((section) => section.id === id)) return arrangement;
  return { ...arrangement, sections: withoutBrokenJumps(arrangement.sections.filter((section) => section.id !== id)) };
}

export function addArrangementSection(
  arrangement: SetlistArrangement,
  source: ArrangementSource,
  makeId: IdFactory = createId,
  songVersion?: number
): SetlistArrangement {
  if (arrangement.sections.length >= MAX_ARRANGEMENT_SECTIONS) return arrangement;
  return { ...arrangement, sections: [...arrangement.sections, newSection(source, makeId, songVersion)] };
}

/** Member ids as stored: real strings, each one once, in the order given. */
export function normalizeMemberIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  for (const entry of value) {
    if (typeof entry === 'string' && entry.trim()) ids.add(entry.trim());
  }
  return [...ids];
}

export interface ArrangementSectionChanges {
  repeatCount?: number;
  voices?: VoiceRole[];
  assignedMemberIds?: string[];
  instruction?: string;
  transition?: ArrangementTransition;
}

export function updateArrangementSection(
  arrangement: SetlistArrangement,
  id: string,
  changes: ArrangementSectionChanges
): SetlistArrangement {
  if (!arrangement.sections.some((section) => section.id === id)) return arrangement;
  const sections = arrangement.sections.map((section) => {
    if (section.id !== id) return section;
    return {
      ...section,
      repeatCount: clampRepeatCount(changes.repeatCount ?? section.repeatCount),
      voices: changes.voices ? normalizeVoices(changes.voices) : section.voices,
      assignedMemberIds: changes.assignedMemberIds
        ? normalizeMemberIds(changes.assignedMemberIds)
        : [...(section.assignedMemberIds ?? [])],
      instruction: cleanInstruction(changes.instruction ?? section.instruction),
      transition: changes.transition ?? section.transition,
    };
  });
  return { ...arrangement, sections: withoutBrokenJumps(sections) };
}

/**
 * A copy of an arrangement with its own ids, used when a setlist or an entry is
 * duplicated. Jumps are re-pointed at the copies, so the copy reads exactly
 * like the original and editing one never touches the other.
 */
export function duplicateArrangement(
  arrangement: SetlistArrangement,
  makeId: IdFactory = createId
): SetlistArrangement {
  const idMap = new Map(arrangement.sections.map((section) => [section.id, makeId()]));
  return {
    sections: arrangement.sections.map((section) => ({
      ...section,
      id: idMap.get(section.id) ?? makeId(),
      voices: [...section.voices],
      assignedMemberIds: [...(section.assignedMemberIds ?? [])],
      transition:
        section.transition.type === 'jump'
          ? { type: 'jump', targetId: idMap.get(section.transition.targetId) ?? '' }
          : { ...section.transition },
    })),
    ...(arrangement.songVersion !== undefined ? { songVersion: arrangement.songVersion } : {}),
  };
}

// ---------------------------------------------------------------------------
// Reading stored data
// ---------------------------------------------------------------------------

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function sanitizeTransition(value: unknown): ArrangementTransition {
  if (!isRecord(value)) return { type: 'continue' };
  if (value.type === 'end') return { type: 'end' };
  if (value.type === 'jump' && typeof value.targetId === 'string' && value.targetId.trim()) {
    return { type: 'jump', targetId: value.targetId.trim() };
  }
  return { type: 'continue' };
}

/**
 * An arrangement from stored data, or undefined when there is nothing usable:
 * a missing or broken arrangement simply means the song is played as written,
 * which is always a valid answer and never an error the user has to see.
 */
export function sanitizeArrangement(
  value: unknown,
  makeId: IdFactory = createId
): SetlistArrangement | undefined {
  if (!isRecord(value) || !Array.isArray(value.sections)) return undefined;

  const seen = new Set<string>();
  const sections: ArrangementSection[] = [];
  for (const entry of value.sections) {
    if (sections.length >= MAX_ARRANGEMENT_SECTIONS) break;
    if (!isRecord(entry)) continue;
    const sourceSectionId =
      typeof entry.sourceSectionId === 'string' ? entry.sourceSectionId.trim() : '';
    if (!sourceSectionId) continue;

    // Two entries sharing an id would be edited together, and a jump could not
    // tell them apart; the second one gets an id of its own.
    const storedId = typeof entry.id === 'string' ? entry.id.trim() : '';
    const id = !storedId || seen.has(storedId) ? makeId() : storedId;
    seen.add(id);

    const evidence =
      isRecord(entry.source) &&
      typeof entry.source.signature === 'string' &&
      Number.isInteger(entry.source.version) &&
      (entry.source.version as number) >= 1
        ? { signature: entry.source.signature, version: entry.source.version as number }
        : undefined;
    sections.push({
      id,
      sourceSectionId,
      ...(evidence ? { source: evidence } : {}),
      ...(entry.needsReview === true ? { needsReview: true as const } : {}),
      label: typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '',
      repeatCount: clampRepeatCount(entry.repeatCount),
      voices: normalizeVoices(entry.voices),
      assignedMemberIds: normalizeMemberIds(entry.assignedMemberIds),
      instruction: cleanInstruction(entry.instruction),
      transition: sanitizeTransition(entry.transition),
    });
  }

  if (sections.length === 0) return undefined;
  const songVersion = Number.isInteger(value.songVersion) && (value.songVersion as number) >= 1 ? (value.songVersion as number) : undefined;
  return { sections: withoutBrokenJumps(sections), ...(songVersion !== undefined ? { songVersion } : {}) };
}

// ---------------------------------------------------------------------------
// An arrangement after the song got a new version
// ---------------------------------------------------------------------------

/** The version an arrangement was made on; arrangements older than versions were made on 1. */
export function arrangementVersionOf(arrangement: SetlistArrangement): number {
  return arrangement.songVersion ?? 1;
}

/**
 * How a stored arrangement reads against the song as it is now:
 *
 *   none      no arrangement: the song is played as written
 *   current   made on this version of the song: used as it is
 *   rebound   made on another version, and every block was found again
 *             without any doubt: used with the blocks pointing at their
 *             sections in this version (stored only when the arrangement is
 *             saved again, never behind anyone's back)
 *   pending   made on another version, and at least one block can't be told
 *             for sure: the arrangement is NOT played (the song is played as
 *             written) until someone reviews it
 */
export type ArrangementBinding =
  | { state: 'none' }
  | { state: 'current'; arrangement: SetlistArrangement }
  | { state: 'rebound'; arrangement: SetlistArrangement }
  | {
      state: 'pending';
      /** The blocks that were found, re-pointed; the pending ones still point where they did */
      arrangement: SetlistArrangement;
      /** Ids of the blocks that need someone to choose their section */
      pendingIds: string[];
    };

/**
 * Re-points the blocks of an arrangement made on another version of the song.
 *
 * Section ids are positions ("section-3"), so after an edit that adds, removes
 * or reorders sections they may point somewhere else. A block is moved only
 * when the section it was checked against is still there, word for word:
 *   - the block wrote down what that section said (its signature), and
 *   - exactly one section of the song now says the same thing, and
 *   - no other section of the song now carries that same name.
 * Anything else waits for someone: a section that was edited, removed,
 * renamed, repeated, or a block that never wrote down what it played. A name
 * proves nothing on its own — a "Coro" of one version and a "Coro" of the
 * next can be different words entirely.
 *
 * A block is only *marked* as needing someone when the song has actually
 * moved on, that is, when what is being shown is newer than what the block
 * was checked against. An older text (the songs shipped with the app while
 * the real catalog is still loading) is not an edit of the song: it is not
 * played either, but it leaves no obligation behind. A mark already there
 * stays: only choosing a section removes it.
 */
export function bindArrangement(
  sections: SongSection[],
  arrangement: SetlistArrangement | undefined,
  songVersion: number
): ArrangementBinding {
  if (!arrangement) return { state: 'none' };
  const waiting = arrangement.sections.some((entry) => entry.needsReview);
  if (!waiting && arrangementVersionOf(arrangement) === songVersion) return { state: 'current', arrangement };

  const sources = listArrangementSources(sections);
  const labelCount = new Map<string, number>();
  for (const source of sources) labelCount.set(source.label, (labelCount.get(source.label) ?? 0) + 1);

  const pendingIds: string[] = [];
  const rebound = arrangement.sections.map((entry) => {
    // Once a block needed a person, only that person takes it off the list.
    if (entry.needsReview) {
      pendingIds.push(entry.id);
      return entry;
    }
    // Already checked against this very version: nothing to prove.
    if (entry.source?.version === songVersion && sources.some((source) => source.sectionId === entry.sourceSectionId)) return entry;
    const signature = entry.source?.signature;
    const matches = signature === undefined ? [] : sources.filter((source) => source.signature === signature);
    if (matches.length !== 1 || (labelCount.get(matches[0].label) ?? 0) !== 1) {
      pendingIds.push(entry.id);
      // Written down on the block itself, so it survives duplicating,
      // removing, reordering, saving, reloading and later versions — but only
      // when the song really moved on. An older text proves nothing.
      const checkedAgainst = entry.source?.version ?? arrangementVersionOf(arrangement);
      return songVersion > checkedAgainst ? { ...entry, needsReview: true as const } : entry;
    }
    return { ...entry, sourceSectionId: matches[0].sectionId, label: matches[0].label };
  });
  const result: SetlistArrangement = { ...arrangement, sections: rebound };
  return pendingIds.length > 0 ? { state: 'pending', arrangement: result, pendingIds } : { state: 'rebound', arrangement: result };
}

/**
 * The stored arrangement with the blocks that just turned out to need someone
 * marked as such, or null when there is nothing new to write down.
 *
 * Wherever the app notices it — the setlist, rehearsal, Mass, the song page —
 * the obligation is written down, because a later version of the song may say
 * again exactly what a block recorded and nobody would ever know it had been
 * in doubt. It only ever adds the mark: what is stored is otherwise left
 * alone, and no mark is ever removed here (only choosing a section does that).
 */
export function withReviewNeeded(stored: SetlistArrangement | undefined, binding: ArrangementBinding): SetlistArrangement | null {
  if (!stored || binding.state !== 'pending') return null;
  // Only what the binding itself marked: a block that can't be matched against
  // an OLDER text of the song is not played, but it is not an obligation
  // either (see bindArrangement).
  const waiting = new Set(binding.arrangement.sections.filter((section) => section.needsReview).map((section) => section.id));
  if (stored.sections.every((section) => !waiting.has(section.id) || section.needsReview)) return null;
  return {
    ...stored,
    sections: stored.sections.map((section) =>
      waiting.has(section.id) && !section.needsReview ? { ...section, needsReview: true as const } : section
    ),
  };
}

/** What is played: the arrangement when it can be trusted, nothing (the song as written) otherwise. */
export function playableArrangement(binding: ArrangementBinding): SetlistArrangement | undefined {
  return binding.state === 'current' || binding.state === 'rebound' ? binding.arrangement : undefined;
}

/**
 * Whether an editing session may save its arrangement, or what is missing.
 *
 * An arrangement is saved whole: storing it while a block is still pending
 * would record blocks nobody checked, and storing it against a version other
 * than the one reviewed would certify a correspondence nobody looked at.
 */
export function arrangementSaveState(session: {
  /** What would be stored; null when the song is played as written */
  arrangement: SetlistArrangement | null;
  pendingIds: readonly string[];
  /** The version the blocks were checked against in this session */
  reviewedVersion: number;
  /** The version of the song right now */
  currentVersion: number;
}): 'ready' | 'pending' | 'song-changed' {
  if (!session.arrangement) return 'ready';
  if (session.pendingIds.length > 0) return 'pending';
  return session.reviewedVersion === session.currentVersion ? 'ready' : 'song-changed';
}

/** Points one pending block at a section of the song as it is now, chosen by someone. */
export function rebindArrangementSection(
  arrangement: SetlistArrangement,
  id: string,
  source: ArrangementSource,
  songVersion: number
): SetlistArrangement {
  if (!arrangement.sections.some((section) => section.id === id)) return arrangement;
  return {
    ...arrangement,
    sections: arrangement.sections.map((section) => {
      if (section.id !== id) return section;
      // Chosen by a person: that is what takes the block off the list.
      const { needsReview: _reviewed, ...rest } = section;
      void _reviewed;
      return { ...rest, sourceSectionId: source.sectionId, label: source.label, source: { signature: source.signature, version: songVersion } };
    }),
  };
}

/**
 * The arrangement as it is saved, when every block can say what it plays.
 *
 * Each block writes down the section it points at, so a later version of the
 * song can be checked against it. Null when any block is still waiting for
 * someone to choose: saving then would record blocks nobody checked as if
 * they had been, which is exactly what must never happen.
 */
export function certifyArrangement(arrangement: SetlistArrangement, songVersion: number, sections: SongSection[]): SetlistArrangement | null {
  const binding = bindArrangement(sections, arrangement, songVersion);
  if (binding.state === 'pending') return null;
  const byId = new Map(sections.map((section) => [section.id, section]));
  const certified = (binding.state === 'none' ? arrangement : binding.arrangement).sections.map((entry) => {
    const section = byId.get(entry.sourceSectionId);
    return section ? { ...entry, source: { signature: sectionSignature(section, sections), version: songVersion } } : entry;
  });
  if (certified.some((entry) => entry.needsReview)) return null;
  if (certified.some((entry) => entry.source?.version !== songVersion)) return null;
  return { ...arrangement, sections: certified, songVersion };
}

// ---------------------------------------------------------------------------
// Reading an arrangement against a song
// ---------------------------------------------------------------------------

export interface ResolvedArrangementSection {
  /** Identity of this appearance: the React key and the anchor in the page */
  id: string;
  sourceSectionId: string;
  /** The section's name now, or the one stored when the song no longer has it */
  label: string;
  /** Null when the song's text changed and this section is no longer there */
  section: SongSection | null;
  repeatCount: number;
  voices: VoiceRole[];
  /** Who sings it, by member id; names are looked up where they are shown */
  assignedMemberIds: string[];
  instruction: string;
  transition: ArrangementTransition;
  /** Name of the section a jump leads to, ready to be read: "Coro (3)" */
  transitionTargetLabel: string | null;
  /** 1 of 3, 2 of 3…, for a section that appears more than once */
  occurrence: number;
  occurrences: number;
}

function describeOccurrence(label: string, occurrence: number, occurrences: number): string {
  return occurrences > 1 ? `${label} (${occurrence})` : label;
}

/**
 * The arrangement as it will be played, against the song as it is now.
 *
 * Without an arrangement the song's own structure is used, so a setlist made
 * before arrangements existed, or a song nobody has arranged, still reads
 * exactly as it always did.
 */
export function resolveArrangement(
  sections: SongSection[],
  arrangement?: SetlistArrangement
): ResolvedArrangementSection[] {
  let auto = 0;
  const effective = arrangement ?? createArrangement(sections, () => `auto-${auto++}`);
  const byId = new Map(sections.map((section) => [section.id, section]));

  // Blocks are counted by the name they show, so three choruses read "Coro
  // (1..3)" whether they are the same section sung again or two sections the
  // author gave the same name.
  const names = effective.sections.map((entry) => {
    const section = byId.get(entry.sourceSectionId);
    return section ? sectionLabel(section) : entry.label || UNTITLED_SECTION_LABEL;
  });
  const counts = new Map<string, number>();
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);

  const seen = new Map<string, number>();
  const resolved: ResolvedArrangementSection[] = effective.sections.map((entry, index) => {
    const section = byId.get(entry.sourceSectionId) ?? null;
    const label = names[index];
    const occurrence = (seen.get(label) ?? 0) + 1;
    seen.set(label, occurrence);
    return {
      id: entry.id,
      sourceSectionId: entry.sourceSectionId,
      label,
      section,
      repeatCount: entry.repeatCount,
      voices: entry.voices,
      assignedMemberIds: entry.assignedMemberIds ?? [],
      instruction: entry.instruction,
      transition: entry.transition,
      transitionTargetLabel: null,
      occurrence,
      occurrences: counts.get(label) ?? 1,
    };
  });

  // Now that every block has its name, a jump can say where it leads.
  const labels = new Map(
    resolved.map((entry) => [
      entry.id,
      describeOccurrence(entry.label, entry.occurrence, entry.occurrences),
    ])
  );
  for (const entry of resolved) {
    if (entry.transition.type === 'jump') {
      entry.transitionTargetLabel = labels.get(entry.transition.targetId) ?? null;
    }
  }
  return resolved;
}

/** "Coro (2)" when the chorus appears more than once, "Puente" when it doesn't. */
export function resolvedSectionName(entry: ResolvedArrangementSection): string {
  return describeOccurrence(entry.label, entry.occurrence, entry.occurrences);
}

// ---------------------------------------------------------------------------
// Describing an arrangement
// ---------------------------------------------------------------------------

export interface ArrangementSummary {
  sections: number;
  /** Sections sung more than once in a row */
  repeated: number;
  /** Sections with voices assigned */
  withVoices: number;
  /** Sections with an instruction written */
  withInstructions: number;
  /** Jumps back to another section */
  jumps: number;
  /** Sections marked as the end of the song */
  endings: number;
  /** Sections the song no longer has */
  missing: number;
}

export function summarizeArrangement(resolved: ResolvedArrangementSection[]): ArrangementSummary {
  return {
    sections: resolved.length,
    repeated: resolved.filter((entry) => entry.repeatCount > 1).length,
    withVoices: resolved.filter((entry) => entry.voices.length > 0).length,
    withInstructions: resolved.filter((entry) => entry.instruction !== '').length,
    jumps: resolved.filter((entry) => entry.transition.type === 'jump').length,
    endings: resolved.filter((entry) => entry.transition.type === 'end').length,
    missing: resolved.filter((entry) => entry.section === null).length,
  };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * "8 secciones · 2 repeticiones · 3 con voces". Only what is actually there is
 * counted; nothing is estimated.
 */
export function describeArrangement(summary: ArrangementSummary): string {
  const parts = [plural(summary.sections, 'sección', 'secciones')];
  if (summary.repeated > 0) parts.push(plural(summary.repeated, 'repetición', 'repeticiones'));
  if (summary.withVoices > 0) parts.push(`${summary.withVoices} con voces`);
  if (summary.withInstructions > 0) {
    parts.push(plural(summary.withInstructions, 'indicación', 'indicaciones'));
  }
  if (summary.jumps > 0) parts.push(plural(summary.jumps, 'salto', 'saltos'));
  if (summary.endings > 0) parts.push(summary.endings === 1 ? 'un final marcado' : 'finales marcados');
  if (summary.missing > 0) {
    parts.push(`${summary.missing} ${summary.missing === 1 ? 'ya no está' : 'ya no están'} en la canción`);
  }
  return parts.join(' · ');
}

/** A deleted member stops being assigned anywhere in this arrangement. */
export function removeMemberFromArrangement(
  arrangement: SetlistArrangement,
  memberId: string
): SetlistArrangement {
  if (!arrangement.sections.some((section) => section.assignedMemberIds?.includes(memberId))) {
    return arrangement;
  }
  return {
    ...arrangement,
    sections: arrangement.sections.map((section) =>
      section.assignedMemberIds?.includes(memberId)
        ? { ...section, assignedMemberIds: section.assignedMemberIds.filter((id) => id !== memberId) }
        : section
    ),
  };
}

/** Everyone assigned to some block of the arrangement, each once. */
export function assignedMembersOf(arrangement: SetlistArrangement | undefined): string[] {
  return normalizeMemberIds((arrangement?.sections ?? []).flatMap((section) => section.assignedMemberIds ?? []));
}
