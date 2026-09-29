import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import { SupabaseRequestError } from '../src/lib/supabase';
import {
  SetlistCloudAuthError,
  type CloudSetlistRead,
  type CloudSetlistRepository,
  type CloudWriteResult,
} from '../src/storage/cloudSetlists';
import type { SetlistDeletionMarker, SetlistDeletionRepository } from '../src/storage/setlistDeletions';
import type { SetlistRepository } from '../src/storage/setlistStorage';
import { portableFingerprint, type SetlistSyncBase, type SetlistSyncStore } from '../src/storage/setlistSync';
import { runSetlistSyncPass, type SetlistSyncPassInput } from '../src/storage/setlistSyncPass';

/**
 * One pass, end to end, entirely in memory.
 *
 * Every store here is a plain object and every cloud is a function these
 * tests wrote: nothing reaches Supabase, nothing is written to a real row.
 * What is checked is what a pass does to the device — and, above all, what it
 * refuses to do when somebody keeps using the app while a request is in the
 * air.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSyncPass.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const DELETED_AT = Date.UTC(2026, 8, 16, 8);
const SERVER_UPDATED = '2026-09-22T18:45:00+00:00';
const ID = 'setlist-1234';

const section = (id: string, sourceSectionId: string, members: string[] = []) => ({
  id,
  sourceSectionId,
  label: 'Coro',
  repeatCount: 2,
  voices: ['women' as const],
  assignedMemberIds: members,
  instruction: 'Entrar suave',
  transition: { type: 'continue' as const },
});

const item = (id: string, overrides: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  songId: 'huracan-hakuna',
  moment: 'Entrada',
  transposeSteps: 2,
  capoFret: 3,
  notes: 'Último coro x2',
  arrangement: { songVersion: 2, sections: [section('bloque-1', 'section-1', ['miembro-ana'])] },
  ...overrides,
});

const setlistOf = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: ID,
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Primera prueba',
  participantIds: ['miembro-ana'],
  items: [item('item-1')],
  createdAt: NOW,
  updatedAt: NOW + 60_000,
  ...overrides,
});

/** The same setlist saying something different: a portable change. */
const renamed = (setlist: Setlist, name: string): Setlist => ({ ...setlist, name, updatedAt: setlist.updatedAt + 1000 });

/** The same setlist with different people: nothing the cloud can hold. */
const withPeople = (setlist: Setlist, people: string[]): Setlist => ({
  ...setlist,
  participantIds: people,
  items: setlist.items.map((entry) => ({
    ...entry,
    arrangement: entry.arrangement && {
      ...entry.arrangement,
      sections: entry.arrangement.sections.map((block) => ({ ...block, assignedMemberIds: people })),
    },
  })),
  updatedAt: setlist.updatedAt + 1000,
});

const baseOf = (setlist: Setlist, cloudRevision: number): SetlistSyncBase => ({
  setlistId: setlist.id,
  cloudRevision,
  fingerprint: portableFingerprint(setlist),
});

const markerOf = (baseRevision?: number, deletedAt = DELETED_AT): SetlistDeletionMarker => ({
  setlistId: ID,
  deletedAt,
  ...(baseRevision === undefined ? {} : { baseRevision }),
});

const activeRow = (setlist: Setlist, revision: number): CloudSetlistRead => ({
  state: 'setlist',
  id: setlist.id,
  setlist,
  revision,
  serverUpdatedAt: SERVER_UPDATED,
});

const tombstoneRow = (revision: number, id = ID): CloudSetlistRead => ({
  state: 'deleted',
  id,
  revision,
  deletedAt: new Date(DELETED_AT).toISOString(),
});

// --- In-memory stores -----------------------------------------------------------------------

/** Storage that is full, which is the realistic way writing fails. */
const quotaExceeded = () => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

interface Breakable {
  /** From this call on, every strict write throws. `null` lets them through again. */
  breakWrites(error: unknown | null): void;
}

function memorySetlists(initial: Setlist[] = []): SetlistRepository & { current(): Setlist[] } & Breakable {
  let stored = [...initial];
  let broken: unknown | null = null;
  return {
    key: 'memoria',
    load: () => ({ setlists: [...stored], recoveredFromUnreadableData: false }),
    // The tolerant path the screens use: a device that will not keep them
    // still shows them for this visit.
    save: (setlists) => {
      if (broken === null) stored = [...setlists];
    },
    saveOrThrow: (setlists) => {
      if (broken !== null) throw broken;
      stored = [...setlists];
    },
    current: () => stored,
    breakWrites: (error) => {
      broken = error;
    },
  };
}

function memoryBases(initial: SetlistSyncBase[] = []): SetlistSyncStore & Breakable {
  let stored = new Map(initial.map((base) => [base.setlistId, base]));
  let broken: unknown | null = null;
  return {
    key: 'memoria',
    load: () => new Map(stored),
    save: (bases) => {
      if (broken === null) stored = new Map(bases);
    },
    saveOrThrow: (bases) => {
      if (broken !== null) throw broken;
      stored = new Map(bases);
    },
    breakWrites: (error) => {
      broken = error;
    },
  };
}

function memoryDeletions(initial: SetlistDeletionMarker[] = []): SetlistDeletionRepository & Breakable {
  let stored = [...initial];
  let broken: unknown | null = null;
  return {
    key: 'memoria',
    list: () => [...stored],
    get: (id) => stored.find((marker) => marker.setlistId === id) ?? null,
    mark: (setlistId, deletedAt, baseRevision) => {
      if (broken !== null) throw broken;
      const marker = { setlistId, deletedAt, ...(baseRevision === undefined ? {} : { baseRevision }) };
      stored = [...stored.filter((entry) => entry.setlistId !== setlistId), marker];
      return marker;
    },
    // This one has always said when it could not write (see setlistDeletions).
    clear: (id) => {
      if (broken !== null) throw broken;
      stored = stored.filter((marker) => marker.setlistId !== id);
    },
    breakWrites: (error) => {
      broken = error;
    },
  };
}

interface CloudCall {
  op: 'list' | 'create' | 'update' | 'remove';
  args: unknown[];
}

/**
 * A cloud that answers what the test says. `during` runs while a write is in
 * the air, which is how somebody editing mid-request is reproduced.
 */
