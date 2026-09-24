import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import { createSupabaseClient } from '../src/lib/supabase';
import {
  CLOUD_LIMITS,
  SETLIST_PAYLOAD_VERSION,
  SetlistCloudAuthError,
  cloudSetlistProblem,
  cloudToSetlist,
  createCloudSetlistRepository,
  setlistToCloud,
  type CloudSetlistRow,
} from '../src/storage/cloudSetlists';

/**
 * The cloud boundary of setlists, on its own.
 *
 * Nothing here touches a real Supabase: `fetch` is a function these tests
 * wrote, and every request it receives is inspected instead of sent. Nothing
 * here synchronises either — that is the next step, and this one only has to
 * say what travels, what a row means, and what a write answers.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`cloudSetlists.test: ${checks} comprobaciones`));

const URL_BASE = 'https://abc.supabase.co';
const CONFIG = { url: URL_BASE, anonKey: 'sb_publishable_x' };
const NOW = Date.UTC(2026, 8, 15, 12);

interface Call {
  url: string;
  init: RequestInit;
}

/** A Supabase that answers what the test says, and remembers what it was asked. */
function fakeCloud(respond: (url: string, init: RequestInit) => { status?: number; body: unknown } = () => ({ body: [] })) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const { status = 200, body } = respond(url, init);
    return new Response(JSON.stringify(body), { status });
  };
  const client = createSupabaseClient(CONFIG, fetchImpl, { accessToken: async () => 'token-de-la-sesion' });
  return { calls, client, repo: createCloudSetlistRepository(client, async () => 'token-de-la-sesion') };
}

/** The same, for somebody who is not signed in. */
function signedOut() {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return new Response('[]', { status: 200 });
  };
  const client = createSupabaseClient(CONFIG, fetchImpl);
  return { calls, repo: createCloudSetlistRepository(client, async () => null) };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body)) as Record<string, unknown>;

// --- A setlist with everything in it -------------------------------------------------

const section = (id: string, sourceSectionId: string, label: string, members: string[]) => ({
  id,
  sourceSectionId,
  source: { signature: `firma-${sourceSectionId}`, version: 2 },
  label,
  repeatCount: 2,
  voices: ['women' as const, 'soloist' as const],
  assignedMemberIds: members,
  instruction: 'Entrar suave',
  transition: { type: 'continue' as const },
});

const item = (id: string, songId: string, overrides: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  songId,
  moment: 'Entrada',
  transposeSteps: 2,
  capoFret: 3,
  notes: 'Último coro x2',
  ...overrides,
});

const fullSetlist = (): Setlist => ({
  id: 'setlist-1234',
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Primera prueba',
  participantIds: ['miembro-ana', 'miembro-bruno'],
  items: [
    item('item-1', 'huracan-hakuna', {
      arrangement: {
        songVersion: 2,
        sections: [
          section('bloque-1', 'section-1', 'Coro', ['miembro-ana']),
          section('bloque-2', 'section-1', 'Coro', ['miembro-bruno']),
          section('bloque-3', 'section-2', 'Verso 1', []),
        ],
      },
      transitionToNext: { type: 'direct', instruction: 'Sin parar' },
    }),
    item('item-2', 'otra-cancion'),
  ],
  createdAt: NOW,
  updatedAt: NOW + 60_000,
});

// --- Serialización -------------------------------------------------------------------

