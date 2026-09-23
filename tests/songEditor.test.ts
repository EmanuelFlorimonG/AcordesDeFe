import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { toComparableSong, type SongDraft } from '../src/catalog/songDraft';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import {
  buildSubmissionPayload,
  createSubmissionAttempt,
  songDraftChanges,
  isSubmissionAttempt,
  type SongSubmissionPayload,
  type SubmissionReceipt,
} from '../src/catalog/submission';
import {
  SubmissionError,
  createMemorySubmissionRepository,
  type SongSubmissionRepository,
} from '../src/catalog/submissionRepository';
import {
  SECTION_KIND_OPTIONS,
  addSection,
  changeChord,
  contentToEditor,
  createEditorDocument,
  createLine,
  defaultLabelFor,
  duplicateSection,
  editorToContent,
  editorToSongDraft,
  hasEditorContent,
  lineFromNotation,
  lineToNotation,
  mergeLines,
  moveChord,
  moveSection,
  moveSectionBy,
  parseEditorDocument,
  placeChord,
  proposedSongDraft,
  remapAnchors,
  removeChord,
  removeSection,
  repeatSection,
  repeatsOf,
  sectionKindOf,
  setInstrumental,
  setLineText,
  splitLine,
  updateSection,
  emptySongMeta,
  validateEditorDocument,
  wordBoundary,
  type EditorDocument,
  type EditorLine,
} from '../src/editor/songEditorModel';
import { buildEditorPreview } from '../src/editor/preview';
import {
  NEW_SONG_DRAFT_KEY,
  SONG_DRAFTS_BACKUP_KEY,
  SONG_DRAFTS_STORAGE_KEY,
  createSongDraftStore,
  updateDraftKey,
} from '../src/editor/draftStorage';
import { parseSuggestEditHash, suggestEditHash } from '../src/catalog/editAvailability';
import { MY_SUBMISSIONS_STORAGE_KEY, createMySubmissionsStore } from '../src/editor/mySubmissions';
import { createSubmitter, sendDraft } from '../src/editor/submitter';
import { parseYouTubeId } from '../src/editor/youtube';
import { parseSongSections, transposeSongContent } from '../src/utils/chordParser';
import { compareSongs } from '../src/admin/songDiff';
import { draftToSong, songToDraft } from '../src/catalog/songDraft';

/** Song text is written line by line in these tests; this is what joins it. */
const NEWLINE = String.fromCharCode(10);

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`songEditor.test: ${checks} comprobaciones`));

function idSequence(prefix = 'x') {
  let count = 0;
  return () => `${prefix}-${++count}`;
}

function memoryStorage(initial: Record<string, string> = {}, { failWrites = false } = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (failWrites) throw new Error('QuotaExceededError');
      data.set(key, value);
    },
  };
}

/** A line with chords, written as the songbook writes it. */
const line = (notation: string, makeId = idSequence('l')) => lineFromNotation(notation, makeId);
const chordsOf = (entry: EditorLine) => entry.chords.map((anchor) => [anchor.chord, anchor.position]);

/** The test song of the manual check: invented words, real structure. */
function sampleDocument(): EditorDocument {
  const makeId = idSequence('s');
  let doc = createEditorDocument(makeId);
  doc = { ...doc, meta: { ...doc.meta, title: 'PRUEBA EDITOR GENESARET 6B', artist: 'Prueba', originalKey: 'G' } };
  const [first] = doc.sections;
  doc = updateSection(doc, first.id, (section) => ({ ...section, label: 'Intro', lines: [line('[G]  [D/F#]  [Em]  [C]', makeId)] }));
  doc = addSection(doc, 'Verso 1', makeId);
  doc = updateSection(doc, doc.sections[1].id, (section) => ({
    ...section,
    lines: [line('[G]Camino de [D/F#]prueba en la mañana', makeId), line('[Em]Canción de en[C]sayo', makeId)],
  }));
  doc = addSection(doc, 'Coro', makeId);
  doc = updateSection(doc, doc.sections[2].id, (section) => ({ ...section, lines: [line('[C]Cantamos [G]juntos [Am7]hoy', makeId)] }));
  doc = addSection(doc, 'Verso 2', makeId);
  doc = updateSection(doc, doc.sections[3].id, (section) => ({ ...section, lines: [line('[G]Otra estrofa de [D/F#]prueba', makeId)] }));
  doc = repeatSection(doc, doc.sections[2].id, makeId);
  doc = addSection(doc, 'Final', makeId);
  doc = updateSection(doc, doc.sections[5].id, (section) => ({ ...section, lines: [line('[C]Fin de la [G]prueba', makeId)] }));
  return doc;
}

// --- Section vocabulary ---------------------------------------------------------

describe('Tipos de sección: el vocabulario del parser', () => {
  it('cada nombre que ofrece el editor se lee como su tipo', () => {
    for (const option of SECTION_KIND_OPTIONS.filter((entry) => entry.kind !== 'custom')) {
      eq(sectionKindOf(option.name), option.kind, option.name);
    }
    eq(sectionKindOf('Estribillo'), 'coro', 'sinónimos del cancionero');
    eq(sectionKindOf('Verso 3'), 'verso');
    eq(sectionKindOf('Primera parte'), 'custom');
  });

  it('los versos se numeran solos', () => {
    let doc = createEditorDocument(idSequence());
    eq(doc.sections.map((section) => section.label), ['Verso 1']);
    eq(defaultLabelFor('verso', doc.sections), 'Verso 2');
    eq(defaultLabelFor('coro', doc.sections), 'Coro');
    doc = addSection(doc, defaultLabelFor('verso', doc.sections), idSequence('b'));
    eq(defaultLabelFor('verso', doc.sections), 'Verso 3');
  });
});

// --- Words and chords --------------------------------------------------------------

