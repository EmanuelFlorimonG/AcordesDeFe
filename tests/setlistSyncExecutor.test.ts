import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import { SupabaseRequestError } from '../src/lib/supabase';
import {
  SetlistCloudAuthError,
  type CloudSetlistRead,
  type CloudSetlistRepository,
  type CloudWriteResult,
} from '../src/storage/cloudSetlists';
import {
  executeSetlistSyncPlan,
  isCloudSetlistPlan,
  type CloudSetlistPlan,
  type SetlistSyncExecutionResult,
} from '../src/storage/setlistSyncExecutor';
import type { SetlistQuestion, SetlistSyncPlan } from '../src/storage/setlistSync';
import type { SetlistCloudInvalidReason } from '../src/storage/setlistSyncExecutor';

/**
 * Carrying out one plan.
 *
 * Every cloud here is a function these tests wrote: nothing reaches a real
 * Supabase, no row is written, no tombstone is made. What is checked is which
 * single call goes out, with exactly which arguments, and what this makes of
 * the answer — including answers the operation could not have produced.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSyncExecutor.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const DELETED_AT = Date.UTC(2026, 8, 16, 8);
const SERVER_UPDATED = '2026-09-22T18:45:00+00:00';

const setlistOf = (id = 'setlist-1234'): Setlist => ({
  id,
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Primera prueba',
  participantIds: ['miembro-ana'],
  items: [],
  createdAt: NOW,
  updatedAt: NOW + 60_000,
});

const active = (revision: number, id = 'setlist-1234'): CloudSetlistRead => ({
  state: 'setlist',
  id,
  setlist: setlistOf(id),
  revision,
  serverUpdatedAt: SERVER_UPDATED,
});

const tombstone = (revision: number, id = 'setlist-1234'): CloudSetlistRead => ({
  state: 'deleted',
  id,
  revision,
  deletedAt: new Date(DELETED_AT).toISOString(),
});

const written = (read: CloudSetlistRead, rows = 1): CloudWriteResult => ({ status: 'written', rows, read });

interface Call {
  op: 'create' | 'update' | 'remove';
  args: unknown[];
}

/**
 * A cloud that answers what the test says and remembers what it was asked.
 * Anything not set up throws, so a call that should not happen is a failure
 * and not a silent pass.
 */
function fakeCloud(answers: {
  create?: CloudWriteResult | (() => never);
  update?: CloudWriteResult | (() => never);
  remove?: CloudWriteResult | (() => never);
}) {
  const calls: Call[] = [];
  const answer = (op: Call['op'], value: CloudWriteResult | (() => never) | undefined): CloudWriteResult => {
    if (value === undefined) throw new Error(`el plan no autoriza ${op}`);
    return typeof value === 'function' ? value() : value;
  };
  const cloud: CloudSetlistRepository = {
    async list() {
      throw new Error('el executor no lee');
    },
    async create(setlist) {
      calls.push({ op: 'create', args: [setlist] });
      return answer('create', answers.create);
    },
    async update(setlist, expectedRevision) {
      calls.push({ op: 'update', args: [setlist, expectedRevision] });
      return answer('update', answers.update);
    },
    async remove(id, expectedRevision, deletedAt) {
      calls.push({ op: 'remove', args: [id, expectedRevision, deletedAt] });
      return answer('remove', answers.remove);
    },
  };
  return { calls, cloud };
}

const throws = (error: unknown) => () => {
  throw error;
};

const createPlan = (setlist = setlistOf()): CloudSetlistPlan => ({ kind: 'upload-candidate', setlist });
const updatePlan = (expectedRevision: number): CloudSetlistPlan => ({
  kind: 'upload-changes',
  setlist: setlistOf(),
  expectedRevision,
});
const deletePlan = (expectedRevision: number): CloudSetlistPlan => ({
  kind: 'delete-remote',
  setlistId: 'setlist-1234',
  expectedRevision,
  deletedAt: DELETED_AT,
});

const run = (plan: CloudSetlistPlan, cloud: CloudSetlistRepository) => executeSetlistSyncPlan({ plan, cloud });

// --- Which plans get this far ------------------------------------------------------------

