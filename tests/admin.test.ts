import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AuthApiError, AuthRetryableFetchError, type SupabaseClient as SupabaseJsClient } from '@supabase/supabase-js';
import { checkSignInForm, resolveAccess, type AdminSession } from '../src/admin/auth';
import { EditorialError, createEditorialRepository, toEditorialError } from '../src/admin/editorialRepository';
import { suggestNewSongId, songIdProblem } from '../src/admin/review';
import { adminHash, isAdminHash, parseAdminRoute, sectionOf } from '../src/admin/routes';
import { matchesSubmission } from '../src/admin/search';
import { compareSongs, lineToText } from '../src/admin/songDiff';
import { emptySongDraft, type SongDraft } from '../src/catalog/songDraft';
import { songDraftChanges } from '../src/catalog/submission';
import { createSupabaseAdminAuth } from '../src/admin/supabaseAuth';
import { SupabaseRequestError, createSupabaseClient, type SupabaseClient } from '../src/lib/supabase';

let checks = 0;
const eq = (actual: unknown, expected: unknown) => {
  assert.deepEqual(actual, expected);
  checks++;
};
after(() => console.log(`admin: ${checks} comprobaciones`));

const USER = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const SUBMISSION = '0f8fad5b-d9cb-469f-a165-70867728950e';
const session: AdminSession = { userId: USER, email: 'equipo@example.com' };

// --- Routes -------------------------------------------------------------------------

describe('Rutas del panel', () => {
  it('solo #/admin y lo que cuelga de él abre el panel', () => {
    eq(['#/admin', '#/admin/', '#/admin/propuestas', '#/', '', '#/administracion', '#/song/admin'].map(isAdminHash), [
      true,
      true,
      true,
      false,
      false,
      false,
      false,
    ]);
  });

  it('cada dirección lleva a su pantalla, y lo desconocido a "no existe"', () => {
    eq(parseAdminRoute('#/admin'), { page: 'overview' });
    eq(parseAdminRoute('#/admin/'), { page: 'overview' });
    eq(parseAdminRoute('#/admin/propuestas'), { page: 'submissions', status: null });
    eq(parseAdminRoute('#/admin/propuestas/cambios-solicitados'), { page: 'submissions', status: 'changes_requested' });
    eq(parseAdminRoute('#/admin/propuestas/otra-cosa'), { page: 'not-found' });
    eq(parseAdminRoute(`#/admin/propuesta/${SUBMISSION}`), { page: 'submission', id: SUBMISSION });
    eq(parseAdminRoute('#/admin/canciones'), { page: 'songs' });
    eq(parseAdminRoute('#/admin/cancion/sencillamente-dios'), { page: 'song', id: 'sencillamente-dios' });
    eq(parseAdminRoute('#/admin/usuarios'), { page: 'not-found' });
    eq(parseAdminRoute('#/admin/propuesta/'), { page: 'not-found' });
  });

  it('los enlaces que construye el panel vuelven a leerse igual', () => {
    for (const status of ['pending', 'changes_requested', 'approved', 'rejected'] as const) {
      eq(parseAdminRoute(adminHash.submissions(status)), { page: 'submissions', status });
    }
    eq(parseAdminRoute(adminHash.submission(SUBMISSION)), { page: 'submission', id: SUBMISSION });
    eq(sectionOf(parseAdminRoute(adminHash.song('x'))), 'songs');
    eq(sectionOf({ page: 'not-found' }), null);
  });
});

// --- Access -------------------------------------------------------------------------

