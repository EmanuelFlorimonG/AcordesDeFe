import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { extractUniqueChords, parseSongSections } from '../src/utils/chordParser';
import { getSongSeasons } from '../src/utils/liturgicalSeasons';
import { songToDraft } from '../src/catalog/songDraft';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import { songFromRow, songToRow } from '../src/catalog/supabaseSongRepository';
import type { Song, SongSection } from '../src/types/song';

/**
 * «Tú en mí, yo en ti», de Vale Montes.
 *
 * La canción está preparada pero todavía no entra en el cancionero: su letra
 * y la transcripción de acordes son de otros, y el cancionero es público. La
 * ficha se monta con `scripts/tu-en-mi-yo-en-ti.py`, que lee el PDF del coro
 * y coloca cada acorde sobre su sílaba; aquí no hay ni una palabra de la
 * letra, solo lo que debe cumplirse cuando la ficha exista.
 *
 * Mientras no esté, estas pruebas se saltan y lo dicen. El día que la canción
 * entre, empiezan a correr solas y vigilan lo que se decidió:
 *
 *   * los acordes son los cuatro del PDF, y ninguno más;
 *   * la segunda mitad del primer verso lleva los acordes del segundo, que es
 *     donde esas mismas frases aparecen escritas con ellos;
 *   * los dos coros repetidos se resuelven como repetición, con su letra;
 *   * la coda se queda sin acordes, pendiente de revisión musical.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`tuEnMiYoEnTi.test: ${checks} comprobaciones`));

const CANCION: Song | null = MOCK_SONGS.find((song) => song.id === 'tu-en-mi-yo-en-ti') ?? null;
const PENDIENTE = CANCION
  ? undefined
  : 'tu-en-mi-yo-en-ti todavía no está en el cancionero: falta la autorización para publicar su letra.';

/** Una prueba que espera a que la canción exista. */
const prueba = (nombre: string, fn: () => void) => it(nombre, { skip: PENDIENTE }, fn);

const SECCIONES: SongSection[] = CANCION ? parseSongSections(CANCION.content) : [];

/** Los acordes de una sección, en el orden en que se tocan. */
const acordesDe = (seccion: SongSection | undefined): string[] =>
  (seccion?.lines ?? []).flatMap((line) => (line.segments ?? []).flatMap((s) => (s.chord ? [s.chord] : [])));

const porEtiqueta = (etiqueta: string, cual = 0): SongSection | undefined =>
  SECCIONES.filter((seccion) => seccion.header?.label === etiqueta)[cual];

// --- La ficha ---------------------------------------------------------------

describe('La canción está en el cancionero con lo que se decidió', () => {
  prueba('con su título y su intérprete', () => {
    eq(CANCION!.title, 'Tú en mí, yo en ti');
    eq(CANCION!.artist, 'Vale Montes');
    eq(CANCION!.year, '2023');
  });

  prueba('se canta en la comunión, y también después', () => {
    eq(CANCION!.categories, ['Comunión', 'PostComunión']);
  });

  prueba('en cualquier tiempo del año', () => {
    eq(getSongSeasons(CANCION!), ['todo-el-ano']);
  });

  prueba('en Sol, sin cejilla ni tempo inventados', () => {
    eq(CANCION!.originalKey, 'G');
    eq(CANCION!.recommendedCapo, undefined, 'el PDF no da cejilla');
    eq(CANCION!.tempo, undefined, 'ni tempo');
  });

  prueba('y pasa la validación con la que entra a la base de datos', () => {
    eq(validateSongDraft(songToDraft(CANCION!)).ok, true);
  });

  prueba('va y vuelve idéntica por la fila de Supabase', () => {
    assert.deepStrictEqual(songFromRow(songToRow(CANCION!)), CANCION);
    checks++;
  });
});

// --- Los acordes ------------------------------------------------------------

