import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChordSheet } from '../src/components/SongViewer/ChordSheet';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { extractUniqueChords, parseSongSections } from '../src/utils/chordParser';
import { parseSectionHeader } from '../src/utils/songSections';
import { getSongSeasons } from '../src/utils/liturgicalSeasons';
import { MASS_MOMENTS } from '../src/utils/setlists';
import { songToDraft } from '../src/catalog/songDraft';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import { songFromRow, songToRow } from '../src/catalog/supabaseSongRepository';
import type { Song } from '../src/types/song';

/**
 * «Piedad Clásico» y «Santo Clásico».
 *
 * Son cantos del Ordinario de la misa, y se parecen poco al resto del
 * cancionero: no traen acordes, ni tonalidad, ni autor, ni tempo. No es que
 * falten datos por recoger, es que estos cantos se cantan así, y el modelo
 * los admite enteros: sólo el título y la letra son obligatorios. Aquí se
 * comprueba justamente eso, que la ficha esté completa sin nada inventado.
 *
 * Lo que sí traen son repeticiones, y ahí está lo delicado. El cancionero
 * las escribe «(x2)» al final de la línea, en minúscula, y nunca duplica el
 * texto. En «Piedad Clásico» la indicación va además en mitad de la frase,
 * antes de «de nosotros», porque lo que se repite es la invocación y no la
 * frase entera. Esa posición es información musical, así que se conserva
 * donde está.
 *
 * El riesgo concreto de escribir letra sin acordes es que el analizador de
 * secciones confunda una línea con una cabecera: lee «(xN)» al final de la
 * línea antes de decidir, y una línea que empezara por «Coro» o «Final» se
 * convertiría en una llamada a otra sección y dejaría de cantarse. Por eso
 * cada línea de las dos canciones se comprueba contra el analizador real.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`cantosDelOrdinario.test: ${checks} comprobaciones`));

const PIEDAD = MOCK_SONGS.find((song) => song.id === 'piedad-clasico') as Song;
const SANTO = MOCK_SONGS.find((song) => song.id === 'santo-clasico') as Song;
const LOS_DOS: Array<[string, Song]> = [
  ['piedad-clasico', PIEDAD],
  ['santo-clasico', SANTO],
];

/** Las líneas cantadas, sin las vacías. */
const versosDe = (song: Song) => song.content.split('\n').map((l) => l.trim()).filter(Boolean);

const TEMPORADAS = ['adviento', 'navidad', 'tiempo-ordinario', 'cuaresma', 'pascua'];

// --- Las fichas -------------------------------------------------------------

describe('Los dos cantos están en el cancionero', () => {
  it('con su título y su categoría, que son momentos reales de la misa', () => {
    eq(PIEDAD.title, 'Piedad Clásico');
    eq(PIEDAD.categories, ['Piedad']);
    eq(SANTO.title, 'Santo Clásico');
    eq(SANTO.categories, ['Santo']);
    for (const [id, song] of LOS_DOS) {
      eq(MASS_MOMENTS.includes(song.categories[0]), true, `${id}: su categoría es un momento de la misa`);
    }
  });

  it('en los cinco tiempos del año, sin el Triduo, como los demás del Ordinario', () => {
    // El Triduo se deja fuera a propósito: es lo que hacen los diez cantos de
    // Piedad y de Santo que ya estaban, y esos días tienen su propia música.
    for (const [id, song] of LOS_DOS) {
      eq(getSongSeasons(song), TEMPORADAS, id);
      eq(getSongSeasons(song).includes('triduo-pascual'), false, `${id}: sin Triduo`);
      eq(getSongSeasons(song).includes('todo-el-ano'), false, `${id}: ni «todo el año»`);
    }
  });

  it('sin acordes, autor, tonalidad, capotraste, tempo ni compás: nada de eso se inventa', () => {
    for (const [id, song] of LOS_DOS) {
      eq(song.chordsUsed, [], id);
      eq(extractUniqueChords(song.content), [], `${id}: tampoco hay ninguno escondido en la letra`);
      eq(song.artist, undefined, id);
      eq(song.originalKey, undefined, id);
      eq(song.recommendedCapo, undefined, id);
      eq(song.tempo, undefined, id);
      eq(song.timeSignature, undefined, id);
      eq(song.year, undefined, id);
    }
  });

  it('y aun así pasan la validación y vuelven idénticas de la base de datos', () => {
    // Sólo el título y la letra son obligatorios: un canto sin música escrita
    // es una canción completa, no una ficha a medias.
    for (const [id, song] of LOS_DOS) {
      eq(validateSongDraft(songToDraft(song)).ok, true, id);
      assert.deepStrictEqual(songFromRow(songToRow(song)), song, id);
      checks++;
    }
  });
});

// --- La letra ---------------------------------------------------------------

