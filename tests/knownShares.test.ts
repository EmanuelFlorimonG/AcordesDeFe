import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SupabaseRequestError } from '../src/lib/supabase';
import {
  KNOWN_SHARES_KEY,
  KNOWN_SHARES_VERSION,
  canFallBackToMemory,
  classifyShareFailure,
  createKnownShareStore,
  knownSharesKey,
  lookupShare,
  type KnownShare,
} from '../src/storage/knownShares';
import { GUEST_SETLISTS, userSetlists } from '../src/storage/setlistStorage';
import { sharedSetlistLink } from '../src/components/Setlists/ui';
import { encodeQr } from '../src/utils/qrCode';

/**
 * Enseñar un enlace ya creado sin conexión.
 *
 * Todo lo de aquí existe por un momento concreto: alguien llega a la iglesia,
 * no hay cobertura, y tiene que pasarle al coro el enlace que creó el jueves.
 * Lo que se comprueba es que eso funcione y que no funcione de más — que sin
 * red no se invente un enlace, no se finja que se desactivó uno, y sobre todo
 * que un problema de sesión no se disfrace de "todo bien" enseñando lo que
 * este dispositivo recordaba.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`knownShares.test: ${checks} comprobaciones`));

const TOKEN = '0123456789abcdef0123456789abcdef';
const OTRO = 'fedcba9876543210fedcba9876543210';
const CREATED = '2026-09-24T18:30:00.000Z';

const share = (overrides: Partial<KnownShare> = {}): KnownShare => ({
  setlistId: 'setlist-1',
  token: TOKEN,
  createdAt: CREATED,
  ...overrides,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

const ANA = userSetlists('ana-id');
const LUIS = userSetlists('luis-id');

/** En Node `navigator` existe y es de sólo lectura, así que se define. */
const describe_ = (target: object, name: string) => Object.getOwnPropertyDescriptor(target, name);
const setNavigator = (value: unknown) =>
  Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });

/** Corre algo como si el navegador dijera que no hay red, y lo deja como estaba. */
function withNavigator<T>(onLine: boolean | undefined, run: () => T): T {
  const before = describe_(globalThis, 'navigator');
  try {
    setNavigator({ onLine });
    return run();
  } finally {
    if (before) Object.defineProperty(globalThis, 'navigator', before);
    else delete (globalThis as { navigator?: unknown }).navigator;
  }
}

/** Un repositorio de mentira que cuenta cuántas veces se le preguntó. */
function remote(answer: KnownShare | null | Error) {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    find: async () => {
      calls++;
      if (answer instanceof Error) throw answer;
      return answer;
    },
  };
}

// --- Lo que se guarda, y dónde ---------------------------------------------

