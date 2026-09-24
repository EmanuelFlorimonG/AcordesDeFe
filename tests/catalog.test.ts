import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Song } from '../src/types/song';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { bundledSongRepository } from '../src/catalog/bundledCatalog';
import { fetchRemoteCatalog, songVersionOf, type SongRepository } from '../src/catalog/songRepository';
import {
  SONG_COLUMNS,
  SONG_READ_COLUMNS,
  createSupabaseSongRepository,
  fetchSongForEdit,
  songFromRow,
  songToRow,
  type SongRow,
} from '../src/catalog/supabaseSongRepository';
import {
  draftToSong,
  emptySongDraft,
  parseSongDraft,
  songToDraft,
  summarizeSongChanges,
  toComparableSong,
  withDerivedChords,
  type SongDraft,
} from '../src/catalog/songDraft';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import {
  TRACKING_ALPHABET,
  generateTrackingCode,
  isTrackingCode,
  normalizeTrackingCode,
} from '../src/catalog/trackingCode';
import {
  buildSubmissionPayload,
  parseSubmissionPayload,
  songDraftChanges,
  toPublicStatus,
  validateSubmissionPayload,
  type SongSubmission,
} from '../src/catalog/submission';
import {
  SubmissionError,
  createMemorySubmissionRepository,
  createSupabaseSubmissionRepository,
  draftFromSnapshot,
} from '../src/catalog/submissionRepository';
import { SONG_ID_PATTERN, isSongId, slugifySongId, suggestSongId } from '../src/catalog/songId';
import {
  SupabaseRequestError,
  createSupabaseClient,
  readSupabaseConfig,
  type SupabaseClient,
} from '../src/lib/supabase';
import { EMPTY_FILTERS, buildSearchIndex, searchSongs } from '../src/utils/songSearch';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`catalog.test: ${checks} comprobaciones`));

const draftOf = (overrides: Partial<SongDraft> = {}): SongDraft => ({
  ...emptySongDraft(),
  title: 'Canción de prueba',
  originalKey: 'G',
  content: '[Verso 1]\n[G]Letra del [D]verso\n\n[Coro]\n[C]Letra del [G]coro\n\nCoro',
  chordsUsed: ['G', 'D', 'C'],
  ...overrides,
});

// --- The catalog as it is -------------------------------------------------------

describe('Catálogo incluido: nada cambia', () => {
  it('las 110 canciones, en el mismo orden y con los mismos ids', async () => {
    eq(bundledSongRepository.source, 'bundled');
    eq(bundledSongRepository.getAll().length, 110);
    eq(bundledSongRepository.getAll().map((song) => song.id), MOCK_SONGS.map((song) => song.id));
    eq((await bundledSongRepository.listSongs()).length, 110);
    eq(await bundledSongRepository.getSong('sencillamente-dios'), MOCK_SONGS.find((song) => song.id === 'sencillamente-dios'));
    eq(await bundledSongRepository.getSong('no-existe'), null);
    eq(bundledSongRepository.getAll()[0], MOCK_SONGS[0], 'los mismos objetos: SongViewer recibe exactamente lo mismo');
  });

  it('listSongs devuelve una copia: nadie puede alterar el catálogo', async () => {
    const list = await bundledSongRepository.listSongs();
    list.pop();
    eq(bundledSongRepository.getAll().length, 110);
  });

  it('la búsqueda da los mismos resultados leyendo del repositorio', () => {
    const before = buildSearchIndex(MOCK_SONGS);
    const after = buildSearchIndex([...bundledSongRepository.getAll()]);
    for (const query of ['huracán', 'maria', 'hakuna', 'santo', 'espíritu', '']) {
      eq(
        searchSongs(after, query, EMPTY_FILTERS).map((match) => match.song.id),
        searchSongs(before, query, EMPTY_FILTERS).map((match) => match.song.id),
        `búsqueda «${query}»`
      );
    }
  });

  it('todos los ids se pueden importar tal cual a la base de datos', () => {
    for (const song of MOCK_SONGS) assert.ok(isSongId(song.id), song.id);
    checks++;
    eq(new Set(MOCK_SONGS.map((song) => song.id)).size, 110, 'sin ids repetidos');
  });

  it('las 110 canciones pasan la validación sin errores (las restricciones SQL son las mismas)', () => {
    const failing = MOCK_SONGS.map((song) => ({ id: song.id, result: validateSongDraft(songToDraft(song)) })).filter(
      (entry) => !entry.result.ok
    );
    eq(failing.map((entry) => `${entry.id}: ${entry.result.errors.map((error) => error.code).join(', ')}`), []);
  });
});

// --- Lossless conversions ------------------------------------------------------------

