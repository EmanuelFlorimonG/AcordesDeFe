import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import type { AppSession, AuthenticatedSession } from '../src/auth/session';
import { SupabaseRequestError } from '../src/lib/supabase';
import { SetlistCloudAuthError, type CloudSetlistRead, type CloudSetlistRepository } from '../src/storage/cloudSetlists';
import { createSetlistDeletionRepository, type SetlistDeletionMarker } from '../src/storage/setlistDeletions';
import { createLocalSetlistRepository, userSetlists, GUEST_SETLISTS } from '../src/storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint } from '../src/storage/setlistSync';
import { runSetlistSyncPass } from '../src/storage/setlistSyncPass';
import { runSetlistSyncPreflight } from '../src/storage/setlistSyncPreflight';

/**
 * Looking before leaping.
 *
 * Nothing here reaches Supabase and nothing here writes: the clouds are
 * functions these tests wrote whose writing methods fail on sight, and the
 * storage counts every call so a single write would be visible. What is
 * checked is that a preflight says what a pass would do — the very same
 * plans — while doing none of it.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSyncPreflight.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const DELETED_AT = Date.UTC(2026, 8, 16, 8);
const ANA = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const BRUNO = '0f8fad5b-d9cb-469f-a165-70867728950e';

const sessionOf = (userId: string): AppSession => ({
  userId,
  email: 'quien.sea@example.com',
  displayName: 'Quien sea',
  emailConfirmed: true,
});

const captureOf = (userId: string, accessToken: string): AuthenticatedSession => ({
  session: sessionOf(userId),
  accessToken,
});

const setlistOf = (id: string, name = 'Misa Domingo'): Setlist => ({
  id,
  name,
  date: '2026-10-04',
  description: '',
  participantIds: ['miembro-ana'],
  items: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const renamed = (setlist: Setlist, name: string): Setlist => ({ ...setlist, name, updatedAt: setlist.updatedAt + 1000 });

const baseOf = (setlist: Setlist, cloudRevision: number) => ({
  setlistId: setlist.id,
  cloudRevision,
  fingerprint: portableFingerprint(setlist),
});

const activeRow = (setlist: Setlist, revision: number): CloudSetlistRead => ({
  state: 'setlist',
  id: setlist.id,
  setlist,
  revision,
  serverUpdatedAt: '2026-09-22T18:45:00+00:00',
});

const tombstoneRow = (id: string, revision: number): CloudSetlistRead => ({
  state: 'deleted',
  id,
  revision,
  deletedAt: new Date(DELETED_AT).toISOString(),
});

/** Storage that remembers every call, so a single write shows up. */
const countingBrowser = () => {
  const data = new Map<string, string>();
  const reads: string[] = [];
  const writes: string[] = [];
  return {
    data,
    reads,
    writes,
    getItem: (key: string) => {
      reads.push(key);
      return data.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
    },
  };
};

/**
 * A cloud that answers `list` and refuses everything else on sight. If a
 * preflight ever tried to write, the test would not merely fail — it could
 * not have happened.
 */
function readOnlyCloud(options: { rows?: CloudSetlistRead[]; listThrows?: unknown; during?: () => void } = {}) {
  const lists: Setlist[][] = [];
  const tokens: string[] = [];
  const refuse = (op: string) => () => {
    throw new Error(`un preflight no puede llamar a ${op}`);
  };
  const cloud: CloudSetlistRepository = {
    async list(local) {
      lists.push([...(local ?? [])]);
      options.during?.();
      if (options.listThrows) throw options.listThrows;
      return options.rows ?? [];
    },
    create: refuse('create'),
    update: refuse('update'),
    remove: refuse('remove'),
  };
  return { lists, tokens, cloud, cloudFor: (accessToken: string) => (tokens.push(accessToken), cloud) };
}

// --- What a pass would do --------------------------------------------------------------------