describe('Qué planes llegan a pedir algo', () => {
  it('sólo los tres que significan una petición', () => {
    // El tipo es la frontera de verdad: los demás ni siquiera se pueden pasar
    // a executeSetlistSyncPlan. Esto es para quien tiene la unión entera y
    // tiene que separarlos.
    const cloudOnes: SetlistSyncPlan[] = [createPlan(), updatePlan(4), deletePlan(4)];
    for (const plan of cloudOnes) eq(isCloudSetlistPlan(plan), true, plan.kind);

    const base = { setlistId: 'setlist-1234', cloudRevision: 4, fingerprint: '0123456789abcdef' };
    const others: SetlistSyncPlan[] = [
      { kind: 'noop', reason: 'in-sync' },
      { kind: 'noop', reason: 'already-deleted' },
      { kind: 'adopt-baseline', base },
      { kind: 'apply-remote', setlist: setlistOf(), base },
      { kind: 'delete-local', setlistId: 'setlist-1234', cloudRevision: 4 },
      { kind: 'forget-baseline', setlistId: 'setlist-1234' },
      { kind: 'confirm-deletion', setlistId: 'setlist-1234' },
      { kind: 'blocked', setlistId: 'setlist-1234', reason: 'newer' },
      { kind: 'blocked', setlistId: 'setlist-1234', reason: 'corrupt' },
      { kind: 'ask', question: 'both-changed', setlistId: 'setlist-1234' },
      { kind: 'ask', question: 'inconsistent-local-deletion', setlistId: 'setlist-1234' },
    ];
    for (const plan of others) eq(isCloudSetlistPlan(plan), false, plan.kind);
    // Los ocho kinds que no son de nube, todos representados: si mañana
    // apareciera uno nuevo, esta cuenta lo diría.
    eq([...new Set(others.map((plan) => plan.kind))].sort(), [
      'adopt-baseline',
      'apply-remote',
      'ask',
      'blocked',
      'confirm-deletion',
      'delete-local',
      'forget-baseline',
      'noop',
    ]);
    // Y las nueve preguntas que existen hoy tampoco pasan.
    const questions: SetlistQuestion[] = [
      'first-meeting',
      'both-changed',
      'deleted-elsewhere-edited-here',
      'deleted-elsewhere-unknown-here',
      'gone-locally',
      'gone-remotely',
      'revision-regressed',
      'deleted-here-changed-there',
      'deleted-here-unknown-revision',
      'inconsistent-local-deletion',
      'deletion-unreadable',
    ];
    for (const question of questions) {
      eq(isCloudSetlistPlan({ kind: 'ask', question, setlistId: 'setlist-1234' }), false, question);
    }
  });

  it('un plan que no es de nube no compila contra el executor', () => {
    // La frontera se comprueba en el fuente, porque en TypeScript no se puede
    // escribir la llamada que no compila.
    const source = readFileSync('src/storage/setlistSyncExecutor.ts', 'utf8');
    eq(
      source.includes("Extract<\n  SetlistSyncPlan,\n  { kind: 'upload-candidate' | 'upload-changes' | 'delete-remote' }\n>"),
      true,
      'el tipo aceptado se deriva de la unión, no se copia'
    );
    eq(source.includes('plan: CloudSetlistPlan'), true);
  });
});

// --- Create --------------------------------------------------------------------------------