describe('Conversiones sin pérdida', () => {
  it('Song → Draft → Song, para las 110', () => {
    for (const song of MOCK_SONGS) assert.deepStrictEqual(draftToSong(songToDraft(song), song.id), song, song.id);
    checks++;
  });

  it('Song → fila SQL → Song, para las 110', () => {
    for (const song of MOCK_SONGS) {
      // The only difference allowed: youtubeId "" ("no video") is stored as null and comes back absent.
      const expected = { ...song };
      if (expected.youtubeId === '') delete expected.youtubeId;
      assert.deepStrictEqual(songFromRow(songToRow(song)), expected, song.id);
    }
    checks++;
    const empty = MOCK_SONGS.filter((song) => song.youtubeId === '').map((song) => song.id);
    eq(empty, ['alfarero'], 'una sola canción usa youtubeId vacío');
    eq(Boolean(songFromRow(songToRow(MOCK_SONGS.find((song) => song.id === 'alfarero') as Song))?.youtubeId), false);
  });

  it('Draft → JSON → Draft → Song (lo que viaja en una propuesta)', () => {
    for (const song of MOCK_SONGS) {
      const payload = buildSubmissionPayload(songToDraft(song), { type: 'update', targetSongId: song.id });
      const back = parseSubmissionPayload(JSON.parse(JSON.stringify(payload)));
      assert.ok(back);
      assert.deepStrictEqual(draftToSong(back.song, song.id), song, song.id);
    }
    checks++;
  });

  it('"sin clasificar" y "lista vacía" no se confunden', () => {
    const song: Song = { ...MOCK_SONGS[0], liturgicalSeasons: [] };
    eq(songToDraft(song).liturgicalSeasons, []);
    const unclassified = { ...MOCK_SONGS[0] };
    delete unclassified.liturgicalSeasons;
    eq(songToDraft(unclassified).liturgicalSeasons, null);
    eq('liturgicalSeasons' in draftToSong(songToDraft(unclassified), 'x'), false);
  });

  it('un borrador ajeno se lee con cuidado', () => {
    eq(parseSongDraft({ schemaVersion: 2, title: 'x', content: 'x' }), null, 'versión desconocida');
    eq(parseSongDraft({ schemaVersion: 1, title: 3, content: 'x' }), null);
    const parsed = parseSongDraft({ schemaVersion: 1, title: 'T', content: 'C', tempo: 'rápido', tags: ['a', 3], difficulty: 'Imposible' });
    eq([parsed?.tempo, parsed?.tags, parsed?.difficulty], [null, ['a'], null]);
  });

  it('los acordes de una canción nueva se derivan de la letra', () => {
    eq(withDerivedChords(draftOf({ chordsUsed: [] })).chordsUsed, ['G', 'D', 'C']);
  });

  it('las columnas pedidas a la base son exactamente las de la fila', () => {
    eq([...SONG_COLUMNS].sort(), Object.keys(songToRow(MOCK_SONGS[0])).sort());
  });
});

// --- Validation ---------------------------------------------------------------

describe('Validación de un borrador', () => {
  const codes = (draft: SongDraft) => {
    const result = validateSongDraft(draft, { knownCategories: ['Adoración'] });
    return { errors: result.errors.map((issue) => issue.code), warnings: result.warnings.map((issue) => issue.code) };
  };

  it('un borrador correcto no tiene errores ni avisos', () => {
    eq(codes(draftOf()), { errors: [], warnings: [] });
    eq(validateSongDraft(draftOf()).ok, true);
  });

  it('título y letra son obligatorios', () => {
    eq(codes(draftOf({ title: '   ' })).errors, ['title-required']);
    eq(codes(draftOf({ title: 'x'.repeat(121) })).errors, ['title-too-long']);
    eq(codes(draftOf({ content: '  \n ' })).errors, ['content-required']);
    eq(codes(draftOf({ content: 'x'.repeat(20_001) })).errors, ['content-too-long']);
  });

  it('metadata con el formato del catálogo', () => {
    eq(codes(draftOf({ originalKey: 'H' })).errors, ['original-key-invalid']);
    eq(codes(draftOf({ rhythmPattern: 'x'.repeat(121) })).errors, ['rhythm-too-long']);
    eq(codes(draftOf({ recommendedCapo: 12 })).errors, ['capo-invalid']);
    eq(codes(draftOf({ tempo: 1000 })).errors, ['tempo-invalid']);
    eq(codes(draftOf({ timeSignature: '4-4' })).errors, ['time-signature-invalid']);
    eq(codes(draftOf({ year: '20' })).errors, ['year-invalid']);
    eq(codes(draftOf({ youtubeId: 'corto' })).errors, ['youtube-id-invalid']);
    eq(codes(draftOf({ youtubeId: '' })).errors, [], 'vacío es "sin vídeo"');
    eq(codes(draftOf({ liturgicalSeasons: ['verano' as never] })).errors, ['season-invalid']);
    eq(codes(draftOf({ originalKey: 'F#m', recommendedCapo: 3, tempo: 72, timeSignature: '6/8', youtubeId: 'P2Kf8RsxuiA', year: '2020' })).errors, []);
  });

  it('corchetes sin cerrar, con su línea', () => {
    const result = validateSongDraft(draftOf({ content: '[Verso]\n[G]Hola [D\nmundo' }));
    eq(result.errors.map((issue) => [issue.code, issue.line]), [['unbalanced-brackets', 2]]);
  });

  it('avisos: acorde no reconocido, sin acordes, sin tonalidad, sección vacía, categoría nueva', () => {
    const unknownChord = validateSongDraft(draftOf({ content: '[Verso]\n[G]Hola [Gx]mundo' }));
    eq(unknownChord.warnings.map((issue) => [issue.code, issue.line]), [['chord-unrecognized', 2]]);
    eq(unknownChord.ok, true, 'un aviso no bloquea');
    eq(codes(draftOf({ content: '[Verso]\nSolo letra' })).warnings, ['no-chords']);
    eq(codes(draftOf({ originalKey: null })).warnings, ['original-key-missing']);
    eq(codes(draftOf({ content: '[Verso]\n[G]Hola\n\n[Hombres]' })).warnings, ['empty-section']);
    eq(codes(draftOf({ categories: ['Adoración', 'Nueva'] })).warnings, ['category-unknown']);
  });

  it('una sección repetida ("Coro" después del coro escrito) no es una sección vacía', () => {
    eq(codes(draftOf()).warnings.includes('empty-section'), false);
  });
});