describe('Un setlist camino de la nube', () => {
  it('conserva todo lo que se puede llevar', () => {
    const setlist = fullSetlist();
    const row = setlistToCloud(setlist, 1);

    eq(row.id, 'setlist-1234', 'el id de siempre, que es lo que lo identifica en los dos sitios');
    eq([row.name, row.date, row.description], ['Misa Domingo', '2026-10-04', 'Primera prueba']);
    eq(row.payload_version, SETLIST_PAYLOAD_VERSION);
    eq(row.revision, 1);
    eq(row.client_created_at, new Date(NOW).toISOString(), 'el reloj del dispositivo, en ISO');
    eq(row.client_updated_at, new Date(NOW + 60_000).toISOString());
    // Una celebración sin fecha no tiene fecha: la columna admite nulo, y "" no es una fecha.
    eq(setlistToCloud({ ...setlist, date: '' }, 1).date, null);
    eq(setlistToCloud({ ...setlist, description: '' }, 1).description, null);

    const [first, second] = row.items;
    eq(row.items.map((entry) => entry.id), ['item-1', 'item-2'], 'y en el orden en que se tocan');
    eq(
      [first.songId, first.moment, first.transposeSteps, first.capoFret, first.notes],
      ['huracan-hakuna', 'Entrada', 2, 3, 'Último coro x2']
    );
    eq(second.songId, 'otra-cancion');
    eq(first.transitionToNext, { type: 'direct', instruction: 'Sin parar' }, 'lo que pasa al terminar esta canción');

    eq(first.arrangement?.songVersion, 2, 'sobre qué versión de la canción se hizo el arreglo');
    eq(first.arrangement?.sections.map((block) => block.id), ['bloque-1', 'bloque-2', 'bloque-3']);
    eq(first.arrangement?.sections[0], {
      id: 'bloque-1',
      sourceSectionId: 'section-1',
      source: { signature: 'firma-section-1', version: 2 },
      label: 'Coro',
      repeatCount: 2,
      voices: ['women', 'soloist'],
      instruction: 'Entrar suave',
      transition: { type: 'continue' },
    }, 'el bloque entero, menos quién lo canta');
  });

  it('deja en el dispositivo lo que la nube todavía no sabe leer', () => {
    const row = setlistToCloud(fullSetlist(), 1);
    const json = JSON.stringify(row);

    eq('participantIds' in row, false, 'el equipo de la celebración no sube');
    for (const block of row.items[0].arrangement?.sections ?? []) {
      eq('assignedMemberIds' in block, false, `quién canta el ${block.id} tampoco`);
    }
    // Ni por otro camino: ningún id de miembro aparece en ninguna parte.
    for (const memberId of ['miembro-ana', 'miembro-bruno']) {
      eq(json.includes(memberId), false, memberId);
    }
    // Y no se convierten en nombres ni se inventa un miembro en la nube.
    eq(json.includes('owner_id'), false, 'de quién es la fila lo decide la base de datos');
  });

  it('no toca el setlist que se le da', () => {
    const setlist = fullSetlist();
    const copy = structuredClone(setlist);
    const row = setlistToCloud(setlist, 1);

    eq(setlist, copy, 'el original, intacto');
    // Y lo que devuelve tampoco comparte nada con él: cambiarlo no cambia el setlist.
    row.items[0].arrangement?.sections.splice(0, 1);
    row.items[1].notes = 'cambiado';
    eq(setlist.items[0].arrangement?.sections.length, 3);
    eq(setlist.participantIds, ['miembro-ana', 'miembro-bruno']);
  });

  it('lo que la tabla no admite se dice antes de enviar nada', () => {
    const setlist = fullSetlist();
    eq(cloudSetlistProblem(setlist), null, 'un setlist normal cabe de sobra');

    // El editor permite un nombre de 120 y una descripción de 1000; la tabla,
    // 80 y 500. Un setlist viejo puede no caber, y eso se dice, no se recorta.
    eq(cloudSetlistProblem({ ...setlist, name: 'N'.repeat(CLOUD_LIMITS.name) }), null);
    eq(cloudSetlistProblem({ ...setlist, name: 'N'.repeat(CLOUD_LIMITS.name + 1) }), 'name');
    eq(cloudSetlistProblem({ ...setlist, name: '   ' }), 'name', 'un nombre en blanco no es un nombre');
    eq(cloudSetlistProblem({ ...setlist, description: 'D'.repeat(CLOUD_LIMITS.description + 1) }), 'description');
    eq(cloudSetlistProblem({ ...setlist, date: '04/10/2026' }), 'date');
    eq(cloudSetlistProblem({ ...setlist, date: '' }), null, 'sin fecha está bien');
    eq(cloudSetlistProblem({ ...setlist, id: 'corto' }), 'id');
    eq(cloudSetlistProblem({ ...setlist, id: 'con espacio en medio' }), 'id');
    eq(cloudSetlistProblem({ ...setlist, id: 'x'.repeat(65) }), 'id');
    const many = Array.from({ length: CLOUD_LIMITS.items + 1 }, (_, index) => item(`item-${index}`, 'huracan-hakuna'));
    eq(cloudSetlistProblem({ ...setlist, items: many }), 'item-count');
    const huge = [item('item-enorme', 'huracan-hakuna', { notes: 'x'.repeat(CLOUD_LIMITS.payloadBytes) })];
    eq(cloudSetlistProblem({ ...setlist, items: huge }), 'payload-size');
  });
});