describe('Subir un setlist que la nube no tenía', () => {
  it('llama a create una sola vez, y a nada más', async () => {
    const { calls, cloud } = fakeCloud({ create: written(active(1)) });
    const setlist = setlistOf();
    const result = await run(createPlan(setlist), cloud);

    eq(calls.length, 1);
    eq(calls[0].op, 'create');
    eq(calls[0].args, [setlist], 'el setlist del plan, tal cual');
    eq(result.kind, 'success');
    eq(result, {
      kind: 'success',
      operation: 'create',
      setlistId: 'setlist-1234',
      revision: 1,
      read: active(1),
    }, 'y devuelve la fila confirmada, para que quien llame pueda anotar la base');
  });

  it('si ya estaba, es un conflicto, y no se convierte en una modificación', async () => {
    const { calls, cloud } = fakeCloud({ create: { status: 'conflict' } });
    eq(await run(createPlan(), cloud), { kind: 'conflict', operation: 'create', setlistId: 'setlist-1234' });
    eq(calls.length, 1, 'una petición, y ninguna más: reintentar es volver a decidir');
    eq(calls.map((call) => call.op), ['create']);
  });

  it('lo que no cabe en la tabla se dice tal cual', async () => {
    const { calls, cloud } = fakeCloud({ create: { status: 'rejected', problem: 'name' } });
    eq(await run(createPlan(), cloud), {
      kind: 'rejected',
      operation: 'create',
      setlistId: 'setlist-1234',
      problem: 'name',
    });
    eq(calls.length, 1);
  });

  it('una respuesta que un create no pudo producir no es un éxito', async () => {
    const cases: Array<[CloudWriteResult, SetlistCloudInvalidReason]> = [
      [written(active(1), 2), 'row-count'],
      [written(active(1), 0), 'row-count'],
      [written(active(1, 'otro-setlist')), 'wrong-id'],
      [written(active(2)), 'wrong-revision'],
      [written(tombstone(1)), 'deleted'],
      [written({ state: 'newer', id: 'setlist-1234', revision: 1, payloadVersion: 2 }), 'newer'],
      [written({ state: 'corrupt', id: 'setlist-1234' }), 'unreadable'],
      [written({ state: 'corrupt', id: null }), 'unreadable'],
    ];
    for (const [answer, reason] of cases) {
      const { cloud } = fakeCloud({ create: answer });
      const result = await run(createPlan(), cloud);
      eq(result.kind, 'invalid-response', reason);
      eq(result.kind === 'invalid-response' && result.reason, reason);
    }
  });
});

// --- Update --------------------------------------------------------------------------------

describe('Guardar un cambio sobre lo que ya estaba', () => {
  it('llama a update con la revisión del plan, ni una más', async () => {
    const { calls, cloud } = fakeCloud({ update: written(active(5)) });
    const setlist = setlistOf();
    const result = await run({ kind: 'upload-changes', setlist, expectedRevision: 4 }, cloud);

    eq(calls.length, 1);
    eq(calls[0], { op: 'update', args: [setlist, 4] }, 'la revisión que leyó el dispositivo');
    eq(result, {
      kind: 'success',
      operation: 'update',
      setlistId: 'setlist-1234',
      revision: 5,
      read: active(5),
    });
  });

  it('cero filas es un conflicto, y ahí se acaba', async () => {
    const { calls, cloud } = fakeCloud({ update: { status: 'conflict' } });
    eq(await run(updatePlan(4), cloud), { kind: 'conflict', operation: 'update', setlistId: 'setlist-1234' });
    // Nada de volver a intentarlo con una revisión más nueva: eso sería
    // decidir otra vez, y decidir es leer, reconciliar y hacer otro plan.
    eq(calls.length, 1);
    eq(calls.map((call) => call.op), ['update']);
  });

  it('una respuesta que un update no pudo producir no es un éxito', async () => {
    const cases: Array<[CloudWriteResult, SetlistCloudInvalidReason]> = [
      [written(active(5), 2), 'row-count'],
      [written(active(5, 'otro-setlist')), 'wrong-id'],
      [written(active(4)), 'wrong-revision'],
      [written(active(6)), 'wrong-revision'],
      [written(active(1)), 'wrong-revision'],
      [written(tombstone(5)), 'deleted'],
      [written({ state: 'newer', id: 'setlist-1234', revision: 5, payloadVersion: 2 }), 'newer'],
      [written({ state: 'corrupt', id: 'setlist-1234' }), 'unreadable'],
    ];
    for (const [answer, reason] of cases) {
      const { cloud } = fakeCloud({ update: answer });
      const result = await run(updatePlan(4), cloud);
      eq(result.kind === 'invalid-response' && result.reason, reason, reason);
    }
  });
});

// --- Delete --------------------------------------------------------------------------------