describe('Letra y acordes (anclas)', () => {
  it('acorde al inicio, en medio, al final y varios por línea', () => {
    let entry = createLine(idSequence(), 'Señor, quiero caminar contigo');
    entry = placeChord(entry, 0, 'G', idSequence('a'));
    entry = placeChord(entry, 7, 'D/F#', idSequence('b'));
    entry = placeChord(entry, entry.text.length, 'Em', idSequence('c'));
    eq(chordsOf(entry), [['G', 0], ['D/F#', 7], ['Em', 29]]);
    eq(lineToNotation(entry), '[G]Señor, [D/F#]quiero caminar contigo[Em]');
  });

  it('un acorde en la misma posición se reemplaza, no se apila', () => {
    let entry = createLine(idSequence(), 'Hola');
    entry = placeChord(entry, 0, 'G', idSequence('a'));
    entry = placeChord(entry, 0, 'Am7', idSequence('b'));
    eq(chordsOf(entry), [['Am7', 0]]);
  });

  it('sostenidos, bemoles, slash, acentos y ñ, ida y vuelta por la notación', () => {
    const notation = '[F#m]Mañana [Bb]él vendrá, [C#dim]canción [Ab/C]de [Gsus4]fe';
    const entry = line(notation);
    eq(entry.text, 'Mañana él vendrá, canción de fe');
    eq(chordsOf(entry), [['F#m', 0], ['Bb', 7], ['C#dim', 18], ['Ab/C', 26], ['Gsus4', 29]]);
    eq(lineToNotation(entry), notation);
  });

  it('una línea instrumental: solo acordes, en orden', () => {
    const entry = line('[G]  [D/F#]  [Em]  [C]');
    eq(entry.instrumental, true);
    eq(entry.chords.map((anchor) => anchor.chord), ['G', 'D/F#', 'Em', 'C']);
    eq(lineToNotation(entry), '[G]  [D/F#]  [Em]  [C]');
    const extended = placeChord(entry, 0, 'Am7', idSequence('z'));
    eq(lineToNotation(extended), '[G]  [D/F#]  [Em]  [C]  [Am7]');
    const reordered = moveChord(extended, extended.chords[4].id, -1);
    eq(reordered.chords.map((anchor) => anchor.chord), ['G', 'D/F#', 'Em', 'Am7', 'C']);
  });

  it('cambiar, mover y quitar un acorde', () => {
    let entry = line('[G]Camino de [D]prueba');
    const [, second] = entry.chords;
    entry = changeChord(entry, second.id, 'D/F#');
    eq(chordsOf(entry), [['G', 0], ['D/F#', 10]]);
    entry = moveChord(entry, second.id, 2);
    eq(chordsOf(entry), [['G', 0], ['D/F#', 12]]);
    entry = moveChord(entry, second.id, -20);
    eq(chordsOf(entry), [['G', 0], ['D/F#', 1]], 'nunca cae sobre otro acorde');
    entry = removeChord(entry, second.id);
    eq(chordsOf(entry), [['G', 0]]);
    eq(chordsOf(changeChord(entry, entry.chords[0].id, '   ')), [], 'dejarlo vacío lo quita');
  });

  it('saltar de palabra en palabra', () => {
    const text = 'Señor, quiero caminar';
    eq(wordBoundary(text, 0, 1), 7);
    eq(wordBoundary(text, 7, 1), 14);
    eq(wordBoundary(text, 14, -1), 7);
    eq(wordBoundary(text, 7, -1), 0);
  });

  it('un acorde no reconocido se conserva tal cual y se avisa', () => {
    let doc = createEditorDocument(idSequence());
    doc = updateSection(doc, doc.sections[0].id, (section) => ({
      ...section,
      lines: [placeChord(createLine(idSequence('q'), 'Hola'), 0, 'Gx', idSequence('r'))],
    }));
    eq(doc.sections[0].lines[0].chords[0].chord, 'Gx');
    const issues = validateEditorDocument(doc);
    eq(issues.map((issue) => [issue.code, issue.severity]), [['chord-unrecognized', 'warning']]);
    eq(editorToContent(doc).includes('[Gx]Hola'), true);
    eq(validateSongDraft(editorToSongDraft(doc)).warnings.some((issue) => issue.code === 'chord-unrecognized'), true);
  });
});

describe('Editar la letra mantiene los acordes en su sitio', () => {
  const base = () => line('[G]Señor, quiero [D/F#]caminar contigo');

  it('escribir antes de la palabra lleva el acorde con ella', () => {
    const edited = setLineText(base(), 'Oh Señor, quiero caminar contigo', 3);
    eq(chordsOf(edited), [['G', 3], ['D/F#', 17]]);
    eq(lineToNotation(edited), 'Oh [G]Señor, quiero [D/F#]caminar contigo');
  });

  it('borrar caracteres antes de un acorde lo desplaza hacia atrás', () => {
    const edited = setLineText(base(), 'Señor, caminar contigo', 7);
    eq(chordsOf(edited), [['G', 0], ['D/F#', 7]]);
    eq(lineToNotation(edited), '[G]Señor, [D/F#]caminar contigo');
  });

  it('borrar la letra bajo un acorde lo deja donde empezó el cambio', () => {
    const edited = setLineText(base(), 'Señor, quiero contigo', 14);
    eq(chordsOf(edited), [['G', 0], ['D/F#', 14]]);
  });

  it('pegar texto en medio desplaza lo que va detrás', () => {
    const edited = setLineText(base(), 'Señor, hoy sí quiero caminar contigo', 14);
    eq(chordsOf(edited), [['G', 0], ['D/F#', 21]]);
  });

  it('el cursor decide en textos repetitivos ("aa" a "aaa")', () => {
    const entry = placeChord(createLine(idSequence(), 'aa'), 1, 'G', idSequence('c'));
    eq(chordsOf(setLineText(entry, 'aaa', 1)), [['G', 2]], 'insertado antes del acorde');
    eq(chordsOf(setLineText(entry, 'aaa', 3)), [['G', 1]], 'insertado al final');
    eq(remapAnchors('aa', 'aaa', entry.chords).map((anchor) => anchor.position), [1], 'sin cursor: el final');
  });

  it('acentos y ñ ocupan una sola posición (texto normalizado)', () => {
    const decomposed = 'Mañana'; // "Mañana" escrito con tilde combinable
    const entry = setLineText(createLine(idSequence(), ''), decomposed, decomposed.length);
    eq(entry.text, 'Mañana');
    eq(entry.text.length, 6);
  });

  it('los corchetes de la letra no rompen la notación', () => {
    eq(setLineText(createLine(idSequence(), ''), 'Coro [bis]').text, 'Coro (bis)');
  });

  it('Enter parte la línea con sus acordes; retroceso al inicio las une', () => {
    const [first, second] = splitLine(base(), 14, idSequence('n'));
    eq([first.text, chordsOf(first)], ['Señor, quiero ', [['G', 0]]]);
    eq([second.text, chordsOf(second)], ['caminar contigo', [['D/F#', 0]]]);
    const merged = mergeLines(first, second);
    eq(lineToNotation(merged), '[G]Señor, quiero [D/F#]caminar contigo');
  });

  it('convertir una línea en instrumental y volver', () => {
    const instrumental = setInstrumental(base(), true);
    eq([instrumental.text, instrumental.chords.map((anchor) => anchor.chord)], ['', ['G', 'D/F#']]);
    eq(lineToNotation(instrumental), '[G]  [D/F#]');
    eq(setInstrumental(instrumental, false).instrumental, false);
  });
});

// --- Sections ---------------------------------------------------------------------