function fakeCloud(options: {
  rows?: CloudSetlistRead[];
  create?: CloudWriteResult | (() => never);
  update?: CloudWriteResult | (() => never);
  remove?: CloudWriteResult | (() => never);
  /** Runs while the cloud is being read: after the snapshot, before any plan. */
  duringList?: () => void;
  /** Runs while a write is in the air. */
  during?: () => void;
}) {
  const calls: CloudCall[] = [];
  const answer = (op: CloudCall['op'], value: CloudWriteResult | (() => never) | undefined): CloudWriteResult => {
    options.during?.();
    if (value === undefined) throw new Error(`la pasada no debía llamar a ${op}`);
    return typeof value === 'function' ? value() : value;
  };
  const cloud: CloudSetlistRepository = {
    async list(local) {
      calls.push({ op: 'list', args: [local] });
      options.duringList?.();
      return options.rows ?? [];
    },
    async create(setlist) {
      calls.push({ op: 'create', args: [setlist] });
      return answer('create', options.create);
    },
    async update(setlist, expectedRevision) {
      calls.push({ op: 'update', args: [setlist, expectedRevision] });
      return answer('update', options.update);
    },
    async remove(id, expectedRevision, deletedAt) {
      calls.push({ op: 'remove', args: [id, expectedRevision, deletedAt] });
      return answer('remove', options.remove);
    },
  };
  return { calls, cloud };
}

const written = (read: CloudSetlistRead, rows = 1): CloudWriteResult => ({ status: 'written', rows, read });
const throws = (error: unknown) => () => {
  throw error;
};

/** One pass over the given world, with everything it touched afterwards. */
async function pass(world: {
  local?: Setlist[];
  bases?: SetlistSyncBase[];
  deletions?: SetlistDeletionMarker[];
  cloud: ReturnType<typeof fakeCloud>;
}) {
  const setlists = memorySetlists(world.local ?? []);
  const bases = memoryBases(world.bases ?? []);
  const deletions = memoryDeletions(world.deletions ?? []);
  const input: SetlistSyncPassInput = { setlists, bases, deletions, cloud: world.cloud.cloud };
  const report = await runSetlistSyncPass(input);
  return {
    report,
    calls: world.cloud.calls,
    setlists: setlists.current(),
    bases: [...bases.load().values()],
    deletions: deletions.list(),
    outcome: (id = ID) => report.outcomes.get(id),
    kind: (id = ID) => report.outcomes.get(id)?.kind,
  };
}

// --- Nothing to do -----------------------------------------------------------------------------

describe('Cuando no hay nada que hacer', () => {
  it('los dos lados de acuerdo: no se toca nada', async () => {
    const local = setlistOf();
    const after = await pass({
      local: [local],
      bases: [baseOf(local, 4)],
      cloud: fakeCloud({ rows: [activeRow(local, 4)] }),
    });

    eq(after.kind(), 'noop');
    eq(after.setlists, [local], 'el setlist, intacto');
    eq(after.bases, [baseOf(local, 4)], 'la base, intacta');
    eq(after.calls.map((call) => call.op), ['list'], 'una lectura y ninguna escritura');
  });

  it('una pregunta se queda en pregunta', async () => {
    // Cambió aquí y cambió allí desde el último acuerdo.
    const local = setlistOf();
    const here = renamed(local, 'Lo que escribí yo');
    const there = renamed(local, 'Lo que escribió el otro');
    const after = await pass({
      local: [here],
      bases: [baseOf(local, 4)],
      cloud: fakeCloud({ rows: [activeRow(there, 5)] }),
    });

    eq(after.kind(), 'ask');
    eq(after.setlists, [here], 'nadie pisa a nadie');
    eq(after.bases, [baseOf(local, 4)]);
    eq(after.calls.map((call) => call.op), ['list']);
  });

  it('una fila que este cliente no puede tocar se queda quieta', async () => {
    const local = setlistOf();
    const newer: CloudSetlistRead = { state: 'newer', id: ID, revision: 9, payloadVersion: 2 };
    const after = await pass({ local: [local], bases: [baseOf(local, 4)], cloud: fakeCloud({ rows: [newer] }) });

    eq(after.kind(), 'blocked');
    eq(after.setlists, [local]);
    eq(after.bases, [baseOf(local, 4)]);
    eq(after.calls.map((call) => call.op), ['list']);
  });

  it('un setlist que la nube no tiene no se sube solo', async () => {
    // Puede ser de esta cuenta o puede ser lo que alguien tenía como invitado
    // antes de entrar: nada en el dispositivo los distingue, y subirlo todo al
    // iniciar sesión no es una decisión que le toque tomar a una pasada.
    const local = setlistOf();
    const after = await pass({ local: [local], cloud: fakeCloud({ rows: [] }) });

    eq(after.kind(), 'pending-user-action');
    eq(after.outcome()?.plan.kind, 'upload-candidate');
    eq(after.calls.map((call) => call.op), ['list'], 'ni un create');
    eq(after.bases, [], 'y ninguna base inventada');
  });
});

// --- Uploading a change --------------------------------------------------------------------------

describe('Subir un cambio', () => {
  const base = setlistOf();
  const changed = renamed(base, 'Misa del domingo');

  it('se envía la revisión leída y se apunta lo que la nube tiene ahora', async () => {
    const after = await pass({
      local: [changed],
      bases: [baseOf(base, 4)],
      cloud: fakeCloud({ rows: [activeRow(base, 4)], update: written(activeRow(changed, 5)) }),
    });

    eq(after.kind(), 'cloud-success');
    eq(after.calls.map((call) => call.op), ['list', 'update']);
    eq(after.calls[1].args[1], 4, 'la revisión que se leyó');
    eq(after.bases, [{ setlistId: ID, cloudRevision: 5, fingerprint: portableFingerprint(changed) }]);
    eq(after.setlists, [changed], 'y el setlist local no se toca');
  });

  it('si alguien edita mientras sube, no se pierde lo que escribió', async () => {
    // T0: local B, base A/r4, remoto A/r4. Se sube B. Durante el await el
    // usuario escribe C. El servidor confirma B/r5.
    const c = renamed(base, 'Lo que escribí mientras subía');
    const setlists = memorySetlists([changed]);
    const bases = memoryBases([baseOf(base, 4)]);
    const deletions = memoryDeletions();
    const cloud = fakeCloud({
      rows: [activeRow(base, 4)],
      update: written(activeRow(changed, 5)),
      during: () => setlists.save([c]),
    });

    const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: cloud.cloud });

    eq(report.outcomes.get(ID)?.kind, 'cloud-success');
    eq(setlists.current(), [c], 'C sigue siendo lo que hay aquí: no se reemplaza por B');
    // La base dice lo que la nube tiene de verdad, que es B en la revisión 5.
    eq([...bases.load().values()], [{ setlistId: ID, cloudRevision: 5, fingerprint: portableFingerprint(changed) }]);
    // Y eso hace que la próxima pasada vea base B/r5 contra local C: otro
    // cambio pendiente de subir, en vez de dar C por sincronizado.
    eq(portableFingerprint(c) !== portableFingerprint(changed), true);
  });

  it('si otro escribió antes, es un conflicto y no se toca nada', async () => {
    const after = await pass({
      local: [changed],
      bases: [baseOf(base, 4)],
      cloud: fakeCloud({ rows: [activeRow(base, 4)], update: { status: 'conflict' } }),
    });

    eq(after.kind(), 'cloud-conflict');
    eq(after.setlists, [changed], 'lo de aquí se queda');
    eq(after.bases, [baseOf(base, 4)], 'y la base también');
    // Ni un segundo fetch, ni un reintento con la revisión nueva: leer y
    // volver a decidir es trabajo de la siguiente pasada.
    eq(after.calls.map((call) => call.op), ['list', 'update']);
  });

  it('sin sesión, con la red caída o con una respuesta imposible: nada cambia', async () => {
    const cases = [
      [{ update: throws(new SetlistCloudAuthError()) }, 'cloud-auth-error'],
      [{ update: throws(new SupabaseRequestError('row-level security', 403, '42501')) }, 'cloud-request-error'],
      [{ update: throws(new TypeError('Failed to fetch')) }, 'cloud-request-error'],
      [{ update: { status: 'rejected' as const, problem: 'name' as const } }, 'cloud-rejected'],
      [{ update: written(activeRow(changed, 9)) }, 'invalid-response'],
      [{ update: written(activeRow(changed, 5), 2) }, 'invalid-response'],
      [{ update: written(tombstoneRow(5)) }, 'invalid-response'],
    ] as const;

    for (const [answer, kind] of cases) {
      const after = await pass({
        local: [changed],
        bases: [baseOf(base, 4)],
        cloud: fakeCloud({ rows: [activeRow(base, 4)], ...answer }),
      });
      eq(after.kind(), kind);
      eq(after.setlists, [changed], kind);
      eq(after.bases, [baseOf(base, 4)], kind);
      eq(after.calls.length, 2, `una lectura y una escritura: ${kind}`);
    }
  });
});

