import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import { retrySharedCopy, saveSharedCopy, type SaveSharedCopyDeps } from '../src/storage/sharedSetlistCopy';
import { sharedCopyId } from '../src/utils/setlists';

/**
 * El camino de «Guardar una copia», probado sin pantalla.
 *
 * La coordinación vive fuera del componente justamente para esto: tiene cinco
 * salidas y cada una importa —sin cuenta, ya copiado, ocupado, guardado y
 * guardado a medias—, y dentro de React habría que mover la aplicación entera
 * para verlas. Aquí se llama y se mira qué devuelve.
 *
 * Lo que más se vigila es lo que no debe pasar: que dos pulsaciones no hagan
 * dos copias, que un fallo de red no mienta diciendo que se guardó, y que
 * reintentar no deje dos Setlists donde debería haber uno.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`sharedCopyFlow.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 9, 29, 12);

/** El id de una copia que sabemos que cabe. */
const idDe = (origen: string, intento = 1) => sharedCopyId(origen, intento)!;

const COMPARTIDO: Setlist = {
  id: 'original-abc',
  name: 'Adoración 29/10',
  kind: 'adoracion',
  date: '2026-10-29',
  description: '',
  participantIds: [],
  items: [{ id: 'item-1', songId: 'huracan', moment: 'Entrada del Señor', transposeSteps: 0, capoFret: 0, notes: '' }],
  createdAt: NOW,
  updatedAt: NOW,
};

interface Banco {
  deps: SaveSharedCopyDeps;
  /** Lo que se metió en los Setlists del dispositivo, en orden. */
  adoptados: Setlist[];
  /** Lo que se ofreció a la cuenta, en orden. */
  subidos: Setlist[];
  /** Los Setlists que la cuenta ya tenía en este dispositivo. */
  guardados: Map<string, Setlist>;
}

/** Un banco de pruebas con la nube que se le diga. */
function banco(
  options: {
    signedIn?: boolean;
    sync?: (setlist: Setlist) => Promise<{ ok: boolean; message: string } | null>;
    existentes?: Setlist[];
    /** Qué dice la nube de lo que ya hay: «new» es que no sabe nada de ello. */
    cloudStateOf?: (setlist: Setlist) => 'guest' | 'new' | 'changed' | 'synced';
  } = {}
): Banco {
  const adoptados: Setlist[] = [];
  const subidos: Setlist[] = [];
  const guardados = new Map((options.existentes ?? []).map((s) => [s.id, s]));
  let siguiente = 0;
  return {
    adoptados,
    subidos,
    guardados,
    deps: {
      signedIn: options.signedIn ?? true,
      find: (id) => guardados.get(id) ?? null,
      cloudStateOf: options.cloudStateOf ?? (() => 'synced'),
      adopt: (setlist) => {
        adoptados.push(setlist);
        // Como el almacén de verdad: el mismo id reemplaza, no duplica.
        guardados.set(setlist.id, setlist);
      },
      sync: async (setlist) => {
        subidos.push(setlist);
        return options.sync ? options.sync(setlist) : { ok: true, message: 'Guardado' };
      },
      now: () => NOW + 1000,
      createId: () => `nuevo-${++siguiente}`,
      lock: { current: false },
    },
  };
}

// --- Cuando todo va bien ----------------------------------------------------

describe('Guardado remoto correcto', () => {
  it('la copia sube y se da por guardada', async () => {
    const b = banco();
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);

    eq(resultado.state, 'saved');
    eq(b.adoptados.length, 1, 'una copia en el dispositivo');
    eq(b.subidos.length, 1, 'ofrecida una vez a la cuenta');
    eq(b.subidos[0].id, idDe('original-abc'));
    eq(b.subidos[0].name, 'Adoración 29/10', 'con su nombre, sin «(copia)»');
  });

  it('y el cerrojo queda libre para la siguiente', async () => {
    const b = banco();
    await saveSharedCopy(COMPARTIDO, b.deps);
    eq(b.deps.lock.current, false);
  });
});

// --- Cuando la red falla ----------------------------------------------------

