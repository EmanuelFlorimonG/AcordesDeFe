import {
  summarizeSongChanges,
  toComparableSong,
  type ComparableLine,
  type ComparableMetadata,
  type ComparableSection,
  type SongDraft,
} from '../catalog/songDraft';

/**
 * PUBLISHED | PROPOSED, for a correction (type=update). Built on the
 * comparable form of phase 6A: the parser splits both versions into sections
 * and lines with their chords, and the comparison is made there, section by
 * section and line by line, never character by character. Lines are shown
 * in the songbook's own bracket notation, which musicians already read.
 */

export const FIELD_LABELS: Record<keyof ComparableMetadata, string> = {
  title: 'Título',
  artist: 'Artista',
  originalKey: 'Tonalidad',
  recommendedCapo: 'Cejilla recomendada',
  timeSignature: 'Compás',
  tempo: 'BPM',
  rhythmPattern: 'Patrón rítmico',
  categories: 'Categorías',
  liturgicalSeasons: 'Tiempos litúrgicos',
  tags: 'Etiquetas',
  chordsUsed: 'Acordes usados',
  difficulty: 'Dificultad',
  year: 'Año',
  youtubeId: 'YouTube',
};

/** chordsUsed is derived from the content: its changes already show in the sections. */
const COMPARED_FIELDS = (Object.keys(FIELD_LABELS) as Array<keyof ComparableMetadata>).filter((field) => field !== 'chordsUsed');

export interface FieldChange {
  field: keyof ComparableMetadata;
  label: string;
  before: string;
  after: string;
}

export interface DiffLine {
  text: string;
  changed: boolean;
}

export interface SectionDiff {
  key: string;
  label: string;
  change: 'added' | 'removed' | 'changed' | 'same';
  lyricsChanged: boolean;
  chordsChanged: boolean;
  /** Null when the section doesn't exist on that side */
  before: DiffLine[] | null;
  after: DiffLine[] | null;
}

export interface SongComparison {
  identical: boolean;
  fields: FieldChange[];
  sections: SectionDiff[];
  orderChanged: boolean;
  orderBefore: string[];
  orderAfter: string[];
}

/** A comparable line back in bracket notation: "[G]Señor, [D]quiero". */
export function lineToText(line: ComparableLine): string {
  if (line.kind === 'comment') return line.text;
  let text = '';
  let cursor = 0;
  for (const { at, chord } of [...line.chords].sort((a, b) => a.at - b.at)) {
    text += line.text.slice(cursor, at) + `[${chord}]`;
    cursor = Math.max(cursor, at);
  }
  return text + line.text.slice(cursor);
}

function sectionText(section: ComparableSection): string[] {
  return section.repeats ? [`(Repite ${section.repeats.replace(/#1$/, '').replace(/#(\d+)$/, ' $1')})`] : section.lines.map(lineToText);
}

function markLines(mine: string[], other: string[] | null): DiffLine[] {
  return mine.map((text, index) => ({ text, changed: other === null || other[index] !== text }));
}

const displayKey = (section: ComparableSection) => section.label || 'Sin encabezado';

export function compareSongs(published: SongDraft, proposed: SongDraft): SongComparison {
  const before = toComparableSong(published);
  const after = toComparableSong(proposed);
  const summary = summarizeSongChanges(published, proposed);

  const fields = COMPARED_FIELDS.filter((field) => before.metadata[field] !== after.metadata[field]).map((field) => ({
    field,
    label: FIELD_LABELS[field],
    before: before.metadata[field],
    after: after.metadata[field],
  }));

  const beforeByKey = new Map(before.sections.map((section) => [section.key, section]));
  const afterByKey = new Map(after.sections.map((section) => [section.key, section]));
  const sections: SectionDiff[] = [];

  // The proposed order first (what will be published), then what it removes.
  for (const section of after.sections) {
    const old = beforeByKey.get(section.key);
    const afterText = sectionText(section);
    if (!old) {
      sections.push({ key: section.key, label: displayKey(section), change: 'added', lyricsChanged: true, chordsChanged: true, before: null, after: markLines(afterText, null) });
      continue;
    }
    const beforeText = sectionText(old);
    const lyricsChanged = summary.lyricsChanged.includes(section.key);
    const chordsChanged = summary.chordsChanged.includes(section.key);
    sections.push({
      key: section.key,
      label: displayKey(section),
      change: lyricsChanged || chordsChanged ? 'changed' : 'same',
      lyricsChanged,
      chordsChanged,
      before: markLines(beforeText, afterText),
      after: markLines(afterText, beforeText),
    });
  }
  for (const section of before.sections) {
    if (!afterByKey.has(section.key)) {
      sections.push({ key: section.key, label: displayKey(section), change: 'removed', lyricsChanged: true, chordsChanged: true, before: markLines(sectionText(section), null), after: null });
    }
  }

  return {
    identical: fields.length === 0 && sections.every((section) => section.change === 'same') && !summary.orderChanged,
    fields,
    sections,
    orderChanged: summary.orderChanged,
    orderBefore: before.sections.map(displayKey),
    orderAfter: after.sections.map(displayKey),
  };
}