describe('Secciones', () => {
  it('añadir, reordenar (arrastre y teclado) y eliminar', () => {
    let doc = sampleDocument();
    eq(doc.sections.map((section) => section.label), ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro', 'Final']);
    const final = doc.sections[5].id;
    doc = moveSection(doc, final, 0);
    eq(doc.sections[0].id, final);
    doc = moveSectionBy(doc, final, 1);
    eq(doc.sections[1].id, final);
    doc = removeSection(doc, final);
    eq(doc.sections.length, 5);
  });

  it('duplicar crea contenido independiente', () => {
    let doc = sampleDocument();
    const coro = doc.sections[2];
    doc = duplicateSection(doc, coro.id, idSequence('d'));
    const copy = doc.sections[3];
    eq([copy.label, copy.repeatOf, copy.id === coro.id], ['Coro', null, false]);
    eq(copy.lines.map(lineToNotation), coro.lines.map(lineToNotation));
    eq(copy.lines[0].id === coro.lines[0].id, false);
    doc = updateSection(doc, copy.id, (section) => ({ ...section, lines: [line('[D]Otra letra')] }));
    eq(doc.sections[2].lines.map(lineToNotation), coro.lines.map(lineToNotation), 'cambiar la copia no toca el original');
  });

  it('repetir hace referencia a la sección anterior y se escribe como el cancionero repite', () => {
    const doc = sampleDocument();
    const repeat = doc.sections[4];
    eq([repeat.repeatOf, repeat.lines.length], [doc.sections[2].id, 0]);
    eq(repeatsOf(doc, doc.sections[2].id).map((section) => section.id), [repeat.id]);
    const content = editorToContent(doc);
    eq(content.includes('\nCoro\n\n[Final]'), true, 'la repetición es el nombre sin letra, como en el cancionero');
    const parsed = parseSongSections(content);
    const repeatParsed = parsed[4];
    eq(repeatParsed.repeatOf, parsed[2].id, 'el parser real la resuelve');
    eq(repeatParsed.lines.map((entry) => entry.raw), parsed[2].lines.map((entry) => entry.raw), 'y muestra la letra del coro');
    eq(validateEditorDocument(doc), []);
  });

  it('una repetición sigue el nombre de su original', () => {
    let doc = sampleDocument();
    doc = updateSection(doc, doc.sections[2].id, (section) => ({ ...section, label: 'Estribillo' }));
    eq(editorToContent(doc).includes('[Estribillo]'), true);
    eq(editorToContent(doc).includes('\nEstribillo\n'), true, 'la repetición también se llama Estribillo');
    eq(validateEditorDocument(doc), []);
  });

  it('una repetición antes de su original, o ambigua, es un error', () => {
    let doc = sampleDocument();
    const repeat = doc.sections[4];
    doc = moveSection(doc, repeat.id, 0);
    eq(validateEditorDocument(doc).map((issue) => issue.code), ['repeat-before-target']);

    let ambiguous = sampleDocument();
    ambiguous = addSection(ambiguous, 'Coro', idSequence('e'), 3);
    ambiguous = updateSection(ambiguous, ambiguous.sections[3].id, (section) => ({ ...section, lines: [line('[D]Otro coro distinto')] }));
    eq(validateEditorDocument(ambiguous).map((issue) => issue.code), ['repeat-unresolved']);
  });

  it('eliminar el original quita también sus repeticiones', () => {
    const doc = sampleDocument();
    const after = removeSection(doc, doc.sections[2].id);
    eq(after.sections.map((section) => section.label), ['Intro', 'Verso 1', 'Verso 2', 'Final']);
  });

  it('una sección vacía es un error (se leería como repetición)', () => {
    let doc = sampleDocument();
    doc = addSection(doc, 'Puente', idSequence('p'));
    eq(validateEditorDocument(doc).map((issue) => issue.code), ['section-empty']);
  });

  it('un nombre que es un acorde, o vacío, es un error; una línea que parece cabecera avisa', () => {
    let doc = sampleDocument();
    doc = updateSection(doc, doc.sections[1].id, (section) => ({ ...section, label: 'Am' }));
    eq(validateEditorDocument(doc).map((issue) => issue.code).includes('label-is-chord'), true);
    let unnamed = sampleDocument();
    unnamed = updateSection(unnamed, unnamed.sections[1].id, (section) => ({ ...section, label: '  ' }));
    eq(validateEditorDocument(unnamed).map((issue) => issue.code).includes('label-required'), true);
    let headerLike = sampleDocument();
    headerLike = updateSection(headerLike, headerLike.sections[1].id, (section) => ({ ...section, lines: [...section.lines, createLine(idSequence('h'), 'Coro')] }));
    eq(validateEditorDocument(headerLike).map((issue) => issue.code), ['line-reads-as-header']);
  });
});

// --- Serialization -----------------------------------------------------------------

describe('Del editor a la canción', () => {
  it('la canción de prueba completa, en la notación del cancionero', () => {
    eq(
      editorToContent(sampleDocument()),
      [
        '[Intro]',
        '[G]  [D/F#]  [Em]  [C]',
        '',
        '[Verso 1]',
        '[G]Camino de [D/F#]prueba en la mañana',
        '[Em]Canción de en[C]sayo',
        '',
        '[Coro]',
        '[C]Cantamos [G]juntos [Am7]hoy',
        '',
        '[Verso 2]',
        '[G]Otra estrofa de [D/F#]prueba',
        '',
        'Coro',
        '',
        '[Final]',
        '[C]Fin de la [G]prueba',
      ].join('\n')
    );
  });

  it('el borrador que se envía: metadata tal cual y acordes derivados de la letra', () => {
    const draft = editorToSongDraft(sampleDocument());
    eq([draft.title, draft.artist, draft.originalKey, draft.tempo], ['PRUEBA EDITOR GENESARET 6B', 'Prueba', 'G', null]);
    eq(draft.chordsUsed, ['G', 'D/F#', 'Em', 'C', 'Am7']);
    eq(validateSongDraft(draft).ok, true);
    eq(validateSongDraft(draft).warnings, []);
  });

  it('nada se inventa: sin tonalidad, BPM, artista, categorías ni tiempos si no se indicaron', () => {
    const draft = editorToSongDraft(createEditorDocument(idSequence()));
    eq([draft.artist, draft.originalKey, draft.tempo, draft.year, draft.liturgicalSeasons, draft.categories], [null, null, null, null, null, []]);
  });

  it('editor → texto → editor → texto es estable', () => {
    const first = editorToContent(sampleDocument());
    const again = editorToContent(contentToEditor(first, undefined, idSequence('r')));
    eq(again, first);
  });

  it('las canciones del catálogo abiertas en el editor conservan su música (misma forma comparable)', () => {
    let exact = 0;
    const failing: string[] = [];
    for (const song of MOCK_SONGS) {
      const written = editorToContent(contentToEditor(song.content, undefined, idSequence(song.id)));
      const draft = (content: string): SongDraft => ({ ...editorToSongDraft(createEditorDocument()), content });
      const before = toComparableSong(draft(song.content));
      const after = toComparableSong(draft(written));
      // Sections without a header after the first can't be written in bracket form
      // without joining the previous one: compare the music line by line instead.
      const lines = (value: typeof before) => value.sections.flatMap((section) => (section.repeats ? [`=${section.label}`] : section.lines.map((entry) => JSON.stringify(entry))));
      if (JSON.stringify(lines(before)) === JSON.stringify(lines(after))) exact++;
      else failing.push(song.id);
    }
    eq(failing, [], 'letra, acordes y repeticiones idénticos');
    eq(exact, 97);
  });

  it('un documento guardado se lee con cuidado', () => {
    const doc = sampleDocument();
    eq(parseEditorDocument(JSON.parse(JSON.stringify(doc))), doc);
    eq(parseEditorDocument({ schemaVersion: 99 }), null);
    const broken = JSON.parse(JSON.stringify(doc));
    const anchorId = broken.sections[1].lines[0].chords[0].id;
    broken.sections[1].lines[0].chords[0].position = 9999;
    broken.sections[4].repeatOf = 'no-existe';
    const repaired = parseEditorDocument(broken) as EditorDocument;
    const repairedLine = repaired.sections[1].lines[0];
    eq(repairedLine.chords.find((anchor) => anchor.id === anchorId)?.position, repairedLine.text.length, 'posición acotada a la línea');
    eq(repaired.sections[4].repeatOf, null, 'referencia rota: se suelta, no se inventa');
  });
});

// --- Preview ----------------------------------------------------------------------

describe('Vista previa: el mismo camino que una canción publicada', () => {
  it('es la canción del catálogo y la transposición de SongViewer', () => {
    const doc = sampleDocument();
    const preview = buildEditorPreview(doc, 3);
    const song = draftToSong(editorToSongDraft(doc), 'vista-previa');
    eq(preview.song, song);
    eq(preview.content, transposeSongContent(song.content, 3, 'G'));
    eq(preview.key, 'Bb');
    eq(preview.content.includes('[Bb]Camino de [F/A]prueba'), true);
    eq(buildEditorPreview(doc).content, song.content, 'sin transponer, el texto guardado');
  });
});

// --- Local drafts -------------------------------------------------------------------

describe('Borrador local', () => {
  it('se guarda, se recupera y se descarta', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const doc = sampleDocument();
    eq(store.save(NEW_SONG_DRAFT_KEY, doc, 1000), true);
    const reopened = createSongDraftStore(storage).load(NEW_SONG_DRAFT_KEY);
    eq([reopened?.document, reopened?.updatedAt, reopened?.attempt], [doc, 1000, null]);
    store.remove(NEW_SONG_DRAFT_KEY);
    eq(createSongDraftStore(storage).load(NEW_SONG_DRAFT_KEY), null);
  });

  it('datos corruptos no rompen nada: se apartan y el editor empieza limpio', () => {
    const storage = memoryStorage({ [SONG_DRAFTS_STORAGE_KEY]: '{roto' });
    const store = createSongDraftStore(storage);
    eq(store.recoveredFromUnreadableData, true);
    eq(store.load(NEW_SONG_DRAFT_KEY), null);
    eq(storage.data.get(SONG_DRAFTS_BACKUP_KEY), '{roto');
    const partly = memoryStorage({
      [SONG_DRAFTS_STORAGE_KEY]: JSON.stringify({ version: 1, drafts: [{ key: 'new', document: { schemaVersion: 1 } }, 'basura'] }),
    });
    eq(createSongDraftStore(partly).load(NEW_SONG_DRAFT_KEY), null);
  });

  it('si el navegador no deja guardar, se sabe (para avisar antes de salir)', () => {
    const store = createSongDraftStore(memoryStorage({}, { failWrites: true }));
    eq(store.save(NEW_SONG_DRAFT_KEY, sampleDocument()), false);
    eq(createSongDraftStore(null).save(NEW_SONG_DRAFT_KEY, sampleDocument()), false);
  });

  it('la identidad de envío se guarda con el borrador y se descarta si la canción cambia', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const doc = sampleDocument();
    store.save(NEW_SONG_DRAFT_KEY, doc);
    const attempt = createSubmissionAttempt();
    store.setAttempt(NEW_SONG_DRAFT_KEY, attempt);
    store.save(NEW_SONG_DRAFT_KEY, doc);
    eq(createSongDraftStore(storage).load(NEW_SONG_DRAFT_KEY)?.attempt, attempt, 'mismo contenido: se conserva');
    store.save(NEW_SONG_DRAFT_KEY, { ...doc, meta: { ...doc.meta, title: 'Otro título' } });
    eq(createSongDraftStore(storage).load(NEW_SONG_DRAFT_KEY)?.attempt, null, 'contenido nuevo: propuesta nueva');
  });

  it('hay contenido que merezca guardarse', () => {
    eq(hasEditorContent(createEditorDocument()), false);
    eq(hasEditorContent(sampleDocument()), true);
  });
});

