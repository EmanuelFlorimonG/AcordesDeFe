import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Setlist } from '../src/types/setlist';
import type { AppSession } from '../src/auth/session';
import {
  SetlistCloudAuthError,
  type CloudSetlistRead,
  type CloudSetlistRepository,
} from '../src/storage/cloudSetlists';
import { createLocalSetlistRepository, userSetlists } from '../src/storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint } from '../src/storage/setlistSync';
import { runAuthenticatedSetlistSyncPass } from '../src/storage/setlistSyncSession';
import { syncStateOf } from '../src/hooks/useSetlistCloudSync';
import type { SetlistCloudSync } from '../src/hooks/useSetlistCloudSync';
import { useSetlistAutoSync } from '../src/hooks/useSetlistAutoSync';
import { RECONNECT_SETTLE_MS } from '../src/hooks/useOnline';
import { runHook } from './hookHarness';

/**
 * Sincronizar al volver la conexión.
 *
 * Lo que se comprueba aquí es sobre todo cuándo NO pasa nada: que dibujar una
 * pantalla no sincroniza, que un invitado no habla con ninguna nube, que dos
 * señales seguidas no son dos pasadas, y que una pasada que se cae a mitad
 * deja los Setlists de este dispositivo exactamente como estaban.
 *
 * El disparador se prueba con el hook de verdad; lo que hace la pasada, con el
 * motor de verdad. Lo único de mentira es la nube y el navegador.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistAutoSync.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const ANA = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';

const setlistOf = (id: string, name = 'Misa Domingo'): Setlist => ({
  id,
  name,
  date: '2026-10-04',
  description: '',
  participantIds: [],
  items: [],
  createdAt: NOW,
  updatedAt: NOW,
});

const sessionOf = (userId: string): AppSession => ({
  userId,
  email: 'quien.sea@example.com',
  displayName: 'Quien sea',
  emailConfirmed: true,
});

// --- El navegador de la prueba ---------------------------------------------

const describe_ = (target: object, name: string) => Object.getOwnPropertyDescriptor(target, name);
const define = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

/** Un navegador con sus eventos de red y sus temporizadores, que la prueba mueve. */
function browser(options: { online: boolean }) {
  const before = {
    window: describe_(globalThis, 'window'),
    navigator: describe_(globalThis, 'navigator'),
  };
  const listeners = new Map<string, Set<() => void>>();
  const timers = new Map<number, { fn: () => void; at: number }>();
  let nextTimer = 1;
  let now = 0;

  define('navigator', { onLine: options.online });
  define('window', {
    addEventListener(type: string, listener: () => void) {
      listeners.set(type, (listeners.get(type) ?? new Set()).add(listener));
    },
    removeEventListener(type: string, listener: () => void) {
      listeners.get(type)?.delete(listener);
    },
    setTimeout(fn: () => void, ms = 0) {
      const id = nextTimer++;
      timers.set(id, { fn, at: now + ms });
      return id;
    },
    clearTimeout(id: number) {
      timers.delete(id);
    },
  });

  const fire = (type: string) => {
    (globalThis.navigator as { onLine: boolean }).onLine = type === 'online';
    for (const listener of [...(listeners.get(type) ?? [])]) listener();
  };

  return {
    /** El navegador pierde la red. */
    offline: () => fire('offline'),
    /** El navegador recupera la red. */
    online: () => fire('online'),
    /** Pasa el tiempo: lo que venciera, vence. */
    tick(ms: number) {
      now += ms;
      for (const [id, timer] of [...timers]) {
        if (timer.at <= now) {
          timers.delete(id);
          timer.fn();
        }
      }
    },
    get pendientes() {
      return timers.size;
    },
    restore() {
      for (const [name, descriptor] of Object.entries(before)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
    },
  };
}

/** Un orquestador de mentira que cuenta y que se puede dejar colgado. */
function orchestrator(options: { available: boolean; hang?: boolean } = { available: true }) {
  let calls = 0;
  let concurrent = 0;
  let peak = 0;
  let release: ((answer: { ok: boolean; message: string } | null) => void) | null = null;
  const sync = {
    available: options.available,
    state: 'idle',
    busyAll: false,
    busy: null,
    stateOf: () => 'synced',
    conflicted: () => false,
    inspect: async () => ({ kind: 'settled' }),
    resolve: async () => null,
    sync: async () => null,
    syncAll: async () => {
      calls += 1;
      // Lo que hace el de verdad: si ya hay una en el aire, no hay otra.
      if (concurrent > 0) return null;
      concurrent += 1;
      peak = Math.max(peak, concurrent);
      try {
        if (options.hang) {
          return await new Promise<{ ok: boolean; message: string } | null>((ok) => {
            release = ok;
          });
        }
        return { ok: true, message: 'Tus Setlists están al día' };
      } finally {
        concurrent -= 1;
      }
    },
  } as unknown as SetlistCloudSync;

  return {
    sync,
    get calls() {
      return calls;
    },
    get peak() {
      return peak;
    },
    /** Deja terminar la pasada que estaba colgada. */
    finish(answer: { ok: boolean; message: string } | null = { ok: true, message: 'ya' }) {
      release?.(answer);
      release = null;
    },
  };
}

/** Monta el auto-sync con un navegador y un orquestador, y los devuelve. */
function mount(options: { online: boolean; available: boolean; hang?: boolean }) {
  const fake = browser({ online: options.online });
  const engine = orchestrator({ available: options.available, hang: options.hang });
  let reloads = 0;
  const run = runHook(() => (useSetlistAutoSync(engine.sync, () => (reloads += 1)), null));
  return {
    ...fake,
    engine,
    run,
    get reloads() {
      return reloads;
    },
    close() {
      run.unmount();
      fake.restore();
    },
  };
}

const settle = () => new Promise((ok) => setTimeout(ok, 0));

// --- Cuándo se dispara, y cuándo no ----------------------------------------

describe('Volver a tener conexión sincroniza', () => {
  it('una reconexión, una pasada', async () => {
    const abierto = mount({ online: false, available: true });
    try {
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();

      eq(abierto.engine.calls, 1, 'exactamente una');
      eq(abierto.reloads, 1, 'y la lista se vuelve a leer');
    } finally {
      abierto.close();
    }
  });

  it('se espera un momento a que la red sirva de verdad', async () => {
    const abierto = mount({ online: false, available: true });
    try {
      abierto.online();
      eq(abierto.engine.calls, 0, 'el evento llega antes de que la red funcione');
      abierto.tick(RECONNECT_SETTLE_MS - 1);
      eq(abierto.engine.calls, 0);
      abierto.tick(1);
      await settle();
      eq(abierto.engine.calls, 1);
    } finally {
      abierto.close();
    }
  });

  it('si la red se vuelve a caer mientras se esperaba, no se intenta', async () => {
    const abierto = mount({ online: false, available: true });
    try {
      abierto.online();
      abierto.offline();
      abierto.tick(RECONNECT_SETTLE_MS * 2);
      await settle();

      eq(abierto.engine.calls, 0, 'ya no había red que aprovechar');
      eq(abierto.pendientes, 0, 'y no queda ningún temporizador suelto');
    } finally {
      abierto.close();
    }
  });
});

describe('Y hay veces que no se sincroniza', () => {
  it('abrir la aplicación con conexión no es volver a tener conexión', async () => {
    const abierto = mount({ online: true, available: true });
    try {
      await abierto.run.settle();
      eq(abierto.engine.calls, 0, 'dibujar una pantalla no sincroniza nada');

      // Ni un `online` suelto sin haber estado sin red: no hubo transición.
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();
      eq(abierto.engine.calls, 0);
    } finally {
      abierto.close();
    }
  });

  it('un invitado no habla con ninguna nube al volver la red', async () => {
    const abierto = mount({ online: false, available: false });
    try {
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();

      eq(abierto.engine.calls, 0, 'no hay cuenta a la que subir nada');
      eq(abierto.reloads, 0);
    } finally {
      abierto.close();
    }
  });

  it('y al salir de la pantalla deja de escuchar', async () => {
    const abierto = mount({ online: false, available: true });
    abierto.run.unmount();
    try {
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();
      eq(abierto.engine.calls, 0);
    } finally {
      abierto.restore();
    }
  });
});

describe('Dos señales no son dos pasadas', () => {
  it('dos reconexiones seguidas se cuentan como una', async () => {
    const abierto = mount({ online: false, available: true });
    try {
      abierto.online();
      abierto.offline();
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();

      eq(abierto.engine.calls, 1);
      eq(abierto.engine.peak, 1, 'nunca dos a la vez');
    } finally {
      abierto.close();
    }
  });

  it('una reconexión mientras ya hay una pasada en el aire no empieza otra', async () => {
    const abierto = mount({ online: false, available: true, hang: true });
    try {
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();
      eq(abierto.engine.calls, 1, 'la primera, en marcha');

      abierto.offline();
      abierto.online();
      abierto.tick(RECONNECT_SETTLE_MS);
      await settle();
      eq(abierto.engine.peak, 1, 'la segunda no se superpone');

      abierto.engine.finish();
      await settle();
    } finally {
      abierto.close();
    }
  });

  it('y una pasada manual en marcha tampoco se duplica', async () => {
    const fake = browser({ online: false });
    const engine = orchestrator({ available: true });
    // Lo que ve el hook es lo que vería con el botón pulsado.
    (engine.sync as { busyAll: boolean }).busyAll = true;
    const run = runHook(() => (useSetlistAutoSync(engine.sync, () => {}), null));
    try {
      fake.online();
      fake.tick(RECONNECT_SETTLE_MS);
      await settle();
      eq(engine.calls, 0, 'la del botón dirá cómo fue');
    } finally {
      run.unmount();
      fake.restore();
    }
  });
});

// --- Lo que hace la pasada, con el motor de verdad -------------------------

/** Un navegador: cada ámbito escribe en el mismo sitio, bajo su propia clave. */
const storageOf = () => {
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

/** Una nube que responde lo que diga la prueba y apunta lo que le piden. */
function cloudOf(options: { rows?: CloudSetlistRead[]; listThrows?: unknown } = {}) {
  const calls: string[] = [];
  const cloud: CloudSetlistRepository = {
    async list() {
      calls.push('list');
      if (options.listThrows) throw options.listThrows;
      return options.rows ?? [];
    },
    async create(setlist) {
      calls.push(`create:${setlist.id}`);
      throw new Error('una pasada automática no crea nada');
    },
    async update(setlist) {
      calls.push(`update:${setlist.id}`);
      throw new TypeError('Failed to fetch');
    },
    async remove(id) {
      calls.push(`remove:${id}`);
      throw new TypeError('Failed to fetch');
    },
  };
  return { calls, cloud };
}

/** El dispositivo de Ana, con un Setlist suyo guardado. */
function device(options: { agreed?: Setlist } = {}) {
  const storage = storageOf();
  const scope = userSetlists(ANA);
  const local = createLocalSetlistRepository(storage, scope);
  if (options.agreed) {
    local.save([options.agreed]);
    // El acuerdo de la última vez: lo que ambos lados tenían entonces.
    createSetlistSyncStore(storage, scope).save(
      new Map([
        [
          options.agreed.id,
          { setlistId: options.agreed.id, cloudRevision: 1, fingerprint: portableFingerprint(options.agreed) },
        ],
      ])
    );
  }
  return { storage, scope, local, snapshot: () => JSON.stringify([...storage.data.entries()]) };
}

const who = { session: sessionOf(ANA), accessToken: 'un-token' };

describe('Si la red se cae a mitad de la pasada', () => {
  it('no se pierde nada de este dispositivo', async () => {
    const mio = setlistOf('setlist-1', 'Misa de Ana');
    const equipo = device({ agreed: mio });
    // Cambiado aquí desde la última vez que se pusieron de acuerdo.
    const cambiado = { ...mio, name: 'Misa de Ana (corregida)', updatedAt: NOW + 1000 };
    equipo.local.save([cambiado]);
    const antes = equipo.snapshot();

    const nube = cloudOf({ rows: [activeRow(mio, 1)] });
    const resultado = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => nube.cloud },
      {}
    );

    eq(resultado.status, 'ran');
    if (resultado.status !== 'ran') return;
    eq(resultado.report.status, 'completed', 'la pasada termina, no revienta');
    eq(nube.calls.includes('update:setlist-1'), true, 'lo intentó');
    eq(resultado.report.outcomes.get('setlist-1')?.kind, 'cloud-request-error');
    eq(equipo.snapshot(), antes, 'y el dispositivo está exactamente como estaba');
    eq(equipo.local.load().setlists[0].name, 'Misa de Ana (corregida)', 'el cambio sigue aquí');
  });

  it('y no queda apuntado como si se hubiera guardado', async () => {
    const mio = setlistOf('setlist-1');
    const equipo = device({ agreed: mio });
    const cambiado = { ...mio, name: 'Otro nombre', updatedAt: NOW + 1000 };
    equipo.local.save([cambiado]);

    const nube = cloudOf({ rows: [activeRow(mio, 1)] });
    await runAuthenticatedSetlistSyncPass(who, { storage: equipo.storage, cloudFor: () => nube.cloud }, {});

    const base = createSetlistSyncStore(equipo.storage, equipo.scope).load().get('setlist-1');
    eq(base?.fingerprint, portableFingerprint(mio), 'el acuerdo sigue siendo el de antes');
    eq(base?.fingerprint === portableFingerprint(cambiado), false, 'no se dio por subido');
  });

  it('si ni siquiera se pudo leer, no se toca nada', async () => {
    const mio = setlistOf('setlist-1');
    const equipo = device({ agreed: mio });
    const antes = equipo.snapshot();

    const nube = cloudOf({ listThrows: new TypeError('Failed to fetch') });
    const resultado = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => nube.cloud },
      {}
    );

    eq(resultado.status, 'ran');
    if (resultado.status !== 'ran') return;
    eq(resultado.report.status, 'remote-read-error');
    eq(equipo.snapshot(), antes, 'una lista vacía no significa que la nube no los tenga');
    // Y la próxima reconexión puede volver a intentarlo: nada quedó bloqueado.
    const otra = cloudOf({ rows: [activeRow(mio, 1)] });
    const segunda = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => otra.cloud },
      {}
    );
    eq(segunda.status === 'ran' && segunda.report.status, 'completed', 'se vuelve a intentar sin más');
  });
});