describe('Acceso al panel', () => {
  it('sin sesión: iniciar sesión; con rol: panel; sin rol o rol desconocido: sin acceso', async () => {
    eq(await resolveAccess(null, async () => 'admin'), { state: 'signed-out' });
    eq(await resolveAccess(session, async () => 'admin'), { state: 'ready', session, role: 'admin' });
    eq(await resolveAccess(session, async () => 'reviewer'), { state: 'ready', session, role: 'reviewer' });
    eq(await resolveAccess(session, async () => null), { state: 'no-role', session });
    eq(await resolveAccess(session, async () => 'superadmin'), { state: 'no-role', session });
  });

  it('si no se puede leer el rol, no se abre nada', async () => {
    eq(
      await resolveAccess(session, async () => {
        throw new Error('red');
      }),
      { state: 'error', session }
    );
  });

  it('el formulario pide un correo válido y una contraseña antes de preguntar al servidor', () => {
    eq(checkSignInForm('', ''), { email: 'Escribe un correo válido.', password: 'Escribe tu contraseña.' });
    eq(checkSignInForm(' equipo@example.com ', 'x'), {});
    eq(checkSignInForm('equipo@', 'x').email !== undefined, true);
  });
});

// --- Supabase Auth adapter ----------------------------------------------------------

function fakeSupabaseJs(options: { signIn?: () => unknown; stored?: unknown } = {}) {
  let stored: unknown = options.stored ?? null;
  const listeners: Array<(event: string, session: unknown) => void> = [];
  const calls: string[] = [];
  const auth = {
    async getSession() {
      return { data: { session: stored }, error: null };
    },
    async signInWithPassword(credentials: { email: string; password: string }) {
      calls.push(`signIn:${credentials.email}`);
      const result = options.signIn?.() ?? { user: { id: USER, email: credentials.email }, access_token: 'jwt-de-prueba' };
      if (result instanceof Error) return { data: { session: null, user: null }, error: result };
      stored = result;
      listeners.forEach((listener) => listener('SIGNED_IN', stored));
      return { data: { session: stored, user: (stored as { user: unknown }).user }, error: null };
    },
    async signOut(scope: unknown) {
      calls.push(`signOut:${JSON.stringify(scope)}`);
      stored = null;
      listeners.forEach((listener) => listener('SIGNED_OUT', null));
      return { error: null };
    },
    onAuthStateChange(listener: (event: string, session: unknown) => void) {
      listeners.push(listener);
      return { data: { subscription: { unsubscribe: () => listeners.splice(listeners.indexOf(listener), 1) } } };
    },
  };
  return { js: { auth } as unknown as SupabaseJsClient, calls, listeners };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('Sesión con Supabase Auth', () => {
  it('login correcto: sesión con id y correo; el token solo sale para las peticiones', async () => {
    const { js, calls } = fakeSupabaseJs();
    const auth = createSupabaseAdminAuth(js);
    eq(await auth.currentSession(), null);
    eq(await auth.accessToken(), null);
    eq(await auth.signIn(' equipo@example.com ', 'secreta'), { ok: true, session });
    eq(calls, ['signIn:equipo@example.com']);
    eq(await auth.accessToken(), 'jwt-de-prueba');
  });

  it('login incorrecto, sin confirmar, demasiados intentos o sin red: motivo claro, sin sesión', async () => {
    const cases: Array<[Error, string]> = [
      [new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'), 'invalid-credentials'],
      [new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'), 'email-not-confirmed'],
      [new AuthApiError('Too many requests', 429, 'over_request_rate_limit'), 'rate-limited'],
      [new AuthRetryableFetchError('Failed to fetch', 0), 'network'],
      [new Error('raro'), 'unavailable'],
    ];
    for (const [error, reason] of cases) {
      const auth = createSupabaseAdminAuth(fakeSupabaseJs({ signIn: () => error }).js);
      eq(await auth.signIn('equipo@example.com', 'mala'), { ok: false, reason });
      eq(await auth.currentSession(), null);
    }
  });

  it('restaurar al recargar: la sesión guardada vuelve sin pedir la contraseña', async () => {
    const { js } = fakeSupabaseJs({ stored: { user: { id: USER, email: 'equipo@example.com' }, access_token: 't' } });
    eq(await createSupabaseAdminAuth(js).currentSession(), session);
  });

  it('logout: cierra la sesión local y avisa a quien escucha (fuera del callback de Supabase)', async () => {
    const { js, calls } = fakeSupabaseJs();
    const auth = createSupabaseAdminAuth(js);
    const seen: Array<AdminSession | null> = [];
    const unsubscribe = auth.subscribe((value) => seen.push(value));
    await auth.signIn('equipo@example.com', 'secreta');
    await auth.signOut();
    eq(seen, []); // deferred, never inside Supabase's own callback
    await tick();
    eq(seen, [session, null]);
    eq(calls.at(-1), 'signOut:{"scope":"local"}');
    unsubscribe();
  });
});

// --- REST client as the reviewer ----------------------------------------------------

describe('Cliente REST con la sesión del revisor', () => {
  it('usa el token de la sesión cuando existe, y la clave pública cuando no', async () => {
    const seen: Array<Record<string, string>> = [];
    const fetchImpl = async (_url: string, init: RequestInit) => {
      seen.push(init.headers as Record<string, string>);
      return new Response('[]', { status: 200 });
    };
    let token: string | null = 'jwt-revisor';
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'sb_publishable_x' }, fetchImpl, {
      accessToken: async () => token,
    });
    await client.select('song_submissions', 'select=id');
    token = null;
    await client.select('songs', 'select=id');
    eq([seen[0].Authorization, seen[0].apikey], ['Bearer jwt-revisor', 'sb_publishable_x']);
    eq(seen[1].Authorization, undefined);
  });

  it('cuenta filas con Content-Range sin descargarlas', async () => {
    let init: RequestInit | null = null;
    const client = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'k' }, async (_url, request) => {
      init = request;
      return new Response(null, { status: 206, headers: { 'content-range': '0-0/42' } });
    });
    eq(await client.count('song_submissions', 'select=id&status=eq.pending'), 42);
    eq([init!.method, (init!.headers as Record<string, string>).Prefer], ['HEAD', 'count=exact']);
    const empty = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'k' }, async () =>
      new Response(null, { status: 200, headers: { 'content-range': '*/0' } })
    );
    eq(await empty.count('songs', 'select=id'), 0);
    const denied = createSupabaseClient({ url: 'https://abc.supabase.co', anonKey: 'k' }, async () => new Response(null, { status: 401 }));
    await assert.rejects(denied.count('song_submissions', 'select=id'), SupabaseRequestError);
    checks++;
  });
});