// --- Comparison (prepared for the diff of phase 6C) -------------------------------------

describe('Comparar dos versiones', () => {
  const base = draftOf();

  it('forma comparable: secciones con clave estable, letra sin acordes y acordes en su posición', () => {
    const comparable = toComparableSong(base);
    eq(comparable.sections.map((section) => [section.key, section.repeats]), [
      ['Verso 1#1', null],
      ['Coro#1', null],
      ['Coro#2', 'Coro#1'],
    ]);
    eq(comparable.sections[0].lines, [
      { kind: 'lyrics', text: 'Letra del verso', chords: [{ at: 0, chord: 'G' }, { at: 10, chord: 'D' }] },
    ]);
  });

  it('un acorde cambiado', () => {
    const changed = summarizeSongChanges(base, { ...base, content: base.content.replace('[D]verso', '[Em]verso') });
    eq([changed.chordsChanged, changed.lyricsChanged, changed.metadata], [['Verso 1#1'], [], []]);
  });

  it('una palabra cambiada', () => {
    const changed = summarizeSongChanges(base, { ...base, content: base.content.replace('del [G]coro', 'del [G]estribillo') });
    eq([changed.lyricsChanged, changed.chordsChanged], [['Coro#1'], []]);
  });

  it('sección añadida, eliminada y orden cambiado', () => {
    const added = summarizeSongChanges(base, { ...base, content: `${base.content}\n\n[Puente]\n[Am]Nuevo` });
    eq(added.sectionsAdded, ['Puente#1']);
    const removed = summarizeSongChanges(base, { ...base, content: '[Verso 1]\n[G]Letra del [D]verso' });
    eq(removed.sectionsRemoved, ['Coro#1', 'Coro#2']);
    const reordered = summarizeSongChanges(base, { ...base, content: '[Coro]\n[C]Letra del [G]coro\n\n[Verso 1]\n[G]Letra del [D]verso' });
    eq(reordered.orderChanged, true);
  });

  it('metadata cambiada', () => {
    eq(summarizeSongChanges(base, { ...base, originalKey: 'A', tempo: 90 }).metadata, ['originalKey', 'tempo']);
    eq(summarizeSongChanges(base, base), {
      metadata: [],
      sectionsAdded: [],
      sectionsRemoved: [],
      lyricsChanged: [],
      chordsChanged: [],
      headersChanged: [],
      orderChanged: false,
    });
  });
});

// --- Tracking codes -----------------------------------------------------------------

describe('Códigos de seguimiento', () => {
  it('formato legible y alfabeto sin caracteres confusos', () => {
    const code = generateTrackingCode();
    eq(isTrackingCode(code), true, code);
    eq(/^GS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code), true);
    for (const confusing of ['0', 'O', '1', 'I', 'L', 'U', 'V']) eq(TRACKING_ALPHABET.includes(confusing), false, confusing);
  });

  it('aleatorios: 2000 códigos distintos, sin orden', () => {
    const codes = Array.from({ length: 2000 }, () => generateTrackingCode());
    eq(new Set(codes).size, 2000);
    eq([...codes].sort().join() === codes.join(), false, 'no son secuenciales');
  });

  it('descarta los bytes que sesgarían el alfabeto', () => {
    const bytes = [255, 250, 0, 1, 2, 3, 4, 5, 6, 7];
    let index = 0;
    const code = generateTrackingCode((length) => Uint8Array.from({ length }, () => bytes[index++ % bytes.length]));
    eq(code, 'GS-2345-6789');
  });

  it('lo que escribe una persona', () => {
    eq(normalizeTrackingCode('gs-4k8p-2qmx'), 'GS-4K8P-2QMX');
    eq(normalizeTrackingCode(' GS 4K8P 2QMX '), 'GS-4K8P-2QMX');
    eq(normalizeTrackingCode('4K8P2QMX'), 'GS-4K8P-2QMX', 'sin prefijo');
    eq(normalizeTrackingCode('GSGS2QMX'), 'GS-GSGS-2QMX', 'un código que empieza por GS');
    eq(normalizeTrackingCode('GS-4K8P-2QM0'), null, 'el 0 no está en el alfabeto');
    eq(normalizeTrackingCode('GS-4K8P'), null);
  });
});