// --- Sending -------------------------------------------------------------------------

describe('Envío a revisión', () => {
  const payloadFor = (attempt = createSubmissionAttempt()) =>
    buildSubmissionPayload(editorToSongDraft(sampleDocument()), {
      type: 'create',
      contributor: { name: 'Prueba', email: 'prueba@example.com' },
      attempt,
    });

  it('payload: tipo create, sin destino, canción exacta e identidad de reintento', () => {
    const attempt = createSubmissionAttempt();
    const payload = payloadFor(attempt);
    eq([payload.type, payload.targetSongId, payload.requestId, payload.editToken], ['create', null, attempt.requestId, attempt.editToken]);
    eq(payload.song, editorToSongDraft(sampleDocument()));
    eq(isSubmissionAttempt(attempt), true);
    eq(attempt.requestId === createSubmissionAttempt().requestId, false);
  });

  it('doble clic: una sola petición', async () => {
    let calls = 0;
    const repository: SongSubmissionRepository = {
      submit: async () => {
        calls++;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64) };
      },
      getPublicStatus: async () => null,
      getForEdit: async () => null,
      resubmit: async () => {
        throw new Error('no se usa');
      },
    };
    const submitter = createSubmitter(repository);
    const payload = payloadFor();
    const [first, second] = await Promise.all([submitter.submit(payload), submitter.submit(payload)]);
    eq(calls, 1);
    eq(first, second);
    eq(submitter.isBusy(), false);
  });

  it('error de red: el borrador sigue ahí; reintentar con la misma identidad no duplica', async () => {
    const storage = memoryStorage();
    const drafts = createSongDraftStore(storage);
    const mine = createMySubmissionsStore(storage);
    drafts.save(NEW_SONG_DRAFT_KEY, sampleDocument());
    const backend = createMemorySubmissionRepository();
    let failNextAnswer = true;
    // The first send reaches the backend but its answer is lost on the way back.
    const flaky: SongSubmissionRepository = {
      submit: async (payload: SongSubmissionPayload): Promise<SubmissionReceipt> => {
        const receipt = await backend.submit(payload);
        if (failNextAnswer) {
          failNextAnswer = false;
          throw new SubmissionError('unavailable', 'Sin conexión');
        }
        return receipt;
      },
      getPublicStatus: (code) => backend.getPublicStatus(code),
      getForEdit: (code, token) => backend.getForEdit(code, token),
      resubmit: (input) => backend.resubmit(input),
    };
    const submitter = createSubmitter(flaky);
    const payload = payloadFor();
    const failed = await sendDraft({ submitter, payload, drafts, draftKey: NEW_SONG_DRAFT_KEY, mine, title: 'Prueba' });
    eq(failed.ok, false);
    eq(drafts.load(NEW_SONG_DRAFT_KEY) !== null, true, 'el borrador no se toca tras un error');
    eq(mine.list(), []);

    const retried = await sendDraft({ submitter, payload, drafts, draftKey: NEW_SONG_DRAFT_KEY, mine, title: 'Prueba' });
    eq(retried.ok, true);
    eq(backend.count(), 1, 'una sola propuesta aunque se envió dos veces');
    eq(drafts.load(NEW_SONG_DRAFT_KEY), null, 'solo tras la confirmación se borra el borrador');
    if (retried.ok) {
      eq(mine.list().map((entry) => entry.trackingCode), [retried.receipt.trackingCode]);
      eq(mine.editTokenFor(retried.receipt.trackingCode), payload.editToken);
    }
  });

  it('un reintento con otro token no obtiene el código de la propuesta original', async () => {
    const backend = createMemorySubmissionRepository();
    const attempt = createSubmissionAttempt();
    await backend.submit(payloadFor(attempt));
    await assert.rejects(backend.submit(payloadFor({ ...attempt, editToken: 'b'.repeat(64) })), SubmissionError);
    checks++;
  });

  it('el token de edición nunca aparece en la lista pública de propuestas', async () => {
    const storage = memoryStorage();
    const mine = createMySubmissionsStore(storage);
    mine.add({ trackingCode: 'GS-2345-6789', title: 'Prueba', submittedAt: '2026-09-18T20:00:00Z', editToken: 'c'.repeat(64) });
    eq(JSON.stringify(mine.list()).includes('c'.repeat(64)), false);
    eq(mine.list(), [{ trackingCode: 'GS-2345-6789', title: 'Prueba', submittedAt: '2026-09-18T20:00:00Z' }]);
    eq(storage.data.get(MY_SUBMISSIONS_STORAGE_KEY)?.includes('c'.repeat(64)), true, 'se guarda aparte, en este navegador');
    eq(createMySubmissionsStore(memoryStorage({ [MY_SUBMISSIONS_STORAGE_KEY]: '{roto' })).list(), []);
  });
});

