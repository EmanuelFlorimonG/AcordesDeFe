import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { useSetlistShare } from '../src/hooks/useSetlistShare';
import { createKnownShareStore, knownSharesKey } from '../src/storage/knownShares';
import { userSetlists } from '../src/storage/setlistStorage';
import { runHook } from './hookHarness';

/**
 * Lo que el hook de compartir hace y deja de hacer cuando no hay red.
 *
 * El botón desactivado de la ventana es cortesía: ayuda a la persona, pero no
 * protege nada. Quien llama a `create()` o a `revoke()` es el hook, y la
 * defensa tiene que estar ahí — un atajo de teclado, un clic a medio camino de
 * quedarse sin cobertura o cualquier pantalla futura entran por el mismo sitio.
 *
 * Aquí el hook se ejecuta de verdad, con su propio estado y sus efectos, con
 * el banco de pruebas de `hookHarness`.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`useSetlistShare.test: ${checks} comprobaciones`));

const SETLIST = 'setlist-1';
const TOKEN = '0123456789abcdef0123456789abcdef';
const CREATED = '2026-09-24T18:30:00.000Z';
const ANA = userSetlists('ana-id');
// --- El navegador de la prueba ---------------------------------------------

const describe_ = (target: object, name: string) => Object.getOwnPropertyDescriptor(target, name);
const set = (name: string, value: unknown) =>
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

interface Browser {
  /** Cuántas peticiones de red se han hecho. Sin red deben ser cero. */
  readonly fetches: string[];
  /** Cuántas veces se ha escrito en el almacenamiento. */
  readonly writes: string[];
  storage: Map<string, string>;
  restore(): void;
}

/**
 * Un navegador de mentira con lo que el hook toca: si hay red, dónde guarda y
 * una red que cuenta a quién llama. No hay sesión guardada, así que la
 * aplicación no descarga Supabase ni intenta restaurar nada.
 */
function browser(options: { online: boolean; known?: boolean }): Browser {
  const before = {
    window: describe_(globalThis, 'window'),
    navigator: describe_(globalThis, 'navigator'),
    fetch: describe_(globalThis, 'fetch'),
  };
  const fetches: string[] = [];
  const writes: string[] = [];
  const data = new Map<string, string>();

  const localStorage = {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      writes.push(key);
      data.set(key, value);
    },
    removeItem: (key: string) => {
      writes.push(key);
      data.delete(key);
    },
  };

  set('navigator', { onLine: options.online });
  set('window', {
    localStorage,
    location: { origin: 'https://ejemplo.org', pathname: '/' },
    addEventListener() {},
    removeEventListener() {},
    setTimeout: (fn: () => void, ms?: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  });
  set('fetch', (input: unknown) => {
    fetches.push(String(input));
    return Promise.reject(new TypeError('Failed to fetch'));
  });

  if (options.known) {
    createKnownShareStore(ANA, localStorage).remember({ setlistId: SETLIST, token: TOKEN, createdAt: CREATED });
    writes.length = 0;
  }

  return {
    fetches,
    writes,
    storage: data,
    restore() {
      for (const [name, descriptor] of Object.entries(before)) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete (globalThis as Record<string, unknown>)[name];
      }
    },
  };
}

/** Abre la ventana de compartir de un Setlist y deja todo asentado. */
async function open(options: { online: boolean; known?: boolean }) {
  const fake = browser(options);
  const run = runHook(() => useSetlistShare(SETLIST));
  await run.settle();
  return { ...fake, run, close: () => (run.unmount(), fake.restore()) };
}

// --- Sin conexión ----------------------------------------------------------