// --- Deleting up there -----------------------------------------------------------------------------

describe('Llevar un borrado a la nube', () => {
  const local = setlistOf();

  it('se envía con la revisión y la hora de la intención', async () => {
    const after = await pass({
      bases: [baseOf(local, 4)],
      deletions: [markerOf(4)],
      cloud: fakeCloud({ rows: [activeRow(local, 4)], remove: written(tombstoneRow(5)) }),
    });

    eq(after.kind(), 'cloud-success');
    eq(after.calls[1].args[0], ID);
    eq(after.calls[1].args[1], 4, 'la revisión que se conocía al borrar');
    eq((after.calls[1].args[2] as Date).getTime(), DELETED_AT, 'y la hora en que se pidió, intacta');
    eq(after.deletions, [], 'la anotación ya no hace falta');
    eq(after.bases, [], 'ni la base');
  });

  it('si aparece otra intención mientras se borra, no se pisa la nueva', async () => {
    const bases = memoryBases([baseOf(local, 4)]);
    const deletions = memoryDeletions([markerOf(4)]);
    const setlists = memorySetlists();
    const cloud = fakeCloud({
      rows: [activeRow(local, 4)],
      remove: written(tombstoneRow(5)),
      // Alguien vuelve a borrar el mismo id, más tarde y sabiendo otra cosa.
      during: () => void deletions.mark(ID, DELETED_AT + 900_000, 9),
    });

    const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: cloud.cloud });

    // La nube sí avanzó: hay una lápida de verdad allí. Lo que no se pudo
    // hacer es limpiar aquí, y el reporte dice las dos cosas por separado.
    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'cloud-success');
    eq(outcome && 'local' in outcome && outcome.local, 'skipped-stale');
    eq(outcome && 'staleWhat' in outcome && outcome.staleWhat, 'deletion');
    eq(deletions.list(), [markerOf(9, DELETED_AT + 900_000)], 'la intención nueva sigue ahí');
  });

  it('si el setlist reaparece mientras se borra, no se limpia nada', async () => {
    const bases = memoryBases([baseOf(local, 4)]);
    const deletions = memoryDeletions([markerOf(4)]);
    const setlists = memorySetlists();
    const cloud = fakeCloud({
      rows: [activeRow(local, 4)],
      remove: written(tombstoneRow(5)),
      during: () => setlists.save([local]),
    });

    const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: cloud.cloud });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'cloud-success', 'la lápida se creó de verdad');
    eq(outcome && 'local' in outcome && outcome.local, 'skipped-stale');
    eq(outcome && 'staleWhat' in outcome && outcome.staleWhat, 'local');
    eq(deletions.list(), [markerOf(4)], 'la anotación se queda, para que otra pasada lo mire');
    eq([...bases.load().values()], [baseOf(local, 4)]);
  });

  it('con la revisión cambiada, conflicto y nada más', async () => {
    const after = await pass({
      bases: [baseOf(local, 4)],
      deletions: [markerOf(4)],
      cloud: fakeCloud({ rows: [activeRow(local, 4)], remove: { status: 'conflict' } }),
    });

    eq(after.kind(), 'cloud-conflict');
    eq(after.deletions, [markerOf(4)], 'la intención sigue pendiente');
    eq(after.bases, [baseOf(local, 4)]);
  });
});

// --- Plans that only move what this device knows -------------------------------------------------