// --- Tracking ------------------------------------------------------------------------

describe('Corregir la propia propuesta (cambios solicitados)', () => {
  it('pedir cambios, recuperar con código y token, corregir, reenviar: vuelve a revisión', async () => {
    const backend = createMemorySubmissionRepository();
    const attempt = createSubmissionAttempt();
    const draft = editorToSongDraft(sampleDocument());
    const receipt = await backend.submit(buildSubmissionPayload(draft, { type: 'create', contributor: { name: 'Ana', email: 'ana@example.com' }, attempt }));

    // While it is pending there is nothing to correct.
    await assert.rejects(backend.resubmit({ trackingCode: receipt.trackingCode, editToken: attempt.editToken, song: draft }), (error: unknown) =>
      error instanceof SubmissionError && error.reason === 'not-editable'
    );
    checks++;

    backend.requestChanges(receipt.trackingCode, 'Revisa el segundo acorde.');
    // A wrong token recovers nothing; the right one recovers the song and the note, never the contact data.
    eq(await backend.getForEdit(receipt.trackingCode, 'f'.repeat(64)), null);
    const forEdit = await backend.getForEdit(receipt.trackingCode.toLowerCase(), attempt.editToken);
    eq([forEdit?.status, forEdit?.reviewNote, forEdit?.song?.title], ['changes_requested', 'Revisa el segundo acorde.', draft.title]);
    eq(JSON.stringify(forEdit).includes('ana@example.com'), false);

    // The corrected song, as the editor produces it from the recovered one.
    const { content: _c, chordsUsed: _u, ...meta } = draft;
    void _c;
    void _u;
    const document = { ...contentToEditor(forEdit!.song!.content, meta), meta: { ...meta, title: `${draft.title} (corregida)` } };
    const song = editorToSongDraft(document);

    await assert.rejects(backend.resubmit({ trackingCode: receipt.trackingCode, editToken: 'f'.repeat(64), song }), SubmissionError);
    checks++;
    eq(await backend.resubmit({ trackingCode: receipt.trackingCode, editToken: attempt.editToken, song }), { trackingCode: receipt.trackingCode, status: 'pending' });
    eq((await backend.getPublicStatus(receipt.trackingCode))?.status, 'pending');
    eq((await backend.getForEdit(receipt.trackingCode, attempt.editToken))?.song?.title, `${draft.title} (corregida)`);
    eq(backend.count(), 1);

    // Once back in review, a second resubmission is refused.
    await assert.rejects(backend.resubmit({ trackingCode: receipt.trackingCode, editToken: attempt.editToken, song }), (error: unknown) =>
      error instanceof SubmissionError && error.reason === 'not-editable'
    );
    checks++;
  });

  it('el editor abre la propuesta recuperada con su música intacta', () => {
    const draft = editorToSongDraft(sampleDocument());
    const { content, chordsUsed: _derived, ...meta } = draft;
    void _derived;
    const reopened = editorToSongDraft(contentToEditor(content, meta));
    eq(toComparableSong(reopened), toComparableSong(draft));
    eq(reopened.title, draft.title);
  });

  it('el borrador de una corrección no pisa el de una canción nueva', () => {
    const storage = memoryStorage();
    const drafts = createSongDraftStore(storage);
    drafts.save(NEW_SONG_DRAFT_KEY, sampleDocument());
    const other = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Otra' } };
    drafts.save('edit:GS-2345-6789', other);
    eq(drafts.load(NEW_SONG_DRAFT_KEY)?.document.meta.title, sampleDocument().meta.title);
    eq(drafts.load('edit:GS-2345-6789')?.document.meta.title, 'Otra');
  });
});

describe('Consulta de una propuesta', () => {
  it('estados públicos, códigos inexistentes o mal escritos, y solo campos seguros', async () => {
    const backend = createMemorySubmissionRepository();
    const receipt = await backend.submit(buildSubmissionPayload(editorToSongDraft(sampleDocument()), {
      type: 'create',
      contributor: { name: 'Prueba', email: 'prueba@example.com' },
    }));
    const status = await backend.getPublicStatus(` ${receipt.trackingCode.toLowerCase().replace(/-/g, ' ')} `);
    eq(status?.status, 'pending');
    eq(Object.keys(status ?? {}).sort(), ['reviewNote', 'reviewedAt', 'status', 'submittedAt', 'title', 'trackingCode', 'type']);
    eq(JSON.stringify(status).includes('prueba@example.com'), false);
    eq(JSON.stringify(status).includes('Camino de'), false, 'sin la letra');
    eq(await backend.getPublicStatus('GS-ZZZZ-ZZZZ'), null);
    eq(await backend.getPublicStatus('no es un código'), null);
  });
});

// --- YouTube ---------------------------------------------------------------------------