describe('Una pasada automática no decide por nadie', () => {
  it('un conflicto se queda como conflicto', async () => {
    const acordado = setlistOf('setlist-1', 'Misa Domingo');
    const equipo = device({ agreed: acordado });
    equipo.local.save([{ ...acordado, name: 'Lo que escribí aquí', updatedAt: NOW + 1000 }]);
    const antes = equipo.snapshot();

    // La cuenta también cambió desde el acuerdo: nadie puede elegir por nadie.
    const suyo = { ...acordado, name: 'Lo que escribió en el portátil', updatedAt: NOW + 2000 };
    const nube = cloudOf({ rows: [activeRow(suyo, 2)] });
    const resultado = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => nube.cloud },
      {}
    );

    eq(resultado.status, 'ran');
    if (resultado.status !== 'ran') return;
    eq(resultado.report.outcomes.get('setlist-1')?.kind, 'ask', 'se pregunta, no se resuelve');
    eq(nube.calls, ['list'], 'no se escribió nada en la nube');
    eq(equipo.snapshot(), antes, 'ni en el dispositivo');
    eq(equipo.local.load().setlists[0].name, 'Lo que escribí aquí');
  });

  it('un Setlist que nunca se subió sigue esperando a que lo pidan', async () => {
    const equipo = device();
    equipo.local.save([setlistOf('setlist-nuevo', 'Sólo en este móvil')]);

    const nube = cloudOf({ rows: [] });
    const resultado = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => nube.cloud },
      // Lo mismo que manda `syncAll`: ninguna subida autorizada.
      { authorisedUploads: [] }
    );

    eq(resultado.status, 'ran');
    if (resultado.status !== 'ran') return;
    eq(resultado.report.outcomes.get('setlist-nuevo')?.kind, 'pending-user-action');
    eq(nube.calls, ['list'], 'no se subió a ciegas');
    eq(equipo.local.load().setlists.length, 1, 'y sigue aquí');
  });
});