describe('Sin conexión, crear un enlace no sale del hook', () => {
  it('dice que hace falta internet, sin pedir nada a nadie', async () => {
    const abierto = await open({ online: false });
    try {
      abierto.run.current.create();
      await abierto.run.settle();

      eq(abierto.run.current.message, 'Necesitas conexión a internet para crear un enlace público.');
      eq(abierto.fetches, [], 'ni una petición de red');
      eq(abierto.run.current.online, false, 'y el hook dice que no hay conexión');
      eq(abierto.run.current.status, 'off', 'no se finge que haya enlace');
      eq(abierto.run.current.link, null, 'ni se inventa uno');
    } finally {
      abierto.close();
    }
  });

  it('no llega a pedirle el enlace a Supabase: no entra en la parte que habla', async () => {
    const abierto = await open({ online: false });
    try {
      // `busy` se pone a true en cuanto se entra a hablar con la nube, antes
      // del primer `await`. Si nunca se pone, nunca se habló.
      abierto.run.current.create();
      abierto.run.flush();
      eq(abierto.run.current.busy, false, 'ni en el instante siguiente a la pulsación');

      await abierto.run.settle();
      eq(
        abierto.run.renders.some((render) => render.busy),
        false,
        'nunca se entró a la parte que llama al repositorio'
      );
      eq(abierto.run.current.busy, false);
    } finally {
      abierto.close();
    }
  });

  it('y termina como una respuesta, no como un error de red', async () => {
    const abierto = await open({ online: false });
    const errores: unknown[] = [];
    const onReject = (error: unknown) => errores.push(error);
    process.on('unhandledRejection', onReject);
    try {
      eq(abierto.run.current.create(), undefined, 'no lanza');
      await abierto.run.settle();
      eq(errores, [], 'ni deja una promesa rota por ahí');
      eq(abierto.run.current.message?.includes('Failed to fetch'), false);
      eq(abierto.run.current.status === 'error', false, 'no es un error: es un "ahora no"');
    } finally {
      process.off('unhandledRejection', onReject);
      abierto.close();
    }
  });
});

describe('Sin conexión, desactivar un enlace no sale del hook', () => {
  it('dice que hace falta internet, sin pedir nada a nadie', async () => {
    const abierto = await open({ online: false, known: true });
    try {
      abierto.run.current.revoke();
      await abierto.run.settle();

      eq(abierto.run.current.message, 'Necesitas conexión a internet para desactivar el enlace.');
      eq(abierto.fetches, [], 'ni una petición de red');
    } finally {
      abierto.close();
    }
  });

  it('no entra en la parte que borra la fila', async () => {
    const abierto = await open({ online: false, known: true });
    try {
      abierto.run.current.revoke();
      abierto.run.flush();
      eq(abierto.run.current.busy, false, 'ni en el instante siguiente a la pulsación');

      await abierto.run.settle();
      eq(
        abierto.run.renders.some((render) => render.busy),
        false,
        'nunca se entró a la parte que llama al repositorio'
      );
    } finally {
      abierto.close();
    }
  });

  it('no borra lo que este dispositivo recordaba: no se ha desactivado nada', async () => {
    const abierto = await open({ online: false, known: true });
    try {
      abierto.run.current.revoke();
      await abierto.run.settle();

      eq(abierto.writes, [], 'no se escribió en el almacenamiento');
      const guardado = createKnownShareStore(ANA, {
        getItem: (key: string) => abierto.storage.get(key) ?? null,
        setItem: () => {},
      }).get(SETLIST);
      eq(guardado, { setlistId: SETLIST, token: TOKEN, createdAt: CREATED }, 'el enlace sigue recordado');
      eq(abierto.storage.has(knownSharesKey(ANA) as string), true);
    } finally {
      abierto.close();
    }
  });

  it('y termina como una respuesta, no como un error de red', async () => {
    const abierto = await open({ online: false, known: true });
    const errores: unknown[] = [];
    const onReject = (error: unknown) => errores.push(error);
    process.on('unhandledRejection', onReject);
    try {
      eq(abierto.run.current.revoke(), undefined, 'no lanza');
      await abierto.run.settle();
      eq(errores, []);
      eq(abierto.run.current.message?.includes('Failed to fetch'), false);
      eq(abierto.run.current.status === 'error', false);
    } finally {
      process.off('unhandledRejection', onReject);
      abierto.close();
    }
  });
});

// --- El contraste: con conexión sí se intenta ------------------------------

describe('Con conexión las dos acciones sí salen del hook', () => {
  it('crear entra a hablar con la nube, y lo que falla es la sesión, no la red', async () => {
    const abierto = await open({ online: true });
    try {
      abierto.run.current.create();
      abierto.run.flush();
      eq(abierto.run.current.busy, true, 'esta vez sí se entró: lo que paró a la otra fue la guarda');

      await abierto.run.settle();
      eq(abierto.run.current.message?.includes('conexión a internet'), false, 'y no se dice lo de la conexión');
      eq(abierto.run.current.busy, false, 'y se sale de ahí igual');
    } finally {
      abierto.close();
    }
  });

  it('desactivar también', async () => {
    const abierto = await open({ online: true, known: true });
    try {
      abierto.run.current.revoke();
      abierto.run.flush();
      eq(abierto.run.current.busy, true);

      await abierto.run.settle();
      eq(abierto.run.current.message?.includes('conexión a internet'), false);
    } finally {
      abierto.close();
    }
  });
});