describe('Mirar antes de tocar', () => {
  it('cuenta los dos lados y dice qué pasaría con cada setlist', async () => {
    const storage = countingBrowser();
    const scope = userSetlists(ANA);
    const enPaz = setlistOf('setlist-en-paz');
    const cambiado = setlistOf('setlist-cambiado');
    const soloAqui = setlistOf('setlist-solo-aqui');
    const soloAlli = setlistOf('setlist-solo-alli');
    const borrado = setlistOf('setlist-borrado');

    createLocalSetlistRepository(storage, scope).save([enPaz, renamed(cambiado, 'Editado aquí'), soloAqui]);
    createSetlistSyncStore(storage, scope).save(
      new Map([
        [enPaz.id, baseOf(enPaz, 4)],
        [cambiado.id, baseOf(cambiado, 4)],
        [borrado.id, baseOf(borrado, 4)],
      ])
    );
    createSetlistDeletionRepository(storage, scope).mark(borrado.id, DELETED_AT, 4);
    storage.writes.length = 0;

    const cloud = readOnlyCloud({
      rows: [activeRow(enPaz, 4), activeRow(cambiado, 4), activeRow(soloAlli, 2), activeRow(borrado, 4)],
    });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), {
      storage,
      cloudFor: cloud.cloudFor,
    });

    eq(report.status, 'ready');
    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.userId, ANA);
    eq(report.local, { setlists: 3, bases: 3, deletions: 1 });
    eq(report.remote, { rows: 4, setlists: 4, deleted: 0, newer: 0, corrupt: 0 });
    eq(report.order, [
      'setlist-borrado',
      'setlist-cambiado',
      'setlist-en-paz',
      'setlist-solo-alli',
      'setlist-solo-aqui',
    ], 'orden fijo');

    eq(report.plans.get('setlist-en-paz')?.kind, 'noop');
    eq(report.plans.get('setlist-cambiado')?.kind, 'upload-changes');
    eq(report.plans.get('setlist-solo-aqui')?.kind, 'upload-candidate');
    eq(report.plans.get('setlist-solo-alli')?.kind, 'apply-remote');
    eq(report.plans.get('setlist-borrado')?.kind, 'delete-remote');

    // Lo que hay que saber antes de una primera prueba de verdad: esta pasada
    // intentaría dos escrituras en la nube, y cuáles.
    eq(report.effects, {
      nothing: ['setlist-en-paz'],
      local: ['setlist-solo-alli'],
      cloud: ['setlist-borrado', 'setlist-cambiado'],
      decision: ['setlist-solo-aqui'],
      blocked: [],
    });
    eq(report.effects.cloud.length, 2, 'dos peticiones que cambiarían una fila');
    eq(storage.writes, [], 'y ni una escritura en el dispositivo');
  });

  it('una pasada que no cambiaría nada lo dice', async () => {
    const storage = countingBrowser();
    const scope = userSetlists(ANA);
    const suyo = setlistOf('setlist-ana');
    createLocalSetlistRepository(storage, scope).save([suyo]);
    createSetlistSyncStore(storage, scope).save(new Map([[suyo.id, baseOf(suyo, 4)]]));
    storage.writes.length = 0;

    const cloud = readOnlyCloud({ rows: [activeRow(suyo, 4)] });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.effects.cloud, [], 'cero escrituras en la nube');
    eq(report.effects.local, []);
    eq(report.effects.nothing, ['setlist-ana']);
  });

  it('cuenta también lo que la nube dice y este cliente no entiende', async () => {
    const storage = countingBrowser();
    const cloud = readOnlyCloud({
      rows: [
        activeRow(setlistOf('setlist-uno'), 4),
        tombstoneRow('setlist-dos', 5),
        { state: 'newer', id: 'setlist-tres', revision: 9, payloadVersion: 2 },
        { state: 'corrupt', id: 'setlist-cuatro' },
        { state: 'corrupt', id: null },
      ],
    });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.remote, { rows: 5, setlists: 1, deleted: 1, newer: 1, corrupt: 2 });
    eq(report.effects.blocked, ['setlist-cuatro', 'setlist-tres'], 'las que no se pueden tocar');
    eq(report.plans.has('setlist-dos'), true, 'la lápida también tiene su plan');
  });

  it('un setlist que la nube no tiene espera a una persona, no a un create', async () => {
    const storage = countingBrowser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    storage.writes.length = 0;

    const cloud = readOnlyCloud({ rows: [] });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.plans.get('setlist-ana')?.kind, 'upload-candidate');
    eq(report.effects.decision, ['setlist-ana'], 'no cuenta como escritura en la nube');
    eq(report.effects.cloud, [], 'porque una pasada no lo subiría');
    eq(storage.writes, [], 'ni se apunta ninguna base');
  });
});