describe('Lo que este dispositivo recuerda de un enlace', () => {
  it('es lo mínimo para reconstruirlo: cuál, de qué Setlist y desde cuándo', () => {
    const storage = memoryStorage();
    createKnownShareStore(ANA, storage).remember(share());

    const stored = JSON.parse(storage.data.get(knownSharesKey(ANA) as string) as string);
    eq(stored.version, KNOWN_SHARES_VERSION, 'con su versión, para no leer mal lo viejo');
    eq(stored.shares, [{ setlistId: 'setlist-1', token: TOKEN, createdAt: CREATED }]);
    // Nada del contenido del Setlist, ni del dueño: eso ya está en su sitio.
    const raw = storage.data.get(knownSharesKey(ANA) as string) as string;
    for (const forbidden of ['owner', 'items', 'name', 'revision', 'payload']) {
      eq(raw.includes(forbidden), false, forbidden);
    }
  });

  it('sigue estando después de cerrar y volver a abrir la aplicación', () => {
    const storage = memoryStorage();
    createKnownShareStore(ANA, storage).remember(share());
    // Otra sesión de la aplicación, el mismo navegador: otra instancia.
    eq(createKnownShareStore(ANA, storage).get('setlist-1'), share());
  });

  it('olvida el de un Setlist sin tocar los demás', () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    store.remember(share());
    store.remember(share({ setlistId: 'setlist-2', token: OTRO }));

    store.forget('setlist-1');
    eq(store.get('setlist-1'), null);
    eq(store.get('setlist-2')?.token, OTRO);
  });

  it('volver a recordarlo lo sustituye, no lo duplica', () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    store.remember(share());
    store.remember(share({ token: OTRO, createdAt: '2026-09-30T10:00:00.000Z' }));

    const stored = JSON.parse(storage.data.get(knownSharesKey(ANA) as string) as string);
    eq(stored.shares.length, 1);
    eq(store.get('setlist-1')?.token, OTRO);
  });

  it('un token con mala forma no se guarda ni se lee', () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    for (const malo of ['', 'corto', `${TOKEN}0`, 'G'.repeat(32)]) {
      store.remember(share({ token: malo }));
      eq(store.get('setlist-1'), null, JSON.stringify(malo));
    }
  });

  it('una entrada rota no se lleva por delante las demás', () => {
    const key = knownSharesKey(ANA) as string;
    const storage = memoryStorage({
      [key]: JSON.stringify({
        version: KNOWN_SHARES_VERSION,
        shares: [{ setlistId: 'roto' }, share({ setlistId: 'setlist-2', token: OTRO })],
      }),
    });
    const store = createKnownShareStore(ANA, storage);
    eq(store.get('roto'), null);
    eq(store.get('setlist-2')?.token, OTRO);
  });

  it('lo guardado por una versión que no es la nuestra no se interpreta', () => {
    const key = knownSharesKey(ANA) as string;
    for (const raw of [
      JSON.stringify({ version: KNOWN_SHARES_VERSION + 1, shares: [share()] }),
      JSON.stringify({ shares: [share()] }),
      'no es json',
      '{}',
    ]) {
      eq(createKnownShareStore(ANA, memoryStorage({ [key]: raw })).get('setlist-1'), null, raw.slice(0, 24));
    }
  });

  it('un dispositivo que no deja guardar no rompe nada', () => {
    const lleno = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = createKnownShareStore(ANA, lleno);
    store.remember(share());
    eq(store.get('setlist-1'), null, 'no se guardó, y se sigue');
    eq(createKnownShareStore(ANA, null).get('setlist-1'), null, 'ni sin almacenamiento');
  });
});

// --- Cada cuenta lo suyo ---------------------------------------------------

describe('Los enlaces de una cuenta no son de otra', () => {
  it('cada cuenta escribe en su propia clave', () => {
    eq(knownSharesKey(ANA), `${KNOWN_SHARES_KEY}:u:ana-id`);
    eq(knownSharesKey(LUIS), `${KNOWN_SHARES_KEY}:u:luis-id`);
    eq(knownSharesKey(ANA) === knownSharesKey(LUIS), false);
  });

  it('en el mismo navegador, Luis no ve los enlaces de Ana', () => {
    const storage = memoryStorage();
    createKnownShareStore(ANA, storage).remember(share());

    eq(createKnownShareStore(LUIS, storage).get('setlist-1'), null, 'aunque sea el mismo Setlist');
    eq(createKnownShareStore(ANA, storage).get('setlist-1'), share(), 'y Ana sigue viendo el suyo');
  });

  it('y lo que guarda Luis no pisa lo de Ana', () => {
    const storage = memoryStorage();
    createKnownShareStore(ANA, storage).remember(share());
    createKnownShareStore(LUIS, storage).remember(share({ token: OTRO }));

    eq(createKnownShareStore(ANA, storage).get('setlist-1')?.token, TOKEN);
    eq(createKnownShareStore(LUIS, storage).get('setlist-1')?.token, OTRO);
    eq(storage.data.size, 2, 'dos cuentas, dos sitios');
  });

  it('un invitado no tiene dónde guardar, porque no puede compartir', () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(GUEST_SETLISTS, storage);
    eq(store.key, null);
    store.remember(share());
    eq(storage.data.size, 0, 'ni una clave');
    eq(store.get('setlist-1'), null);
  });

  it('una identidad sin id tampoco, que no es de nadie', () => {
    eq(knownSharesKey(userSetlists('   ')), null);
    eq(createKnownShareStore(userSetlists(''), memoryStorage()).key, null);
  });

  it('un id raro no se convierte en una clave rara', () => {
    eq(knownSharesKey(userSetlists('a:b/c')), `${KNOWN_SHARES_KEY}:u:a%3Ab%2Fc`);
  });
});