// --- Editorial repository -----------------------------------------------------------

function fakeClient(handlers: { select?: (table: string, query: string) => unknown[]; rpc?: (fn: string, args: Record<string, unknown>) => unknown; count?: (table: string, query: string) => number } = {}) {
  const log: string[] = [];
  const client: SupabaseClient = {
    async select<T>(table: string, query: string) {
      log.push(`select ${table}?${query}`);
      return (handlers.select?.(table, query) ?? []) as T[];
    },
    async rpc<T>(fn: string, args: Record<string, unknown>) {
      log.push(`rpc ${fn} ${JSON.stringify(args)}`);
      return handlers.rpc?.(fn, args) as T;
    },
    async invoke() {
      throw new Error('el panel no usa Edge Functions');
    },
    async count(table: string, query: string) {
      log.push(`count ${table}?${query}`);
      return handlers.count?.(table, query) ?? 0;
    },
  };
  return { client, log };
}

const listRow = {
  id: SUBMISSION,
  type: 'create',
  status: 'pending',
  target_song_id: null,
  tracking_code: 'GS-2345-6789',
  submitted_at: '2026-09-19T10:00:00Z',
  reviewed_at: null,
  title: 'Canción de prueba',
  artist: null,
  contributor_name: null,
  contributor_email: 'persona@example.com',
};