// --- It cannot write -------------------------------------------------------------------------

describe('Un preflight no puede escribir', () => {
  it('ni en la nube: las otras tres operaciones fallan si se las llama', async () => {
    const storage = countingBrowser();
    const scope = userSetlists(ANA);
    const suyo = setlistOf('setlist-ana');
    // Un mundo con trabajo de todas las clases pendiente: subir, bajar,
    // borrar aquí, borrar allí y confirmar.
    createLocalSetlistRepository(storage, scope).save([renamed(suyo, 'Cambiado aquí'), setlistOf('setlist-nuevo')]);
    createSetlistSyncStore(storage, scope).save(
      new Map([
        [suyo.id, baseOf(suyo, 4)],
        ['setlist-para-borrar', baseOf(setlistOf('setlist-para-borrar'), 4)],
        ['setlist-huerfano', baseOf(setlistOf('setlist-huerfano'), 4)],
      ])
    );
    createSetlistDeletionRepository(storage, scope).mark('setlist-para-borrar', DELETED_AT, 4);
    storage.writes.length = 0;

    const cloud = readOnlyCloud({
      rows: [activeRow(suyo, 4), activeRow(setlistOf('setlist-para-borrar'), 4), activeRow(setlistOf('setlist-bajar'), 3)],
    });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    // Hay planes de las tres clases, y aun así no se llamó a nada que escriba.
    eq(report.effects.cloud.length > 0, true);
    eq(report.effects.local.length > 0, true);
    eq(cloud.lists.length, 1, 'una sola lectura de la nube');
  });

  it('ni en el dispositivo: sólo lecturas', async () => {
    const storage = countingBrowser();
    const scope = userSetlists(ANA);
    const suyo = setlistOf('setlist-ana');
    createLocalSetlistRepository(storage, scope).save([suyo]);
    createSetlistSyncStore(storage, scope).save(new Map([[suyo.id, baseOf(suyo, 4)]]));
    createSetlistDeletionRepository(storage, scope).mark('setlist-otro', DELETED_AT, 2);
    storage.writes.length = 0;
    storage.reads.length = 0;
    const antes = new Map(storage.data);

    const cloud = readOnlyCloud({ rows: [activeRow(renamed(suyo, 'Editado allí'), 5)] });
    await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    eq(storage.writes, [], 'ninguna escritura');
    eq(storage.reads.length > 0, true, 'y sí lecturas');
    eq(storage.data, antes, 'el almacenamiento, byte a byte como estaba');
  });

  it('y el fuente no nombra ninguna forma de escribir', () => {
    const source = readFileSync('src/storage/setlistSyncPreflight.ts', 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const forbidden of [
      'cloud.create',
      'cloud.update',
      'cloud.remove',
      '.save(',
      'saveOrThrow',
      '.mark(',
      '.clear(',
      'executeSetlistSyncPlan',
      'runSetlistSyncPass',
      'setItem',
      'localStorage',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // Lo único que se le pide a cada almacén.
    eq((code.match(/\.load\(\)/g) ?? []).length, 2, 'dos load');
    eq((code.match(/\.list\(\)/g) ?? []).length, 1, 'y una list local');
    eq((code.match(/cloud\.list\(/g) ?? []).length, 1, 'una sola lectura de la nube');
    // Y la reconciliación es la del proyecto, no una segunda opinión.
    eq((code.match(/reconcileSetlists\(/g) ?? []).length, 1);
  });
});

// --- Same plans as a real pass ----------------------------------------------------------------

describe('Dice exactamente lo que haría una pasada', () => {
  it('los mismos planes, para el mismo estado', async () => {
    const scope = userSetlists(ANA);
    const enPaz = setlistOf('setlist-en-paz');
    const cambiado = setlistOf('setlist-cambiado');
    const soloAqui = setlistOf('setlist-solo-aqui');
    const bajar = setlistOf('setlist-bajar');
    const locales = [enPaz, renamed(cambiado, 'Editado aquí'), soloAqui, bajar];
    const bases = new Map([
      [enPaz.id, baseOf(enPaz, 4)],
      [cambiado.id, baseOf(cambiado, 4)],
      [bajar.id, baseOf(bajar, 4)],
    ]);
    const marcadores: SetlistDeletionMarker[] = [{ setlistId: 'setlist-fuera', deletedAt: DELETED_AT, baseRevision: 4 }];
    const filas = [
      activeRow(enPaz, 4),
      activeRow(cambiado, 4),
      activeRow(renamed(bajar, 'Editado allí'), 5),
      activeRow(setlistOf('setlist-fuera'), 4),
    ];

    /** The same world, twice: one store for the preflight, one for the pass. */
    const world = () => {
      const storage = countingBrowser();
      createLocalSetlistRepository(storage, scope).save(locales);
      createSetlistSyncStore(storage, scope).save(bases);
      const deletions = createSetlistDeletionRepository(storage, scope);
      for (const marker of marcadores) deletions.mark(marker.setlistId, marker.deletedAt, marker.baseRevision);
      return storage;
    };

    const mirado = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), {
      storage: world(),
      cloudFor: readOnlyCloud({ rows: filas }).cloudFor,
    });

    const paraLaPasada = world();
    const hecho = await runSetlistSyncPass({
      setlists: createLocalSetlistRepository(paraLaPasada, scope),
      bases: createSetlistSyncStore(paraLaPasada, scope),
      deletions: createSetlistDeletionRepository(paraLaPasada, scope),
      cloud: {
        async list() {
          return filas;
        },
        async create() {
          throw new Error('no');
        },
        async update() {
          return { status: 'conflict' };
        },
        async remove() {
          return { status: 'conflict' };
        },
      },
    });

    if (mirado.status !== 'ready') return assert.fail('debería estar listo');
    eq(mirado.order, hecho.order, 'el mismo orden');
    // Cada plan, idéntico. Lo que la pasada haga después con él es otra cosa.
    // Por id, que es lo que importa: el orden de iteracion de un Map es el de
    // insercion, y cada uno los inserta a su manera.
    eq(
      mirado.order.map((id) => [id, mirado.plans.get(id)]),
      hecho.order.map((id) => [id, hecho.outcomes.get(id)?.plan]),
      'y los mismos planes'
    );
  });
});

// --- Whose look it is -------------------------------------------------------------------------

describe('Un preflight es de una cuenta y de una sola', () => {
  it('lee lo de Ana y nada de Bruno ni del invitado', async () => {
    const storage = countingBrowser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);
    createLocalSetlistRepository(storage, GUEST_SETLISTS).save([setlistOf('setlist-invitado')]);
    createSetlistSyncStore(storage, userSetlists(BRUNO)).save(
      new Map([['setlist-bruno', baseOf(setlistOf('setlist-bruno'), 9)]])
    );
    storage.writes.length = 0;
    const antes = new Map(storage.data);

    const cloud = readOnlyCloud({ rows: [] });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), { storage, cloudFor: cloud.cloudFor });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.local, { setlists: 1, bases: 0, deletions: 0 }, 'sólo lo de Ana');
    eq(cloud.lists[0].map((entry) => entry.id), ['setlist-ana']);
    eq([...report.plans.keys()], ['setlist-ana']);
    eq(cloud.tokens, ['token-de-ana']);
    eq(storage.data, antes, 'y nada de nadie cambió');
  });

  it('si la sesión cambia mientras se lee, el preflight sigue siendo de quien lo pidió', async () => {
    const storage = countingBrowser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);
    storage.writes.length = 0;

    let sesionViva = captureOf(ANA, 'token-de-ana');
    const cloud = readOnlyCloud({
      rows: [],
      during: () => {
        sesionViva = captureOf(BRUNO, 'token-de-bruno');
      },
    });

    const report = await runSetlistSyncPreflight(sesionViva, { storage, cloudFor: cloud.cloudFor });

    eq(sesionViva.session.userId, BRUNO, 'la sesión sí cambió');
    if (report.status !== 'ready') return assert.fail('debería estar listo');
    eq(report.userId, ANA, 'y el preflight siguió siendo de Ana');
    eq([...report.plans.keys()], ['setlist-ana']);
    eq(cloud.tokens, ['token-de-ana']);
    eq(storage.writes, []);
  });

  it('sin identidad, sin token o sin Supabase no se mira nada', async () => {
    const storage = countingBrowser();
    const cloud = readOnlyCloud();

    eq(await runSetlistSyncPreflight(captureOf('', 'token'), { storage, cloudFor: cloud.cloudFor }), {
      status: 'not-signed-in',
    });
    eq(await runSetlistSyncPreflight(captureOf('   ', 'token'), { storage, cloudFor: cloud.cloudFor }), {
      status: 'not-signed-in',
    });
    eq(await runSetlistSyncPreflight(captureOf(ANA, '   '), { storage, cloudFor: cloud.cloudFor }), {
      status: 'no-access-token',
      userId: ANA,
    });
    eq(await runSetlistSyncPreflight(captureOf(ANA, 'token'), { storage, cloudFor: () => null }), {
      status: 'unconfigured',
      userId: ANA,
    });
    eq(cloud.lists, [], 'ninguna lectura de la nube');
    eq(cloud.tokens, [], 'y sin identidad ni token, ninguna nube construida');
    eq(storage.reads, [], 'ni se abrió el almacenamiento');
  });
});