describe('Un fallo de red no dice que se guardó', () => {
  const caida = async () => ({ ok: false, message: 'No hay conexión.' });

  it('se queda en el dispositivo y lo dice', async () => {
    const b = banco({ sync: caida });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);

    eq(resultado.state, 'local-only');
    eq(resultado.state === 'local-only' && resultado.message.includes('todavía no en tu cuenta'), true);
    eq(resultado.state === 'local-only' && resultado.message.includes('No hay conexión.'), true);
  });

  it('nunca se anuncia como guardada en la cuenta', async () => {
    const b = banco({ sync: caida });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);
    eq(resultado.state === 'saved', false);
  });

  it('y si había una pasada en el aire, tampoco', async () => {
    // Null es «ya se estaba sincronizando»: la primera pasada dirá cómo fue.
    const b = banco({ sync: async () => null });
    eq((await saveSharedCopy(COMPARTIDO, b.deps)).state, 'local-only');
  });

  it('la copia local no se borra: una lápida mataría la subida que sí llegó', async () => {
    // Si la subida llegó pero la respuesta se perdió, borrar aquí dejaría una
    // lápida que en la siguiente pasada se llevaría por delante la copia buena.
    const b = banco({ sync: caida });
    await saveSharedCopy(COMPARTIDO, b.deps);
    eq(b.guardados.has(idDe('original-abc')), true);
  });
});

// --- Reintentar ------------------------------------------------------------

describe('Reintentar no deja dos copias', () => {
  it('tras un fallo, volver a pedirla reconoce la que ya está', async () => {
    const b = banco({ sync: async () => ({ ok: false, message: 'Se cortó.' }) });

    eq((await saveSharedCopy(COMPARTIDO, b.deps)).state, 'local-only');
    // La copia se quedó en el dispositivo, así que el segundo gesto no crea
    // otra: la reconoce y deja que decida quien mira. Reintentar la subida es
    // el camino de siempre, desde las opciones de esa copia.
    const segundo = await saveSharedCopy(COMPARTIDO, b.deps, 1);

    eq(segundo.state, 'exists');
    eq(segundo.state === 'exists' && segundo.existing.id, idDe('original-abc'));
    eq(b.subidos.length, 1, 'una sola subida intentada');
    eq(b.guardados.size, 1, 'y un solo Setlist en el dispositivo');
  });

  it('una subida que sí llegó se reconoce por el id, no se duplica', async () => {
    // Otro dispositivo ya la subió y la pasada la trajo aquí.
    const existente: Setlist = { ...COMPARTIDO, id: idDe('original-abc') };
    const b = banco({ existentes: [existente] });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);

    eq(resultado.state, 'exists');
    eq(resultado.state === 'exists' && resultado.existing.id, idDe('original-abc'));
    eq(resultado.state === 'exists' && resultado.pending, false, 'ésta sí está en la nube');
    eq(b.subidos.length, 0, 'no se vuelve a subir nada');
    eq(b.adoptados.length, 0, 'ni se toca lo que ya había');
  });

  it('y la segunda copia voluntaria sí se crea, con su propio id', async () => {
    const existente: Setlist = { ...COMPARTIDO, id: idDe('original-abc') };
    const b = banco({ existentes: [existente] });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps, 2);

    eq(resultado.state, 'saved');
    eq(b.subidos[0].id, 'copia-original-abc-2');
    eq(b.guardados.size, 2, 'la primera sigue donde estaba');
  });
});

// --- Dos pulsaciones seguidas ----------------------------------------------

describe('Doble clic', () => {
  it('la segunda no manda nada', async () => {
    let soltar = () => {};
    const esperando = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    const b = banco({
      sync: async () => {
        await esperando;
        return { ok: true, message: 'Guardado' };
      },
    });

    const primera = saveSharedCopy(COMPARTIDO, b.deps);
    // Sin esperar: es lo que pasa entre dos pulsaciones seguidas.
    const segunda = await saveSharedCopy(COMPARTIDO, b.deps);
    eq(segunda, { state: 'busy' });

    soltar();
    eq((await primera).state, 'saved');
    eq(b.subidos.length, 1, 'una sola subida');
    eq(b.adoptados.length, 1, 'una sola copia');
  });

  it('el cerrojo se suelta aunque la subida reviente', async () => {
    const b = banco({
      sync: async () => {
        throw new Error('la red se cayó a la mitad');
      },
    });
    await assert.rejects(saveSharedCopy(COMPARTIDO, b.deps));
    checks++;
    eq(b.deps.lock.current, false, 'y se puede reintentar');
  });
});