describe('Lo que sólo cambia en este dispositivo', () => {
  const local = setlistOf();

  it('apuntar que los dos dicen lo mismo', async () => {
    // Primera vez que se ven, y coinciden.
    const after = await pass({ local: [local], cloud: fakeCloud({ rows: [activeRow(local, 4)] }) });
    eq(after.kind(), 'applied-local');
    eq(after.outcome()?.plan.kind, 'adopt-baseline');
    eq(after.bases, [baseOf(local, 4)]);
    eq(after.setlists, [local], 'sin tocar el setlist');
    eq(after.calls.map((call) => call.op), ['list']);
  });

  it('bajar lo que cambió allí, sin perder a quién canta aquí', async () => {
    const there = renamed(local, 'Editado en otro dispositivo');
    const after = await pass({
      local: [local],
      bases: [baseOf(local, 4)],
      cloud: fakeCloud({ rows: [activeRow(there, 5)] }),
    });

    eq(after.kind(), 'applied-local');
    eq(after.setlists[0].name, 'Editado en otro dispositivo', 'el contenido viene de la nube');
    eq(after.setlists[0].participantIds, ['miembro-ana'], 'y las personas, de aquí');
    eq(after.setlists[0].items[0].arrangement?.sections[0].assignedMemberIds, ['miembro-ana']);
    eq(after.bases, [{ setlistId: ID, cloudRevision: 5, fingerprint: portableFingerprint(there) }]);
  });

  it('y si alguien cambia a quién canta mientras se aplica, se respeta lo nuevo', async () => {
    const there = renamed(local, 'Editado en otro dispositivo');
    const setlists = memorySetlists([local]);
    const bases = memoryBases([baseOf(local, 4)]);
    const deletions = memoryDeletions();
    const cloud = fakeCloud({
      rows: [activeRow(there, 5)],
      // Cambiar personas no es un cambio que la nube pueda entender, así que
      // no impide aplicar lo de allí: se conserva, no se descarta.
      duringList: () => setlists.save([withPeople(local, ['miembro-zoe', 'miembro-bruno'])]),
    });

    const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: cloud.cloud });

    eq(report.outcomes.get(ID)?.kind, 'applied-local');
    eq(setlists.current()[0].name, 'Editado en otro dispositivo');
    eq(setlists.current()[0].participantIds, ['miembro-zoe', 'miembro-bruno'], 'lo que se acababa de elegir');
    eq(setlists.current()[0].items[0].arrangement?.sections[0].assignedMemberIds, ['miembro-zoe', 'miembro-bruno']);
  });

  it('pero si cambia el contenido mientras se aplica, no se pisa', async () => {
    const there = renamed(local, 'Editado en otro dispositivo');
    const mine = renamed(local, 'Lo que escribí yo');
    const setlists = memorySetlists([local]);
    const bases = memoryBases([baseOf(local, 4)]);
    const cloud = fakeCloud({ rows: [activeRow(there, 5)], duringList: () => setlists.save([mine]) });

    const report = await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    eq(report.outcomes.get(ID)?.kind, 'skipped-stale');
    eq((report.outcomes.get(ID) as { what: string }).what, 'local');
    eq(setlists.current()[0].name, 'Lo que escribí yo', 'lo de aquí no se reemplaza');
    eq([...bases.load().values()], [baseOf(local, 4)], 'y la base tampoco avanza');
  });

  it('borrar aquí lo que borraron allí', async () => {
    const after = await pass({
      local: [local],
      bases: [baseOf(local, 4)],
      cloud: fakeCloud({ rows: [tombstoneRow(5)] }),
    });

    eq(after.kind(), 'applied-local');
    eq(after.outcome()?.plan.kind, 'delete-local');
    eq(after.setlists, []);
    eq(after.bases, []);
  });

  it('olvidar una referencia que ya no significa nada', async () => {
    const after = await pass({ bases: [baseOf(local, 4)], cloud: fakeCloud({ rows: [] }) });
    eq(after.kind(), 'applied-local');
    eq(after.outcome()?.plan.kind, 'forget-baseline');
    eq(after.bases, []);
  });

  it('dar por confirmado un borrado que la nube ya hizo', async () => {
    const after = await pass({
      bases: [baseOf(local, 4)],
      deletions: [markerOf(4)],
      cloud: fakeCloud({ rows: [tombstoneRow(5)] }),
    });

    eq(after.kind(), 'applied-local');
    eq(after.outcome()?.plan.kind, 'confirm-deletion');
    eq(after.deletions, []);
    eq(after.bases, []);
    eq(after.calls.map((call) => call.op), ['list'], 'sin pedirle nada más a la nube');
  });
});

// --- When another tab got there first --------------------------------------------------------------

describe('Cuando otra pestaña escribió por en medio', () => {
  const local = setlistOf();

  /** A pass whose stores change the moment the cloud is read. */
  async function racing(world: {
    local?: Setlist[];
    bases?: SetlistSyncBase[];
    deletions?: SetlistDeletionMarker[];
    rows: CloudSetlistRead[];
    meanwhile: (stores: {
      setlists: ReturnType<typeof memorySetlists>;
      bases: SetlistSyncStore;
      deletions: SetlistDeletionRepository;
    }) => void;
  }) {
    const setlists = memorySetlists(world.local ?? []);
    const bases = memoryBases(world.bases ?? []);
    const deletions = memoryDeletions(world.deletions ?? []);
    const cloud: CloudSetlistRepository = {
      async list() {
        world.meanwhile({ setlists, bases, deletions });
        return world.rows;
      },
      async create() {
        throw new Error('no debería escribir');
      },
      async update() {
        throw new Error('no debería escribir');
      },
      async remove() {
        throw new Error('no debería escribir');
      },
    };
    const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud });
    return { report, setlists, bases, deletions, kind: () => report.outcomes.get(ID)?.kind };
  }

  it('no se pisa una base más nueva al apuntar un acuerdo', async () => {
    const newer = { setlistId: ID, cloudRevision: 9, fingerprint: portableFingerprint(local) };
    const after = await racing({
      local: [local],
      rows: [activeRow(local, 4)],
      meanwhile: ({ bases }) => bases.save(new Map([[ID, newer]])),
    });
    eq(after.kind(), 'skipped-stale');
    eq([...after.bases.load().values()], [newer], 'lo que escribió la otra pestaña sigue ahí');
  });

  it('no se borra una base más nueva al olvidarla', async () => {
    const newer = { setlistId: ID, cloudRevision: 9, fingerprint: portableFingerprint(local) };
    const after = await racing({
      bases: [baseOf(local, 4)],
      rows: [],
      meanwhile: ({ bases }) => bases.save(new Map([[ID, newer]])),
    });
    eq(after.kind(), 'skipped-stale');
    eq([...after.bases.load().values()], [newer]);
  });

  it('no se borra localmente algo que acaban de editar', async () => {
    const after = await racing({
      local: [local],
      bases: [baseOf(local, 4)],
      rows: [tombstoneRow(5)],
      meanwhile: ({ setlists }) => setlists.save([renamed(local, 'Editado justo ahora')]),
    });
    eq(after.kind(), 'skipped-stale');
    eq(after.setlists.current()[0].name, 'Editado justo ahora');
  });

  it('ni algo en lo que sólo cambiaron las personas', async () => {
    // Borrar se lleva también a quién canta, así que cualquier cambio basta
    // para dejarlo para la siguiente pasada.
    const after = await racing({
      local: [local],
      bases: [baseOf(local, 4)],
      rows: [tombstoneRow(5)],
      meanwhile: ({ setlists }) => setlists.save([withPeople(local, ['miembro-zoe'])]),
    });
    eq(after.kind(), 'skipped-stale');
    eq(after.setlists.current().length, 1);
    eq(after.setlists.current()[0].participantIds, ['miembro-zoe']);
  });

  it('no se limpia una anotación distinta de la que se confirmó', async () => {
    const after = await racing({
      bases: [baseOf(local, 4)],
      deletions: [markerOf(4)],
      rows: [tombstoneRow(5)],
      meanwhile: ({ deletions }) => void deletions.mark(ID, DELETED_AT + 900_000, 9),
    });
    eq(after.kind(), 'skipped-stale');
    eq(after.deletions.list(), [markerOf(9, DELETED_AT + 900_000)]);
  });

  it('ni cuando la base cambió bajo una confirmación', async () => {
    const newer = { setlistId: ID, cloudRevision: 9, fingerprint: portableFingerprint(local) };
    const after = await racing({
      bases: [baseOf(local, 4)],
      deletions: [markerOf(4)],
      rows: [tombstoneRow(5)],
      meanwhile: ({ bases }) => bases.save(new Map([[ID, newer]])),
    });
    eq(after.kind(), 'skipped-stale');
    eq(after.deletions.list(), [markerOf(4)], 'la anotación no se pierde');
    eq([...after.bases.load().values()], [newer]);
  });
});

// --- Several setlists at once ------------------------------------------------------------------------

