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
 * El lote de adoración: cuatro canciones que llegaron solo con su letra.
 *
 * De ninguna de ellas se sabe el tono, ni el tempo, ni el compás, ni la
 * cejilla, y por eso ninguna los tiene: el cancionero prefiere no decir nada
 * antes que decir algo que nadie ha tocado. Lo que sí se decidió, una por
 * una, fue dónde empieza cada sección y qué se repite, y eso es lo que estas
 * pruebas sujetan.
 *
 * Tres cosas se conservan tal cual llegaron, aunque chirríen, porque
 * corregirlas sin una transcripción verificada sería inventarse la canción:
 * «Kyrie Eleison» con sus dos mayúsculas, la súplica por los pueblos
 * oprimidos sin su «Ten piedad» final, y dos versos de Tuyo Es.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`loteAdoracion.test: ${checks} comprobaciones`));

const LOTE = ['inundame-espiritu-santo', 'noche', 'tuyo-es', 'gracias'];
const cancion = (id: string): Song => MOCK_SONGS.find((song) => song.id === id)!;
const secciones = (id: string): SongSection[] => parseSongSections(cancion(id).content);

/** Las etiquetas de las secciones. La del número ya lo lleva dentro. */
const etiquetas = (id: string): string[] =>
  secciones(id).map((seccion) => seccion.header?.label ?? '(sin cabecera)');

/** Las secciones que son una llamada a otra escrita antes. */
const llamadas = (id: string): SongSection[] => secciones(id).filter((seccion) => seccion.repeatOf);

// --- Las cuatro, lo que tienen en común -------------------------------------

describe('Las cuatro entran en el cancionero', () => {
  it('están, con su título y su artista', () => {
    eq(
      LOTE.map((id) => [cancion(id)?.title, cancion(id)?.artist]),
      [
        ['Inúndame (Espíritu Santo)', undefined],
        ['Noche', 'Hakuna Group Music'],
        ['Tuyo Es', 'Eduard Muñoz con Génesis Zabala'],
        ['Gracias', 'Tuyo'],
      ]
    );
  });

  it('Inúndame no tiene artista, y no lo tiene de verdad', () => {
    // Ausente, no vacío: una cadena vacía viaja a Supabase como null y
    // volvería distinta de como se escribió.
    eq('artist' in cancion('inundame-espiritu-santo'), false);
  });

  it('con sus categorías, en el orden del cancionero', () => {
    eq(LOTE.map((id) => cancion(id).categories), [
      ['Adoración'],
      // La litúrgica primero y el estilo después, como las demás de Hakuna:
      // es la primera la que decide la portada.
      ['Adoración', 'Hakuna'],
      ['Adoración'],
      ['Comunión', 'PostComunión'],
    ]);
  });

  it('y se cantan en cualquier tiempo', () => {
    for (const id of LOTE) eq(getSongSeasons(cancion(id)), ['todo-el-ano'], id);
  });

  it('sin un solo dato musical inventado', () => {
    for (const id of LOTE) {
      const song = cancion(id);
      eq(
        [song.chordsUsed, song.originalKey, song.tempo, song.recommendedCapo, song.timeSignature],
        [[], undefined, undefined, undefined, undefined],
        id
      );
      eq(extractUniqueChords(song.content), [], `${id}: ni un acorde en la letra`);
    }
  });

  it('sin barras invertidas: el salto de línea de Markdown no es letra', () => {
    for (const id of LOTE) eq(cancion(id).content.includes('\\'), false, id);
  });

  it('pasan la validación y vuelven idénticas de la fila de Supabase', () => {
    for (const id of LOTE) {
      eq(validateSongDraft(songToDraft(cancion(id))).ok, true, id);
      assert.deepStrictEqual(songFromRow(songToRow(cancion(id))), cancion(id), id);
      checks++;
    }
  });

  it('ninguna llamada se queda sin su letra', () => {
    for (const id of LOTE) {
      for (const seccion of secciones(id)) {
        const vacia = seccion.header && seccion.header.kind !== 'otro' && seccion.lines.length === 0;
        eq(Boolean(vacia), false, `${id} · ${seccion.header?.label}`);
      }
    }
  });
});

// --- Inúndame ---------------------------------------------------------------

describe('Inúndame llegó sin cabeceras, y se le pusieron', () => {
  it('coro, su repetición, puente y final', () => {
    eq(etiquetas('inundame-espiritu-santo'), ['Coro', 'Coro', 'Puente', 'Final']);
  });

  it('el coro se canta dos veces y la segunda trae su letra entera', () => {
    const [escrito, repetido] = secciones('inundame-espiritu-santo');
    eq(repetido.repeatOf, escrito.id);
    eq(repetido.lines, escrito.lines);
    eq(escrito.lines.length, 5);
  });

  it('el final conserva sus siete líneas, con los «Oh, oh» y el «Ven» último', () => {
    const final = secciones('inundame-espiritu-santo')[3];
    eq(final.lines.length, 7);
    eq(final.lines[final.lines.length - 1].raw, 'Ven');
  });
});