// --- Por qué falló --------------------------------------------------------

describe('Por qué falló una petición', () => {
  it('sin red, ni se intentó', () => {
    withNavigator(false, () => {
      eq(classifyShareFailure(new Error('lo que sea')), 'offline');
      // Incluso si el error parece del servidor: si no hay red, no hubo servidor.
      eq(classifyShareFailure(new SupabaseRequestError('x', 500, null)), 'offline');
    });
  });

  it('un fetch que no llega es un problema de red, no una respuesta', () => {
    withNavigator(true, () => {
      eq(classifyShareFailure(new TypeError('Failed to fetch')), 'network');
      eq(classifyShareFailure(undefined), 'network');
    });
  });

  it('que el servidor diga que no es otra cosa', () => {
    withNavigator(true, () => {
      eq(classifyShareFailure(new SupabaseRequestError('x', 401, null)), 'auth', 'sesión caducada');
      eq(classifyShareFailure(new SupabaseRequestError('x', 403, null)), 'auth');
      eq(classifyShareFailure(new SupabaseRequestError('x', 400, '42501')), 'auth', 'una política que no deja pasar');
      eq(classifyShareFailure(new SupabaseRequestError('x', 400, 'PGRST301')), 'auth', 'un JWT que no vale');
      eq(classifyShareFailure(new SupabaseRequestError('x', 500, 'XX000')), 'server');
      eq(classifyShareFailure(new SupabaseRequestError('x', 503, null)), 'server');
    });
  });

  it('sólo no llegar al servidor permite tirar de memoria', () => {
    eq(canFallBackToMemory('offline'), true);
    eq(canFallBackToMemory('network'), true);
    eq(canFallBackToMemory('auth'), false, 'enseñar lo guardado diría que todo va bien');
    eq(canFallBackToMemory('server'), false);
  });
});

// --- En qué estado está el enlace ------------------------------------------

describe('Con conexión manda Supabase', () => {
  it('lo que responde se guarda, para la próxima vez que no haya red', async () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    const cloud = remote(share());

    const found = await lookupShare('setlist-1', cloud.find, store, true);
    eq(found, { state: 'on', share: share(), fromMemory: false });
    eq(store.get('setlist-1'), share(), 'y queda guardado');
  });

  it('si dice que no hay enlace, lo que este dispositivo recordaba se borra', async () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    store.remember(share());

    const found = await lookupShare('setlist-1', remote(null).find, store, true);
    eq(found, { state: 'off' });
    eq(store.get('setlist-1'), null, 'lo desactivaron desde otro sitio: sobra');
  });

  it('un enlace nuevo sustituye al que se recordaba', async () => {
    const storage = memoryStorage();
    const store = createKnownShareStore(ANA, storage);
    store.remember(share());

    await lookupShare('setlist-1', remote(share({ token: OTRO })).find, store, true);
    eq(store.get('setlist-1')?.token, OTRO);
  });
});

