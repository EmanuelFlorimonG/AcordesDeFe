import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Setlist } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import type { SupabaseClient } from '../src/lib/supabase';
import { createSetlistShareRepository, readShareToken, readSharedSetlist } from '../src/storage/setlistShares';
import { sharedSetlistHash, sharedSetlistLink } from '../src/components/Setlists/ui';
import { SharedSetlistView } from '../src/components/Setlists/SharedSetlistScreen';

/**
 * Compartir un Setlist por enlace.
 *
 * Lo que de verdad hay que comprobar aquí es lo que NO pasa: que el id
 * interno no sirva para leer nada, que no se mande nunca el dueño, que un
 * enlace desactivado y uno que nunca existió se respondan igual, y que la
 * página que ve quien recibe el enlace no tenga por dónde cambiar nada.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistShares.test: ${checks} comprobaciones`));

const TOKEN = '0123456789abcdef0123456789abcdef';
const NOW = Date.UTC(2026, 8, 15, 12);

interface Call {
  op: string;
  args: unknown[];
}

/** Un cliente que apunta lo que le piden y responde lo que diga la prueba. */
function fakeClient(answers: Partial<Record<string, unknown>> = {}) {
  const calls: Call[] = [];
  const client = {
    select: async (table: string, query: string) => {
      calls.push({ op: 'select', args: [table, query] });
      return (answers.select ?? []) as never[];
    },
    insert: async (table: string, rows: unknown) => {
      calls.push({ op: 'insert', args: [table, rows] });
      return (answers.insert ?? []) as never[];
    },
    remove: async (table: string, match: unknown) => {
      calls.push({ op: 'remove', args: [table, match] });
      return [] as never[];
    },
    rpc: async (fn: string, args: unknown) => {
      calls.push({ op: 'rpc', args: [fn, args] });
      if (typeof answers.rpc === 'function') return (answers.rpc as (a: unknown) => unknown)(args);
      return answers.rpc;
    },
    update: async () => [] as never[],
    count: async () => 0,
    invoke: async () => null,
  } as unknown as SupabaseClient;
  return { calls, client };
}

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'setlist-1',
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Coro juvenil',
  items: [],
  payload_version: 1,
  revision: 3,
  client_created_at: new Date(NOW).toISOString(),
  client_updated_at: new Date(NOW).toISOString(),
  shared_at: new Date(NOW).toISOString(),
  ...overrides,
});

// --- Qué es un token -------------------------------------------------------

describe('Un token de compartir', () => {
  it('son treinta y dos hexadecimales, y nada más', () => {
    eq(readShareToken(TOKEN), TOKEN);
    eq(readShareToken(` ${TOKEN.toUpperCase()} `), TOKEN, 'se limpia y se pone en minúsculas');
    for (const malo of ['', 'corto', TOKEN.slice(0, 31), `${TOKEN}0`, 'g'.repeat(32), `${TOKEN.slice(0, 30)}..`]) {
      eq(readShareToken(malo), null, JSON.stringify(malo));
    }
  });

  it('no se confunde con el id interno de un Setlist', () => {
    eq(readShareToken('45befac1-cedb-469c-b4fb-3648ce1970f4'), null, 'un uuid con guiones no es un token');
  });
});

// --- Lo que hace el dueño --------------------------------------------------

describe('Los enlaces de quien ha iniciado sesión', () => {
  it('pregunta por el Setlist, nunca por el dueño', async () => {
    const { calls, client } = fakeClient({ select: [{ token: TOKEN }] });
    const found = await createSetlistShareRepository(client).find('setlist-1');

    eq(found, TOKEN);
    eq(calls[0].op, 'select');
    eq(calls[0].args[0], 'setlist_shares');
    const query = calls[0].args[1] as string;
    eq(query.includes('setlist_id=eq.setlist-1'), true);
    eq(query.includes('owner_id'), false, 'de quién es una fila lo decide la base de datos');
  });

  it('sin enlace responde que no hay, no un error', async () => {
    const { client } = fakeClient({ select: [] });
    eq(await createSetlistShareRepository(client).find('setlist-1'), null);
  });

  it('un token con mala forma que llegara de la nube no se usa', async () => {
    const { client } = fakeClient({ select: [{ token: 'LO-QUE-SEA' }] });
    eq(await createSetlistShareRepository(client).find('setlist-1'), null);
  });

  it('al crear manda sólo el Setlist: el token y el dueño los pone la base de datos', async () => {
    const { calls, client } = fakeClient({ insert: [{ token: TOKEN }] });
    eq(await createSetlistShareRepository(client).create('setlist-1'), TOKEN);

    eq(calls[0].op, 'insert');
    eq(calls[0].args[0], 'setlist_shares');
    eq(calls[0].args[1], { setlist_id: 'setlist-1' }, 'ni token, ni owner_id, ni fecha');
  });

  it('si no vuelve un token válido, no se inventa uno', async () => {
    for (const answer of [[], [{}], [{ token: 'corto' }]]) {
      const { client } = fakeClient({ insert: answer });
      await assert.rejects(() => createSetlistShareRepository(client).create('setlist-1'));
      checks += 1;
    }
  });

  it('desactivar borra por el Setlist, y sólo ese', async () => {
    const { calls, client } = fakeClient();
    await createSetlistShareRepository(client).revoke('setlist-1');

    eq(calls[0].op, 'remove');
    eq(calls[0].args[0], 'setlist_shares');
    eq(calls[0].args[1], { setlist_id: 'setlist-1' });
  });
});