// --- Sin sesión ------------------------------------------------------------

describe('Sin cuenta no se guarda nada', () => {
  it('se pide la sesión y no se toca ningún Setlist', async () => {
    const b = banco({ signedIn: false });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);

    eq(resultado, { state: 'needs-account' });
    eq([b.adoptados.length, b.subidos.length], [0, 0]);
  });

  it('cancelar el inicio de sesión no deja nada a medias', async () => {
    // Cancelar es no volver a llamar: la intención se queda sin consumir.
    const b = banco({ signedIn: false });
    await saveSharedCopy(COMPARTIDO, b.deps);
    eq([b.adoptados.length, b.subidos.length, b.guardados.size], [0, 0, 0]);
    eq(b.deps.lock.current, false);
  });

  it('y al volver con sesión se guarda una sola vez', async () => {
    const b = banco({ signedIn: false });
    eq((await saveSharedCopy(COMPARTIDO, b.deps)).state, 'needs-account');

    const conSesion = { ...b.deps, signedIn: true };
    eq((await saveSharedCopy(COMPARTIDO, conSesion)).state, 'saved');
    eq(b.subidos.length, 1);
  });
});

// --- La frontera -----------------------------------------------------------

describe('Lo que la copia no puede saltarse', () => {
  it('el id derivado cabe, o no hay copia: nunca se recorta', () => {
    // La tabla admite ids de 8 a 64 caracteres, sin espacios. Lo que cabe,
    // cabe entero; lo que no, se dice que no en vez de cortarlo.
    for (const origen of ['a'.repeat(8), 'b'.repeat(36), 'c'.repeat(55), crypto.randomUUID()]) {
      for (const intento of [1, 2, 9, 10, 99]) {
        const id = sharedCopyId(origen, intento);
        assert.ok(id, `${origen.length} · ${intento}`);
        checks++;
        eq(id.length >= 8 && id.length <= 64, true, `${origen.length} · ${intento} → ${id.length}`);
        eq(/\s/.test(id), false, id);
        eq(id.includes(origen), true, 'el origen entero, sin cortar');
      }
    }
  });

  it('dos orígenes largos que empiezan igual no colisionan', () => {
    // Recortar los habría dejado con el mismo id, y el segundo habría pisado
    // al primero sin que nadie se enterara.
    const comun = 'x'.repeat(50);
    const uno = sharedCopyId(`${comun}-uno`);
    const otro = sharedCopyId(`${comun}-dos`);
    eq(uno === otro, false, 'distintos, o ninguno');
    if (uno && otro) eq(uno.endsWith('-uno'), true, 'cada uno con su final');
  });

  it('un origen que no deja sitio no se copia a medias', () => {
    eq(sharedCopyId('z'.repeat(56)), null, 'no cabe con su sufijo');
    eq(sharedCopyId('z'.repeat(64)), null);
    // Y un UUID, que es lo que esta aplicación crea, cabe de sobra.
    eq(sharedCopyId(crypto.randomUUID(), 99)!.length <= 64, true);
  });

  it('y el flujo lo dice en vez de inventarse un id', async () => {
    const b = banco();
    const largo: Setlist = { ...COMPARTIDO, id: 'z'.repeat(60) };
    eq((await saveSharedCopy(largo, b.deps)).state, 'cannot-copy');
    eq([b.adoptados.length, b.subidos.length], [0, 0]);
  });

  it('la aplicación no elige quién es el dueño de la copia', () => {
    // Lo pone Supabase desde el token: `owner_id uuid not null default auth.uid()`.
    const flujo = readFileSync('src/storage/sharedSetlistCopy.ts', 'utf8');
    eq(flujo.includes('owner_id'), false);
    eq(readFileSync('src/App.tsx', 'utf8').includes('owner_id'), false);
  });

  it('un conflicto de sincronización no sobrescribe nada por su cuenta', () => {
    // Resolver un conflicto es un gesto aparte, que alguien tiene que pedir:
    // ni la pasada automática ni esta copia lo hacen por su cuenta.
    const sync = readFileSync('src/hooks/useSetlistCloudSync.ts', 'utf8');
    eq(sync.includes('resolve:'), true, 'existe, y hay que llamarlo');
    const auto = readFileSync('src/hooks/useSetlistAutoSync.ts', 'utf8');
    eq(auto.includes('resolve('), false, 'la pasada automática no resuelve nada');
    const flujo = readFileSync('src/storage/sharedSetlistCopy.ts', 'utf8');
    eq(flujo.includes('resolve'), false, 'ni guardar una copia');
  });

  it('y la copia no habla con la nube por fuera de su capa', () => {
    const flujo = readFileSync('src/storage/sharedSetlistCopy.ts', 'utf8');
    eq(flujo.includes('cloudSetlists'), false);
    eq(flujo.includes('supabase'), false);
  });
});