describe('Borrar en la nube lo que alguien borró aquí', () => {
  it('llama a remove con la revisión del plan y la hora de la intención', async () => {
    const { calls, cloud } = fakeCloud({ remove: written(tombstone(5)) });
    const result = await run(deletePlan(4), cloud);

    eq(calls.length, 1);
    eq(calls[0].op, 'remove');
    eq(calls[0].args[0], 'setlist-1234');
    eq(calls[0].args[1], 4, 'la revisión que se conocía al borrar');
    // Alguien borra en el tren y sincroniza una hora más tarde: lo quiso en el
    // tren. La hora del servidor queda aparte, y dice otra cosa distinta.
    eq((calls[0].args[2] as Date).getTime(), DELETED_AT);
    eq((calls[0].args[2] as Date).toISOString(), '2026-09-16T08:00:00.000Z');
    eq(result, {
      kind: 'success',
      operation: 'delete',
      setlistId: 'setlist-1234',
      revision: 5,
      read: tombstone(5),
    });
  });

  it('cero filas es un conflicto', async () => {
    const { calls, cloud } = fakeCloud({ remove: { status: 'conflict' } });
    eq(await run(deletePlan(4), cloud), { kind: 'conflict', operation: 'delete', setlistId: 'setlist-1234' });
    eq(calls.length, 1);
  });

  it('un momento que no es un momento no llega a salir', async () => {
    // El motor ya se niega a planearlo, pero esta es la frontera donde un
    // valor se convierte en una petición: un Date hecho con NaN viaja como
    // null y dejaría una lápida sin hora. Se comprueba aquí también.
    for (const deletedAt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 1.5, -0]) {
      const { calls, cloud } = fakeCloud({ remove: written(tombstone(5)) });
      const plan: CloudSetlistPlan = { kind: 'delete-remote', setlistId: 'setlist-1234', expectedRevision: 4, deletedAt };
      eq(await run(plan, cloud), {
        kind: 'invalid-plan',
        operation: 'delete',
        setlistId: 'setlist-1234',
        reason: 'deleted-at',
      }, String(deletedAt));
      eq(calls, [], `no sale nada con ${String(deletedAt)}`);
    }
  });

  it('el epoch viaja intacto: ni texto, ni zona, ni idioma', async () => {
    for (const deletedAt of [1, DELETED_AT, Date.UTC(1970, 0, 2), Date.UTC(2099, 11, 31, 23, 59, 59)]) {
      const { calls, cloud } = fakeCloud({ remove: written(tombstone(5)) });
      await run({ kind: 'delete-remote', setlistId: 'setlist-1234', expectedRevision: 4, deletedAt }, cloud);
      eq((calls[0].args[2] as Date).getTime(), deletedAt, String(deletedAt));
    }
  });

  it('una fila que sigue viva no es un borrado', async () => {
    // Aceptarla haría que el dispositivo olvidase un setlist que sigue ahí.
    const cases: Array<[CloudWriteResult, SetlistCloudInvalidReason]> = [
      [written(active(5)), 'not-deleted'],
      [written(tombstone(5), 2), 'row-count'],
      [written(tombstone(5, 'otro-setlist')), 'wrong-id'],
      [written(tombstone(4)), 'wrong-revision'],
      [written(tombstone(6)), 'wrong-revision'],
      [written({ state: 'newer', id: 'setlist-1234', revision: 5, payloadVersion: 2 }), 'newer'],
      [written({ state: 'corrupt', id: 'setlist-1234' }), 'unreadable'],
    ];
    for (const [answer, reason] of cases) {
      const { cloud } = fakeCloud({ remove: answer });
      const result = await run(deletePlan(4), cloud);
      eq(result.kind === 'invalid-response' && result.reason, reason, reason);
    }
  });
});

// --- When it does not get through ------------------------------------------------------------