// --- Lo que ve quien abre el enlace ----------------------------------------

describe('Abrir un enlace', () => {
  it('trae el Setlist, y nada de cómo está guardado', async () => {
    const { calls, client } = fakeClient({ rpc: [row()] });
    const read = await readSharedSetlist(client, TOKEN);

    eq(calls[0].op, 'rpc');
    eq(calls[0].args[0], 'shared_setlist');
    eq(calls[0].args[1], { share_token: TOKEN }, 'el token y nada más');
    eq(read.state, 'setlist');
    if (read.state !== 'setlist') return;
    eq(read.setlist.name, 'Misa Domingo');
    eq(read.setlist.date, '2026-10-04');
    eq(Object.keys(read.setlist).includes('owner_id'), false);
    eq(read.sharedAt !== null, true);
  });

  it('un token con mala forma no llega a preguntarse', async () => {
    const { calls, client } = fakeClient({ rpc: [row()] });
    eq((await readSharedSetlist(client, 'lo-que-sea')).state, 'gone');
    eq(calls.length, 0, 'ni una petición');
  });

  it('un enlace desactivado y uno que nunca existió se responden igual', async () => {
    for (const answer of [[], null, undefined]) {
      const { client } = fakeClient({ rpc: answer });
      eq((await readSharedSetlist(client, TOKEN)).state, 'gone', JSON.stringify(answer ?? null));
    }
  });

  it('más de una fila no se interpreta: algo está mal y se dice que no está', async () => {
    const { client } = fakeClient({ rpc: [row(), row()] });
    eq((await readSharedSetlist(client, TOKEN)).state, 'gone');
  });

  it('una fila de una versión más nueva no se enseña como si se entendiera', async () => {
    const { client } = fakeClient({ rpc: [row({ payload_version: 99 })] });
    eq((await readSharedSetlist(client, TOKEN)).state, 'unreadable');
  });

  it('una fila rota no rompe la pantalla', async () => {
    const { client } = fakeClient({ rpc: [row({ revision: 'no es un número' })] });
    eq((await readSharedSetlist(client, TOKEN)).state, 'unreadable');
  });
});

// --- El enlace que se copia y el que va en el QR ----------------------------

describe('El enlace', () => {
  it('se arma con el sitio donde está la aplicación, no con uno escrito a mano', () => {
    eq(
      sharedSetlistLink(TOKEN, { origin: 'https://acordes-de-fe.vercel.app', pathname: '/' }),
      `https://acordes-de-fe.vercel.app/#/shared/setlist/${TOKEN}`
    );
    eq(
      sharedSetlistLink(TOKEN, { origin: 'http://localhost:5174', pathname: '/' }),
      `http://localhost:5174/#/shared/setlist/${TOKEN}`
    );
    // Y si algún día vive bajo una subcarpeta, sigue estando bien.
    eq(
      sharedSetlistLink(TOKEN, { origin: 'https://ejemplo.org', pathname: '/coro/' }),
      `https://ejemplo.org/coro/#/shared/setlist/${TOKEN}`
    );
  });

  it('la ruta pública es la misma que entiende la aplicación', () => {
    eq(sharedSetlistHash(TOKEN), `#/shared/setlist/${TOKEN}`);
    const route = /^#\/shared\/setlist\/([^/]+)$/;
    eq(route.exec(sharedSetlistHash(TOKEN))?.[1], TOKEN);
  });

  it('en ningún sitio hay un dominio escrito a mano', () => {
    for (const file of [
      'src/components/Setlists/ui.ts',
      'src/hooks/useSetlistShare.ts',
      'src/components/Setlists/ShareSetlistDialog.tsx',
    ]) {
      const code = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      for (const forbidden of ['localhost', 'vercel.app', 'https://acordes']) {
        eq(code.includes(forbidden), false, `${file}: ${forbidden}`);
      }
    }
  });
});

