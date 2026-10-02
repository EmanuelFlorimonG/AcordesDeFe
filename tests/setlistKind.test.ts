import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import {
  ADORATION_MOMENTS,
  MASS_MOMENTS,
  createSetlist,
  liveModeName,
  duplicateSetlist,
  momentsFor,
  suggestedMoments,
  updateSetlistDetails,
} from '../src/utils/setlists';
import {
  SETLIST_STORAGE_KEY,
  createLocalSetlistRepository,
  sanitizeSetlist,
} from '../src/storage/setlistStorage';
import { cloudToSetlist, setlistToCloud } from '../src/storage/cloudSetlists';
import { portableFingerprint } from '../src/storage/setlistSync';
import { buildSetlistDocument } from '../src/utils/setlistExport';

/**
 * De qué celebración es un Setlist.
 *
 * Una misa y una adoración se preparan igual: las mismas canciones, el mismo
 * orden, los mismos tonos y arreglos. Lo único que cambia es cómo se llaman
 * sus partes. Por eso esto es una palabra y no un segundo sistema.
 *
 * Lo que de verdad hay que vigilar es lo de siempre: que los Setlists que ya
 * existían no se enteren de nada. Eran misas sin decirlo, lo siguen siendo, y
 * ni lo que guardan ni lo que viaja ni lo que la nube tenía apuntado cambia
 * por esto.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistKind.test: ${checks} comprobaciones`));

/** El código sin sus comentarios: lo que hace, no lo que cuenta. */
const sinComentarios = (ruta: string) =>
  readFileSync(ruta, 'utf8')
    .replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*/g, '');

const NOW = Date.UTC(2026, 9, 11, 12);
const idSequence = (prefix = 'id') => {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
};

const crear = (kind?: 'misa' | 'adoracion') =>
  createSetlist({ name: 'Misa del domingo', date: '2026-10-11', kind }, { now: NOW, createId: idSequence() });

const memoryStorage = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial));
  return { data, getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
};

// --- Qué se guarda ---------------------------------------------------------

describe('Crear un Setlist de cada clase', () => {
  it('una misa no dice que lo es: es lo que fueron siempre', () => {
    const misa = crear('misa');
    eq(misa.kind, undefined);
    eq('kind' in misa, false, 'la propiedad ni siquiera está');
    eq(crear().kind, undefined, 'y sin elegir nada, tampoco');
  });

  it('una adoración sí lo dice', () => {
    eq(crear('adoracion').kind, 'adoracion');
  });

  it('cualquier otra cosa no es un tipo', () => {
    for (const basura of ['vigilia', '', 'MISA', 'adoración', 42, null, {}]) {
      const setlist = createSetlist(
        { name: 'Lo que sea', kind: basura as never },
        { now: NOW, createId: idSequence() }
      );
      eq(setlist.kind, undefined, JSON.stringify(basura));
    }
  });

  it('duplicar una adoración da otra adoración', () => {
    const copia = duplicateSetlist(crear('adoracion'), { name: 'Otra vez' }, { now: NOW, createId: idSequence('c') });
    eq(copia.kind, 'adoracion');
    eq(duplicateSetlist(crear('misa'), {}, { now: NOW, createId: idSequence('c') }).kind, undefined);
  });

  it('editar nombre y fecha no cambia de qué es', () => {
    const adoracion = crear('adoracion');
    eq(updateSetlistDetails(adoracion, { name: 'Adoración del jueves' }, NOW + 1).kind, 'adoracion');
    const misa = crear('misa');
    // Ni siquiera pidiéndolo: el formulario de editar no manda el tipo, y si
    // llegara, cambiarlo renombraría momentos que alguien ya escribió.
    eq(updateSetlistDetails(misa, { name: 'X', kind: 'adoracion' } as never, NOW + 1).kind, undefined);
  });
});