describe('Varios setlists en la misma pasada', () => {
  it('lo que le pasa a uno no le pasa a los demás', async () => {
    const uno = setlistOf({ id: 'setlist-aaa' });
    const dos = setlistOf({ id: 'setlist-bbb' });
    const tres = setlistOf({ id: 'setlist-ccc' });
    const cuatro = setlistOf({ id: 'setlist-ddd' });
    const dosChanged = renamed(dos, 'Cambiado aquí');
    const tresHere = renamed(tres, 'Lo mío');
    const tresThere = renamed(tres, 'Lo suyo');

    const setlists = memorySetlists([uno, dosChanged, tresHere, cuatro]);
    const bases = memoryBases([baseOf(uno, 4), baseOf(dos, 4), baseOf(tres, 4), baseOf(cuatro, 4)]);
    const cloud: CloudSetlistRepository = {
      async list() {
        return [
          activeRow(uno, 4),
          activeRow(dos, 4),
          activeRow(tresThere, 5),
          activeRow(renamed(cuatro, 'Cambiado allí'), 5),
        ];
      },
      async create() {
        throw new Error('no');
      },
      // El de en medio falla; los demás tienen que seguir su camino.
      async update() {
        throw new SupabaseRequestError('algo se rompió', 500, null);
      },
      async remove() {
        throw new Error('no');
      },
    };

    const report = await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud });

    eq(report.order, ['setlist-aaa', 'setlist-bbb', 'setlist-ccc', 'setlist-ddd'], 'orden fijo y ordenado');
    eq(report.outcomes.get('setlist-aaa')?.kind, 'noop');
    eq(report.outcomes.get('setlist-bbb')?.kind, 'cloud-request-error', 'el que falló');
    eq(report.outcomes.get('setlist-ccc')?.kind, 'ask', 'el que hay que decidir');
    eq(report.outcomes.get('setlist-ddd')?.kind, 'applied-local', 'y el que sí se pudo bajar');
    eq(setlists.current().find((entry) => entry.id === 'setlist-ddd')?.name, 'Cambiado allí');
    eq(setlists.current().find((entry) => entry.id === 'setlist-ccc')?.name, 'Lo mío', 'sin tocar');
  });

  it('la misma entrada da siempre la misma pasada', async () => {
    const world = () => ({
      local: [setlistOf({ id: 'setlist-bbb' }), setlistOf({ id: 'setlist-aaa' })],
      cloud: fakeCloud({ rows: [activeRow(setlistOf({ id: 'setlist-aaa' }), 4)] }),
    });
    const first = await pass(world());
    const second = await pass(world());
    eq(first.report.order, second.report.order);
    eq([...first.report.outcomes.keys()], [...second.report.outcomes.keys()]);
    eq(first.bases, second.bases);
  });
});

// --- Where the baseline comes from ---------------------------------------------------------------

describe('De donde sale lo que se apunta como acordado', () => {
  const local = setlistOf();

  it('al bajar, la huella es la del contenido portable, no la de las personas', async () => {
    const there = renamed(local, 'Editado en otro dispositivo');
    const setlists = memorySetlists([local]);
    const bases = memoryBases([baseOf(local, 4)]);
    const cloud = fakeCloud({
      rows: [activeRow(there, 5)],
      duringList: () => setlists.save([withPeople(local, ['miembro-zoe'])]),
    });

    await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    const base = bases.load().get(ID);
    eq(base?.fingerprint, portableFingerprint(there), 'la del contenido que trajo la nube');
    eq(base?.cloudRevision, 5);
    // Y la huella de lo que quedo guardado aqui, con otras personas, es la
    // misma: las personas no entran en ella.
    eq(portableFingerprint(setlists.current()[0]), base?.fingerprint);

    // Cambiar las personas otra vez no hace parecer que el contenido se
    // desincronizo: la siguiente pasada no tiene nada que subir.
    setlists.save([withPeople(setlists.current()[0], ['miembro-bruno', 'miembro-carla'])]);
    const second = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: fakeCloud({ rows: [activeRow(there, 5)] }).cloud,
    });
    eq(second.outcomes.get(ID)?.kind, 'noop');
    eq(setlists.current()[0].participantIds, ['miembro-bruno', 'miembro-carla'], 'y lo elegido se queda');
  });

  it('al subir, la huella es la de la fila que el servidor confirmo', async () => {
    // El servidor es la ultima palabra sobre que quedo almacenado. Aqui
    // contesta con un contenido distinto del que se envio para que se vea de
    // cual de los dos sale la huella.
    const changed = renamed(local, 'Lo que envie');
    const confirmed = renamed(local, 'Lo que el servidor guardo');
    const after = await pass({
      local: [changed],
      bases: [baseOf(local, 4)],
      cloud: fakeCloud({ rows: [activeRow(local, 4)], update: written(activeRow(confirmed, 5)) }),
    });

    eq(after.kind(), 'cloud-success');
    eq(after.bases, [{ setlistId: ID, cloudRevision: 5, fingerprint: portableFingerprint(confirmed) }]);
    eq(after.bases[0].fingerprint !== portableFingerprint(changed), true, 'no la de la copia enviada');
  });
});

// --- Two setlists, one storage --------------------------------------------------------------------

describe('Escribir uno sin pisar a los demas', () => {
  const a = setlistOf({ id: 'setlist-aaa' });
  const b = setlistOf({ id: 'setlist-bbb', name: 'El otro' });

  it('lo que otra pestana escribio en B sobrevive a una escritura en A', async () => {
    const aThere = renamed(a, 'Editado en otro dispositivo');
    const b2 = renamed(b, 'B cambiado en otra pestana');
    const setlists = memorySetlists([a, b]);
    const bases = memoryBases([baseOf(a, 4)]);
    const cloud = fakeCloud({
      rows: [activeRow(aThere, 5)],
      // Despues del snapshot y antes de que se escriba A.
      duringList: () => setlists.save([a, b2]),
    });

    await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    eq(setlists.current().find((entry) => entry.id === 'setlist-aaa')?.name, 'Editado en otro dispositivo');
    eq(setlists.current().find((entry) => entry.id === 'setlist-bbb')?.name, 'B cambiado en otra pestana');
    eq(setlists.current().length, 2, 'y ninguno se perdio');
  });

  it('y una base escrita en otra pestana para B sobrevive a una base para A', async () => {
    const bBase = { setlistId: 'setlist-bbb', cloudRevision: 9, fingerprint: portableFingerprint(b) };
    const setlists = memorySetlists([a]);
    const bases = memoryBases([]);
    const cloud = fakeCloud({
      rows: [activeRow(a, 4)],
      duringList: () => bases.save(new Map([['setlist-bbb', bBase]])),
    });

    await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    eq(bases.load().get('setlist-aaa')?.cloudRevision, 4, 'la de A se apunto');
    eq(bases.load().get('setlist-bbb'), bBase, 'y la de B sigue ahi');
  });

  it('borrar A localmente deja en paz a B', async () => {
    const b2 = renamed(b, 'B cambiado en otra pestana');
    const setlists = memorySetlists([a, b]);
    const bases = memoryBases([baseOf(a, 4), { setlistId: 'setlist-bbb', cloudRevision: 2, fingerprint: 'abcdef0123456789' }]);
    const cloud = fakeCloud({ rows: [tombstoneRow(5, 'setlist-aaa')], duringList: () => setlists.save([a, b2]) });

    await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    eq(setlists.current().map((entry) => entry.id), ['setlist-bbb']);
    eq(setlists.current()[0].name, 'B cambiado en otra pestana');
    eq([...bases.load().keys()], ['setlist-bbb'], 'y solo se borro la base de A');
  });
});

