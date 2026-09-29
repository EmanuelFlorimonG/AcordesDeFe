import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import type { AppSession } from '../src/auth/session';
import { SupabaseRequestError } from '../src/lib/supabase';
import {
  SetlistCloudAuthError,
  type CloudSetlistRead,
  type CloudSetlistRepository,
  type CloudWriteResult,
} from '../src/storage/cloudSetlists';
import { createLocalSetlistRepository, userSetlists, GUEST_SETLISTS } from '../src/storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint } from '../src/storage/setlistSync';
import { runAuthenticatedSetlistSyncPass } from '../src/storage/setlistSyncSession';

/**
 * One pass for one signed-in person.
 *
 * No Supabase is reached here: the cloud is always a function these tests
 * wrote, and the only thing that stands in for a browser is a Map. What is
 * checked is whose stores a pass opens, what it refuses to do without an
 * identity or a token, and that a change of session while a request is in
 * the air cannot make one person's pass write into another's.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSyncSession.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const ANA = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const BRUNO = '0f8fad5b-d9cb-469f-a165-70867728950e';

const sessionOf = (userId: string): AppSession => ({
  userId,
  email: 'quien.sea@example.com',
  displayName: 'Quien sea',
  emailConfirmed: true,
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

/** One browser: every scope writes into the same storage, under its own key. */
const browser = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

const activeRow = (setlist: Setlist, revision: number): CloudSetlistRead => ({
  state: 'setlist',
  id: setlist.id,
  setlist,
  revision,
  serverUpdatedAt: '2026-09-22T18:45:00+00:00',
});

interface CloudCall {
  op: 'list' | 'create' | 'update' | 'remove';
  args: unknown[];
}

/** A cloud that answers what the test says and remembers what it was asked. */
function fakeCloud(
  options: { rows?: CloudSetlistRead[]; listThrows?: unknown; during?: () => void; create?: CloudWriteResult } = {}
) {
  const calls: CloudCall[] = [];
  const cloud: CloudSetlistRepository = {
    async list(local) {
      calls.push({ op: 'list', args: [local] });
      options.during?.();
      if (options.listThrows) throw options.listThrows;
      return options.rows ?? [];
    },
    async create(setlist) {
      calls.push({ op: 'create', args: [setlist] });
      // Sin una respuesta preparada, crear es un error: significa que nadie
      // autorizo esta subida.
      if (!options.create) throw new Error('una pasada no crea nada sin que alguien lo pida');
      return options.create;
    },
    async update(setlist, expectedRevision) {
      calls.push({ op: 'update', args: [setlist, expectedRevision] });
      return { status: 'conflict' } as CloudWriteResult;
    },
    async remove(id, expectedRevision, deletedAt) {
      calls.push({ op: 'remove', args: [id, expectedRevision, deletedAt] });
      return { status: 'conflict' } as CloudWriteResult;
    },
  };
  return { calls, cloud };
}

/** What `cloudFor` was handed, so the token reaching the cloud can be checked. */
function watchingCloud(options: Parameters<typeof fakeCloud>[0] = {}) {
  const tokens: string[] = [];
  const inner = fakeCloud(options);
  return {
    ...inner,
    tokens,
    cloudFor: (accessToken: string) => {
      tokens.push(accessToken);
      return inner.cloud;
    },
  };
}

// --- Whose pass it is ------------------------------------------------------------------------