// --- Noche ------------------------------------------------------------------

describe('Noche es una letanía, y se navega como tal', () => {
  it('once súplicas, tres Kyrie y un final', () => {
    eq(etiquetas('noche'), [
      'Súplica 1', 'Súplica 2', 'Súplica 3', 'Súplica 4', 'Súplica 5', 'Súplica 6',
      'Kyrie',
      'Súplica 7', 'Súplica 8', 'Súplica 9',
      'Kyrie',
      'Súplica 10', 'Súplica 11',
      'Kyrie',
      'Final',
    ]);
  });

  it('los tres Kyrie van escritos enteros, ninguno es una llamada', () => {
    // El del medio es más corto que los otros dos, así que una llamada no
    // sabría a cuál apunta: se escriben los tres.
    const kyries = secciones('noche').filter((seccion) => seccion.header?.label === 'Kyrie');
    eq(kyries.length, 3);
    eq(kyries.map((k) => k.lines.length), [2, 1, 2]);
    eq(kyries.map((k) => k.repeatOf ?? null), [null, null, null]);
    eq(llamadas('noche').length, 0);
  });

  it('y se escriben como llegaron, con sus dos mayúsculas', () => {
    eq(cancion('noche').content.includes('Kyrie Eleison'), true);
    eq(cancion('noche').content.includes('Kyrie eleison'), false, 'no se le cambió la caja');
  });

  it('la súplica por los pueblos oprimidos sigue sin su «Ten piedad»', () => {
    // Sus vecinas sí lo llevan. Hasta tener una transcripción verificada no
    // se le añade: el hueco puede ser de la canción.
    const tercera = secciones('noche')[2];
    eq(tercera.lines.length, 3);
    eq(tercera.lines.some((linea) => linea.raw.includes('Ten piedad')), false);
  });
});

// --- Tuyo Es ----------------------------------------------------------------

describe('Tuyo Es trae tres coros que no son el mismo', () => {
  it('verso con dos repeticiones, tres coros y un puente', () => {
    eq(etiquetas('tuyo-es'), [
      'Verso', 'Verso', 'Coro 1', 'Verso', 'Coro 1', 'Coro 2', 'Puente', 'Coro 2', 'Coro 3',
    ]);
  });

  it('las cuatro llamadas resuelven, cada una a la suya', () => {
    eq(llamadas('tuyo-es').length, 4);
    const todas = secciones('tuyo-es');
    eq(todas[1].repeatOf, todas[0].id, 'el verso');
    eq(todas[3].repeatOf, todas[0].id, 'y otra vez el verso');
    eq(todas[4].repeatOf, todas[2].id, 'el primer coro');
    eq(todas[7].repeatOf, todas[5].id, 'el segundo coro');
  });

  it('los tres coros están numerados porque dicen cosas distintas', () => {
    // Sin número, una llamada «Coro» tendría tres candidatos y no resolvería
    // ninguno: el cancionero prefiere no enseñar letra a enseñar la que no es.
    const coros = secciones('tuyo-es').filter((s) => s.header?.kind === 'coro' && !s.repeatOf);
    eq(coros.map((c) => c.header?.number), [1, 2, 3]);
    const textos = coros.map((c) => c.lines.map((l) => l.raw).join('\n'));
    eq(new Set(textos).size, 3, 'los tres dicen algo distinto');
  });

  it('el puente conserva sus dos estrofas y las voces entre paréntesis', () => {
    const puente = secciones('tuyo-es').find((s) => s.header?.label === 'Puente')!;
    eq(puente.lines.filter((l) => l.type !== 'empty').length, 7);
    eq(puente.lines.some((l) => l.raw.includes('(Tuyo soy Señor)')), true);
  });

  it('y los dos versos que chirrían se quedan tal cual', () => {
    // Pendientes de una transcripción verificada. Nadie los «arregla» sin ella.
    const contenido = cancion('tuyo-es').content;
    eq(contenido.includes('Tuya, Tuya en mi Señor'), true);
    eq(contenido.includes('Cosa y posesión'), true);
  });
});

// --- Gracias ----------------------------------------------------------------

describe('Gracias reparte verso, estribillo y puente', () => {
  it('con cinco llamadas y tres secciones escritas', () => {
    eq(etiquetas('gracias'), ['Verso', 'Coro', 'Verso', 'Coro', 'Puente', 'Puente', 'Puente', 'Coro']);
    eq(llamadas('gracias').length, 5);
  });

  it('el estribillo vuelve tres veces, siempre con su letra', () => {
    const todas = secciones('gracias');
    const escrito = todas[1];
    for (const at of [3, 7]) {
      eq(todas[at].repeatOf, escrito.id, `la del lugar ${at}`);
      eq(todas[at].lines, escrito.lines);
    }
    eq(escrito.lines.length, 4);
  });

  it('y el puente se canta tres veces seguidas', () => {
    const todas = secciones('gracias');
    eq([todas[5].repeatOf, todas[6].repeatOf], [todas[4].id, todas[4].id]);
    eq(todas[4].lines.length, 4);
  });
});