// --- When the cloud cannot be read -------------------------------------------------------------------

describe('Cuando ni siquiera se puede leer la nube', () => {
  const local = setlistOf();

  const failingList = (error: unknown): CloudSetlistRepository => ({
    async list() {
      throw error;
    },
    async create() {
      throw new Error('no deberia escribir');
    },
    async update() {
      throw new Error('no deberia escribir');
    },
    async remove() {
      throw new Error('no deberia escribir');
    },
  });

  it('no se toma por una nube vacia', async () => {
    // Leerlo como "la nube no tiene nada" convertiria cada setlist en
    // local-only y cada base en una referencia a algo que ya no existe.
    for (const [error, status] of [
      [new SetlistCloudAuthError(), 'remote-auth-error'],
      [new SupabaseRequestError('row-level security', 403, '42501'), 'remote-read-error'],
      [new TypeError('Failed to fetch'), 'remote-read-error'],
    ] as const) {
      const setlists = memorySetlists([local]);
      const bases = memoryBases([baseOf(local, 4)]);
      const deletions = memoryDeletions([markerOf(4, DELETED_AT)]);

      const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: failingList(error) });

      eq(report.status, status);
      eq(report.error, error, 'y el error llega entero');
      eq(report.outcomes.size, 0, 'ningun plan: no se sabe nada');
      eq(report.order, []);
      eq(setlists.current(), [local], 'nada borrado');
      eq([...bases.load().values()], [baseOf(local, 4)], 'ninguna base tocada');
      eq(deletions.list(), [markerOf(4, DELETED_AT)], 'ninguna anotacion limpiada');
    }
  });

  it('una pasada que si leyo se distingue de una que no pudo', async () => {
    const after = await pass({ local: [local], bases: [baseOf(local, 4)], cloud: fakeCloud({ rows: [activeRow(local, 4)] }) });
    eq(after.report.status, 'completed');
    eq(after.report.error, undefined);
  });
});

// --- Nothing happens after a cloud failure -------------------------------------------------------------

describe('Despues de un fallo en la nube no se toca nada', () => {
  const base = setlistOf();
  const changed = renamed(base, 'Misa del domingo');

  it('ni la base, ni la anotacion, ni el setlist', async () => {
    const answers = [
      [{ update: { status: 'conflict' as const } }, 'cloud-conflict'],
      [{ update: throws(new SetlistCloudAuthError()) }, 'cloud-auth-error'],
      [{ update: throws(new SupabaseRequestError('nope', 500, null)) }, 'cloud-request-error'],
      [{ update: { status: 'rejected' as const, problem: 'name' as const } }, 'cloud-rejected'],
      [{ update: written(activeRow(changed, 9)) }, 'invalid-response'],
      [{ update: written(tombstoneRow(5)) }, 'invalid-response'],
    ] as const;

    for (const [answer, kind] of answers) {
      const setlists = memorySetlists([changed]);
      const bases = memoryBases([baseOf(base, 4)]);
      // Un canario: una anotacion de otro setlist que la pasada tiene que
      // dejar en paz porque necesita una decision (la fila avanzo despues de
      // lo que sabia la nota).
      const canary = { setlistId: 'otro-setlist', deletedAt: DELETED_AT, baseRevision: 4 };
      const deletions = memoryDeletions([canary]);
      const otherRow = activeRow(setlistOf({ id: 'otro-setlist' }), 9);
      const cloud = fakeCloud({ rows: [activeRow(base, 4), otherRow], ...answer });

      const report = await runSetlistSyncPass({ setlists, bases, deletions, cloud: cloud.cloud });

      eq(report.outcomes.get(ID)?.kind, kind);
      eq(report.outcomes.get('otro-setlist')?.kind, 'ask', kind);
      eq(setlists.current(), [changed], kind);
      eq([...bases.load().values()], [baseOf(base, 4)], kind);
      eq(deletions.list(), [canary], kind);
    }
  });
});

// --- When the device will not keep it ------------------------------------------------------------