// --- Submissions ----------------------------------------------------------------------

describe('Propuestas', () => {
  const NOW = new Date('2026-09-18T12:00:00Z');
  const published = new Set(MOCK_SONGS.map((song) => song.id));

  it('construir: nombre y correo limpios, sin destino para una canción nueva', () => {
    const payload = buildSubmissionPayload(draftOf(), {
      type: 'create',
      targetSongId: 'huracan-hakuna',
      contributor: { name: '  Ana  ', email: ' Ana@Example.COM ' },
    });
    eq([payload.targetSongId, payload.contributor], [null, { name: 'Ana', email: 'ana@example.com' }]);
    eq(buildSubmissionPayload(draftOf(), { type: 'create' }).contributor, { name: null, email: null });
  });

  it('validar: destino, correo, tamaño y la canción', () => {
    const errors = (payload: ReturnType<typeof buildSubmissionPayload>) =>
      validateSubmissionPayload(payload, { publishedSongIds: published }).errors.map((error) => error.code);
    eq(errors(buildSubmissionPayload(draftOf(), { type: 'update', baseVersion: 1 })), ['target-required']);
    eq(errors(buildSubmissionPayload(draftOf(), { type: 'update', targetSongId: 'inventada', baseVersion: 1 })), ['target-unknown']);
    eq(errors(buildSubmissionPayload(draftOf(), { type: 'update', targetSongId: 'huracan-hakuna', baseVersion: 1 })), []);
    eq(errors(buildSubmissionPayload(draftOf(), { type: 'create', contributor: { email: 'no-es-correo' } })), ['contributor-email-invalid']);
    eq(errors(buildSubmissionPayload(draftOf({ title: '' }), { type: 'create' })), ['song-invalid']);
    eq(errors(buildSubmissionPayload(draftOf({ content: 'x'.repeat(19_000), notes: undefined, tags: ['y'.repeat(50_000)] } as Partial<SongDraft>), { type: 'create' })), ['too-large']);
  });

  it('enviar: queda pendiente y devuelve código y token de edición distintos', async () => {
    const repository = createMemorySubmissionRepository({ now: () => NOW, publishedSongIds: published });
    const receipt = await repository.submit(
      buildSubmissionPayload(draftOf(), { type: 'create', contributor: { name: 'Ana', email: 'ana@example.com' } })
    );
    eq(isTrackingCode(receipt.trackingCode), true);
    eq(/^[0-9a-f]{64}$/.test(receipt.editToken), true);
    eq(receipt.editToken.includes(receipt.trackingCode), false, 'el código no es el token');
    eq(repository.count(), 1);
    const status = await repository.getPublicStatus(receipt.trackingCode.toLowerCase());
    eq(status, {
      trackingCode: receipt.trackingCode,
      type: 'create',
      title: 'Canción de prueba',
      status: 'pending',
      reviewNote: null,
      submittedAt: NOW.toISOString(),
      reviewedAt: null,
    });
  });

  it('el seguimiento nunca devuelve correo, nombre, token ni la canción', async () => {
    const repository = createMemorySubmissionRepository({ now: () => NOW });
    const receipt = await repository.submit(
      buildSubmissionPayload(draftOf(), { type: 'create', contributor: { name: 'Ana', email: 'ana@example.com' } })
    );
    const status = await repository.getPublicStatus(receipt.trackingCode);
    const text = JSON.stringify(status);
    eq(text.includes('ana@example.com'), false);
    eq(text.includes('Ana'), false);
    eq(text.includes(receipt.editToken), false);
    eq(text.includes('Letra del'), false);
    eq(Object.keys(status ?? {}).sort(), ['reviewNote', 'reviewedAt', 'status', 'submittedAt', 'title', 'trackingCode', 'type']);
  });

  it('la nota de revisión solo se muestra cuando ya se revisó', () => {
    const stored: SongSubmission = {
      id: 'x',
      type: 'create',
      targetSongId: null,
      proposedSong: draftOf(),
      status: 'pending',
      contributorName: null,
      contributorEmail: 'privado@example.com',
      trackingCode: 'GS-2345-6789',
      reviewNote: 'Nota interna aún no enviada',
      submittedAt: NOW.toISOString(),
      reviewedAt: null,
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    };
    eq(toPublicStatus(stored).reviewNote, null);
    eq(toPublicStatus({ ...stored, status: 'changes_requested', reviewNote: 'Revisa el coro' }).reviewNote, 'Revisa el coro');
  });

  it('una propuesta inválida no se guarda; un código desconocido no devuelve nada', async () => {
    const repository = createMemorySubmissionRepository({ publishedSongIds: published });
    await assert.rejects(
      repository.submit(buildSubmissionPayload(draftOf({ title: '' }), { type: 'create' })),
      (error: unknown) => error instanceof SubmissionError && error.reason === 'invalid'
    );
    checks++;
    eq(repository.count(), 0);
    eq(await repository.getPublicStatus('GS-2345-6789'), null);
    eq(await repository.getPublicStatus('lo que sea'), null);
  });
});

// --- Supabase, without a real Supabase ---------------------------------------------------