describe('Sin sesión no se sincroniza, y no se borra nada', () => {
  it('sin identidad no se abre ninguna tienda', async () => {
    const equipo = device({ agreed: setlistOf('setlist-1') });
    const antes = equipo.snapshot();

    const resultado = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf('   '), accessToken: 'un-token' },
      { storage: equipo.storage, cloudFor: () => cloudOf().cloud },
      {}
    );

    eq(resultado.status, 'not-signed-in');
    eq(equipo.snapshot(), antes, 'los Setlists de este dispositivo siguen enteros');
  });

  it('sin token tampoco', async () => {
    const equipo = device({ agreed: setlistOf('setlist-1') });
    const antes = equipo.snapshot();

    const resultado = await runAuthenticatedSetlistSyncPass(
      { session: sessionOf(ANA), accessToken: '  ' },
      { storage: equipo.storage, cloudFor: () => cloudOf().cloud },
      {}
    );

    eq(resultado.status, 'no-access-token');
    eq(equipo.snapshot(), antes);
  });

  it('y si la nube dice que la sesión no vale, se para sin tocar nada', async () => {
    const equipo = device({ agreed: setlistOf('setlist-1') });
    const antes = equipo.snapshot();

    const nube = cloudOf({ listThrows: new SetlistCloudAuthError() });
    const resultado = await runAuthenticatedSetlistSyncPass(
      who,
      { storage: equipo.storage, cloudFor: () => nube.cloud },
      {}
    );

    eq(resultado.status, 'ran');
    if (resultado.status !== 'ran') return;
    eq(resultado.report.status, 'remote-auth-error');
    eq(equipo.snapshot(), antes, 'un problema de sesión no borra Setlists');
  });
});

// --- El estado que mirará la Fase 6 ----------------------------------------

describe('Cómo va, en una palabra', () => {
  it('lo que hace falta y nada más', () => {
    eq(syncStateOf({ working: false, conflicts: 0, stopped: false }), 'idle');
    eq(syncStateOf({ working: true, conflicts: 0, stopped: false }), 'syncing');
    eq(syncStateOf({ working: false, conflicts: 2, stopped: false }), 'conflict');
    eq(syncStateOf({ working: false, conflicts: 0, stopped: true }), 'error');
  });

  it('un conflicto se dice antes que un fallo: es lo que espera a una persona', () => {
    eq(syncStateOf({ working: false, conflicts: 1, stopped: true }), 'conflict');
    eq(syncStateOf({ working: true, conflicts: 1, stopped: true }), 'syncing', 'y mientras corre, corre');
  });
});