describe('Cuando el dispositivo no acepta la escritura', () => {
  const local = setlistOf();
  const there = renamed(local, 'Editado en otro dispositivo');
  const mine = renamed(local, 'Lo que escribi yo');

  /** A world whose stores can be told to refuse every strict write. */
  const world = (options: {
    local?: Setlist[];
    bases?: SetlistSyncBase[];
    deletions?: SetlistDeletionMarker[];
  } = {}) => ({
    setlists: memorySetlists(options.local ?? []),
    bases: memoryBases(options.bases ?? []),
    deletions: memoryDeletions(options.deletions ?? []),
  });

  it('subir funciono pero la base no se pudo guardar: la nube avanzo igual', async () => {
    const stores = world({ local: [mine], bases: [baseOf(local, 4)] });
    const cloud = fakeCloud({
      rows: [activeRow(local, 4)],
      update: written(activeRow(mine, 5)),
      during: () => stores.bases.breakWrites(quotaExceeded()),
    });

    const report = await runSetlistSyncPass({ ...stores, cloud: cloud.cloud });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'cloud-success', 'la fila se escribio de verdad');
    eq(outcome && 'local' in outcome && outcome.local, 'failed', 'y no se finge que quedo anotado');
    eq([...stores.bases.load().values()], [baseOf(local, 4)], 'la base sigue donde estaba');
    eq(stores.setlists.current(), [mine], 'y el setlist tampoco se toca');
  });

  it('bajar: si no se puede guardar el setlist, la base no avanza', async () => {
    const stores = world({ local: [local], bases: [baseOf(local, 4)] });
    stores.setlists.breakWrites(quotaExceeded());
    const cloud = fakeCloud({ rows: [activeRow(there, 5)] });

    const report = await runSetlistSyncPass({ ...stores, cloud: cloud.cloud });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'local-error');
    eq(outcome && 'error' in outcome && (outcome.error as DOMException).name, 'QuotaExceededError');
    eq(stores.setlists.current(), [local], 'el contenido no cambio');
    eq(
      [...stores.bases.load().values()],
      [baseOf(local, 4)],
      'y la base no dice que este dispositivo tiene lo que no tiene'
    );
  });

  it('bajar: si el setlist se guarda y falla la base, el contenido esta y la pasada siguiente converge', async () => {
    const stores = world({ local: [local], bases: [baseOf(local, 4)] });
    const cloud = fakeCloud({ rows: [activeRow(there, 5)] });
    // El almacen de bases falla justo despues de guardar el setlist.
    const original = stores.setlists.saveOrThrow;
    stores.setlists.saveOrThrow = (setlists) => {
      original(setlists);
      stores.bases.breakWrites(quotaExceeded());
    };

    const report = await runSetlistSyncPass({ ...stores, cloud: cloud.cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq(stores.setlists.current()[0].name, 'Editado en otro dispositivo', 'el contenido si llego');
    eq([...stores.bases.load().values()], [baseOf(local, 4)], 'la base se quedo atras');

    // Y la siguiente pasada, con el almacen ya sano, converge sola: los dos
    // lados dicen lo mismo, asi que solo hay que apuntarlo.
    stores.bases.breakWrites(null);
    const second = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [activeRow(there, 5)] }).cloud });
    eq(second.outcomes.get(ID)?.kind, 'applied-local');
    eq([...stores.bases.load().values()], [{ setlistId: ID, cloudRevision: 5, fingerprint: portableFingerprint(there) }]);
  });

  it('apuntar un acuerdo que no se puede guardar no es un acuerdo', async () => {
    const stores = world({ local: [local] });
    stores.bases.breakWrites(quotaExceeded());
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [activeRow(local, 4)] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq([...stores.bases.load().values()], [], 'ninguna base');
  });

  it('borrar aqui: si no se puede persistir, la base se queda', async () => {
    const stores = world({ local: [local], bases: [baseOf(local, 4)] });
    stores.setlists.breakWrites(quotaExceeded());
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [tombstoneRow(5)] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq(stores.setlists.current(), [local], 'el setlist sigue aqui');
    eq([...stores.bases.load().values()], [baseOf(local, 4)], 'y lo que se sabe de el, tambien');
  });

  it('borrar aqui: si el setlist se va y falla la base, se reporta y no se finge', async () => {
    const stores = world({ local: [local], bases: [baseOf(local, 4)] });
    const original = stores.setlists.saveOrThrow;
    stores.setlists.saveOrThrow = (setlists) => {
      original(setlists);
      stores.bases.breakWrites(quotaExceeded());
    };

    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [tombstoneRow(5)] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq(stores.setlists.current(), [], 'el setlist si se fue');
    eq([...stores.bases.load().values()], [baseOf(local, 4)], 'la base quedo suelta, y se sabe');
  });

  it('confirmar un borrado: si falla la base, la anotacion no se limpia', async () => {
    const stores = world({ bases: [baseOf(local, 4)], deletions: [markerOf(4)] });
    stores.bases.breakWrites(quotaExceeded());
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [tombstoneRow(5)] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq(stores.deletions.list(), [markerOf(4)], 'la evidencia de la intencion se conserva');
    eq([...stores.bases.load().values()], [baseOf(local, 4)]);
  });

  it('confirmar un borrado: si la base se va y falla la anotacion, la proxima pasada converge', async () => {
    const stores = world({ bases: [baseOf(local, 4)], deletions: [markerOf(4)] });
    stores.deletions.breakWrites(quotaExceeded());
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [tombstoneRow(5)] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq([...stores.bases.load().values()], [], 'la base si se fue');
    eq(stores.deletions.list(), [markerOf(4)], 'y la anotacion se queda');

    stores.deletions.breakWrites(null);
    const second = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [tombstoneRow(5)] }).cloud });
    eq(second.outcomes.get(ID)?.kind, 'applied-local');
    eq(stores.deletions.list(), [], 'y a la segunda se limpia');
  });

  it('borrado en la nube confirmado: si falla la limpieza, la lapida sigue siendo un hecho', async () => {
    for (const breaking of ['bases', 'deletions'] as const) {
      const stores = world({ bases: [baseOf(local, 4)], deletions: [markerOf(4)] });
      const cloud = fakeCloud({
        rows: [activeRow(local, 4)],
        remove: written(tombstoneRow(5)),
        during: () => stores[breaking].breakWrites(quotaExceeded()),
      });

      const report = await runSetlistSyncPass({ ...stores, cloud: cloud.cloud });

      const outcome = report.outcomes.get(ID);
      eq(outcome?.kind, 'cloud-success', breaking);
      eq(outcome && 'local' in outcome && outcome.local, 'failed', breaking);
      eq(stores.deletions.list(), [markerOf(4)], `la anotacion se conserva (${breaking})`);
    }
  });

  it('olvidar una base que no se puede olvidar', async () => {
    const stores = world({ bases: [baseOf(local, 4)] });
    stores.bases.breakWrites(quotaExceeded());
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [] }).cloud });

    eq(report.outcomes.get(ID)?.kind, 'local-error');
    eq([...stores.bases.load().values()], [baseOf(local, 4)], 'sigue ahi, y se sabe');
  });

  it('un error genérico se conserva igual que uno de cuota', async () => {
    const boom = new Error('el almacenamiento esta bloqueado');
    const stores = world({ local: [local] });
    stores.bases.breakWrites(boom);
    const report = await runSetlistSyncPass({ ...stores, cloud: fakeCloud({ rows: [activeRow(local, 4)] }).cloud });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'local-error');
    eq(outcome && 'error' in outcome && outcome.error, boom, 'el error original, entero');
  });

  it('un fallo local en uno no detiene a los demas', async () => {
    const a = setlistOf({ id: 'setlist-aaa' });
    const b = setlistOf({ id: 'setlist-bbb', name: 'El otro' });
    const bThere = renamed(b, 'Cambiado alli');
    const setlists = memorySetlists([a, b]);
    const bases = memoryBases([baseOf(b, 4)]);
    // Las bases fallan: A no puede apuntar su acuerdo…
    bases.breakWrites(quotaExceeded());
    const cloud = fakeCloud({ rows: [activeRow(a, 4), activeRow(bThere, 5)] });

    const report = await runSetlistSyncPass({ setlists, bases, deletions: memoryDeletions(), cloud: cloud.cloud });

    eq(report.order, ['setlist-aaa', 'setlist-bbb']);
    eq(report.outcomes.get('setlist-aaa')?.kind, 'local-error');
    // …y B tampoco, pero se intento y se reporto por separado: la pasada no
    // se detuvo en el primero.
    eq(report.outcomes.get('setlist-bbb')?.kind, 'local-error');
    eq(report.outcomes.size, 2, 'los dos ids llegaron a decidirse');
    eq(setlists.current().find((entry) => entry.id === 'setlist-bbb')?.name, 'Cambiado alli', 'y B si recibio su contenido');
  });
});

// --- Putting a new setlist in the cloud, when somebody asks -----------------------------------