const jwt = (payload: object) =>
  ['eyJhbGciOiJIUzI1NiJ9', btoa(JSON.stringify(payload)).replace(/=+$/, ''), 'firma'].join('.');

describe('Configuración de Supabase', () => {
  it('sin variables: sin backend, sin errores', () => {
    eq(readSupabaseConfig({}), { state: 'unconfigured' });
  });

  it('valores de ejemplo, URL insegura o clave secreta: se rechazan', () => {
    eq(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co', VITE_SUPABASE_ANON_KEY: 'x' }).state, 'invalid');
    eq(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://example.com', VITE_SUPABASE_ANON_KEY: 'k' }), { state: 'invalid', reason: 'url' });
    eq(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: '' }), { state: 'invalid', reason: 'url' });
    eq(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: jwt({ role: 'service_role' }) }),
      { state: 'invalid', reason: 'secret-key' },
      'la service_role nunca se usa en el navegador'
    );
    eq(
      readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co', VITE_SUPABASE_ANON_KEY: 'sb_secret_abc' }),
      { state: 'invalid', reason: 'secret-key' }
    );
  });

  it('configuración válida (también el Supabase local)', () => {
    eq(readSupabaseConfig({ VITE_SUPABASE_URL: 'https://abc.supabase.co/', VITE_SUPABASE_ANON_KEY: ' sb_publishable_abc ' }), {
      state: 'configured',
      config: { url: 'https://abc.supabase.co', anonKey: 'sb_publishable_abc' },
    });
    eq(readSupabaseConfig({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_ANON_KEY: jwt({ role: 'anon' }) }).state, 'configured');
  });
});

interface Call {
  url: string;
  init: RequestInit;
}

function fakeFetch(respond: (url: string, init: RequestInit) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = respond(url, init);
    return new Response(JSON.stringify(body), { status });
  };
  return { calls, fetchImpl };
}

describe('Cliente REST', () => {
  it('lee con la clave pública; Authorization solo con claves JWT', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ body: [] }));
    await createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x' }, fetchImpl).select('songs', 'select=id');
    const headers = calls[0].init.headers as Record<string, string>;
    eq(calls[0].url, 'https://abc.supabase.co/rest/v1/songs?select=id');
    eq([headers.apikey, headers.Authorization], ['sb_publishable_x', undefined]);
    const anon = jwt({ role: 'anon' });
    await createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: anon }, fetchImpl).select('songs', 'select=id');
    eq((calls[1].init.headers as Record<string, string>).Authorization, `Bearer ${anon}`);
  });

  it('las funciones van por POST a /rpc y los errores conservan su código', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ status: 400, body: { message: 'GENESARET:rate_limited', code: 'P0001' } }));
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'k' }, fetchImpl);
    await assert.rejects(client.rpc('submit_song_submission', { p_payload: {} }), (error: unknown) =>
      error instanceof SupabaseRequestError && error.status === 400 && error.code === 'P0001'
    );
    checks++;
    eq([calls[0].url, calls[0].init.method, calls[0].init.body], [
      'https://abc.supabase.co/rest/v1/rpc/submit_song_submission',
      'POST',
      '{"p_payload":{}}',
    ]);
    assert.throws(() => client.select('songs; drop table songs', ''));
    checks++;
  });

  it('las Edge Functions van por POST a /functions/v1 con la clave pública', async () => {
    const { calls, fetchImpl } = fakeFetch(() => ({ body: { ok: true } }));
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x' }, fetchImpl);
    await client.invoke('submit-song', { payload: {} });
    eq([calls[0].url, calls[0].init.method, (calls[0].init.headers as Record<string, string>).apikey], [
      'https://abc.supabase.co/functions/v1/submit-song',
      'POST',
      'sb_publishable_x',
    ]);
    assert.throws(() => client.invoke('../rest/v1/rpc/x', {}));
    checks++;
  });
});

function fakeClient(handlers: {
  select?: (table: string, query: string) => unknown[];
  rpc?: (fn: string, args: Record<string, unknown>) => unknown;
  invoke?: (fn: string, body: Record<string, unknown>) => unknown;
}) {
  const queries: string[] = [];
  const client: SupabaseClient = {
    async select<T>(table: string, query: string) {
      queries.push(`${table}?${query}`);
      return (handlers.select?.(table, query) ?? []) as T[];
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      queries.push(`rpc:${fn}`);
      return handlers.rpc?.(fn, args) as T;
    },
    async invoke<T>(fn: string, body: Record<string, unknown>) {
      queries.push(`fn:${fn}`);
      return handlers.invoke?.(fn, body) as T;
    },
    async count() {
      return 0;
    },
  };
  return { client, queries };
}