describe('YouTube: id o enlace', () => {
  it('lee el id de los enlaces de YouTube y de nada más', () => {
    eq(parseYouTubeId('P2Kf8RsxuiA'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://www.youtube.com/watch?v=P2Kf8RsxuiA&t=42s'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('youtu.be/P2Kf8RsxuiA?si=abc'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://m.youtube.com/watch?v=P2Kf8RsxuiA'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://www.youtube.com/shorts/P2Kf8RsxuiA'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://music.youtube.com/watch?v=P2Kf8RsxuiA'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://www.youtube.com/embed/P2Kf8RsxuiA'), 'P2Kf8RsxuiA');
    eq(parseYouTubeId('https://evil.example.com/watch?v=P2Kf8RsxuiA'), null, 'otro dominio');
    eq(parseYouTubeId('https://www.youtube.com/watch?v=corto'), null);
    eq(parseYouTubeId(''), null);
    eq(parseYouTubeId('javascript:alert(1)'), null);
  });
});

// --- Suggesting an edit of a published song -----------------------------------------------

describe('Sugerir una edición de una canción publicada', () => {
  const song = MOCK_SONGS[0];
  const key = updateDraftKey(song.id);

  it('el borrador de una edición guarda sobre qué canción y versión se hizo', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    eq(store.save(key, sampleDocument(), 1000, { songId: song.id, version: 3 }), true);
    eq(createSongDraftStore(storage).load(key)?.base, { songId: song.id, version: 3 });
    // Sin base, o con la de otra canción, no se guarda: nunca se continuaría sobre una versión supuesta.
    eq(store.save(key, sampleDocument()), false);
    eq(store.save(key, sampleDocument(), 1000, { songId: 'otra', version: 3 }), false);
    // Las canciones nuevas no llevan base.
    eq(store.save(NEW_SONG_DRAFT_KEY, sampleDocument()), true);
    eq('base' in (createSongDraftStore(storage).load(NEW_SONG_DRAFT_KEY) ?? {}), false);
  });

  it('un borrador de edición guardado sin base (o con una base rota) no se recupera', () => {
    const document = sampleDocument();
    for (const base of [undefined, { songId: song.id }, { songId: song.id, version: 0 }, { songId: 'otra', version: 2 }]) {
      const storage = memoryStorage({
        [SONG_DRAFTS_STORAGE_KEY]: JSON.stringify({ version: 1, drafts: [{ key, document, updatedAt: 1, attempt: null, base }] }),
      });
      eq(createSongDraftStore(storage).load(key), null);
    }
  });

  it('otra versión es otro envío: la identidad de reintento no pasa de una versión a otra', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const doc = sampleDocument();
    store.save(key, doc, 1, { songId: song.id, version: 2 });
    const attempt = createSubmissionAttempt();
    store.setAttempt(key, attempt);
    store.save(key, doc, 2, { songId: song.id, version: 2 });
    eq(store.load(key)?.attempt, attempt);
    store.save(key, doc, 3, { songId: song.id, version: 3 });
    eq(store.load(key)?.attempt, null);
  });

  it('se envía como corrección de esa canción, sobre la versión de la que partió', async () => {
    const published = songToDraft(song);
    const backend = createMemorySubmissionRepository({ publishedSongs: new Map([[song.id, { version: 2, song: published }]]) });
    const storage = memoryStorage();
    const drafts = createSongDraftStore(storage);
    const mine = createMySubmissionsStore(memoryStorage());
    const edited = { ...published, tags: [...published.tags, 'con acordes'] };
    drafts.save(key, contentToEditor(edited.content, edited), 1, { songId: song.id, version: 2 });
    const outcome = await sendDraft({
      submitter: createSubmitter(backend),
      payload: buildSubmissionPayload(edited, { type: 'update', targetSongId: song.id, baseVersion: 2, attempt: createSubmissionAttempt() }),
      drafts,
      draftKey: key,
      mine,
      title: edited.title,
    });
    eq(outcome.ok, true);
    eq(drafts.load(key), null);
    // Sobre una versión que ya no es la actual: nada se guarda y el borrador sigue.
    drafts.save(key, contentToEditor(edited.content, edited), 2, { songId: song.id, version: 1 });
    const stale = await sendDraft({
      submitter: createSubmitter(backend),
      payload: buildSubmissionPayload(edited, { type: 'update', targetSongId: song.id, baseVersion: 1 }),
      drafts,
      draftKey: key,
      mine,
      title: edited.title,
    });
    eq([stale.ok, stale.ok ? null : stale.error.reason, drafts.load(key)?.base?.version], [false, 'stale', 1]);
  });

  it('rebase: corregir la propuesta sobre la versión publicada ahora', async () => {
    const v1 = songToDraft(song);
    const v2 = { ...v1, title: `${v1.title} (revisada)` };
    const published = new Map([[song.id, { version: 1, song: v1, versions: new Map([[1, v1], [2, v2]]) }]]);
    const backend = createMemorySubmissionRepository({ publishedSongs: published });
    const attempt = createSubmissionAttempt();
    const mine = { ...v1, tags: [...v1.tags, 'propuesta'] };
    const receipt = await backend.submit(buildSubmissionPayload(mine, { type: 'update', targetSongId: song.id, baseVersion: 1, attempt }));
    backend.requestChanges(receipt.trackingCode, 'Revisa los acordes del coro.');

    // Mientras esperaba, se publicó la versión 2.
    published.set(song.id, { version: 2, song: v2, versions: new Map([[1, v1], [2, v2]]) });
    const forEdit = await backend.getForEdit(receipt.trackingCode, attempt.editToken);
    eq([forEdit?.baseVersion, forEdit?.baseSong], [1, v1], 'el colaborador ve sobre qué versión la hizo');

    const reasonOf = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: SubmissionError) => error.reason);
    const corrected = { ...v2, tags: [...v2.tags, 'propuesta'] };
    const input = { trackingCode: receipt.trackingCode, editToken: attempt.editToken };
    eq(await reasonOf(backend.resubmit({ ...input, song: corrected, baseVersion: 1 })), 'stale');
    eq(await reasonOf(backend.resubmit({ ...input, song: corrected })), 'invalid', 'sin versión base no se reenvía una corrección');
    eq(await reasonOf(backend.resubmit({ ...input, song: v2, baseVersion: 2 })), 'no-changes');
    eq(await backend.resubmit({ ...input, song: corrected, baseVersion: 2 }), { trackingCode: receipt.trackingCode, status: 'pending' });
    const after = await backend.getForEdit(receipt.trackingCode, attempt.editToken);
    eq([after?.status, after?.baseVersion, after?.baseSong], ['pending', 2, v2], 'queda pendiente sobre la versión nueva');
  });

  it('durante un rebase manual, los cambios anteriores sobreviven al autoguardado y a recargar', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const base = { songId: song.id, version: 1 };
    const withABC = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'A + B + C' } };
    store.save(key, withABC, 1000, base);

    // Se publicó la versión 2: se abre la actual y lo anterior queda como referencia.
    const onV2 = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Versión 2 publicada' } };
    eq(store.startRebase(key, onV2, { songId: song.id, version: 2 }, { document: withABC, version: 1 }), true);
    eq(store.startRebase('update:otra', onV2, { songId: song.id, version: 2 }, { document: withABC, version: 1 }), false);

    // El colaborador reaplica solo A y el borrador se autoguarda varias veces.
    const withA = { ...onV2, meta: { ...onV2.meta, title: 'Versión 2 con A' } };
    store.save(key, withA, 2000, { songId: song.id, version: 2 });
    store.save(key, withA, 2500, { songId: song.id, version: 2 });

    const reopened = createSongDraftStore(storage).load(key);
    eq(reopened?.document, withA, 'el borrador actual es lo reaplicado');
    eq(reopened?.base, { songId: song.id, version: 2 });
    eq(reopened?.previous, [{ document: withABC, version: 1 }], 'B y C siguen disponibles como referencia');

    // Solo el colaborador decide dejar de conservarlos.
    eq(createSongDraftStore(storage).setPrevious(key, null), true);
    eq('previous' in (createSongDraftStore(storage).load(key) ?? {}), false);
    eq(createSongDraftStore(storage).load(key)?.document, withA, 'y su borrador sigue intacto');
    // Enviar la propuesta se lleva el borrador entero, referencia incluida.
    store.save(key, withA, 3000, { songId: song.id, version: 2 });
    store.remove(key);
    eq(createSongDraftStore(storage).load(key), null);
  });

  it('un segundo rebase no se lleva por delante lo que quedó del primero', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const withABC = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'A + B + C' } };
    store.save(key, withABC, 1000, { songId: song.id, version: 1 });

    const onV2 = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Publicada v2' } };
    store.startRebase(key, onV2, { songId: song.id, version: 2 }, { document: withABC, version: 1 });
    const withA = { ...onV2, meta: { ...onV2.meta, title: 'v2 con A reaplicado' } };
    store.save(key, withA, 2000, { songId: song.id, version: 2 });

    // Llega la versión 3 y se vuelve a empezar: lo de la 1 y lo de la 2 se conservan.
    const onV3 = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Publicada v3' } };
    eq(store.startRebase(key, onV3, { songId: song.id, version: 3 }, { document: withA, version: 2 }), true);
    const reopened = createSongDraftStore(storage).load(key);
    eq(reopened?.document, onV3);
    eq(reopened?.base, { songId: song.id, version: 3 });
    eq(
      reopened?.previous,
      [
        { document: withABC, version: 1 },
        { document: withA, version: 2 },
      ],
      'B y C siguen recuperables, y lo reaplicado en la 2 también'
    );

    // Descartar una no toca la otra.
    eq(createSongDraftStore(storage).setPrevious(key, [{ document: withA, version: 2 }]), true);
    eq(createSongDraftStore(storage).load(key)?.previous, [{ document: withA, version: 2 }]);
  });

  it('corrigiendo la propia propuesta (edit:<código>) el rebase también conserva lo anterior', () => {
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    const editKey = 'edit:GS-2345-6789';
    const mine = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Mi propuesta' } };
    store.save(editKey, mine, 1000, { songId: song.id, version: 1 });

    const onV2 = { ...sampleDocument(), meta: { ...sampleDocument().meta, title: 'Publicada v2' } };
    eq(store.startRebase(editKey, onV2, { songId: song.id, version: 2 }, { document: mine, version: 1 }), true, 'la clave de una propuesta también vale');
    store.save(editKey, onV2, 2000, { songId: song.id, version: 2 });

    const reopened = createSongDraftStore(storage).load(editKey);
    eq([reopened?.document, reopened?.base], [onV2, { songId: song.id, version: 2 }]);
    eq(reopened?.previous, [{ document: mine, version: 1 }], 'la propuesta anterior sigue ahí tras recargar');
  });

  it('si el navegador no deja guardar, nada dice que se guardó', () => {
    const full = createSongDraftStore(memoryStorage({}, { failWrites: true }));
    const document = sampleDocument();
    eq(full.save(key, document, 1000, { songId: song.id, version: 1 }), false);
    eq(full.startRebase(key, document, { songId: song.id, version: 2 }, { document, version: 1 }), false);
    eq(full.load(key), null, 'y no se inventa un borrador en memoria');

    // Una referencia solo se olvida si de verdad se pudo guardar el cambio.
    const storage = memoryStorage();
    const store = createSongDraftStore(storage);
    store.save(key, document, 1000, { songId: song.id, version: 1 });
    store.startRebase(key, document, { songId: song.id, version: 2 }, { document, version: 1 });
    eq(createSongDraftStore(storage).setPrevious('update:otra-cancion', null), false, 'sin borrador no hay nada que olvidar');
    eq(createSongDraftStore(storage).load(key)?.previous?.length, 1);
  });

  it('una referencia guardada que no se puede leer no rompe el borrador', () => {
    const document = sampleDocument();
    for (const previous of [null, 'texto', [], [{ document: { schemaVersion: 9 }, version: 1 }], { version: 1 }]) {
      const storage = memoryStorage({
        [SONG_DRAFTS_STORAGE_KEY]: JSON.stringify({ version: 1, drafts: [{ key, document, updatedAt: 1, attempt: null, base: { songId: song.id, version: 2 }, previous }] }),
      });
      const loaded = createSongDraftStore(storage).load(key);
      eq([loaded?.document, 'previous' in (loaded ?? {})], [document, false]);
    }
    // Una referencia suelta, como se guardaba antes de que pudiera haber varias, se lee igual.
    const storage = memoryStorage({
      [SONG_DRAFTS_STORAGE_KEY]: JSON.stringify({
        version: 1,
        drafts: [{ key, document, updatedAt: 1, attempt: null, base: { songId: song.id, version: 2 }, previous: { document, version: 1 } }],
      }),
    });
    eq(createSongDraftStore(storage).load(key)?.previous, [{ document, version: 1 }]);
  });

  it('abrir cualquiera de las 97 y enviar sin tocar nada no propone ningún cambio', () => {
    const differ: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const { content, chordsUsed: _derived, ...meta } = published;
      void _derived;
      const opened = contentToEditor(content, meta);
      const proposed = proposedSongDraft(published, opened, opened);
      // Literalmente lo mismo: es lo que compara la base de datos antes de guardar.
      if (proposed.content !== published.content || songDraftChanges(published, proposed)) differ.push(catalogSong.id);
    }
    eq(differ, [], 'ninguna canción cambia solo por abrirla');
    checks += 96;
  });

  it('y sí detecta los cambios de verdad', () => {
    const published = songToDraft(MOCK_SONGS[0]);
    const { content, chordsUsed: _derived, ...meta } = published;
    void _derived;
    const opened = contentToEditor(content, meta);
    const changed = (next: EditorDocument) => songDraftChanges(published, proposedSongDraft(published, opened, next));

    // Letra.
    const words = {
      ...opened,
      sections: opened.sections.map((section, index) =>
        index === 0 ? { ...section, lines: [...section.lines, createLine(idSequence('l'), 'Una línea más')] } : section
      ),
    };
    eq(changed(words), true, 'letra añadida');
    // Acorde.
    const withChord = {
      ...opened,
      sections: opened.sections.map((section, index) =>
        index === 0 ? { ...section, lines: section.lines.map((line, at) => (at === 0 ? placeChord(line, 0, 'F#m', idSequence('c')) : line)) } : section
      ),
    };
    eq(changed(withChord), true, 'acorde puesto');
    // Metadatos.
    eq(changed({ ...opened, meta: { ...opened.meta, tempo: (opened.meta.tempo ?? 60) + 5 } }), true, 'tempo cambiado');
    eq(changed({ ...opened, meta: { ...opened.meta, title: `${opened.meta.title} (nueva)` } }), true, 'título cambiado');
    // Sección añadida, quitada y reordenada.
    eq(changed(addSection(opened, 'puente')), true, 'sección añadida');
    eq(changed(removeSection(opened, opened.sections[opened.sections.length - 1].id)), true, 'sección quitada');
    eq(changed(moveSectionBy(opened, opened.sections[0].id, 1)), true, 'secciones reordenadas');
    // Y volver a dejarlo como estaba no propone nada.
    eq(changed(opened), false);
  });

  it('la ruta del editor de una canción', () => {
    eq(suggestEditHash('alfarero'), '#/song/alfarero/sugerir');
    eq(parseSuggestEditHash('#/song/alfarero/sugerir'), 'alfarero');
    eq(parseSuggestEditHash('#/song/alfarero'), null);
    eq(parseSuggestEditHash('#/song/a/b/sugerir'), null);
  });
});