describe('Repositorio editorial', () => {
  it('el rol propio: se pregunta solo por un uuid válido', async () => {
    const { client, log } = fakeClient({ select: () => [{ role: 'reviewer' }] });
    const repository = createEditorialRepository(client);
    eq(await repository.getOwnRole(USER), 'reviewer');
    eq(await repository.getOwnRole("x' or 1=1"), null);
    eq(log, [`select editorial_roles?select=role&user_id=eq.${USER}&limit=1`]);
  });

  it('la lista: más recientes primero, filtro por estado, y el correo se queda en "con contacto"', async () => {
    const { client, log } = fakeClient({ select: () => [listRow] });
    const repository = createEditorialRepository(client);
    const [item] = await repository.listSubmissions({ status: 'pending' });
    eq(item.hasContact, true);
    eq(JSON.stringify(item).includes('persona@example.com'), false);
    eq(Object.keys(item).sort(), ['artist', 'hasContact', 'id', 'reviewedAt', 'status', 'submittedAt', 'targetSongId', 'title', 'trackingCode', 'type']);
    eq(log[0].includes('&status=eq.pending&order=submitted_at.desc'), true);
    await repository.listSubmissions();
    eq(log[1].includes('status=eq.'), false);
  });

  it('el detalle se pide por id (uuid), nunca por código de seguimiento', async () => {
    const { client, log } = fakeClient({
      select: () => [
        {
          ...listRow,
          proposed_song: { schemaVersion: 1, title: 'Canción de prueba', content: '[G]Hola', categories: [], tags: [], chordsUsed: ['G'] },
          review_note: null,
          reviewed_by: null,
          published_song_id: null,
          published_version: null,
          resubmission_count: 1,
          resubmitted_at: '2026-09-19T12:00:00Z',
        },
      ],
    });
    const repository = createEditorialRepository(client);
    const detail = await repository.getSubmission(SUBMISSION);
    eq([detail?.contributorEmail, detail?.proposedSong?.title], ['persona@example.com', 'Canción de prueba']);
    eq([detail?.resubmissionCount, detail?.resubmittedAt], [1, '2026-09-19T12:00:00Z']);
    eq(log[0].includes(`&id=eq.${SUBMISSION}&limit=1`), true);
    eq(await repository.getSubmission('GS-2345-6789'), null);
    eq(log.length, 1);
  });

  it('el resumen cuenta cada estado en la base de datos', async () => {
    const { client, log } = fakeClient({ count: (_table, query) => (query.includes('pending') ? 3 : 1) });
    const counts = await createEditorialRepository(client).countSubmissions(new Date('2026-09-19T00:00:00Z'));
    eq(counts, { pending: 3, changesRequested: 1, approvedRecently: 1, rejectedRecently: 1 });
    eq(log.some((entry) => entry.includes('status=eq.approved&reviewed_at=gte.2026-08-20')), true);
  });

  it('aprobar, pedir cambios y rechazar llaman a las funciones de la base de datos', async () => {
    const { client, log } = fakeClient({ rpc: (fn) => (fn === 'approve_submission' ? [{ song_id: 'cancion-de-prueba', version: 1 }] : null) });
    const repository = createEditorialRepository(client);
    eq(await repository.approve(SUBMISSION, 3, { songId: ' cancion-de-prueba ', reviewNote: '  ' }), { songId: 'cancion-de-prueba', version: 1 });
    await repository.requestChanges(SUBMISSION, ' Revisa el segundo verso. ', 3);
    await repository.reject(SUBMISSION, 'Duplicada', 4);
    eq(log, [
      `rpc approve_submission {"p_submission_id":"${SUBMISSION}","p_song_id":"cancion-de-prueba","p_review_note":null,"p_expected_revision":3}`,
      `rpc request_submission_changes {"p_submission_id":"${SUBMISSION}","p_review_note":"Revisa el segundo verso.","p_expected_revision":3}`,
      `rpc reject_submission {"p_submission_id":"${SUBMISSION}","p_review_note":"Duplicada","p_expected_revision":4}`,
    ]);
  });

  it('pedir cambios o rechazar sin mensaje no llega al servidor', async () => {
    const { client, log } = fakeClient();
    const repository = createEditorialRepository(client);
    await assert.rejects(repository.requestChanges(SUBMISSION, '   ', 1), (error: unknown) => error instanceof EditorialError && error.reason === 'invalid');
    await assert.rejects(repository.reject(SUBMISSION, '', 1), (error: unknown) => error instanceof EditorialError && error.reason === 'invalid');
    eq(log, []);
  });

  it('una edición trae la versión sobre la que se hizo, y su canción destino cómo está ahora', async () => {
    const detail = fakeClient({
      select: () => [
        {
          ...listRow,
          type: 'update',
          target_song_id: 'sencillamente-dios',
          base_version: 2,
          proposed_song: { schemaVersion: 1, title: 'Sencillamente Dios', content: '[G]Hola', categories: [], tags: [], chordsUsed: ['G'] },
          review_note: null,
          reviewed_by: null,
          published_song_id: null,
          published_version: null,
          resubmission_count: 0,
          resubmitted_at: null,
        },
      ],
    });
    const repository = createEditorialRepository(detail.client);
    eq((await repository.getSubmission(SUBMISSION))?.baseVersion, 2);
    eq(detail.log[0].includes('base_version'), true);
    // Una propuesta anterior a las versiones no inventa ninguna.
    for (const base_version of [null, 0, 'dos']) {
      const old = fakeClient({ select: () => [{ ...listRow, base_version, proposed_song: null, resubmission_count: 0 }] });
      eq((await createEditorialRepository(old.client).getSubmission(SUBMISSION))?.baseVersion, null);
    }

    const target = fakeClient({
      select: () => [
        {
          id: 'sencillamente-dios',
          title: 'Sencillamente Dios',
          artist: null,
          original_key: 'G',
          recommended_capo: null,
          time_signature: null,
          tempo: null,
          rhythm_pattern: null,
          categories: [],
          liturgical_seasons: null,
          tags: [],
          content: '[G]Hola',
          chords_used: ['G'],
          difficulty: null,
          year: null,
          youtube_id: null,
          current_version: 3,
          status: 'hidden',
        },
      ],
    });
    const found = await createEditorialRepository(target.client).getTargetSong('sencillamente-dios');
    eq([found?.status, found?.currentVersion, found?.song.version], ['hidden', 3, 3]);
    eq(target.log[0].includes('current_version,status'), true);
    eq(await createEditorialRepository(fakeClient({ select: () => [] }).client).getTargetSong('no-existe'), null);
  });

  it('cada decisión editorial nombra la revisión que se leyó', async () => {
    const { client, log } = fakeClient({
      select: () => [
        {
          ...listRow,
          base_version: null,
          revision: 4,
          proposed_song: { schemaVersion: 1, title: 'T', content: '[G]x', categories: [], tags: [], chordsUsed: ['G'] },
          review_note: null,
          reviewed_by: null,
          published_song_id: null,
          published_version: null,
          resubmission_count: 0,
          resubmitted_at: null,
        },
      ],
      rpc: () => [{ song_id: 'x', version: 2 }],
    });
    const repository = createEditorialRepository(client);
    const detail = await repository.getSubmission(SUBMISSION);
    eq(detail?.revision, 4);
    eq(log[0].includes(',revision,'), true);
    await repository.approve(SUBMISSION, detail!.revision);
    eq(log[1].includes('"p_expected_revision":4'), true);
    // Una propuesta guardada antes de que existieran las revisiones cuenta como la 1.
    for (const revision of [null, 0, 'dos']) {
      const old = fakeClient({ select: () => [{ ...listRow, revision, proposed_song: null, resubmission_count: 0 }] });
      eq((await createEditorialRepository(old.client).getSubmission(SUBMISSION))?.revision, 1);
    }
  });

  it('las negativas de la base de datos llegan con un motivo claro', () => {
    const reasons = [
      new SupabaseRequestError('GENESARET:forbidden', 403, '42501'),
      new SupabaseRequestError('permission denied for table song_submissions', 401, '42501'),
      new SupabaseRequestError('JWT expired', 401, 'PGRST303'),
      new SupabaseRequestError('GENESARET:not_reviewable', 400, 'P0001'),
      new SupabaseRequestError('GENESARET:song_id_taken', 400, 'P0001'),
      new SupabaseRequestError('GENESARET:not_found', 400, 'P0001'),
      new SupabaseRequestError('GENESARET:stale', 400, 'P0001'),
      new SupabaseRequestError('GENESARET:submission_changed', 400, 'P0001'),
      new SupabaseRequestError('GENESARET:invalid:target', 400, 'P0001'),
      new SupabaseRequestError('new row violates check constraint', 400, '23514'),
      new Error('offline'),
    ].map((error) => toEditorialError(error).reason);
    eq(reasons, [
      'forbidden',
      'forbidden',
      'session',
      'not-reviewable',
      'song-id-taken',
      'not-found',
      'stale',
      'submission-changed',
      'target-hidden',
      'invalid',
      'unavailable',
    ]);
  });
});