describe('Repositorios de Supabase (preparados)', () => {
  it('el catálogo remoto pide solo lo publicado y devuelve canciones idénticas', async () => {
    // Como en la base real: cada fila dice en qué versión publicada está.
    const rows: SongRow[] = MOCK_SONGS.slice(0, 3).map((song) => ({ ...songToRow(song), current_version: 1 }));
    const { client, queries } = fakeClient({ select: () => rows });
    const repository = createSupabaseSongRepository(client);
    eq(await repository.listSongs(), MOCK_SONGS.slice(0, 3).map((song) => ({ ...song, version: 1 })));
    eq(queries[0].includes('status=eq.published'), true);
    await repository.getSong('huracan-hakuna');
    eq(queries[1].includes('id=eq.huracan-hakuna'), true);
  });

  it('enviar por la Edge Function (con Turnstile) y consultar por la función pública; errores traducidos', async () => {
    const sent: Record<string, unknown>[] = [];
    const { client, queries } = fakeClient({
      invoke: (_fn, body) => {
        sent.push(body);
        return { trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64) };
      },
      rpc: () => [{ tracking_code: 'GS-2345-6789', type: 'create', title: 'T', status: 'pending', review_note: null, submitted_at: 'x', reviewed_at: null }],
    });
    const repository = createSupabaseSubmissionRepository(client);
    const payload = buildSubmissionPayload(draftOf(), { type: 'create' });
    eq(await repository.submit(payload, { humanCheck: 'token-de-turnstile' }), {
      trackingCode: 'GS-2345-6789',
      editToken: 'a'.repeat(64),
    });
    eq(queries[0], 'fn:submit-song');
    eq(sent[0], { payload, turnstileToken: 'token-de-turnstile' });
    eq((await repository.getPublicStatus('gs 2345 6789'))?.status, 'pending');
    eq(await repository.getPublicStatus('no es un código'), null);

    const failingWith = (message: string, status: number) =>
      createSupabaseSubmissionRepository({
        select: async () => [],
        rpc: async <T,>() => [] as T,
        count: async () => 0,
        invoke: async () => {
          throw new SupabaseRequestError(message, status, null);
        },
      });
    for (const [message, status, reason] of [
      ['GENESARET:rate_limited', 429, 'rate-limited'],
      ['GENESARET:captcha', 403, 'human-check'],
      ['GENESARET:invalid', 400, 'invalid'],
      ['GENESARET:unavailable', 503, 'unavailable'],
    ] as const) {
      await assert.rejects(failingWith(message, status).submit(payload), (error: unknown) =>
        error instanceof SubmissionError && error.reason === reason
      );
      checks++;
    }
    // An answer without a receipt is a failure, never a fake success.
    const empty = createSupabaseSubmissionRepository({ select: async () => [], rpc: async <T,>() => [] as T, count: async () => 0, invoke: async <T,>() => ({}) as T });
    await assert.rejects(empty.submit(payload), (error: unknown) => error instanceof SubmissionError && error.reason === 'unavailable');
    checks++;
  });
});

// --- Transition: backend first, bundled catalog as safety net ----------------------------

describe('Catálogo remoto: solo traer y comprobar', () => {
  /** The 110 as the backend hands them over: each one with its published version. */
  const published = (songs: Song[]) => songs.map((song) => ({ ...song, version: 1 }));
  const remoteWith = (songs: Song[] | Error | 'never'): SongRepository => ({
    source: 'remote',
    listSongs: () =>
      songs === 'never' ? new Promise<Song[]>(() => {}) : songs instanceof Error ? Promise.reject(songs) : Promise.resolve(songs),
    getSong: async () => null,
  });

  it('una respuesta con canciones: tal cual, sin mezclar nada', async () => {
    eq(await fetchRemoteCatalog(remoteWith(published(MOCK_SONGS.slice(0, 3)))), { ok: true, songs: published(MOCK_SONGS.slice(0, 3)) });
  });

  it('una respuesta sin versión publicada no es el catálogo', async () => {
    eq(await fetchRemoteCatalog(remoteWith(MOCK_SONGS.slice(0, 3))), { ok: false, reason: 'invalid' });
  });

  it('caído, lento o vacío: un fallo con su motivo, nunca un catálogo vacío', async () => {
    eq(await fetchRemoteCatalog(remoteWith(new Error('500'))), { ok: false, reason: 'error' });
    eq(await fetchRemoteCatalog(remoteWith([])), { ok: false, reason: 'empty' });
    eq(await fetchRemoteCatalog(remoteWith('never'), { timeoutMs: 20 }), { ok: false, reason: 'timeout' });
  });

  it('un id repetido invalida la respuesta entera: no es un catálogo', async () => {
    const [first, second] = published(MOCK_SONGS.slice(0, 2));
    const result = await fetchRemoteCatalog(remoteWith([first, { ...first, title: 'Otra' }, second]));
    eq(result, { ok: false, reason: 'invalid' });
  });
});

// --- Song ids --------------------------------------------------------------------------

describe('Ids de canciones nuevas', () => {
  it('slug como los del catálogo (misma regla que slugify_song_id en SQL)', () => {
    eq(slugifySongId('Sencillamente Dios'), 'sencillamente-dios');
    eq(slugifySongId('  ¡Aleluya, Señor Jesús!  '), 'aleluya-senor-jesus');
    eq(slugifySongId('Ave María (Schubert)'), 'ave-maria-schubert');
    eq(slugifySongId('¿?'), 'cancion');
    eq(slugifySongId('x'.repeat(100)).length, 60);
    eq(SONG_ID_PATTERN.test(slugifySongId('Canción -- con   espacios--')), true);
  });

  it('si el id está ocupado, se numera', () => {
    eq(suggestSongId('Huracán', new Set(['huracan'])), 'huracan-2');
    eq(suggestSongId('Huracán', new Set(['huracan', 'huracan-2'])), 'huracan-3');
    eq(suggestSongId('Huracán', new Set()), 'huracan');
  });
});