describe('Una pasada es de una cuenta y de una sola', () => {
  it('abre los almacenes de esa cuenta, y ninguno más', async () => {
    const storage = browser();
    const deAna = setlistOf('setlist-ana', 'Lo de Ana');
    const deBruno = setlistOf('setlist-bruno', 'Lo de Bruno');
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([deAna]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([deBruno]);
    createLocalSetlistRepository(storage, GUEST_SETLISTS).save([setlistOf('setlist-invitado', 'Lo del invitado')]);

    const cloud = watchingCloud({ rows: [] });
    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    eq(result.status, 'ran');
    if (result.status !== 'ran') return assert.fail('debería haber corrido');
    eq(result.userId, ANA);
    // La nube recibió los setlists de Ana para hidratar, y sólo esos.
    eq((cloud.calls[0].args[0] as Setlist[]).map((entry) => entry.id), ['setlist-ana']);
    eq([...result.report.outcomes.keys()], ['setlist-ana'], 'y sólo se decidió sobre el suyo');
    eq(cloud.tokens, ['token-de-ana']);
  });

  it('lo de Bruno no entra en la pasada de Ana, ni al revés', async () => {
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);

    const deAna = watchingCloud({ rows: [] });
    const primera = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: deAna.cloudFor }
    );
    const deBruno = watchingCloud({ rows: [] });
    const segunda = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(BRUNO), accessToken: 'token-de-bruno' },
      { storage, cloudFor: deBruno.cloudFor }
    );

    eq((deAna.calls[0].args[0] as Setlist[]).map((entry) => entry.id), ['setlist-ana']);
    eq((deBruno.calls[0].args[0] as Setlist[]).map((entry) => entry.id), ['setlist-bruno']);
    eq(primera.status === 'ran' && [...primera.report.outcomes.keys()], ['setlist-ana']);
    eq(segunda.status === 'ran' && [...segunda.report.outcomes.keys()], ['setlist-bruno']);
    eq([deAna.tokens, deBruno.tokens], [['token-de-ana'], ['token-de-bruno']]);
  });

  it('escribe en las claves de esa cuenta y deja intactas las demás', async () => {
    const storage = browser();
    const deAna = setlistOf('setlist-ana');
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([deAna]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);
    const antesDeBruno = storage.data.get(`genesaret_setlists:u:${BRUNO}`);
    const antesDelInvitado = storage.data.get('genesaret_setlists');

    // La nube dice lo mismo que el dispositivo: se apunta el acuerdo.
    const cloud = watchingCloud({ rows: [activeRow(deAna, 4)] });
    await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    eq(
      [...createSetlistSyncStore(storage, userSetlists(ANA)).load().values()],
      [{ setlistId: 'setlist-ana', cloudRevision: 4, fingerprint: portableFingerprint(deAna) }]
    );
    eq(createSetlistSyncStore(storage, userSetlists(BRUNO)).load().size, 0, 'Bruno no tiene bases nuevas');
    eq(storage.data.get(`genesaret_setlists:u:${BRUNO}`), antesDeBruno, 'ni sus setlists cambiaron');
    eq(storage.data.get('genesaret_setlists'), antesDelInvitado, 'ni los del invitado');
    eq(storage.data.has('genesaret_setlist_sync'), false, 'ninguna clave sin cuenta');
  });
});

// --- Without an identity, or without a token --------------------------------------------------

describe('Sin identidad o sin token no se hace nada', () => {
  it('un invitado no tiene pasada autenticada', async () => {
    // Un invitado no tiene user id: es exactamente la identidad en blanco.
    const storage = browser();
    const cloud = watchingCloud();
    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(''), accessToken: 'token-de-alguien' },
      { storage, cloudFor: cloud.cloudFor }
    );

    eq(result, { status: 'not-signed-in' });
    eq(cloud.calls, [], 'ni una petición');
    eq(cloud.tokens, [], 'ni se construyó una nube');
    eq(storage.data.size, 0, 'ni se tocó el almacenamiento');
  });

  it('un id en blanco tampoco', async () => {
    const cloud = watchingCloud();
    for (const userId of ['', '   ', '\t']) {
      const result = await runAuthenticatedSetlistSyncPass(
        { session: sessionOf(userId), accessToken: 'token' },
        { storage: browser(), cloudFor: cloud.cloudFor }
      );
      eq(result, { status: 'not-signed-in' }, JSON.stringify(userId));
    }
    eq(cloud.calls, []);
  });

  it('con identidad pero sin token, tampoco: no se pregunta como el público', async () => {
    const storage = browser();
    const cloud = watchingCloud();
    // La captura nunca produce uno de estos; se construyen a mano para
    // comprobar la frontera de todos modos.
    for (const accessToken of [null as unknown as string, '', '   ', undefined as unknown as string]) {
      const result = await runAuthenticatedSetlistSyncPass(
        { session: sessionOf(ANA), accessToken },
        { storage, cloudFor: cloud.cloudFor }
      );
      eq(result, { status: 'no-access-token', userId: ANA }, String(accessToken));
    }
    eq(cloud.calls, [], 'ninguna petición');
    eq(cloud.tokens, [], 'y ninguna nube construida: no hay nadie a quien representar');
    eq(storage.data.size, 0);
  });

  it('sin Supabase en esta compilación no hay nada con lo que sincronizar', async () => {
    const storage = browser();
    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: () => null }
    );
    eq(result, { status: 'unconfigured', userId: ANA });
    eq(storage.data.size, 0);
  });
});

// --- The report comes back as it was made -------------------------------------------------------