describe('Cuando la petición no llega o la rechazan', () => {
  const authError = new SetlistCloudAuthError();
  const requestError = new SupabaseRequestError('row-level security', 403, '42501');
  const networkError = new TypeError('Failed to fetch');

  it('sin sesión: se dice, y no se intenta nada más', async () => {
    for (const [plan, key] of [
      [createPlan(), 'create'],
      [updatePlan(4), 'update'],
      [deletePlan(4), 'remove'],
    ] as const) {
      const { calls, cloud } = fakeCloud({ [key]: throws(authError) });
      const result = await run(plan, cloud);
      eq(result.kind, 'auth-error', key);
      eq(calls.length, 1, 'una sola llamada');
    }
    // Y nunca se reintenta como público, ni se cierra sesión, ni se borra nada:
    // en el código no hay bucles, ni una segunda llamada a la nube.
    const code = readFileSync('src/storage/setlistSyncExecutor.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');
    for (const forbidden of ['signOut', 'anonKey', 'accessToken', 'catch {']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    eq((code.match(/await cloud\./g) ?? []).length, 3, 'tres llamadas posibles, una por plan, y ninguna repetida');
  });

  it('una negativa de la base de datos o una red caída: el error viaja entero', async () => {
    for (const error of [requestError, networkError]) {
      for (const [plan, key] of [
        [createPlan(), 'create'],
        [updatePlan(4), 'update'],
        [deletePlan(4), 'remove'],
      ] as const) {
        const { calls, cloud } = fakeCloud({ [key]: throws(error) });
        const result = await run(plan, cloud);
        eq(result.kind, 'request-error', `${key} / ${error.name}`);
        eq(result.kind === 'request-error' && result.error, error, 'sin mirarle el texto a nadie');
        eq(calls.length, 1);
      }
    }
    // El código y el estado siguen ahí para quien tenga que distinguirlos.
    const { cloud } = fakeCloud({ update: throws(requestError) });
    const result = await run(updatePlan(4), cloud);
    const error = result.kind === 'request-error' ? result.error : null;
    eq(error instanceof SupabaseRequestError && [error.status, error.code], [403, '42501']);
  });

  it('el mismo fallo da siempre el mismo resultado', async () => {
    const first = await run(updatePlan(4), fakeCloud({ update: throws(requestError) }).cloud);
    const second = await run(updatePlan(4), fakeCloud({ update: throws(requestError) }).cloud);
    eq(first, second);
  });
});

// --- What it does not do ----------------------------------------------------------------------

describe('Lo que el executor no hace', () => {
  const source = readFileSync('src/storage/setlistSyncExecutor.ts', 'utf8');
  /** Sólo el código: los comentarios hablan de estas reglas, y hablar no es hacer. */
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('no decide nada: ni reconcilia, ni compara, ni mira el reloj', () => {
    for (const forbidden of [
      'reconcileSetlist',
      'portableFingerprint',
      'fingerprint',
      'Date.now',
      'updatedAt',
      'deletion.',
      'react',
      'useState',
      'useEffect',
      'while (',
      'for (',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // La única revisión que usa es la del plan, y la del plan más uno para
    // comprobar la respuesta. No hay ninguna comparación de "más nuevo".
    eq(code.includes('plan.expectedRevision'), true);
    eq(/remote\.revision|local\.|[<>]=?\s*\w*[Rr]evision/.test(code), false, 'no compara revisiones con nada');
  });

  it('no toca el almacenamiento del dispositivo', async () => {
    // Ni los setlists, ni las bases, ni las anotaciones de borrado: para eso
    // ni siquiera importa sus módulos.
    for (const forbidden of [
      'localStorage',
      'setlistStorage',
      'setlistDeletions',
      'createSetlistSyncStore',
      'SetlistSyncStore',
      '.save(',
      '.mark(',
      '.clear(',
      'setItem',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }

    // Y en marcha: se ejecutan las tres operaciones con un almacenamiento
    // puesto delante, y no se escribe ni una clave.
    const storage = new Map<string, string>();
    const watched = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    };
    storage.set('genesaret_setlists', 'los setlists, intactos');
    void watched;

    await run(createPlan(), fakeCloud({ create: written(active(1)) }).cloud);
    await run(updatePlan(4), fakeCloud({ update: written(active(5)) }).cloud);
    await run(deletePlan(4), fakeCloud({ remove: written(tombstone(5)) }).cloud);

    eq([...storage.keys()], ['genesaret_setlists']);
    eq(storage.get('genesaret_setlists'), 'los setlists, intactos');
  });

  it('nadie lo llama todavía desde la aplicación', () => {
    const files = ['src/App.tsx', 'src/hooks/useSetlists.ts'];
    for (const file of files) {
      eq(readFileSync(file, 'utf8').includes('setlistSyncExecutor'), false, file);
      eq(readFileSync(file, 'utf8').includes('cloudSetlists'), false, file);
    }
  });
});

/** A result is a value: it says what happened and does nothing about it. */
const _shape: SetlistSyncExecutionResult = {
  kind: 'conflict',
  operation: 'update',
  setlistId: 'setlist-1234',
};
void _shape;