// --- La página que ve quien recibe el enlace -------------------------------

describe('La página pública de un Setlist compartido', () => {
  const song = (id: string, title: string, artist: string): Song =>
    ({ id, title, artist, sections: [] }) as unknown as Song;
  const songsById = new Map([
    ['huracan', song('huracan', 'Huracán', 'Hakuna')],
    ['alma', song('alma', 'Alma mía', 'Hakuna')],
  ]);

  const setlist = (overrides: Partial<Setlist> = {}): Setlist => ({
    id: 'setlist-1',
    name: 'Misa del domingo',
    date: '2026-10-04',
    description: 'Ensayo el viernes',
    participantIds: [],
    items: [
      {
        id: 'item-1',
        songId: 'huracan',
        moment: 'Entrada',
        transposeSteps: 2,
        capoFret: 3,
        notes: 'Último coro x2',
        arrangement: {
          songVersion: 1,
          sections: [
            {
              id: 'b1',
              sourceSectionId: 'section-1',
              label: 'Coro',
              repeatCount: 2,
              voices: [],
              instruction: 'Entrar suave',
              transition: { type: 'continue' },
            },
          ],
        },
        transitionToNext: { type: 'direct', instruction: 'Sin respirar' },
      },
      {
        id: 'item-2',
        songId: 'alma',
        moment: '',
        transposeSteps: 0,
        capoFret: 0,
        notes: '',
      },
    ],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  });

  const view = (data = setlist()) =>
    renderToStaticMarkup(createElement(SharedSetlistView, { setlist: data, songsById, onGoToSongbook: () => {} }));

  it('enseña lo que hace falta para tocar', () => {
    const html = view();
    eq(html.includes('Misa del domingo'), true, 'el nombre');
    eq(html.includes('2026'), true, 'la fecha');
    eq(html.includes('Ensayo el viernes'), true, 'la descripción');
    eq(html.includes('2 canciones'), true);
    eq(html.includes('Huracán'), true, 'las canciones');
    eq(html.includes('Alma mía'), true);
    eq(html.includes('Hakuna'), true, 'y de quién son');
    eq(html.includes('Entrada'), true, 'el momento');
  });

  it('en el orden en que se cantan', () => {
    const html = view();
    eq(html.indexOf('Huracán') < html.indexOf('Alma mía'), true);
  });

  it('con la información musical de esta ocasión', () => {
    const html = view();
    eq(html.includes('2 semitonos más alto'), true, 'el tono');
    eq(html.includes('Cejilla en el traste 3'), true);
    eq(html.includes('Último coro x2'), true, 'las notas');
    eq(html.includes('Coro'), true, 'el arreglo');
    eq(html.includes('×2'), true, 'y sus repeticiones');
    eq(html.includes('Entrar suave'), true);
    eq(html.includes('entra directa en la siguiente'), true, 'la transición');
    eq(html.includes('Sin respirar'), true);
  });

  it('lo que está como está escrito no se llena de ruido', () => {
    const html = view();
    // La segunda canción no tiene tono ni cejilla: no se dice "tono original".
    eq(html.includes('Tono original'), false);
    eq(html.includes('Sin cejilla'), false);
  });

  it('dice que es de otra persona y que sólo se lee', () => {
    const html = view();
    eq(html.includes('sólo lectura'), true);
    eq(html.includes('Los cambios que hagas aquí no llegan a quien lo compartió'), true);
  });

  it('no tiene por dónde cambiar nada', () => {
    const html = view();
    for (const control of [
      'Editar',
      'Eliminar',
      'Duplicar',
      'Añadir canción',
      'Guardar en mi cuenta',
      'Sincronizar',
      'Compartir',
      'Iniciar ensayo',
      'Modo Misa',
      'Miembros',
      'Equipo',
      '<input',
      '<textarea',
      'draggable',
    ]) {
      eq(html.includes(control), false, control);
    }
  });

  it('no se le ensena a nadie nada de cómo está guardado', () => {
    const html = view();
    for (const interno of ['owner_id', 'setlist-1', 'item-1', 'huracan', 'revision', 'payload', 'token', 'supabase']) {
      eq(html.toLowerCase().includes(interno.toLowerCase()), false, interno);
    }
  });

  it('un Setlist sin fecha ni descripción no inventa ninguna', () => {
    const html = view(setlist({ date: '', description: '' }));
    eq(html.includes('Misa del domingo'), true);
    eq(html.includes('Ensayo el viernes'), false);
  });

  it('una canción que este dispositivo no conoce no rompe la página', () => {
    const html = view(setlist({ items: [{ ...setlist().items[0], songId: 'no-existe' }] }));
    eq(html.includes('Canción no disponible'), true);
  });

  it('un Setlist vacío lo dice', () => {
    eq(view(setlist({ items: [] })).includes('Todavía no tiene canciones'), true);
  });
});