describe('Sin conexión se enseña lo último que se supo', () => {
  it('no se manda una petición que no va a llegar', async () => {
    const store = createKnownShareStore(ANA, memoryStorage());
    store.remember(share());
    const cloud = remote(share());

    const found = await lookupShare('setlist-1', cloud.find, store, false);
    eq(cloud.calls, 0, 'ni una');
    eq(found, { state: 'on', share: share(), fromMemory: true }, 'y se dice que es memoria');
  });

  it('el enlace se puede enseñar y copiar tal cual', async () => {
    const store = createKnownShareStore(ANA, memoryStorage());
    store.remember(share());

    const found = await lookupShare('setlist-1', remote(null).find, store, false);
    assert.equal(found.state, 'on');
    if (found.state !== 'on') return;
    eq(
      sharedSetlistLink(found.share.token, { origin: 'https://ejemplo.org', pathname: '/' }),
      `https://ejemplo.org/#/shared/setlist/${TOKEN}`,
      'el mismo enlace de siempre'
    );
  });

  it('y su código QR se dibuja aquí, sin pedirle la imagen a nadie', async () => {
    const store = createKnownShareStore(ANA, memoryStorage());
    store.remember(share());
    const found = await lookupShare('setlist-1', remote(null).find, store, false);
    assert.equal(found.state, 'on');
    if (found.state !== 'on') return;

    const link = sharedSetlistLink(found.share.token, { origin: 'https://ejemplo.org', pathname: '/' });
    const qr = encodeQr(link);
    eq(qr.size > 0, true);
    eq(qr.modules.length, qr.size, 'una matriz cuadrada, lista para pintar');
    // Y el generador no habla con nadie: es todo cuenta.
    const source = readFileSync('src/utils/qrCode.ts', 'utf8');
    for (const forbidden of ['fetch(', 'http://', 'https://', 'XMLHttpRequest']) {
      eq(source.includes(forbidden), false, forbidden);
    }
  });

  it('un Setlist que nunca se compartió se dice que no lo está, sin inventar nada', async () => {
    const store = createKnownShareStore(ANA, memoryStorage());
    const cloud = remote(share());

    const found = await lookupShare('setlist-1', cloud.find, store, false);
    eq(found, { state: 'off' });
    eq(cloud.calls, 0, 'no se intenta crear nada');
    eq(store.get('setlist-1'), null, 'ni se apunta un token que no existe');
  });

  it('el enlace de Ana no aparece en la sesión de Luis', async () => {
    const storage = memoryStorage();
    createKnownShareStore(ANA, storage).remember(share());

    const found = await lookupShare('setlist-1', remote(null).find, createKnownShareStore(LUIS, storage), false);
    eq(found, { state: 'off' });
  });
});

describe('Cuando algo falla, depende de qué', () => {
  const boom = (error: Error, known: boolean) => {
    const store = createKnownShareStore(ANA, memoryStorage());
    if (known) store.remember(share());
    return { store, find: remote(error).find };
  };

  it('si no se llegó al servidor, se enseña lo guardado', async () => {
    await withNavigator(true, async () => {
      const { store, find } = boom(new TypeError('Failed to fetch'), true);
      eq(await lookupShare('setlist-1', find, store, true), {
        state: 'on',
        share: share(),
        fromMemory: true,
      });
      eq(store.get('setlist-1'), share(), 'y se sigue guardando');
    });
  });

  it('si la sesión caducó, NO se enseña lo guardado: se dice lo que pasa', async () => {
    await withNavigator(true, async () => {
      const { store, find } = boom(new SupabaseRequestError('x', 401, null), true);
      eq(await lookupShare('setlist-1', find, store, true), { state: 'error', failure: 'auth' });
      // Tampoco se borra: no se sabe nada del enlace, sólo de la sesión.
      eq(store.get('setlist-1'), share(), 'lo guardado se queda, sin enseñarse');
    });
  });

  it('lo mismo si una política no deja pasar', async () => {
    await withNavigator(true, async () => {
      const { store, find } = boom(new SupabaseRequestError('x', 400, '42501'), true);
      eq(await lookupShare('setlist-1', find, store, true), { state: 'error', failure: 'auth' });
    });
  });

  it('y si el servidor contesta mal, tampoco se tapa', async () => {
    await withNavigator(true, async () => {
      const { store, find } = boom(new SupabaseRequestError('x', 500, null), true);
      eq(await lookupShare('setlist-1', find, store, true), { state: 'error', failure: 'server' });
    });
  });

  it('sin nada guardado, un fallo de red es un fallo de red', async () => {
    await withNavigator(true, async () => {
      const { store, find } = boom(new TypeError('Failed to fetch'), false);
      eq(await lookupShare('setlist-1', find, store, true), { state: 'error', failure: 'network' });
    });
  });

  it('si la red se cayó a mitad de la petición, se responde como sin conexión', async () => {
    await withNavigator(false, async () => {
      const { store, find } = boom(new TypeError('Failed to fetch'), true);
      eq(await lookupShare('setlist-1', find, store, true), {
        state: 'on',
        share: share(),
        fromMemory: true,
      });
    });
  });
});