// --- What counts as a change --------------------------------------------------------

describe('El editor y el panel ven los mismos cambios musicales', () => {
  const draftOf = (content: string): SongDraft => ({
    ...emptySongDraft(),
    title: 'Canción',
    originalKey: 'G',
    content,
    chordsUsed: ['G'],
  });
  const base = draftOf(['[Coro]', 'Hola'].join(String.fromCharCode(10)));
  /** [editor, panel]: ambos tienen que decir lo mismo de cada caso. */
  const seenBy = (proposed: SongDraft) => [songDraftChanges(base, proposed), !compareSongs(base, proposed).identical];

  it('una repetición escrita en el encabezado es un cambio', () => {
    // Codex: «[Coro (x2)]» pasaba por idéntico en el panel.
    eq(seenBy(draftOf(['[Coro (x2)]', 'Hola'].join(String.fromCharCode(10)))), [true, true]);
    eq(seenBy(draftOf(['[Coro (x3)]', 'Hola'].join(String.fromCharCode(10)))), [true, true]);
    const twice = draftOf(['[Coro (x2)]', 'Hola'].join(String.fromCharCode(10)));
    const thrice = draftOf(['[Coro (x3)]', 'Hola'].join(String.fromCharCode(10)));
    // x2 frente a x3 también es un cambio.
    eq([songDraftChanges(twice, thrice), !compareSongs(twice, thrice).identical], [true, true]);
  });

  it('una indicación del encabezado también', () => {
    eq(seenBy(draftOf(['[Coro suave]', 'Hola'].join(String.fromCharCode(10)))), [true, true]);
  });

  it('nombre, letra, acordes, repetición de sección e identidad', () => {
    eq(seenBy(draftOf(['[Estribillo]', 'Hola'].join(String.fromCharCode(10)))), [true, true]); // nombre
    eq(seenBy(draftOf(['[Coro]', 'Adiós'].join(String.fromCharCode(10)))), [true, true]); // letra
    eq(seenBy(draftOf(['[Coro]', '[G]Hola'].join(String.fromCharCode(10)))), [true, true]); // acorde
    eq(seenBy(draftOf(['[Coro]', 'Hola', '', 'Coro'].join(String.fromCharCode(10)))), [true, true]); // una llamada que repite el coro
    eq(seenBy(base), [false, false]); // el mismo documento
    eq(seenBy(draftOf(['[Coro]', 'Hola'].join(String.fromCharCode(10)))), [false, false]); // otro objeto con el mismo texto
  });

  it('los espacios al final de una línea: el editor los ve, el panel no', () => {
    // Discrepancia conocida y documentada: la base de datos compara el texto
    // literal, como el editor; el panel compara la música y por eso los
    // ignora. Igualarlo tocaría la función de publicación ya auditada.
    eq(seenBy(draftOf(['[Coro]', 'Hola  '].join(String.fromCharCode(10)))), [true, false]);
  });
});