// --- Edits of a published song: its version ---------------------------------------------

describe('Versión publicada de una canción', () => {
  const row = (overrides: Partial<SongRow> = {}): SongRow => ({ ...songToRow(MOCK_SONGS[0]), ...overrides });

  it('llega de current_version; sin ella (catálogo incluido) cuenta como 1', () => {
    eq(songFromRow(row({ current_version: 4 }))?.version, 4);
    for (const current_version of [undefined, null, 0, -2, 1.5, '3' as unknown as number]) {
      eq('version' in (songFromRow(row({ current_version })) as Song), false);
    }
    eq(songVersionOf(MOCK_SONGS[0]), 1);
    eq(songVersionOf({ version: 7 }), 7);
    // La importación y las instantáneas no llevan la versión: solo la base de datos la sube.
    eq('current_version' in songToRow({ ...MOCK_SONGS[0], version: 5 }), false);
    eq(SONG_READ_COLUMNS, [...SONG_COLUMNS, 'current_version']);
  });

  it('el catálogo remoto pide la versión de cada canción', async () => {
    const { client, queries } = fakeClient({ select: () => [row({ current_version: 2 })] });
    const songs = await createSupabaseSongRepository(client).listSongs();
    eq(songs[0].version, 2);
    eq(queries[0].includes('current_version'), true);
  });

  it('getSongForEdit: la canción publicada de ahora con su versión; oculta o inexistente, null', async () => {
    const found = fakeClient({ select: () => [row({ current_version: 3 })] });
    const result = await fetchSongForEdit(found.client, MOCK_SONGS[0].id);
    eq([result?.version, result?.song.id, result?.song.version], [3, MOCK_SONGS[0].id, 3]);
    eq(found.queries[0].includes('status=eq.published'), true);
    eq(found.queries[0].includes(`id=eq.${MOCK_SONGS[0].id}`), true);
    eq(await fetchSongForEdit(fakeClient({ select: () => [] }).client, 'oculta'), null);
    // Sin versión no se adivina: nunca se propone sobre una versión supuesta.
    await assert.rejects(fetchSongForEdit(fakeClient({ select: () => [row()] }).client, MOCK_SONGS[0].id));
    checks++;
  });
});