// --- When the cloud cannot be read ---------------------------------------------------------------

describe('Si no se puede leer la nube', () => {
  it('se dice por qué, y no se concluye nada sobre los setlists', async () => {
    for (const [error, status] of [
      [new SetlistCloudAuthError(), 'remote-auth-error'],
      [new SupabaseRequestError('row-level security', 403, '42501'), 'remote-read-error'],
      [new TypeError('Failed to fetch'), 'remote-read-error'],
    ] as const) {
      const storage = countingBrowser();
      const scope = userSetlists(ANA);
      createLocalSetlistRepository(storage, scope).save([setlistOf('setlist-ana')]);
      createSetlistSyncStore(storage, scope).save(
        new Map([['setlist-ana', baseOf(setlistOf('setlist-ana'), 4)]])
      );
      storage.writes.length = 0;
      const antes = new Map(storage.data);

      const report = await runSetlistSyncPreflight(captureOf(ANA, 'token-de-ana'), {
        storage,
        cloudFor: readOnlyCloud({ listThrows: error }).cloudFor,
      });

      eq(report.status, status);
      if (report.status !== 'remote-auth-error' && report.status !== 'remote-read-error') {
        return assert.fail('debería ser un error de lectura');
      }
      eq(report.error, error, 'el error entero');
      eq(report.userId, ANA);
      // Lo de aquí sí se contó; sobre lo de allí no se concluye nada.
      eq(report.local, { setlists: 1, bases: 1, deletions: 0 });
      eq('plans' in report, false, 'ningún plan inventado contra una nube vacía');
      eq(storage.writes, []);
      eq(storage.data, antes);
    }
  });
});