describe('La letra es la que se cantó, con sus repeticiones donde van', () => {
  it('Piedad: las tres invocaciones, con el (x3) en mitad de la frase', () => {
    eq(versosDe(PIEDAD), [
      'Señor ten piedad (x3) de nosotros',
      'Cristo ten piedad (x3) de nosotros',
      'Señor ten piedad (x3) de nosotros',
    ]);
  });

  it('Santo: las cuatro estrofas, con su (x2) al final de la línea', () => {
    eq(versosDe(SANTO), [
      'Santo es el Señor mi Dios digno de alabanza',
      'A Él, el poder, el honor y la gloria (x2)',
      'Osanna',
      'Osanna',
      'Osanna oh Señor (x2)',
      'Bendito el que viene en nombre del Señor',
      'Con todos sus santos, cantamos para ti (x2)',
      'Osanna',
      'Osanna',
      'Osanna oh Señor (x2)',
    ]);
    eq(SANTO.content.split('\n\n').length, 4, 'cuatro bloques separados por una línea en blanco');
  });

  it('en Piedad la marca va dentro de la frase; en Santo, al final', () => {
    // No es un capricho de formato. En Piedad lo que se repite es la
    // invocación —«Señor ten piedad» tres veces— y luego se canta «de
    // nosotros» una sola vez; la marca puesta al final diría otra cosa. En
    // Santo se repite la línea entera, y ahí su sitio es el final.
    for (const verso of versosDe(PIEDAD)) {
      const marca = verso.indexOf('(x3)');
      eq(marca > 0, true, `${verso}: lleva su marca`);
      eq(verso.endsWith('(x3)'), false, `${verso}: y no al final`);
      eq(verso.slice(marca + 4).trim(), 'de nosotros', verso);
    }
    for (const verso of versosDe(SANTO).filter((v) => v.includes('(x'))) {
      eq(verso.endsWith('(x2)'), true, verso);
    }
  });

  it('en minúscula y entre paréntesis, como todo el cancionero', () => {
    for (const [id, song] of LOS_DOS) {
      eq(/\(X\d+\)/.test(song.content), false, `${id}: nunca con X mayúscula`);
      eq(song.content.includes('//'), false, `${id}: ni con la otra notación`);
      for (const marca of song.content.matchAll(/\(x\d+\)/g)) {
        eq(['(x2)', '(x3)'].includes(marca[0]), true, `${id}: ${marca[0]}`);
      }
    }
  });
});

// --- El analizador ----------------------------------------------------------

describe('Ninguna línea se confunde con una cabecera de sección', () => {
  it('ni siquiera las que acaban en (xN), que es cuando el analizador duda', () => {
    // El analizador recorta un «(xN)» final antes de mirar la primera
    // palabra. Si alguna de estas líneas empezara por «Coro» o «Final»,
    // dejaría de ser letra y se convertiría en una llamada a otra sección.
    for (const [id, song] of LOS_DOS) {
      for (const [i, linea] of song.content.split('\n').entries()) {
        eq(parseSectionHeader(linea), null, `${id} línea ${i + 1}: ${linea}`);
      }
    }
  });

  it('así que cada canto es un solo bloque sin nombre, todo cantado', () => {
    for (const [id, song] of LOS_DOS) {
      const secciones = parseSongSections(song.content);
      eq(secciones.length, 1, `${id}: una sola sección`);
      eq(secciones[0].header, null, `${id}: sin cabecera`);
      eq(secciones[0].repeatOf, undefined, `${id}: no repite a ninguna otra`);
    }
  });
});

// --- La hoja ----------------------------------------------------------------

describe('La hoja se lee igual con acordes y sin ellos', () => {
  const hoja = (song: Song, showChords: boolean) =>
    renderToStaticMarkup(
      createElement(ChordSheet, { content: song.content, fontSize: 'base', twoColumns: false, showChords })
    );

  it('la letra entera aparece, y las repeticiones con ella', () => {
    for (const [id, song] of LOS_DOS) {
      const sin = hoja(song, false);
      for (const verso of versosDe(song)) {
        eq(sin.includes(verso), true, `${id}: ${verso}`);
      }
    }
  });

  it('esconder los acordes no cambia nada, porque no hay ninguno', () => {
    // La prueba de que son cantos sin música escrita: el botón de acordes no
    // tiene nada que esconder ni que mostrar.
    for (const [id, song] of LOS_DOS) {
      eq(hoja(song, true).includes('Ver diagrama de'), false, `${id}: ningún acorde pulsable`);
      eq(hoja(song, false).includes('Ver diagrama de'), false, id);
    }
  });

  it('y el (x3) de Piedad se ve donde está, en mitad de la frase', () => {
    const sin = hoja(PIEDAD, false);
    eq(sin.includes('Señor ten piedad (x3) de nosotros'), true);
    eq(sin.includes('Señor ten piedad de nosotros (x3)'), false, 'no se movió al final');
  });
});