describe('Lo que ya estaba guardado sigue significando lo mismo', () => {
  it('un Setlist sin tipo es una misa', () => {
    const viejo = sanitizeSetlist({ id: 'viejo', name: 'Vigilia', items: [], createdAt: NOW, updatedAt: NOW }, NOW);
    eq(viejo?.kind, undefined);
    eq(momentsFor(viejo?.kind), MASS_MOMENTS);
  });

  it('un tipo inventado en el almacenamiento se ignora', () => {
    const raro = sanitizeSetlist({ id: 'raro', name: 'X', kind: 'vigilia', items: [], createdAt: NOW, updatedAt: NOW }, NOW);
    eq(raro?.kind, undefined);
  });

  it('se guarda y vuelve tal cual, de las dos clases', () => {
    const storage = memoryStorage();
    const repositorio = createLocalSetlistRepository(storage);
    repositorio.save([crear('adoracion'), { ...crear('misa'), id: 'la-misa' }]);

    const leidos = createLocalSetlistRepository(storage).load().setlists;
    eq(leidos.length, 2);
    eq(leidos[0].kind, 'adoracion');
    eq(leidos[1].kind, undefined);
    // Y lo escrito no mete nada en los de siempre.
    eq((storage.data.get(SETLIST_STORAGE_KEY) ?? '').includes('"kind":"adoracion"'), true);
    eq((storage.data.get(SETLIST_STORAGE_KEY) ?? '').includes('"kind":"misa"'), false);
  });

  it('una lista de antes, sin versión y sin tipo, se lee entera', () => {
    const storage = memoryStorage({
      [SETLIST_STORAGE_KEY]: JSON.stringify([
        { id: 'old', name: 'Vigilia', createdAt: NOW, items: [{ songId: 'huracan-hakuna' }] },
      ]),
    });
    const { setlists } = createLocalSetlistRepository(storage).load();
    eq(setlists.length, 1);
    eq(setlists[0].kind, undefined);
    eq(setlists[0].items.length, 1, 'y con sus canciones');
  });
});

// --- Qué momentos se ofrecen ----------------------------------------------

describe('Cada clase ofrece sus partes', () => {
  it('la misa, en el orden en que se canta', () => {
    eq(momentsFor('misa'), [
      'Entrada',
      'Piedad',
      'Gloria',
      'Aclamación',
      'Ofertorio',
      'Santo',
      'Cordero',
      'Comunión',
      'PostComunión',
      'Salida',
    ]);
    eq(MASS_MOMENTS.includes('Paz'), false, 'la Paz deja de ofrecerse');
  });

  it('la adoración, los suyos', () => {
    eq(momentsFor('adoracion'), [
      'Entrada del Señor',
      'Momento de alabanza',
      'Peticiones al Espíritu Santo',
      'Momento de gracia',
      'Procesión',
      'Salida',
    ]);
  });

  it('sin decir nada, los de la misa', () => {
    eq(momentsFor(undefined), MASS_MOMENTS);
  });

  it('y detrás, lo que no es ninguna de las dos cosas', () => {
    const adoracion = suggestedMoments('adoracion');
    eq(adoracion.slice(0, ADORATION_MOMENTS.length), ADORATION_MOMENTS, 'primero lo que se prepara');
    for (const extra of ['Apertura', 'Reflexión', 'Dinámica', 'Cierre']) {
      eq(adoracion.includes(extra), true, extra);
    }
    eq(new Set(adoracion).size, adoracion.length, 'sin repetir «Salida»');
    eq(suggestedMoments('misa').includes('Paz'), false);
  });

  it('los nombres de la adoración no son categorías de canción', () => {
    // Una canción vale para la alabanza de una adoración y para la comunión de
    // una misa sin tener que llamarse de otra forma.
    const estilos = readFileSync('src/utils/categoryStyle.ts', 'utf8');
    for (const momento of ADORATION_MOMENTS) {
      if (momento === 'Salida') continue;
      eq(estilos.includes(`'${momento}'`), false, momento);
    }
  });
});

// --- Qué viaja a la cuenta -------------------------------------------------

