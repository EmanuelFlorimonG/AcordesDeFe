import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOCK_SONGS } from '../src/data/mockSongs';
import {
  CATALOG_FIELD_ORDER,
  backupProblems,
  catalogDifferences,
  forBackup,
  orderLikeBundled,
  serializeCatalog,
  serializeSong,
} from '../src/catalog/catalogBackup';
import type { Song } from '../src/types/song';

/**
 * El respaldo del cancionero, probado sin red y sin disco.
 *
 * Lo que se comprueba aquí es que una exportación no pueda estropear el
 * archivo incluido: que escriba exactamente el mismo formato que ya tiene,
 * que dos ejecuciones den los mismos bytes, que ningún campo aprobado se
 * quede por el camino, y que se niegue a escribir cuando lo que llega del
 * remoto no cuadra.
 *
 * Esa última parte es la que de verdad importa. Un exportador que se traga
 * una respuesta incompleta borra canciones del respaldo sin que nadie se
 * entere, y lo hace en silencio, que es la peor manera.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`catalogBackup.test: ${checks} comprobaciones`));

const cancion = (extra: Partial<Song> = {}): Song => ({
  id: 'una-cancion',
  title: 'Una canción',
  categories: ['Comunión'],
  liturgicalSeasons: ['todo-el-ano'],
  tags: [],
  chordsUsed: ['G'],
  content: '[G]Una letra',
  ...extra,
});

// --- El formato -------------------------------------------------------------

describe('El archivo exportado se escribe como el que ya hay', () => {
  it('reproduce el cancionero entero, salvo dos irregularidades escritas a mano', () => {
    // Es la prueba más fuerte que se puede hacer sin red: serializar las 115
    // canciones incluidas tiene que devolver el archivo del que salieron.
    //
    // Las dos excepciones son erratas de formato que alguien dejó al editar a
    // mano: una llave en la columna cero y una coma en su propia línea. El
    // exportador las normaliza, y es un diff de cuatro líneas la primera vez.
    const real = readFileSync('src/data/mockSongs.ts', 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\n\{\n/g, '\n  {\n')
      .replace(/\n  \}\n,\n/g, '\n  },\n');
    eq(serializeCatalog(MOCK_SONGS.map(forBackup)), real);
  });

  it('los campos van en el orden del archivo, y la letra siempre al final', () => {
    eq(CATALOG_FIELD_ORDER[0], 'id');
    eq(CATALOG_FIELD_ORDER[CATALOG_FIELD_ORDER.length - 1], 'content');
    const escrito = serializeSong(cancion({ artist: 'Alguien', originalKey: 'G', year: '2024' }));
    const campos = [...escrito.matchAll(/^ {4}(\w+):/gm)].map((m) => m[1]);
    eq(campos, [...campos].sort((a, b) => CATALOG_FIELD_ORDER.indexOf(a as never) - CATALOG_FIELD_ORDER.indexOf(b as never)));
  });

  it('escapa lo que rompería el archivo: comillas, barras y plantillas', () => {
    const escrito = serializeSong(
      cancion({ title: "Lo que diga el Se'ñor", artist: 'Con \\ barra', content: 'Una `plantilla` con ${algo}' })
    );
    eq(escrito.includes("'Lo que diga el Se\\'ñor'"), true, escrito);
    eq(escrito.includes("'Con \\\\ barra'"), true, escrito);
    eq(escrito.includes('\\`plantilla\\`'), true, escrito);
    eq(escrito.includes('\\${algo}'), true, escrito);
  });

  it('un canto sin acordes ni metadatos se escribe entero igualmente', () => {
    const escrito = serializeSong(cancion({ chordsUsed: [], content: 'Sin acordes' }));
    eq(escrito.includes('chordsUsed: []'), true);
    eq(escrito.includes('tags: []'), true);
    eq(/^ {4}artist:/m.test(escrito), false, 'lo que no hay, no se escribe');
  });
});

// --- El determinismo --------------------------------------------------------

describe('La exportación es determinista', () => {
  it('dos veces los mismos datos, dos veces los mismos bytes', () => {
    const songs = MOCK_SONGS.map(forBackup);
    eq(serializeCatalog(songs), serializeCatalog(songs));
    eq(serializeCatalog(songs), serializeCatalog(songs.map((song) => ({ ...song }))));
  });

  it('y no depende del orden en que el objeto enumera sus claves', () => {
    // Una canción construida al revés tiene que escribirse igual que la
    // normal: el orden lo pone CATALOG_FIELD_ORDER, no el objeto.
    const normal = cancion({ artist: 'Alguien', originalKey: 'G' });
    const alReves = Object.fromEntries(Object.entries(normal).reverse()) as Song;
    eq(serializeSong(alReves), serializeSong(normal));
  });
});

// --- Los metadatos ----------------------------------------------------------

describe('No se pierde ningún dato aprobado', () => {
  it('todos los campos del modelo viajan, incluidos los raros', () => {
    const completa = cancion({
      artist: 'Hakuna Group Music',
      youtubeId: 'P2Kf8RsxuiA',
      originalKey: 'Bb',
      recommendedCapo: 5,
      timeSignature: '6/8',
      tempo: 78,
      difficulty: 'Intermedio',
      year: '2020',
      categories: ['Adoración', 'Hakuna'],
      liturgicalSeasons: ['adviento', 'pascua'],
      tags: ['Favoritas'],
      chordsUsed: ['G', 'D/F#', 'Em7'],
    });
    const escrito = serializeSong(completa);
    for (const [campo, valor] of Object.entries(completa)) {
      eq(escrito.includes(`${campo}:`), true, `falta ${campo}`);
      if (typeof valor === 'string' && campo !== 'content') eq(escrito.includes(valor), true, `falta el valor de ${campo}`);
    }
    eq(escrito.includes("chordsUsed: ['G', 'D/F#', 'Em7']"), true, escrito);
    eq(escrito.includes('recommendedCapo: 5'), true);
    eq(escrito.includes('tempo: 78'), true);
  });

  it('la versión publicada no se guarda: el respaldo no la lleva en ninguna canción', () => {
    // songFromRow la rellena desde current_version, pero ninguna de las 115
    // incluidas la tiene, y caducaría en cuanto alguien editara en producción.
    eq(forBackup(cancion({ version: 7 })).version, undefined);
    eq(MOCK_SONGS.some((song) => song.version !== undefined), false, 'ninguna incluida la lleva hoy');
  });

  it('una cadena vacía se guarda como campo ausente, siempre igual', () => {
    // La base guarda '' como nulo y lo devuelve ausente. Si el exportador
    // escribiera la cadena vacía, el archivo bailaría en cada ejecución.
    const limpia = forBackup(cancion({ artist: '', originalKey: '', youtubeId: '', year: '' }));
    eq([limpia.artist, limpia.originalKey, limpia.youtubeId, limpia.year], [undefined, undefined, undefined, undefined]);
  });
});

// --- El orden ---------------------------------------------------------------

describe('El orden del cancionero se conserva', () => {
  const a = cancion({ id: 'a' });
  const b = cancion({ id: 'b' });
  const c = cancion({ id: 'c' });

  it('las conocidas en su sitio, las nuevas al final', () => {
    eq(orderLikeBundled([c, a, b], ['a', 'b']).map((s) => s.id), ['a', 'b', 'c']);
  });

  it('una que ya no está en el remoto simplemente no aparece', () => {
    // No la inventa: quien decide qué hacer con ella es backupProblems.
    eq(orderLikeBundled([b], ['a', 'b']).map((s) => s.id), ['b']);
  });

  it('con el cancionero entero, el orden no se mueve ni una canción', () => {
    const ids = MOCK_SONGS.map((song) => song.id);
    const alReves = [...MOCK_SONGS].reverse();
    eq(orderLikeBundled(alReves, ids).map((song) => song.id), ids);
  });
});

// --- Cuándo no se exporta ---------------------------------------------------

describe('Se niega a exportar cuando algo no cuadra', () => {
  const incluidas = [cancion({ id: 'a' }), cancion({ id: 'b' })];

  it('si el remoto no devuelve nada', () => {
    const problemas = backupProblems([], incluidas);
    eq(problemas.length, 1);
    eq(problemas[0].includes('vacío'), true, problemas[0]);
  });

  it('si falta una canción que el respaldo sí tiene', () => {
    // El caso que más daño haría: exportar la borraría del respaldo.
    const problemas = backupProblems([cancion({ id: 'a' })], incluidas);
    eq(problemas.length, 1);
    eq(problemas[0].includes('b'), true, problemas[0]);
    eq(problemas[0].includes('borraría'), true, 'y dice por qué importa');
  });

  it('si el remoto trae ids repetidos', () => {
    const problemas = backupProblems([cancion({ id: 'a' }), cancion({ id: 'a' }), cancion({ id: 'b' })], incluidas);
    eq(problemas.some((p) => p.includes('repetidos')), true, problemas.join(' | '));
  });

  it('si alguna canción no pasa la validación del editor', () => {
    const rota = cancion({ id: 'b', content: '' });
    const problemas = backupProblems([cancion({ id: 'a' }), rota], incluidas);
    eq(problemas.some((p) => p.includes('validación')), true, problemas.join(' | '));
  });

  it('y no se queja cuando todo está en su sitio', () => {
    eq(backupProblems([...incluidas, cancion({ id: 'c' })], incluidas), []);
  });
});

// --- El reporte -------------------------------------------------------------

describe('El reporte dice qué cambió y dónde', () => {
  it('campo por campo, con la versión que lo explica', () => {
    const incluida = cancion({ id: 'a', originalKey: 'G', chordsUsed: [] });
    const remota = cancion({ id: 'a', originalKey: 'D', chordsUsed: ['D', 'A'], version: 3 });
    eq(catalogDifferences([remota], [incluida]), [
      { id: 'a', kind: 'distinta', fields: ['originalKey', 'chordsUsed'], version: 3 },
    ]);
  });

  it('distingue la que sólo está en un sitio', () => {
    const a = cancion({ id: 'a' });
    const b = cancion({ id: 'b', version: 1 });
    eq(catalogDifferences([b], [a]), [
      { id: 'a', kind: 'solo-incluida', fields: [] },
      { id: 'b', kind: 'solo-remota', fields: [], version: 1 },
    ]);
  });

  it('no inventa diferencias entre lo ausente y lo vacío', () => {
    const incluida = cancion({ id: 'a' });
    const remota = cancion({ id: 'a', liturgicalSeasons: undefined });
    eq(catalogDifferences([remota], [{ ...incluida, liturgicalSeasons: undefined }]), []);
  });

  it('y calla cuando los dos dicen lo mismo', () => {
    eq(catalogDifferences(MOCK_SONGS.map((s) => ({ ...s })), MOCK_SONGS), []);
  });
});