// --- Reintentar una copia que se quedó a medias -----------------------------

describe('Una copia pendiente se reintenta, no se duplica', () => {
  const existente = (): Setlist => ({ ...COMPARTIDO, id: idDe('original-abc') });

  it('se distingue de una que sí está en la cuenta', async () => {
    const pendiente = banco({ existentes: [existente()], cloudStateOf: () => 'new' });
    const subida = banco({ existentes: [existente()], cloudStateOf: () => 'synced' });

    const a = await saveSharedCopy(COMPARTIDO, pendiente.deps);
    const b = await saveSharedCopy(COMPARTIDO, subida.deps);
    eq(a.state === 'exists' && a.pending, true, 'la nube no sabe nada de ella');
    eq(b.state === 'exists' && b.pending, false, 'ésta sí está arriba');
  });

  it('una copia editada después de subir tampoco está pendiente', async () => {
    const b = banco({ existentes: [existente()], cloudStateOf: () => 'changed' });
    const resultado = await saveSharedCopy(COMPARTIDO, b.deps);
    eq(resultado.state === 'exists' && resultado.pending, false, 'subió, y luego se tocó');
  });

  it('el reintento sube la misma copia, con su mismo id', async () => {
    const copia = existente();
    const b = banco({ existentes: [copia], cloudStateOf: () => 'new' });
    const resultado = await retrySharedCopy(copia, b.deps);

    eq(resultado.state, 'saved');
    eq(b.subidos.map((s) => s.id), [idDe('original-abc')]);
    eq(b.adoptados.length, 0, 'no se crea nada nuevo');
    eq(b.guardados.size, 1, 'sigue habiendo una sola copia');
  });

  it('y si vuelve a fallar, sigue habiendo una sola', async () => {
    const copia = existente();
    const b = banco({
      existentes: [copia],
      cloudStateOf: () => 'new',
      sync: async () => ({ ok: false, message: 'Se cortó otra vez.' }),
    });

    eq((await retrySharedCopy(copia, b.deps)).state, 'local-only');
    eq((await retrySharedCopy(copia, b.deps)).state, 'local-only');
    eq(b.guardados.size, 1);
    eq(b.adoptados.length, 0);
  });

  it('dos reintentos seguidos no mandan lo mismo dos veces', async () => {
    let soltar = () => {};
    const esperando = new Promise<void>((resolve) => {
      soltar = resolve;
    });
    const copia = existente();
    const b = banco({
      existentes: [copia],
      cloudStateOf: () => 'new',
      sync: async () => {
        await esperando;
        return { ok: true, message: 'Guardado' };
      },
    });

    const primero = retrySharedCopy(copia, b.deps);
    eq(await retrySharedCopy(copia, b.deps), { state: 'busy' });
    soltar();
    eq((await primero).state, 'saved');
    eq(b.subidos.length, 1);
  });

  it('sin sesión no se reintenta nada', async () => {
    const copia = existente();
    const b = banco({ existentes: [copia], signedIn: false });
    eq(await retrySharedCopy(copia, b.deps), { state: 'needs-account' });
    eq(b.subidos.length, 0);
  });

  it('la segunda copia voluntaria no pisa a la primera', async () => {
    const primera = existente();
    const b = banco({ existentes: [primera] });
    await saveSharedCopy(COMPARTIDO, b.deps, 2);

    eq(b.guardados.get(idDe('original-abc')), primera, 'intacta');
    eq(b.guardados.has('copia-original-abc-2'), true, 'y la nueva, aparte');
    eq(b.guardados.size, 2);
  });
});