describe('Lo que viaja a la cuenta', () => {
  it('una adoración lleva su palabra; una misa manda null', () => {
    eq(setlistToCloud(crear('adoracion'), 1).kind, 'adoracion');
    eq(setlistToCloud(crear('misa'), 1).kind, null, 'lo mismo que tienen las filas de antes');
  });

  const fila = (extra: Record<string, unknown> = {}) => ({
    id: 'setlist-1',
    name: 'Misa del domingo',
    date: '2026-10-11',
    description: '',
    items: [],
    payload_version: 1,
    revision: 3,
    client_created_at: new Date(NOW).toISOString(),
    client_updated_at: new Date(NOW).toISOString(),
    ...extra,
  });

  it('y vuelve igual', () => {
    const leido = cloudToSetlist(fila({ kind: 'adoracion' }));
    eq(leido.state, 'setlist');
    if (leido.state !== 'setlist') return;
    eq(leido.setlist.kind, 'adoracion');
  });

  it('una fila de antes, sin la columna, es una misa', () => {
    for (const valor of [{}, { kind: null }, { kind: '' }, { kind: 'misa' }, { kind: 'vigilia' }, { kind: 7 }]) {
      const leido = cloudToSetlist(fila(valor));
      eq(leido.state, 'setlist', JSON.stringify(valor));
      if (leido.state !== 'setlist') continue;
      eq(leido.setlist.kind, undefined, JSON.stringify(valor));
    }
  });

  it('la columna se pide por su nombre, como las demás', () => {
    const codigo = readFileSync('src/storage/cloudSetlists.ts', 'utf8');
    eq(/const COLUMNS =\s*\n?\s*'id,name,kind,/.test(codigo.replace(/\r\n/g, '\n')), true);
  });

  it('y existe en la base de datos, sin tocar nada más', () => {
    const sql = readFileSync('supabase/migrations/20261001130000_setlist_kind.sql', 'utf8').replace(/\r\n/g, '\n');
    eq(sql.includes('add column if not exists kind text'), true);
    eq(sql.includes("check (kind is null or kind in ('misa', 'adoracion'))"), true);
    // Ni datos, ni políticas, ni permisos de más. Lo único que se tira es la
    // función, para volver a levantarla con una columna más.
    for (const prohibido of ['delete from', 'alter policy', 'grant all', 'drop table', 'drop policy', 'truncate']) {
      eq(sql.toLowerCase().includes(prohibido), false, prohibido);
    }
    eq((sql.match(/^drop /gm) ?? []).length, 1, 'un solo drop');
    eq(sql.includes('drop function if exists public.shared_setlist(text);'), true);
    // Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta.
    eq(sql.replace(/^\s*--.*$/gm, '').includes('cascade'), false, 'sin arrastrar nada por delante');
  });

  it('y se puede ejecutar aunque un intento anterior se quedara a medias', () => {
    const sql = readFileSync('supabase/migrations/20261001130000_setlist_kind.sql', 'utf8');
    // Entera o nada.
    eq(/^begin;$/m.test(sql), true);
    eq(sql.trimEnd().endsWith('commit;'), true);
    // La columna puede existir ya, y entonces su restricción también: se mira
    // si está antes de ponerla, y se busca por lo que dice, no por su nombre.
    eq(sql.includes('add column if not exists'), true);
    eq(sql.includes("pg_get_constraintdef(oid) ilike '%kind%adoracion%'"), true);
    eq(sql.includes('drop function if exists'), true);
  });

  it('y comprueba al final que quedó como tenía que quedar', () => {
    const sql = readFileSync('supabase/migrations/20261001130000_setlist_kind.sql', 'utf8');
    for (const comprobacion of [
      'La columna setlists.kind no existe',
      'setlists.kind no tiene restricción de valores',
      'public.shared_setlist(text) no existe',
      'shared_setlist no devuelve kind',
      'shared_setlist devuelve columnas internas',
      'shared_setlist perdió security definer',
      'shared_setlist no fija search_path',
      'shared_setlist tiene un search_path abierto',
      'anon no puede ejecutar shared_setlist',
      'authenticated no puede ejecutar shared_setlist',
      'shared_setlist sigue abierta a PUBLIC',
    ]) {
      eq(sql.includes(comprobacion), true, comprobacion);
    }
  });
});

describe('Compartir un Setlist lleva de qué es', () => {
  it('la función pública devuelve el tipo', () => {
    const sql = readFileSync('supabase/migrations/20261001130000_setlist_kind.sql', 'utf8').replace(/\r\n/g, '\n');
    // Se recrea entera: añadir una columna al resultado cambia su forma, y
    // eso `create or replace` no lo hace.
    eq(sql.includes('create function public.shared_setlist(share_token text)'), true);
    eq(sql.includes('create or replace function public.shared_setlist'), false);
    eq(/returns table \([\s\S]*?\n  kind text,/.test(sql), true, 'entre las columnas que devuelve');
    eq(sql.includes('select s.id, s.name, s.kind,'), true);
    // Y sigue sin devolver ni el dueño ni los relojes del servidor.
    eq(sql.includes('owner_id,'), false);
    eq(sql.includes('security definer'), true, 'sigue siendo la misma puerta');
    eq(sql.includes('stable'), true, 'y sigue sin escribir');
    eq(sql.includes("set search_path = ''"), true);
    // El camino cerrado se comprueba por lo que es, no por cómo se escribe:
    // `search_path` es un parámetro de lista, así que PostgreSQL guarda un
    // camino vacío como `search_path=""`. Preguntarle a `proconfig` por la
    // cadena exacta era frágil, y falló.
    eq(sql.includes('pg_options_to_table(p.proconfig)'), true);
    eq(sql.includes("o.option_name = 'search_path'"), true);
    eq(sql.includes("proconfig @> array["), false, 'ni una comparación de cadenas');
    eq(sql.includes("where share_token ~ '^[0-9a-f]{32}$'"), true, 'sólo se entra con el token');
    eq(sql.includes('s.deleted_at is null'), true, 'y un Setlist borrado deja el enlace mudo');
    // Tirar la función se lleva sus permisos: se vuelven a dar los mismos.
    eq(sql.includes('revoke all on function public.shared_setlist(text) from public;'), true);
    eq(sql.includes('grant execute on function public.shared_setlist(text) to anon, authenticated;'), true);
  });

  it('quien abre el enlace ve una adoración como adoración', () => {
    const leido = cloudToSetlist({
      id: 'setlist-1',
      name: 'Adoración del jueves',
      kind: 'adoracion',
      date: '',
      description: '',
      items: [],
      payload_version: 1,
      revision: 1,
      client_created_at: new Date(NOW).toISOString(),
      client_updated_at: new Date(NOW).toISOString(),
    });
    eq(leido.state === 'setlist' && leido.setlist.kind, 'adoracion');
  });
});

// --- Qué pasa con lo que ya estaba sincronizado ---------------------------

describe('Nadie ve sus Setlists cambiados sin haber tocado nada', () => {
  const base: Setlist = {
    id: 'setlist-1',
    name: 'Misa del domingo',
    date: '2026-10-11',
    description: '',
    participantIds: [],
    items: [],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('una misa deja la misma huella que antes de que existieran los tipos', () => {
    // Si la huella cambiara, cada Setlist ya guardado en la cuenta aparecería
    // como «con cambios» sin que nadie hubiera tocado nada.
    eq(portableFingerprint({ ...base, kind: 'misa' }), portableFingerprint(base));
    eq(portableFingerprint({ ...base, kind: undefined }), portableFingerprint(base));
  });

  it('una adoración deja una huella distinta', () => {
    eq(portableFingerprint({ ...base, kind: 'adoracion' }) === portableFingerprint(base), false);
  });
});

// --- Qué pasa en las pantallas que ya existían ----------------------------

describe('Las pantallas de siempre sirven para las dos', () => {
  const song = (id: string, title: string): Song =>
    ({ id, title, artist: 'Quien sea', categories: [], tags: [], content: '[G]Una letra', chordsUsed: ['G'] }) as unknown as Song;
  const songsById = new Map([
    ['a', song('a', 'Una canción')],
    ['b', song('b', 'Otra canción')],
  ]);

  const adoracion: Setlist = {
    id: 'adoracion-1',
    kind: 'adoracion',
    name: 'Adoración del jueves',
    date: '2026-10-15',
    description: '',
    participantIds: [],
    items: [
      { id: 'i1', songId: 'a', moment: 'Entrada del Señor', transposeSteps: 0, capoFret: 0, notes: '' },
      { id: 'i2', songId: 'b', moment: 'Peticiones al Espíritu Santo', transposeSteps: 2, capoFret: 0, notes: '' },
    ],
    createdAt: NOW,
    updatedAt: NOW,
  };

  it('las hojas para imprimir agrupan por el momento que sea', () => {
    const documento = buildSetlistDocument(adoracion, songsById);
    // El momento va en versales en la hoja, que es como se imprime.
    eq(documento.moments.map((momento) => momento.moment), ['ENTRADA DEL SEÑOR', 'PETICIONES AL ESPÍRITU SANTO']);
    eq(documento.entries.length, 2);
    eq(documento.entries[0].title, 'Una canción');
    // Ni una palabra de la misa se cuela en una adoración.
    for (const momento of documento.moments) {
      eq(MASS_MOMENTS.some((parte) => parte.toUpperCase() === momento.moment), false, momento.moment);
    }
  });

  it('y no hay nada que asuma que un grupo es una parte de la misa', () => {
    for (const ruta of [
      'src/utils/setlistExport.ts',
      'src/components/Setlists/SetlistPrintSheet.tsx',
      'src/components/Setlists/SetlistSingersSheet.tsx',
    ]) {
      eq(sinComentarios(ruta).includes('MASS_MOMENTS'), false, ruta);
    }
  });

  it('una canción que este dispositivo no conoce no rompe la hoja', () => {
    // Las canciones retiradas del cancionero pueden seguir nombradas en
    // un Setlist viejo: se dice que no está, y lo demás se imprime igual.
    for (const songId of ['pescador-de-hombres', 'forajidos-hakuna']) {
      const conHueco: Setlist = {
        ...adoracion,
        items: [{ id: 'i1', songId, moment: 'Procesión', transposeSteps: 0, capoFret: 0, notes: '' }],
      };
      const documento = buildSetlistDocument(conHueco, songsById);
      eq(documento.entries.length, 1);
      eq(documento.entries[0].content, '', 'la canción no está en este dispositivo');
      eq(documento.moments.length, 1, 'y la hoja se arma igual');
      eq(documento.entries[0].missing, true);
      eq(documento.entries[0].title, 'Canción no disponible');
      eq(conHueco.items[0].songId, songId, 'la referencia original se conserva');
    }
  });
});

// --- Cómo se llama el modo en vivo ----------------------------------------

describe('El modo en vivo se llama como la celebración', () => {
  it('una adoración no se llama Misa', () => {
    eq(liveModeName('adoracion'), 'Modo Adoración');
    eq(liveModeName('misa'), 'Modo Misa');
    eq(liveModeName(undefined), 'Modo Misa', 'y los de antes, tampoco cambian');
  });

  it('es el mismo modo: una sola pantalla y un solo camino', () => {
    // Ni un componente duplicado ni una ruta paralela: lo único que cambia es
    // la palabra, y viene del Setlist que se está tocando.
    const modo = sinComentarios('src/components/Mass/MassMode.tsx');
    eq(modo.includes('const modeName = liveModeName(setlist.kind);'), true);
    eq(/Modo (Misa|Adoración)/.test(modo), false, 'ningún nombre escrito a mano');
    eq(existsSync('src/components/Mass/AdorationMode.tsx'), false, 'no hay un segundo modo');
  });

  it('y lo escriben las mismas pantallas de siempre', () => {
    for (const ruta of [
      'src/components/Mass/MassHeader.tsx',
      'src/components/Mass/MassMenu.tsx',
      'src/components/Mass/MassStartScreen.tsx',
      'src/components/Mass/MassSongScreen.tsx',
    ]) {
      const codigo = sinComentarios(ruta);
      eq(codigo.includes('modeName'), true, ruta);
      eq(/Modo Misa/.test(codigo), false, ruta);
    }
  });

  it('desde donde se ofrece entrar, también', () => {
    for (const ruta of ['src/components/Setlists/SetlistDetail.tsx', 'src/components/Calendar/EventDetail.tsx']) {
      eq(sinComentarios(ruta).includes('liveModeName(setlist.kind)'), true, ruta);
    }
  });
});