// --- Review helpers ----------------------------------------------------------------

describe('Identificador de una canción nueva', () => {
  const taken = new Set(['cancion-de-prueba']);
  const bundled = new Set(['sencillamente-dios']);

  it('se propone libre frente al servidor y frente a las canciones incluidas', () => {
    eq(suggestNewSongId('Canción de prueba', taken, bundled), 'cancion-de-prueba-2');
    eq(suggestNewSongId('Sencillamente Dios', taken, bundled), 'sencillamente-dios-2');
    eq(suggestNewSongId('Señor, ¡ven!', taken, bundled), 'senor-ven');
    eq(suggestNewSongId('¿?¡!', taken, bundled), 'cancion');
    eq(suggestNewSongId('a'.repeat(200), taken, bundled).length <= 60, true);
  });

  it('uno elegido a mano se rechaza si está ocupado, reservado o mal formado', () => {
    eq(songIdProblem('cancion-nueva', taken, bundled), null);
    eq(songIdProblem('cancion-de-prueba', taken, bundled)?.includes('Ya existe'), true);
    eq(songIdProblem('sencillamente-dios', taken, bundled)?.includes('incluidas en la app'), true);
    eq(songIdProblem('Canción Nueva', taken, bundled)?.includes('minúsculas'), true);
    eq(songIdProblem('-x', taken, bundled) !== null, true);
    eq(songIdProblem('   ', taken, bundled), 'Escribe un identificador.');
  });
});