describe('El reporte de la pasada llega entero', () => {
  it('una pasada completada se devuelve tal cual', async () => {
    const storage = browser();
    const suyo = setlistOf('setlist-ana');
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([suyo]);
    const cloud = watchingCloud({ rows: [activeRow(suyo, 4)] });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    if (result.status !== 'ran') return assert.fail('debería haber corrido');
    eq(result.report.status, 'completed');
    eq(result.report.order, ['setlist-ana']);
    eq(result.report.outcomes.get('setlist-ana')?.kind, 'applied-local');
    eq(result.report.error, undefined);
  });

  it('y una que no pudo leer la nube conserva su motivo', async () => {
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);

    for (const [error, status] of [
      [new SetlistCloudAuthError(), 'remote-auth-error'],
      [new SupabaseRequestError('row-level security', 403, '42501'), 'remote-read-error'],
      [new TypeError('Failed to fetch'), 'remote-read-error'],
    ] as const) {
      const cloud = watchingCloud({ listThrows: error });
      const result = await runAuthenticatedSetlistSyncPass(
        { session: sessionOf(ANA), accessToken: 'token-de-ana' },
        { storage, cloudFor: cloud.cloudFor }
      );

      // No se convierte todo en "falló la sincronización": la pasada corrió,
      // y lo que no se pudo fue leer.
      eq(result.status, 'ran', status);
      if (result.status !== 'ran') return assert.fail('debería haber corrido');
      eq(result.report.status, status);
      eq(result.report.error, error, 'el error entero');
      eq(result.report.outcomes.size, 0);
    }
  });

  it('un setlist que la nube no tiene sigue esperando a que alguien lo decida', async () => {
    // Iniciar sesión no sube lo que ya había en el dispositivo.
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([setlistOf('setlist-ana')]);
    const cloud = watchingCloud({ rows: [] });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    if (result.status !== 'ran') return assert.fail('debería haber corrido');
    eq(result.report.outcomes.get('setlist-ana')?.kind, 'pending-user-action');
    eq(cloud.calls.map((call) => call.op), ['list'], 'ni un create');
    eq([...createSetlistSyncStore(storage, userSetlists(ANA)).load().values()], [], 'ni una base inventada');
  });
});

// --- The session changing underneath ------------------------------------------------------------

describe('Si la sesión cambia mientras la pasada está en marcha', () => {
  it('la pasada de Ana termina siendo de Ana', async () => {
    const storage = browser();
    const deAna = setlistOf('setlist-ana', 'Lo de Ana');
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([deAna]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno', 'Lo de Bruno')]);
    const antesDeBruno = storage.data.get(`genesaret_setlists:u:${BRUNO}`);

    // Una "sesión actual" que cambia a Bruno en mitad de la petición. Nada
    // del adaptador vuelve a mirarla: la identidad y el token se tomaron una
    // vez, antes del primer await.
    let sesionActual = sessionOf(ANA);
    const cloud = watchingCloud({
      rows: [activeRow(deAna, 4)],
      during: () => {
        sesionActual = sessionOf(BRUNO);
      },
    });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sesionActual, accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    eq(sesionActual.userId, BRUNO, 'la sesión sí cambió');
    if (result.status !== 'ran') return assert.fail('debería haber corrido');
    eq(result.userId, ANA, 'y la pasada siguió siendo de quien la empezó');
    eq(
      [...createSetlistSyncStore(storage, userSetlists(ANA)).load().keys()],
      ['setlist-ana'],
      'lo aprendido se guardó en lo de Ana'
    );
    eq(createSetlistSyncStore(storage, userSetlists(BRUNO)).load().size, 0, 'y nada en lo de Bruno');
    eq(storage.data.get(`genesaret_setlists:u:${BRUNO}`), antesDeBruno, 'cuyos setlists ni se tocaron');
    eq(cloud.tokens, ['token-de-ana'], 'con el token con el que empezó');
  });

  it('la pasada no vuelve a preguntar a la capa de auth', async () => {
    // Lo que recibe es una captura ya hecha: no hay forma de que consulte la
    // sesion otra vez, porque no conoce a nadie a quien preguntar.
    const source = readFileSync('src/storage/setlistSyncSession.ts', 'utf8');
    for (const forbidden of ['authenticated(', 'getAppServices', 'currentSession', 'useSession', 'auth.']) {
      eq(source.includes(forbidden), false, forbidden);
    }
    eq(source.includes("import type { AuthenticatedSession }"), true, 'solo el tipo de la captura');
  });

  it('un fallo al guardar no hace perder el reporte de la pasada', async () => {
    const storage = browser();
    const suyo = setlistOf('setlist-ana');
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([suyo]);
    // El almacenamiento se llena justo antes de que la pasada quiera escribir.
    const full = {
      getItem: (key: string) => storage.data.get(key) ?? null,
      setItem: () => {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      },
    };
    const cloud = watchingCloud({ rows: [activeRow(suyo, 4)] });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage: full, cloudFor: cloud.cloudFor }
    );

    if (result.status !== 'ran') return assert.fail('debería haber corrido');
    eq(result.report.status, 'completed');
    const outcome = result.report.outcomes.get('setlist-ana');
    eq(outcome?.kind, 'local-error');
    eq(outcome && 'error' in outcome && (outcome.error as DOMException).name, 'QuotaExceededError');
  });
});