// --- Hidratación ---------------------------------------------------------------------

/**
 * Server clocks deliberately far from the device's: the row was first written
 * a day later than the setlist was made, and last touched a week after it was
 * last edited. Nothing of that may end up in the setlist.
 */
const SERVER_CREATED = '2026-09-16T09:30:00+00:00';
const SERVER_UPDATED = '2026-09-22T18:45:00+00:00';

const rowOf = (overrides: CloudSetlistRow = {}): CloudSetlistRow => ({
  ...setlistToCloud(fullSetlist(), 3),
  created_at: SERVER_CREATED,
  updated_at: SERVER_UPDATED,
  deleted_at: null,
  ...overrides,
});

describe('Una fila de la nube camino del dispositivo', () => {
  it('vuelve a ser un setlist', () => {
    const read = cloudToSetlist(rowOf());
    assert.equal(read.state, 'setlist');
    checks++;
    if (read.state !== 'setlist') return;

    eq([read.id, read.revision], ['setlist-1234', 3]);
    eq(read.serverUpdatedAt, SERVER_UPDATED, 'la hora del servidor, que es la que manda al sincronizar');
    eq([read.setlist.name, read.setlist.date, read.setlist.description], ['Misa Domingo', '2026-10-04', 'Primera prueba']);
    eq(read.setlist.items.map((entry) => entry.id), ['item-1', 'item-2']);
    eq(read.setlist.items[0].transitionToNext, { type: 'direct', instruction: 'Sin parar' });
    eq(read.setlist.items[0].arrangement?.songVersion, 2);
    eq([read.setlist.createdAt, read.setlist.updatedAt], [NOW, NOW + 60_000], 'los relojes del dispositivo vuelven como estaban');
  });

  it('los relojes del servidor no se cuelan en el setlist', () => {
    // La fila se escribió un día después de hacerse el setlist, y se tocó por
    // última vez una semana después de editarlo. Nada de eso es el setlist:
    // createdAt y updatedAt son lo que la persona ve, y vienen de su
    // dispositivo. Los del servidor son metadatos para sincronizar.
    const read = cloudToSetlist(rowOf());
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');

    eq(read.setlist.createdAt, NOW, 'createdAt sale de client_created_at');
    eq(read.setlist.updatedAt, NOW + 60_000, 'updatedAt sale de client_updated_at');
    eq(read.setlist.createdAt, Date.parse('2026-09-15T12:00:00.000Z'));
    eq(read.setlist.createdAt === Date.parse(SERVER_CREATED), false, 'y nunca de created_at');
    eq(read.setlist.updatedAt === Date.parse(SERVER_UPDATED), false, 'ni de updated_at');
    eq(read.serverUpdatedAt, SERVER_UPDATED, 'que se conserva aparte, tal cual llegó');

    // Cambiar sólo los del servidor no cambia el setlist en absoluto.
    const later = cloudToSetlist(rowOf({ created_at: '2030-01-01T00:00:00+00:00', updated_at: '2030-01-01T00:00:00+00:00' }));
    if (later.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq([later.setlist.createdAt, later.setlist.updatedAt], [NOW, NOW + 60_000]);
  });

  it('un reloj del dispositivo que no se entiende hace la fila corrupta, no "de ahora"', () => {
    // El almacén local sustituye por la hora actual un timestamp que no puede
    // leer. Aquí eso convertiría una fila estropeada en una recién hecha, que
    // en una sincronización es la que gana: se rechaza antes de llegar ahí.
    for (const bad of ['ayer', '', '2026', '2026-09-15', '2026-09-15 12:00:00', '2026-09-15T12:00:00', 1_758_000_000_000, null]) {
      eq(cloudToSetlist(rowOf({ client_created_at: bad })).state, 'corrupt', String(bad));
      eq(cloudToSetlist(rowOf({ client_updated_at: bad })).state, 'corrupt', String(bad));
    }
    // Sin zona horaria no se sabe cuándo fue: se lee en la del teléfono, que
    // es distinta en cada uno. Con zona, sí, la escriba como la escriba.
    for (const good of ['2026-09-15T12:00:00+00:00', '2026-09-15T12:00:00.000Z', '2026-09-15T14:00:00+02:00', '2026-09-15T12:00:00-0300']) {
      eq(cloudToSetlist(rowOf({ client_created_at: good })).state, 'setlist', good);
    }
    eq(cloudToSetlist(rowOf({ client_created_at: '2026-09-15T14:00:00+02:00' })).state, 'setlist');
    const shifted = cloudToSetlist(rowOf({ client_created_at: '2026-09-15T14:00:00+02:00' }));
    if (shifted.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(shifted.setlist.createdAt, NOW, 'la misma hora, dicha en otra zona');

    // Y una fecha anterior a 1970: el almacén la leería como "sin fecha" y
    // pondría la de ahora.
    eq(cloudToSetlist(rowOf({ client_created_at: '1969-07-20T20:17:00+00:00' })).state, 'corrupt');
  });

  it('sin nada en el dispositivo, nadie queda asignado, que es la verdad', () => {
    const read = cloudToSetlist(rowOf());
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');

    eq(read.setlist.participantIds, [], 'la nube no sabe quién participa');
    eq(
      read.setlist.items[0].arrangement?.sections.map((block) => block.assignedMemberIds),
      [[], [], []],
      'ni quién canta cada bloque'
    );
  });

  it('con el setlist en el dispositivo, lo de los miembros se queda donde estaba', () => {
    const local = fullSetlist();
    const read = cloudToSetlist(rowOf(), local);
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');

    eq(read.setlist.participantIds, ['miembro-ana', 'miembro-bruno'], 'el equipo, tal como lo tenía este dispositivo');
    eq(
      read.setlist.items[0].arrangement?.sections.map((block) => block.assignedMemberIds),
      [['miembro-ana'], ['miembro-bruno'], []],
      'y cada bloque con quien tenía'
    );
    // Bajar de la nube no puede vaciar lo local: sigue siendo el mismo objeto de datos.
    eq(local.participantIds, ['miembro-ana', 'miembro-bruno'], 'y lo local, intacto');
    read.setlist.participantIds.push('miembro-colado');
    read.setlist.items[0].arrangement?.sections[0].assignedMemberIds?.push('miembro-colado');
    eq(local.participantIds.length, 2, 'ni comparte sus listas con él');
    eq(local.items[0].arrangement?.sections[0].assignedMemberIds, ['miembro-ana']);
  });

  it('dos bloques con el mismo nombre no se confunden', () => {
    // "Coro" dos veces, de la misma sección de la canción: sólo el id del
    // bloque los distingue, y es lo único que se usa para emparejarlos.
    const local = fullSetlist();
    const read = cloudToSetlist(rowOf(), local);
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');
    const blocks = read.setlist.items[0].arrangement?.sections ?? [];
    eq(blocks.map((block) => [block.label, block.assignedMemberIds]), [
      ['Coro', ['miembro-ana']],
      ['Coro', ['miembro-bruno']],
      ['Verso 1', []],
    ], 'cada quien en su bloque, no en el de al lado');

    // Y si el orden cambió en la nube, siguen sus ids, no su posición.
    const reordered = rowOf();
    const sections = (reordered as { items: { arrangement?: { sections: unknown[] } }[] }).items[0].arrangement?.sections;
    sections?.reverse();
    const again = cloudToSetlist(reordered, local);
    if (again.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(
      again.setlist.items[0].arrangement?.sections.map((block) => [block.id, block.assignedMemberIds]),
      [['bloque-3', []], ['bloque-2', ['miembro-bruno']], ['bloque-1', ['miembro-ana']]]
    );
  });

  it('sin una correspondencia segura no se asigna a nadie', () => {
    const local = fullSetlist();

    // Un bloque que ahora toca otra parte de la canción ya no es aquel bloque.
    const moved = rowOf();
    const sections = (moved as { items: { arrangement?: { sections: { sourceSectionId: string }[] } }[] }).items[0].arrangement?.sections;
    if (sections) sections[0].sourceSectionId = 'section-9';
    const read = cloudToSetlist(moved, local);
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(read.setlist.items[0].arrangement?.sections[0].assignedMemberIds, [], 'no se adivina');

    // Una entrada que el dispositivo no tiene: tampoco se copia de otra.
    const otherLocal: Setlist = { ...local, items: [{ ...local.items[0], id: 'item-distinto' }] };
    const orphan = cloudToSetlist(rowOf(), otherLocal);
    if (orphan.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(
      orphan.setlist.items[0].arrangement?.sections.map((block) => block.assignedMemberIds),
      [[], [], []],
      'nadie hereda los miembros de otra entrada'
    );
  });

  it('el setlist que sale no comparte nada con la fila ni con lo local', () => {
    // Si compartiera un array o un objeto, editar el setlist hidratado
    // cambiaría por detrás lo que el dispositivo ya tenía guardado, o la fila
    // que se acaba de leer. Se comprueba mutándolo todo.
    const row = rowOf();
    const rowBefore = structuredClone(row);
    const local = fullSetlist();
    const localBefore = structuredClone(local);
    const read = cloudToSetlist(row, local);
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');

    const setlist = read.setlist;
    const block = setlist.items[0].arrangement?.sections[0];
    setlist.participantIds.push('colado');
    setlist.items.push(item('item-colado', 'x'));
    setlist.items[0].arrangement?.sections.push(block!);
    block?.assignedMemberIds?.push('colado');
    block?.voices.push('bass');
    Object.assign(block?.transition ?? {}, { type: 'end' });
    setlist.items[1].notes = 'cambiado';

    eq(local, localBefore, 'lo que el dispositivo tenía, intacto');
    eq(row, rowBefore, 'y la fila leída, también');
  });

  it('dos bloques no pueden acabar con el mismo id, que es por donde se emparejan', () => {
    // Si una fila tocada a mano repite el id de un bloque, el emparejamiento
    // sería ambiguo. El saneado de siempre le da uno propio al segundo, así
    // que sólo uno puede reclamar a quien estaba asignado.
    const row = rowOf();
    const sections = (row as { items: { arrangement?: { sections: { id: string }[] } }[] }).items[0].arrangement?.sections;
    if (sections) sections[1].id = 'bloque-1';
    const read = cloudToSetlist(row, fullSetlist());
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');

    const blocks = read.setlist.items[0].arrangement?.sections ?? [];
    eq(new Set(blocks.map((entry) => entry.id)).size, blocks.length, 'tres ids distintos');
    eq(blocks.filter((entry) => entry.assignedMemberIds?.includes('miembro-ana')).length, 1, 'y una sola persona en un solo sitio');
  });

  it('una fila borrada se reconoce como borrada', () => {
    const read = cloudToSetlist(rowOf({ deleted_at: '2026-09-16T08:00:00.000Z' }));
    eq(read, {
      state: 'deleted',
      id: 'setlist-1234',
      revision: 3,
      deletedAt: '2026-09-16T08:00:00.000Z',
    }, 'la lápida llega entera, para que el borrado pueda viajar');
  });

  it('una fila escrita por un cliente que sabe más no se lee como si fuera de este', () => {
    eq(cloudToSetlist(rowOf({ payload_version: 2 })), {
      state: 'newer',
      id: 'setlist-1234',
      revision: 3,
      payloadVersion: 2,
    });
    // No hay conversión, ni rebaja, ni contenido: sólo el hecho de que existe.
    const read = cloudToSetlist(rowOf({ payload_version: 7 }));
    eq('setlist' in read, false, 'nada de su contenido se interpreta');
  });

  it('una fila corrupta se reconoce, y no se arregla a base de inventar', () => {
    eq(cloudToSetlist(rowOf({ id: '' })).state, 'corrupt');
    eq(cloudToSetlist(rowOf({ id: 42 })), { state: 'corrupt', id: null });
    eq(cloudToSetlist(rowOf({ revision: 0 })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist(rowOf({ revision: 'tres' })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist(rowOf({ payload_version: 0 })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist(rowOf({ items: 'no es una lista' })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist(rowOf({ client_created_at: 'ayer' })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist(rowOf({ deleted_at: 'nunca' })), { state: 'corrupt', id: 'setlist-1234' });
    eq(cloudToSetlist({}), { state: 'corrupt', id: null });

    // Lo que sí se repara es lo de siempre: una entrada sin canción se cae, y
    // el resto del setlist sigue en pie. Eso no es inventar, es lo que hace el
    // almacén local con cualquier dato tocado a mano.
    const read = cloudToSetlist(rowOf({ items: [{ songId: '' }, { id: 'item-2', songId: 'otra-cancion' }] }));
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(read.setlist.items.map((entry) => entry.songId), ['otra-cancion']);
    // Un nombre en blanco no se inventa; queda el que pone el almacén local.
    eq(cloudToSetlist(rowOf({ name: '   ' })).state, 'setlist');
  });
});

// --- Sin sesión ----------------------------------------------------------------------

describe('La nube de setlists necesita una sesión de verdad', () => {
  it('sin access token no sale ninguna petición', async () => {
    const { calls, repo } = signedOut();
    const setlist = fullSetlist();

    await assert.rejects(repo.list(), SetlistCloudAuthError);
    await assert.rejects(repo.create(setlist), SetlistCloudAuthError);
    await assert.rejects(repo.update(setlist, 3), SetlistCloudAuthError);
    await assert.rejects(repo.remove('setlist-1234', 3), SetlistCloudAuthError);
    checks += 4;
    eq(calls, [], 'ni una sola: fallan antes de llegar a fetch');
  });
});

// --- Crear ---------------------------------------------------------------------------

describe('Subir un setlist por primera vez', () => {
  it('lo escribe sin decir de quién es', async () => {
    const { calls, repo } = fakeCloud(() => ({ status: 201, body: [rowOf({ revision: 1 })] }));
    const result = await repo.create(fullSetlist());

    eq(calls[0].init.method, 'POST');
    eq(calls[0].url, `${URL_BASE}/rest/v1/setlists`, 'sin on_conflict: esto es una fila nueva');
    const headers = calls[0].init.headers as Record<string, string>;
    eq(headers.Prefer, 'return=representation', 'nunca merge-duplicates');
    eq(headers.Authorization, 'Bearer token-de-la-sesion');

    const body = bodyOf(calls[0]);
    eq('owner_id' in body, false, 'lo pone la base de datos desde auth.uid()');
    eq(body.payload_version, 1);
    eq(body.revision, 1, 'la primera revisión, como la que pone la tabla');
    eq(body.id, 'setlist-1234');
    eq(result, { status: 'saved', revision: 1, serverUpdatedAt: SERVER_UPDATED });
  });

  it('si ya estaba, es un conflicto y no un error a la cara', async () => {
    const { repo } = fakeCloud(() => ({ status: 409, body: { message: 'duplicate key value', code: '23505' } }));
    eq(await repo.create(fullSetlist()), { status: 'conflict' });
  });

  it('lo que no cabe en la tabla no se envía', async () => {
    const { calls, repo } = fakeCloud();
    const result = await repo.create({ ...fullSetlist(), name: 'N'.repeat(200) });
    eq(result, { status: 'rejected', problem: 'name' });
    eq(calls, [], 'sin petición: la tabla lo habría rechazado con un mensaje que nadie entiende');
  });
});

// --- Actualizar ----------------------------------------------------------------------

describe('Guardar un cambio sobre lo que ya está', () => {
  it('escribe sólo si la fila sigue como se leyó', async () => {
    const { calls, repo } = fakeCloud(() => ({ body: [rowOf({ revision: 4 })] }));
    const result = await repo.update(fullSetlist(), 3);

    eq(calls[0].init.method, 'PATCH');
    eq(
      calls[0].url,
      `${URL_BASE}/rest/v1/setlists?id=eq.setlist-1234&revision=eq.3&payload_version=eq.1`,
      'por id, por la revisión que se leyó, y sólo sobre una fila de la versión 1'
    );
    const body = bodyOf(calls[0]);
    eq(body.revision, 4, 'la revisión avanza una, y la pone quien escribe');
    eq('owner_id' in body, false);
    eq('id' in body, false, 'el id identifica la fila, no se reescribe');
    eq('created_at' in body || 'updated_at' in body, false, 'los relojes del servidor son suyos');
    eq(body.client_updated_at, new Date(NOW + 60_000).toISOString(), 'el del dispositivo, ese sí');
    eq(result, { status: 'saved', revision: 4, serverUpdatedAt: SERVER_UPDATED });
  });

  it('si alguien escribió antes, es un conflicto: nadie pisa a nadie', async () => {
    const { repo } = fakeCloud(() => ({ status: 200, body: [] }));
    eq(await repo.update(fullSetlist(), 3), { status: 'conflict' }, 'cero filas no es un éxito');
  });

  it('una fila de una versión futura no se puede escribir como si fuera de la 1', async () => {
    // El filtro lo impide en la base de datos, no aquí: una fila con
    // payload_version 2 no casa, así que el PATCH no alcanza nada.
    const { calls, repo } = fakeCloud(() => ({ body: [] }));
    const result = await repo.update(fullSetlist(), 3);
    eq(calls[0].url.includes('payload_version=eq.1'), true);
    eq(result, { status: 'conflict' }, 'y se ve como lo que es: no se escribió');
    eq(bodyOf(calls[0]).payload_version, 1, 'nunca se rebaja la versión de otra fila');
  });

  it('lo que no cabe tampoco se envía', async () => {
    const { calls, repo } = fakeCloud();
    eq(await repo.update({ ...fullSetlist(), items: Array.from({ length: 300 }, (_, i) => item(`item-${i}`, 'x')) }, 3), {
      status: 'rejected',
      problem: 'item-count',
    });
    eq(calls, []);
  });
});

// --- Borrar --------------------------------------------------------------------------

describe('Borrar un setlist de la nube', () => {
  it('es una lápida, no un borrado de verdad', async () => {
    const { calls, repo } = fakeCloud(() => ({ body: [rowOf({ revision: 4, deleted_at: '2026-09-16T08:00:00.000Z' })] }));
    const result = await repo.remove('setlist-1234', 3, new Date('2026-09-16T08:00:00.000Z'));

    eq(calls[0].init.method, 'PATCH', 'nunca DELETE: la fila tiene que quedarse para que el borrado llegue a los demás');
    eq(calls[0].url, `${URL_BASE}/rest/v1/setlists?id=eq.setlist-1234&revision=eq.3&payload_version=eq.1`);
    eq(bodyOf(calls[0]), { deleted_at: '2026-09-16T08:00:00.000Z', revision: 4 }, 'sólo la lápida y la revisión');
    eq(result, { status: 'saved', revision: 4, serverUpdatedAt: SERVER_UPDATED });
  });

  it('con la revisión cambiada, conflicto', async () => {
    const { repo } = fakeCloud(() => ({ body: [] }));
    eq(await repo.remove('setlist-1234', 3), { status: 'conflict' });
  });

  it('no puede borrar una fila escrita por un cliente que sabe más', async () => {
    // La fila es id=setlist-123, revision=4, payload_version=2. Este cliente
    // sólo entiende la 1, así que no le toca nada: ni el contenido, ni la
    // lápida. El filtro lo impide en la base de datos, que es donde no se
    // puede olvidar, y PostgREST no encuentra nada que cambiar.
    const { calls, repo } = fakeCloud(() => ({ status: 200, body: [] }));
    const result = await repo.remove('setlist-123', 4);

    eq(
      calls[0].url,
      `${URL_BASE}/rest/v1/setlists?id=eq.setlist-123&revision=eq.4&payload_version=eq.1`,
      'los tres filtros a la vez'
    );
    eq(result, { status: 'conflict' }, 'y nunca llega a escribir deleted_at sobre una v2');
    eq(calls.length, 1, 'sin reintentos ni segundas vías');
  });
});

// --- Leer ----------------------------------------------------------------------------

describe('Leer lo que hay en la nube', () => {
  const rows = [
    rowOf(),
    rowOf({ id: 'setlist-borrado', deleted_at: '2026-09-16T08:00:00.000Z' }),
    rowOf({ id: 'setlist-futuro', payload_version: 2 }),
    rowOf({ id: 'setlist-roto', revision: null }),
  ];

  it('pide lo suyo sin fingir que el filtro es la seguridad', async () => {
    const { calls, repo } = fakeCloud(() => ({ body: [] }));
    await repo.list();

    eq(calls[0].init.method, 'GET');
    eq(calls[0].url.includes('owner_id'), false, 'Row Level Security es la frontera, no un filtro que se puede olvidar');
    eq(calls[0].url.includes('order=updated_at.desc'), true, 'lo último que cambió, primero');
    eq((calls[0].init.headers as Record<string, string>).Authorization, 'Bearer token-de-la-sesion');
  });

  it('cada fila se entiende por separado, y una rota no tira las demás', async () => {
    const { repo } = fakeCloud(() => ({ body: rows }));
    const read = await repo.list();

    eq(read.map((entry) => entry.state), ['setlist', 'deleted', 'newer', 'corrupt']);
    eq(read.map((entry) => ('id' in entry ? entry.id : null)), [
      'setlist-1234',
      'setlist-borrado',
      'setlist-futuro',
      'setlist-roto',
    ]);
    // Las lápidas se conservan: sin ellas, un borrado hecho en otro sitio no
    // llegaría nunca. Filtrarlas aquí sería tener que leerlas otra vez luego.
    eq(read.filter((entry) => entry.state === 'deleted').length, 1);
  });

  it('lo que el dispositivo ya tenía se respeta en la lectura', async () => {
    const { repo } = fakeCloud(() => ({ body: [rowOf()] }));
    const [read] = await repo.list([fullSetlist()]);
    if (read.state !== 'setlist') return assert.fail('debería ser un setlist');
    eq(read.setlist.participantIds, ['miembro-ana', 'miembro-bruno']);
    eq(read.setlist.items[0].arrangement?.sections[0].assignedMemberIds, ['miembro-ana']);
  });
});

// --- Y nada más ----------------------------------------------------------------------

describe('Este paso no sincroniza nada', () => {
  it('la app sigue guardando los setlists donde los guardaba', () => {
    // Nada del cancionero llama todavía a esta capa: entrar o salir de una
    // cuenta no sube ni baja ningún setlist.
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk('src');
    const users = files.filter(
      (file) => file !== 'src/storage/cloudSetlists.ts' && readFileSync(file, 'utf8').includes('cloudSetlists')
    );
    eq(users, [], 'la capa cloud existe y todavía no la usa nadie');
  });
});