describe('Propuestas de edición: versión base', () => {
  const song = songToDraft(MOCK_SONGS[0]);
  const target = MOCK_SONGS[0].id;
  const published = new Set([target]);

  it('una corrección lleva su versión base; una canción nueva no', () => {
    eq(buildSubmissionPayload(song, { type: 'update', targetSongId: target, baseVersion: 2 }).baseVersion, 2);
    eq('baseVersion' in buildSubmissionPayload(song, { type: 'create', baseVersion: 2 }), false);
    const back = parseSubmissionPayload(JSON.parse(JSON.stringify(buildSubmissionPayload(song, { type: 'update', targetSongId: target, baseVersion: 2 }))));
    eq(back?.baseVersion, 2);
    eq('baseVersion' in (parseSubmissionPayload({ ...buildSubmissionPayload(song, { type: 'update', targetSongId: target }), baseVersion: '2' }) ?? {}), false);
  });

  it('validar: la versión base es obligatoria y entera en una corrección, y prohibida en una canción nueva', () => {
    const codes = (payload: ReturnType<typeof buildSubmissionPayload>) =>
      validateSubmissionPayload(payload, { publishedSongIds: published }).errors.map((error) => error.code);
    const edited = { ...song, title: `${song.title} (corregida)` };
    eq(codes(buildSubmissionPayload(edited, { type: 'update', targetSongId: target, baseVersion: 1 })), []);
    for (const baseVersion of [undefined, 0, -1, 1.5, 1e9]) {
      eq(codes(buildSubmissionPayload(edited, { type: 'update', targetSongId: target, baseVersion })), ['base-version-invalid']);
    }
    eq(codes({ ...buildSubmissionPayload(edited, { type: 'create' }), baseVersion: 1 }), ['base-version-invalid']);
  });

  it('una corrección que no cambia nada se detecta antes de enviarla', () => {
    const codes = (proposed: SongDraft) =>
      validateSubmissionPayload(buildSubmissionPayload(proposed, { type: 'update', targetSongId: target, baseVersion: 1 }), { publishedSong: song }).errors.map(
        (error) => error.code
      );
    eq(codes(song), ['no-changes']);
    // Espacios alrededor del título y campos vacíos cuentan como nada, igual que en la base de datos.
    eq(codes({ ...song, title: ` ${song.title} ` }), ['no-changes']);
    eq(songDraftChanges(song, { ...song, year: song.year ?? '' }), false);
    eq(codes({ ...song, content: `${song.content}\n[C]Una línea más` }), []);
    eq(codes({ ...song, tempo: (song.tempo ?? 60) + 1 }), []);
    eq(songDraftChanges(song, { ...song, tags: [...song.tags, 'nueva'] }), true);
  });

  it('getForEdit trae el destino, la versión base y cómo era esa versión', async () => {
    const snapshot = { ...songToRow(MOCK_SONGS[0]), current_version: 2, status: 'published' };
    const { client } = fakeClient({
      rpc: () => [
        { tracking_code: 'GS-2345-6789', type: 'update', status: 'changes_requested', review_note: 'Revisa', proposed_song: song, target_song_id: target, base_version: 2, base_snapshot: snapshot },
      ],
    });
    const forEdit = await createSupabaseSubmissionRepository(client).getForEdit('GS-2345-6789', 'a'.repeat(64));
    eq([forEdit?.targetSongId, forEdit?.baseVersion, forEdit?.baseSong], [target, 2, songToDraft(MOCK_SONGS[0])]);
    // Una corrección antigua (sin versión) o una canción nueva: sin base.
    const legacy = fakeClient({
      rpc: () => [
        { tracking_code: 'GS-2345-6789', type: 'update', status: 'changes_requested', review_note: null, proposed_song: song, target_song_id: target, base_version: null, base_snapshot: null },
      ],
    });
    const old = await createSupabaseSubmissionRepository(legacy.client).getForEdit('GS-2345-6789', 'a'.repeat(64));
    eq([old?.baseVersion, old?.baseSong], [null, null]);
    eq(draftFromSnapshot({ id: 'x' }), null);
    eq(draftFromSnapshot('texto'), null);
  });

  it('el reenvío lleva la versión base; el que no la tiene no la inventa', async () => {
    const sent: Record<string, unknown>[] = [];
    const { client } = fakeClient({
      invoke: (_fn, body) => {
        sent.push(body);
        return { trackingCode: 'GS-2345-6789', status: 'pending' };
      },
    });
    const repository = createSupabaseSubmissionRepository(client);
    await repository.resubmit({ trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64), song, baseVersion: 3 }, { humanCheck: 't' });
    await repository.resubmit({ trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64), song }, { humanCheck: 't' });
    eq([sent[0].baseVersion, 'baseVersion' in sent[1]], [3, false]);
  });

  it('canción cambiada, sin cambios u oculta: errores que la app puede explicar', async () => {
    const payload = buildSubmissionPayload(song, { type: 'update', targetSongId: target, baseVersion: 1 });
    const failingWith = (message: string, status: number) =>
      createSupabaseSubmissionRepository({
        select: async () => [],
        rpc: async <T,>() => [] as T,
        count: async () => 0,
        invoke: async () => {
          throw new SupabaseRequestError(message, status, null);
        },
      });
    for (const [message, status, reason] of [
      ['GENESARET:stale', 409, 'stale'],
      ['GENESARET:invalid:no_changes', 400, 'no-changes'],
      ['GENESARET:invalid:target', 400, 'target-hidden'],
      ['GENESARET:invalid:base_version', 400, 'invalid'],
    ] as const) {
      await assert.rejects(failingWith(message, status).submit(payload), (error: unknown) => error instanceof SubmissionError && error.reason === reason);
      await assert.rejects(
        failingWith(message, status).resubmit({ trackingCode: 'GS-2345-6789', editToken: 'a'.repeat(64), song, baseVersion: 1 }),
        (error: unknown) => error instanceof SubmissionError && error.reason === reason
      );
      checks += 2;
    }
  });

  it('en memoria, las mismas comprobaciones que la base de datos', async () => {
    const v1 = song;
    const v2 = { ...song, title: `${song.title} v2` };
    const publishedSongs = new Map([[target, { version: 2, song: v2, versions: new Map([[1, v1], [2, v2]]) }]]);
    const repository = createMemorySubmissionRepository({ publishedSongs });
    const edited = { ...v2, tags: [...v2.tags, 'editada'] };
    const reasonOf = (promise: Promise<unknown>) => promise.then(() => 'ok', (error: SubmissionError) => error.reason);
    eq(await reasonOf(repository.submit(buildSubmissionPayload(edited, { type: 'update', targetSongId: target, baseVersion: 1 }))), 'stale');
    eq(await reasonOf(repository.submit(buildSubmissionPayload(v2, { type: 'update', targetSongId: target, baseVersion: 2 }))), 'no-changes');
    eq(await reasonOf(repository.submit(buildSubmissionPayload(edited, { type: 'update', targetSongId: 'otra', baseVersion: 2 }))), 'target-hidden');
    const attempt = { requestId: '0f8fad5b-d9cb-469f-a165-70867728950e', editToken: 'c'.repeat(64) };
    const receipt = await repository.submit(buildSubmissionPayload(edited, { type: 'update', targetSongId: target, baseVersion: 2, attempt }));
    const forEdit = await repository.getForEdit(receipt.trackingCode, attempt.editToken);
    eq([forEdit?.targetSongId, forEdit?.baseVersion, forEdit?.baseSong], [target, 2, v2]);
  });
});