// --- The editor writes back what it read ------------------------------------------------

describe('Editar una parte no cambia las demás', () => {
  /** A song as the app reads it: its sections, with what each one puts on the page. */
  const structureOf = (content: string) => {
    const sections = parseSongSections(content);
    const at = new Map(sections.map((section, index) => [section.id, index]));
    return sections.map((section) => [
      section.header ? `${section.header.label}|${section.header.form}` : '(sin título)',
      // Una llamada ("Coro" a secas) toca las líneas de la sección que repite:
      // lo que la identifica es a cuál repite, no una copia de aquellas líneas.
      section.repeatOf ? `repite ${at.get(section.repeatOf) ?? '?'}` : section.lines.filter((line) => line.type !== 'empty').map((line) => line.raw.trimEnd()),
    ]);
  };
  const openedOf = (draft: SongDraft) => {
    const { content, chordsUsed: _derived, ...meta } = draft;
    void _derived;
    return contentToEditor(content, meta);
  };

  it('abrir y volver a escribir las 97 deja la misma estructura', () => {
    const differ: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const again = editorToContent(openedOf(published));
      if (JSON.stringify(structureOf(again)) !== JSON.stringify(structureOf(published.content))) differ.push(catalogSong.id);
    }
    eq(differ, []);
    checks += 96;
  });

  it('recuperar el borrador guardado de cualquiera de las 97 no propone ningún cambio', () => {
    const differ: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const opened = openedOf(published);
      // Guardado y vuelto a leer: los ids son otros, la canción es la misma.
      const stored = JSON.parse(JSON.stringify(opened));
      const recovered = parseEditorDocument(stored, idSequence('nuevo'));
      if (!recovered) {
        differ.push(`${catalogSong.id} (ilegible)`);
        continue;
      }
      // Y el editor se abre otra vez con ids nuevos, como en una pestaña nueva.
      const reopened = contentToEditor(published.content, { ...published, content: undefined } as never, idSequence('otro'));
      const proposed = proposedSongDraft(published, reopened, recovered);
      if (proposed.content !== published.content || songDraftChanges(published, proposed)) differ.push(catalogSong.id);
    }
    eq(differ, []);
    checks += 96;
  });

  it('cambiar solo el tempo, o solo los datos, no toca la música de las 97', () => {
    const differ: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const opened = openedOf(published);
      const before = JSON.stringify(structureOf(published.content));
      const tempo = editorToSongDraft({ ...opened, meta: { ...opened.meta, tempo: (opened.meta.tempo ?? 90) + 4 } });
      const metadata = editorToSongDraft({ ...opened, meta: { ...opened.meta, year: '2026', tags: [...opened.meta.tags, 'revisada'] } });
      if (JSON.stringify(structureOf(tempo.content)) !== before || JSON.stringify(structureOf(metadata.content)) !== before) {
        differ.push(catalogSong.id);
      }
    }
    eq(differ, []);
    checks += 96;
  });

  it('editar una línea deja intactos los límites de las demás secciones', () => {
    const differ: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const opened = openedOf(published);
      const index = opened.sections.findIndex((section) => !section.repeatOf && section.lines.some((line) => line.text.trim()));
      if (index < 0) continue;
      const edited = {
        ...opened,
        sections: opened.sections.map((section, at) =>
          at === index
            ? { ...section, lines: section.lines.map((line, position) => (position === 0 ? { ...line, text: `${line.text} ahora` } : line)) }
            : section
        ),
      };
      const before = structureOf(published.content);
      const after = structureOf(editorToSongDraft(edited).content);
      const untouched = (entries: unknown[][]) => JSON.stringify(entries.filter((_entry, at) => at !== index));
      if (before.length !== after.length || untouched(before) !== untouched(after)) differ.push(catalogSong.id);
    }
    eq(differ, []);
    checks += 96;
  });

  it('una repetición encuentra su sección aunque el encabezado sea «Coro:»', () => {
    // Codex: abrir fiesta-de-fe, cambiar solo el tempo y validar daba repeat-unresolved.
    const published = songToDraft(MOCK_SONGS.find((entry) => entry.id === 'fiesta-de-fe')!);
    const opened = openedOf(published);
    eq(opened.sections.find((section) => section.label === 'Coro')?.headerForm, 'label');
    const onlyTempo = { ...opened, meta: { ...opened.meta, tempo: 100 } };
    eq(validateEditorDocument(onlyTempo).map((issue) => issue.code), []);
    eq(editorToSongDraft(onlyTempo).content, published.content, 'y el texto sigue siendo el mismo');

    // Todas las canciones que escriben así algún encabezado validan igual de limpio.
    const withLabelHeaders = MOCK_SONGS.filter((entry) =>
      openedOf(songToDraft(entry)).sections.some((section) => section.headerForm === 'label')
    );
    eq(withLabelHeaders.length > 0, true);
    const broken = withLabelHeaders.filter((entry) => {
      const document = openedOf(songToDraft(entry));
      const edited = { ...document, meta: { ...document.meta, tempo: 96, year: '2026' } };
      return validateEditorDocument(edited).some((issue) => issue.severity === 'error');
    });
    eq(broken.map((entry) => entry.id), [], 'ninguna canción con «Coro:» queda con errores por cambiar datos');

    // Las repeticiones con corchetes siguen funcionando, y una repetición imposible se sigue avisando.
    const bracketed = contentToEditor(['[Coro]', 'Hola', '', 'Coro'].join(NEWLINE), emptySongMeta());
    eq(validateEditorDocument(bracketed).map((issue) => issue.code), []);
    // Y un coro escrito con dos puntos también puede ser el destino de una repetición.
    const withColon = contentToEditor(['Coro:', 'Hola', '', '[Verso 1]', 'Letra', '', 'Coro'].join(NEWLINE), emptySongMeta());
    eq(withColon.sections.map((section) => section.headerForm), ['label', 'bracket', undefined], 'la llamada no es un encabezado más');
    eq(withColon.sections[2].repeatOf, withColon.sections[0].id, 'la llamada repite ese coro');
    eq(validateEditorDocument(withColon).map((issue) => issue.code), []);
    eq(editorToContent(withColon).startsWith('Coro:'), true, 'y se sigue escribiendo con dos puntos');
  });

  it('«sin cambios» significa lo mismo en el editor, en el panel y en la base de datos', () => {
    const disagree: string[] = [];
    for (const catalogSong of MOCK_SONGS) {
      const published = songToDraft(catalogSong);
      const opened = openedOf(published);
      const untouched = proposedSongDraft(published, opened, parseEditorDocument(JSON.parse(JSON.stringify(opened)), idSequence('r'))!);
      // El editor no lo envía, la base de datos lo vería idéntico y el comparador del panel también.
      const agreed =
        !songDraftChanges(published, untouched) && untouched.content === published.content && compareSongs(published, untouched).identical;
      if (!agreed) disagree.push(catalogSong.id);
    }
    eq(disagree, []);
    checks += 96;

    // Y un cambio de verdad lo ven los tres.
    const published = songToDraft(MOCK_SONGS[0]);
    const opened = openedOf(published);
    const edited = {
      ...opened,
      sections: opened.sections.map((section, index) =>
        index === 0 ? { ...section, lines: [...section.lines, createLine(idSequence('l'), 'Una línea más')] } : section
      ),
    };
    const proposed = proposedSongDraft(published, opened, edited);
    eq([songDraftChanges(published, proposed), proposed.content !== published.content, compareSongs(published, proposed).identical], [true, true, false]);
  });

  it('un "Coro:" no se traga la estrofa siguiente', () => {
    const song = MOCK_SONGS.find((entry) => entry.id === 'vienen-con-alegria')!;
    const published = songToDraft(song);
    eq(published.content.includes('Coro:'), true, 'esta canción escribe su coro con dos puntos');
    const opened = openedOf(published);
    eq(opened.sections.find((section) => section.label === 'Coro')?.headerForm, 'label');

    // Una edición mínima: solo el tempo.
    const minimal = editorToSongDraft({ ...opened, meta: { ...opened.meta, tempo: 100 } });
    eq(structureOf(minimal.content), structureOf(published.content));
    eq(minimal.content.includes('Coro:'), true, 'el coro se sigue escribiendo igual');
    eq(parseSongSections(minimal.content).length, parseSongSections(published.content).length);

    // Y editando una línea del coro, las demás secciones no se mueven.
    const coroAt = opened.sections.findIndex((section) => section.label === 'Coro');
    const edited = editorToSongDraft({
      ...opened,
      sections: opened.sections.map((section, at) =>
        at === coroAt ? { ...section, lines: section.lines.map((line, index) => (index === 0 ? { ...line, text: `${line.text} hoy` } : line)) } : section
      ),
    });
    const before = structureOf(published.content);
    const after = structureOf(edited.content);
    eq(after.length, before.length);
    eq(
      after.filter((_entry, at) => at !== coroAt),
      before.filter((_entry, at) => at !== coroAt)
    );
  });
});