// --- La frontera de seguridad ----------------------------------------------

describe('Lo que compartir no puede debilitar', () => {
  const migration = readFileSync(
    'supabase/migrations/20260929120000_setlist_public_shares.sql',
    'utf8'
  ).replace(/\r\n/g, '\n');
  const sql = migration.replace(/^\s*--.*$/gm, '');

  it('no toca las políticas de los Setlists, que siguen siendo privados', () => {
    for (const forbidden of [
      'alter table public.setlists',
      'drop policy',
      'on public.setlists\n  for select to anon',
      'grant select on public.setlists to anon',
    ]) {
      eq(sql.includes(forbidden), false, forbidden);
    }
    // Ni una política nueva sobre setlists.
    eq(/create policy[\s\S]{0,120}on public\.setlists/.test(sql), false, 'ninguna política nueva sobre setlists');
  });

  it('la tabla de enlaces está cerrada con llave', () => {
    eq(sql.includes('alter table public.setlist_shares enable row level security'), true);
    eq(sql.includes('revoke all on public.setlist_shares from anon, authenticated'), true);
    // El público no toca la tabla: ni leer, que enseñaría tokens de otros.
    eq(sql.includes('grant select, insert, delete on public.setlist_shares to authenticated'), true);
    eq(/grant[^;]*on public\.setlist_shares to[^;]*anon/.test(sql), false, 'nada para anon');
    // Y nadie la actualiza: un enlace no se edita.
    eq(/grant[^;]*update[^;]*on public\.setlist_shares/.test(sql), false, 'sin update');
  });

  it('cada política es sólo sobre lo propio', () => {
    for (const action of ['select', 'insert', 'delete']) {
      eq(sql.includes(`for ${action} to authenticated`), true, action);
    }
    eq((sql.match(/owner_id = \(select auth\.uid\(\)\)/g) ?? []).length >= 3, true, 'las tres políticas');
  });

  it('el token lo pone la base de datos y no se puede elegir ni cambiar', () => {
    eq(sql.includes('before insert on public.setlist_shares'), true);
    eq(sql.includes('new.token := replace(gen_random_uuid()::text'), true);
    eq(sql.includes('before update on public.setlist_shares'), true);
    eq(sql.includes("check (token ~ '^[0-9a-f]{32}$')"), true);
  });

  it('la única puerta pública es de sólo lectura y bien cerrada', () => {
    eq(sql.includes('create or replace function public.shared_setlist(share_token text)'), true);
    eq(sql.includes('security definer'), true);
    eq(sql.includes("set search_path = ''"), true, 'nadie cuela otra tabla por delante');
    eq(sql.includes('stable'), true, 'no escribe');
    eq(sql.includes('grant execute on function public.shared_setlist(text) to anon, authenticated'), true);
    eq(sql.includes('revoke all on function public.shared_setlist(text) from public'), true);
    // Sólo devuelve un Setlist.
    for (const column of ['owner_id', 'deleted_at,', 'created_at,\n  updated_at']) {
      eq(sql.split('returns table (')[1].split(')')[0].includes(column), false, column);
    }
    // Y un Setlist borrado no se devuelve.
    eq(sql.includes('s.deleted_at is null'), true);
  });

  it('saber el id interno de un Setlist no sirve para leerlo', () => {
    // La función busca por token, nunca por id: no hay ninguna forma pública
    // de pedir "el Setlist tal".
    eq(sql.includes('where share_token'), true);
    eq(sql.includes('k.token = share_token'), true);
    eq(/where[\s\S]{0,200}s\.id = /.test(sql), false, 'no se busca por id');
  });

  it('desde el navegador sólo se habla con la tabla de enlaces y con esa función', () => {
    const source = readFileSync('src/storage/setlistShares.ts', 'utf8').replace(/\r\n/g, '\n');
    // Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    eq(code.includes("const SHARES = 'setlist_shares'"), true);
    // Ni una petición a la tabla privada, ni un dueño mandado a mano.
    eq(/['"`]setlists['"`]/.test(code), false, 'nunca la tabla de Setlists');
    for (const forbidden of ['owner_id', 'service_role', 'auth.uid']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    eq((code.match(/client\.rpc[<(]/g) ?? []).length, 1, 'una sola llamada pública');
  });
});