describe('Búsqueda en la bandeja', () => {
  const item = { title: 'Canción del Señor', artist: 'Coro Juvenil', trackingCode: 'GS-2345-6789' };
  it('título, artista o código; sin acentos ni mayúsculas; todas las palabras', () => {
    eq(['cancion', 'SEÑOR', 'coro juvenil', 'gs-2345', '23456789', 'gs 2345 6789', '', 'senor coro'].map((query) => matchesSubmission(item, query)), [
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    eq(['alabanza', 'GS-9999', 'coro adulto'].map((query) => matchesSubmission(item, query)), [false, false, false]);
  });
});

describe('Comparación publicada | propuesta', () => {
  const published = {
    ...emptySongDraft(),
    title: 'Himno de prueba',
    originalKey: 'G',
    tempo: 80,
    content: '[Verso 1]\n[G]Luz del [D]alba\n[Em]nueva es\n\n[Coro]\n[C]Canta [G]ya',
    chordsUsed: ['G', 'D', 'Em', 'C'],
  };

  it('una copia idéntica no tiene cambios', () => {
    const comparison = compareSongs(published, { ...published });
    eq([comparison.identical, comparison.fields, comparison.orderChanged], [true, [], false]);
  });

  it('metadatos, acordes, letra, secciones nuevas y eliminadas, sin diff de caracteres', () => {
    const proposed = {
      ...published,
      originalKey: 'A',
      tempo: 84,
      content: '[Verso 1]\n[G]Luz del [A]alba\n[Em]nueva es\n\n[Puente]\n[D]Otra vez',
      chordsUsed: ['G', 'A', 'Em', 'D'],
    };
    const comparison = compareSongs(published, proposed);
    eq(comparison.identical, false);
    eq(comparison.fields.map((field) => [field.label, field.before, field.after]), [
      ['Tonalidad', 'G', 'A'],
      ['BPM', '80', '84'],
    ]);
    const verse = comparison.sections.find((section) => section.label === 'Verso 1');
    eq([verse?.change, verse?.lyricsChanged, verse?.chordsChanged], ['changed', false, true]);
    eq(verse?.before?.map((line) => [line.text, line.changed]), [
      ['[G]Luz del [D]alba', true],
      ['[Em]nueva es', false],
    ]);
    eq(verse?.after?.[0], { text: '[G]Luz del [A]alba', changed: true });
    eq(comparison.sections.filter((section) => section.change === 'added').map((section) => section.label), ['Puente']);
    eq(comparison.sections.filter((section) => section.change === 'removed').map((section) => section.label), ['Coro']);
  });

  it('un cambio de orden se dice como tal', () => {
    const reordered = { ...published, content: '[Coro]\n[C]Canta [G]ya\n\n[Verso 1]\n[G]Luz del [D]alba\n[Em]nueva es' };
    const comparison = compareSongs(published, reordered);
    eq([comparison.orderChanged, comparison.orderBefore, comparison.orderAfter], [true, ['Verso 1', 'Coro'], ['Coro', 'Verso 1']]);
  });

  it('las líneas vuelven a la notación del cancionero con los acordes en su sitio', () => {
    eq(lineToText({ kind: 'lyrics', text: 'Señor, quiero', chords: [{ at: 0, chord: 'G' }, { at: 7, chord: 'D/F#' }] }), '[G]Señor, [D/F#]quiero');
    eq(lineToText({ kind: 'lyrics', text: '', chords: [{ at: 0, chord: 'G' }, { at: 0, chord: 'D' }] }), '[G][D]');
  });
});