// --- Lo que no se hace sin conexión ---------------------------------------

describe('Crear y desactivar siguen necesitando conexión', () => {
  /** Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta. */
  const sinComentarios = (path: string) =>
    readFileSync(path, 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '');

  const hook = sinComentarios('src/hooks/useSetlistShare.ts');
  const dialog = sinComentarios('src/components/Setlists/ShareSetlistDialog.tsx');
  const memoria = sinComentarios('src/storage/knownShares.ts');

  it('sin red no se llega a pedir la creación, y se dice por qué', () => {
    eq(/create = useCallback\(\(\) => \{\s*if \(!isOnline\(\)\) \{/.test(hook), true);
    eq(hook.includes('NEEDS_INTERNET_TO_CREATE'), true);
    eq(hook.includes("'Necesitas conexión a internet para crear un enlace público.'"), true);
  });

  it('sin red no se borra nada, ni se finge que se borró', () => {
    eq(/revoke = useCallback\(\(\) => \{\s*if \(!isOnline\(\)\) \{/.test(hook), true);
    eq(hook.includes('NEEDS_INTERNET_TO_REVOKE'), true);
    // La copia local sólo se olvida DESPUÉS de que la nube lo confirme.
    const revoke = hook.slice(hook.indexOf('const revoke'));
    eq(revoke.indexOf('await repository.revoke') < revoke.indexOf('forget('), true);
  });

  it('y los dos botones están desactivados cuando no hay conexión', () => {
    eq((dialog.match(/disabled=\{share\.busy \|\| !share\.online\}/g) ?? []).length, 2);
    eq(dialog.includes('{!share.online && <Offline>{NEEDS_INTERNET_TO_CREATE}</Offline>}'), true);
    eq(dialog.includes('{!share.online && <Offline>{NEEDS_INTERNET_TO_REVOKE}</Offline>}'), true);
  });

  it('un enlace de memoria se enseña diciendo que es de memoria', () => {
    eq(dialog.includes('share.fromMemory'), true);
    eq(dialog.includes('guardado en el dispositivo'), true);
    eq(dialog.includes('no podemos'), true, 'y que no se puede confirmar');
  });

  it('esta memoria no genera tokens ni escribe en la nube', () => {
    for (const forbidden of ['random', 'uuid', 'fetch(', 'insert', 'client.', 'rpc']) {
      eq(memoria.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    }
    // Es localStorage a través del mismo sitio que todo lo demás, no IndexedDB.
    eq(memoria.includes('getBrowserStorage'), true);
    eq(memoria.includes('indexedDB'), false);
  });

  it('el service worker sigue sin saber nada de compartir', () => {
    const config = sinComentarios('vite.config.ts');
    for (const forbidden of ['runtimeCaching', 'shared_setlist', 'setlist_shares', 'supabase']) {
      eq(config.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
    }
  });
});