// --- Uploading, only when somebody asks ---------------------------------------------------------

describe('Subir un setlist requiere pedirlo', () => {
  const suyo = setlistOf('setlist-ana');

  it('sin nombrarlo, la pasada no crea nada', async () => {
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([suyo]);
    const cloud = watchingCloud({ rows: [] });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor }
    );

    if (result.status !== 'ran') return assert.fail('deberia haber corrido');
    eq(result.report.outcomes.get('setlist-ana')?.kind, 'pending-user-action');
    eq(cloud.calls.map((call) => call.op), ['list']);
  });

  it('nombrandolo, se crea en la nube de esa cuenta y se apunta la base', async () => {
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([suyo]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);
    const antesDeBruno = storage.data.get(`genesaret_setlists:u:${BRUNO}`);
    const cloud = watchingCloud({
      rows: [],
      create: { status: 'written', rows: 1, read: activeRow(suyo, 1) },
    });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor },
      { authorisedUploads: ['setlist-ana'] }
    );

    if (result.status !== 'ran') return assert.fail('deberia haber corrido');
    const outcome = result.report.outcomes.get('setlist-ana');
    eq(outcome?.kind, 'cloud-success');
    eq(outcome && 'local' in outcome && outcome.local, 'written');
    eq(cloud.calls.map((call) => call.op), ['list', 'create']);
    eq(cloud.tokens, ['token-de-ana'], 'con el token de esa sesion');
    eq(
      [...createSetlistSyncStore(storage, userSetlists(ANA)).load().values()],
      [{ setlistId: 'setlist-ana', cloudRevision: 1, fingerprint: portableFingerprint(suyo) }]
    );
    // Y nada de Bruno se movio.
    eq(createSetlistSyncStore(storage, userSetlists(BRUNO)).load().size, 0);
    eq(storage.data.get(`genesaret_setlists:u:${BRUNO}`), antesDeBruno);
  });

  it('nombrar el setlist de otra cuenta no sube nada', async () => {
    const storage = browser();
    createLocalSetlistRepository(storage, userSetlists(ANA)).save([suyo]);
    createLocalSetlistRepository(storage, userSetlists(BRUNO)).save([setlistOf('setlist-bruno')]);
    const cloud = watchingCloud({ rows: [] });

    const result = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: 'token-de-ana' },
      { storage, cloudFor: cloud.cloudFor },
      { authorisedUploads: ['setlist-bruno'] }
    );

    if (result.status !== 'ran') return assert.fail('deberia haber corrido');
    // El de Bruno no esta en la pasada de Ana, asi que nombrarlo no hace nada.
    eq(result.report.outcomes.has('setlist-bruno'), false);
    eq(result.report.outcomes.get('setlist-ana')?.kind, 'pending-user-action');
    eq(cloud.calls.map((call) => call.op), ['list'], 'ninguna creacion');
  });
});

// --- Still nobody runs this ----------------------------------------------------------------------

describe('Esta capa sigue sin que nadie la use', () => {
  const source = readFileSync('src/storage/setlistSyncSession.ts', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('no es React, no mide el tiempo y no vuelve a preguntar quién hay', () => {
    for (const forbidden of [
      'useState',
      'useEffect',
      'react',
      'setTimeout',
      'setInterval',
      'while (',
      'for (',
      'getAppServices',
      'currentSession',
      'localStorage',
      'createClient(',
      'service_role',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // Una pasada, una sola.
    eq((code.match(/runSetlistSyncPass\(/g) ?? []).length, 1);
    // Las claves se construyen con los constructores de siempre, no a mano.
    eq(code.includes('genesaret_setlists'), false, 'ninguna clave escrita a mano');
    eq(code.includes('userSetlists(userId)'), true);
  });

  it('la aplicación no la importa', () => {
    for (const file of ['src/App.tsx', 'src/hooks/useSetlists.ts']) {
      const contents = readFileSync(file, 'utf8');
      eq(contents.includes('setlistSyncSession'), false, file);
      eq(contents.includes('runAuthenticatedSetlistSyncPass'), false, file);
      eq(contents.includes('runSetlistSyncPass'), false, file);
    }
  });
});