describe('Subir un setlist que la nube no tenia', () => {
  const local = setlistOf();

  it('no se sube porque una pasada corra: hay que nombrarlo', async () => {
    const after = await pass({ local: [local], cloud: fakeCloud({ rows: [] }) });
    eq(after.kind(), 'pending-user-action');
    eq(after.calls.map((call) => call.op), ['list'], 'ni un create');
    eq(after.bases, [], 'ni una base');
  });

  it('nombrar otro setlist no sube este', async () => {
    const setlists = memorySetlists([local]);
    const bases = memoryBases();
    const cloud = fakeCloud({ rows: [] });
    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: ['otro-setlist-cualquiera'],
    });

    eq(report.outcomes.get(ID)?.kind, 'pending-user-action');
    eq(cloud.calls.map((call) => call.op), ['list']);
    eq([...bases.load().values()], []);
  });

  it('nombrado, se crea una vez y se apunta lo que el servidor guardo', async () => {
    const setlists = memorySetlists([local]);
    const bases = memoryBases();
    const confirmado = renamed(local, 'Lo que el servidor guardo');
    const cloud = fakeCloud({ rows: [], create: written(activeRow(confirmado, 1)) });

    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: [ID],
    });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'cloud-success');
    eq(outcome && 'local' in outcome && outcome.local, 'written');
    eq(cloud.calls.map((call) => call.op), ['list', 'create'], 'una sola creacion');
    eq(cloud.calls[1].args, [local], 'con el setlist tal cual');
    // La base sale de la fila confirmada, no de la copia enviada.
    eq([...bases.load().values()], [
      { setlistId: ID, cloudRevision: 1, fingerprint: portableFingerprint(confirmado) },
    ]);
    eq(setlists.current(), [local], 'y el setlist local no se toca');
  });

  it('si alguien lo edita mientras se sube, lo editado se queda aqui', async () => {
    const setlists = memorySetlists([local]);
    const bases = memoryBases();
    const editado = renamed(local, 'Editado mientras subia');
    const cloud = fakeCloud({
      rows: [],
      create: written(activeRow(local, 1)),
      during: () => setlists.save([editado]),
    });

    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: [ID],
    });

    eq(report.outcomes.get(ID)?.kind, 'cloud-success');
    eq(setlists.current(), [editado], 'no se reemplaza por lo que se subio');
    // La base dice lo que la nube tiene, asi que la proxima pasada vera un
    // cambio pendiente de subir en vez de dar lo editado por sincronizado.
    eq([...bases.load().values()], [{ setlistId: ID, cloudRevision: 1, fingerprint: portableFingerprint(local) }]);
  });

  it('si ya estaba alli, es un conflicto y no se apunta nada', async () => {
    const setlists = memorySetlists([local]);
    const bases = memoryBases();
    const cloud = fakeCloud({ rows: [], create: { status: 'conflict' } });

    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: [ID],
    });

    eq(report.outcomes.get(ID)?.kind, 'cloud-conflict');
    eq([...bases.load().values()], [], 'ninguna base');
    eq(cloud.calls.length, 2, 'y sin reintentos');
  });

  it('una respuesta que un create no pudo producir no es un exito', async () => {
    for (const [answer, reason] of [
      [written(activeRow(local, 2)), 'wrong-revision'],
      [written(activeRow(local, 1), 2), 'row-count'],
      [written(tombstoneRow(1)), 'deleted'],
    ] as const) {
      const bases = memoryBases();
      const report = await runSetlistSyncPass({
        setlists: memorySetlists([local]),
        bases,
        deletions: memoryDeletions(),
        cloud: fakeCloud({ rows: [], create: answer }).cloud,
        authorisedUploads: [ID],
      });
      eq(report.outcomes.get(ID)?.kind, 'invalid-response', reason);
      eq([...bases.load().values()], [], `sin base (${reason})`);
    }
  });

  it('si la base no se puede guardar, la fila existe igual y se dice', async () => {
    const setlists = memorySetlists([local]);
    const bases = memoryBases();
    const cloud = fakeCloud({
      rows: [],
      create: written(activeRow(local, 1)),
      during: () => bases.breakWrites(quotaExceeded()),
    });

    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: [ID],
    });

    const outcome = report.outcomes.get(ID);
    eq(outcome?.kind, 'cloud-success', 'la fila se creo de verdad');
    eq(outcome && 'local' in outcome && outcome.local, 'failed');
    eq([...bases.load().values()], []);
  });

  it('nombrar un setlist no cambia lo que se hace con los demas', async () => {
    // Autorizar una subida no autoriza nada mas: el resto de la pasada decide
    // exactamente igual que antes.
    const nuevo = setlistOf({ id: 'setlist-nuevo' });
    const enPaz = setlistOf({ id: 'setlist-en-paz' });
    const otroNuevo = setlistOf({ id: 'setlist-otro-nuevo' });
    const setlists = memorySetlists([nuevo, enPaz, otroNuevo]);
    const bases = memoryBases([baseOf(enPaz, 4)]);
    const cloud = fakeCloud({ rows: [activeRow(enPaz, 4)], create: written(activeRow(nuevo, 1)) });

    const report = await runSetlistSyncPass({
      setlists,
      bases,
      deletions: memoryDeletions(),
      cloud: cloud.cloud,
      authorisedUploads: ['setlist-nuevo'],
    });

    eq(report.outcomes.get('setlist-nuevo')?.kind, 'cloud-success');
    eq(report.outcomes.get('setlist-en-paz')?.kind, 'noop');
    eq(report.outcomes.get('setlist-otro-nuevo')?.kind, 'pending-user-action', 'el que no se nombro, sigue esperando');
    eq(cloud.calls.filter((call) => call.op === 'create').length, 1, 'una sola creacion');
  });
});

// --- What a pass never does ----------------------------------------------------------------------------

describe('Lo que una pasada nunca hace', () => {
  const source = readFileSync('src/storage/setlistSyncPass.ts', 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

  it('no mira el reloj, no reintenta, no resuelve conflictos', () => {
    for (const forbidden of ['Date.now', 'new Date(', 'setTimeout', 'setInterval', 'while (', 'updatedAt']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    // Una sola llamada posible a cada operación de escritura, y todas pasan
    // por el executor: aquí no se escribe en la nube directamente.
    eq(code.includes('cloud.update('), false, 'no llama a update por su cuenta');
    eq(code.includes('cloud.remove('), false);
    eq(code.includes('cloud.create('), false);
    eq((code.match(/executeSetlistSyncPlan\(/g) ?? []).length, 1, 'un solo sitio desde el que se escribe');
    eq((code.match(/input\.cloud\.list/g) ?? []).length, 1, 'una sola lectura por pasada');
  });

  it('no es React y nadie de la aplicación la usa', () => {
    for (const forbidden of ['useState', 'useEffect', 'react', 'window', 'localStorage']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    for (const file of ['src/App.tsx', 'src/hooks/useSetlists.ts']) {
      eq(readFileSync(file, 'utf8').includes('setlistSyncPass'), false, file);
      eq(readFileSync(file, 'utf8').includes('runSetlistSyncPass'), false, file);
    }
  });
});