describe('Los acordes son los cuatro del PDF, y ninguno más', () => {
  prueba('G, C, D y Em: el I, el IV, el V y el vi de Sol', () => {
    eq([...CANCION!.chordsUsed].sort(), ['C', 'D', 'Em', 'G']);
  });

  prueba('los declarados son exactamente los que aparecen en la letra', () => {
    eq([...CANCION!.chordsUsed].sort(), [...extractUniqueChords(CANCION!.content)].sort());
  });

  prueba('no se coló ningún acorde ajeno a la transcripción', () => {
    for (const acorde of extractUniqueChords(CANCION!.content)) {
      eq(['G', 'C', 'D', 'Em'].includes(acorde), true, acorde);
    }
  });
});

// --- La estructura ----------------------------------------------------------

describe('La estructura es la del PDF', () => {
  prueba('verso, coro, verso, coro, cierre, coro y coda', () => {
    eq(SECCIONES.map((seccion) => seccion.header?.label), [
      'Verso 1',
      'Coro',
      'Verso 2',
      'Coro',
      'Final',
      'Coro',
      'Coda',
    ]);
  });

  prueba('el coro se escribe una vez y vuelve dos, con su letra entera', () => {
    const escrito = porEtiqueta('Coro', 0)!;
    for (const cual of [1, 2]) {
      const repetido = porEtiqueta('Coro', cual)!;
      eq(repetido.repeatOf, escrito.id, `la repetición ${cual}`);
      eq(repetido.lines, escrito.lines, 'las mismas líneas, no una frase que las sustituya');
      eq(repetido.id === escrito.id, false, 'cada aparición conserva su id');
    }
  });

  prueba('y por eso el coro final suena con los acordes del coro, no sin ellos', () => {
    eq(acordesDe(porEtiqueta('Coro', 2)), acordesDe(porEtiqueta('Coro', 0)));
    eq(acordesDe(porEtiqueta('Coro', 2)).length > 0, true);
  });
});

// --- Dónde cae cada acorde --------------------------------------------------

describe('Cada sección toca lo que dice el PDF', () => {
  prueba('el primer verso empieza en la tónica, como está escrito', () => {
    eq(acordesDe(porEtiqueta('Verso 1')).slice(0, 4), ['G', 'C', 'G', 'D']);
  });

  prueba('y el segundo empieza en la subdominante, que es la otra cosa que dice', () => {
    // No es un descuido de la transcripción: los dos versos arrancan distinto.
    eq(acordesDe(porEtiqueta('Verso 2')).slice(0, 3), ['C', 'G', 'D']);
  });

  prueba('la segunda mitad del primer verso copia la del segundo', () => {
    // Son las mismas frases, así que son los mismos acordes. Es lo único que
    // se completó, y se completó con lo que el propio PDF ya decía.
    const primero = acordesDe(porEtiqueta('Verso 1'));
    const segundo = acordesDe(porEtiqueta('Verso 2'));
    eq(primero.slice(4), segundo.slice(3), 'de la cuarta línea en adelante, iguales');
  });

  prueba('el coro va Em C G D, y acaba con el giro al verso', () => {
    const coro = acordesDe(porEtiqueta('Coro'));
    eq(coro.slice(0, 3), ['C', 'G', 'D'], 'la primera frase');
    eq(coro.slice(3, 7), ['Em', 'C', 'G', 'D'], 'y de ahí en adelante');
    eq(coro.slice(-3), ['C', 'G', 'D'], 'el giro que lleva al verso');
  });

  prueba('el cierre son dos frases sobre C G D', () => {
    eq(acordesDe(porEtiqueta('Final')), ['C', 'G', 'D', 'C', 'G', 'D']);
  });

  prueba('la coda se queda sin acordes, a propósito', () => {
    // El PDF no da ninguno para la parte hablada. Pendiente de revisión
    // musical: si alguien la toca y los confirma, se añaden entonces.
    eq(acordesDe(porEtiqueta('Coda')), []);
    eq((porEtiqueta('Coda')?.lines ?? []).length > 0, true, 'pero la letra sí está');
  });
});