// --- Nobody runs this yet --------------------------------------------------------------------------

describe('Esto todavía no lo usa nadie', () => {
  it('ni la aplicación, ni un botón, ni un temporizador', () => {
    const source = readFileSync('src/storage/setlistSyncPreflight.ts', 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
    for (const forbidden of [
      'useState',
      'useEffect',
      'react',
      'setTimeout',
      'setInterval',
      'getAppServices',
      'currentSession',
      'authenticated(',
      'useSession',
      'atob',
      'createClient(',
      'genesaret_setlists',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }
    for (const file of ['src/App.tsx', 'src/hooks/useSetlists.ts']) {
      const contents = readFileSync(file, 'utf8');
      eq(contents.includes('setlistSyncPreflight'), false, file);
      eq(contents.includes('runSetlistSyncPreflight'), false, file);
    }
  });

  it('el reporte se puede enseñar sin enseñar ningún secreto', async () => {
    const storage = countingBrowser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    const cloud = readOnlyCloud({ rows: [] });
    const report = await runSetlistSyncPreflight(captureOf(ANA, 'jwt-secretisimo-de-ana'), {
      storage,
      cloudFor: cloud.cloudFor,
    });

    if (report.status !== 'ready') return assert.fail('debería estar listo');
    // El id de la cuenta sí está: es de quién es esto. El token no, ni nada
    // que se le parezca.
    const shown = JSON.stringify({ ...report, plans: [...report.plans.keys()] });
    eq(shown.includes('jwt-secretisimo-de-ana'), false, 'ningún token');
    for (const secret of ['Authorization', 'apikey', 'Bearer', 'service_role', 'sb_secret', 'password']) {
      eq(shown.includes(secret), false, secret);
    }
    eq(shown.includes(ANA), true, 'de quién es, sí');
  });
});
