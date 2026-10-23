import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChordSheet } from '../src/components/SongViewer/ChordSheet';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { extractUniqueChords, parseSongSections, transposeSongContent } from '../src/utils/chordParser';
import {
  getNoteIndex,
  parseChordSymbol,
  transposeChordBetweenKeys,
  transposeKey,
} from '../src/utils/chordTransposer';
import { getSongSeasons } from '../src/utils/liturgicalSeasons';
import { songToDraft } from '../src/catalog/songDraft';
import { validateSongDraft } from '../src/catalog/validateSongDraft';
import { songFromRow, songToRow } from '../src/catalog/supabaseSongRepository';
import type { Song, SongSection } from '../src/types/song';

/**
 * «Nadie que no seas tú», de Alfareros.
 *
 * La ficha se armó con dos fuentes que no dicen lo mismo. La letra que
 * autorizó el ministerio manda en las palabras, la puntuación, el orden y
 * las repeticiones cantadas; la hoja de acordes manda en los acordes y en
 * dónde cae cada uno. Donde la hoja no escribe nada, aquí no hay acordes:
 * no se completan por parecido.
 *
 * Las dos fuentes se contradicen en un punto que se dejó sin resolver: la
 * hoja repite el riff de entrada tres veces y la letra trae cuatro bloques
 * de «Oh». Los dos datos están escritos tal cual —tres líneas de acordes y
 * cuatro bloques cantados— y ninguna marca de repetición los relaciona,
 * porque nadie ha comprobado que sean la misma cantidad de vueltas.
 *
 * Lo que distingue a esta canción es que cambia de tonalidad a mitad de
 * camino: el primer coro se toca en Re y el segundo en Mi, dos semitonos
 * más arriba. Esa subida es la canción, y el riesgo concreto es la
 * transposición: quien la baja para su voz reescribe los dos coros, y si al
 * reescribirlos la distancia cambiara, la segunda mitad sonaría igual que
 * la primera. Por eso aquí se comprueba que sigan separados por dos
 * semitonos después de transportar la canción entera.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`nadieQueNoSeasTu.test: ${checks} comprobaciones`));

const CANCION = MOCK_SONGS.find((song) => song.id === 'nadie-que-no-seas-tu') as Song;
const SECCIONES: SongSection[] = parseSongSections(CANCION.content);

/** Los acordes de una sección, en el orden en que se tocan. */
const acordesDe = (seccion: SongSection | undefined): string[] =>
  (seccion?.lines ?? []).flatMap((line) => (line.segments ?? []).flatMap((s) => (s.chord ? [s.chord] : [])));

/** Lo que se canta en una sección: las líneas con palabras, sin los acordes. */
const versosDe = (seccion: SongSection | undefined): string[] =>
  (seccion?.lines ?? [])
    .filter((line) => line.segments?.some((s) => s.lyric.trim()))
    .map((line) => (line.segments ?? []).map((s) => s.lyric).join('').trim());

/** Una sección por el nombre que se lee en la hoja, con su matiz si lo tiene. */
const nombreDe = (seccion: SongSection): string =>
  seccion.header ? `${seccion.header.label}${seccion.header.note ? ` ${seccion.header.note}` : ''}` : '(sin nombre)';

const porNombre = (nombre: string, cual = 0): SongSection | undefined =>
  SECCIONES.filter((s) => nombreDe(s) === nombre)[cual];

/** Semitonos que hay que subir desde la raíz de un acorde para llegar a la del otro. */
const distancia = (desde: string, hasta: string): number =>
  (getNoteIndex(parseChordSymbol(hasta)!.root)! - getNoteIndex(parseChordSymbol(desde)!.root)! + 12) % 12;

/** Mayor, menor, séptima…: lo que una transposición no puede cambiar. */
const calidadDe = (acorde: string): string => parseChordSymbol(acorde)!.suffix;

/** El bloque vocal que abre y cierra la canción. */
const BLOQUE_OH = ['Oh', 'Oh, oh, oh', 'Oh, oh, oh', 'Oh, oh, oh'];
const RIFF = ['D', 'A', 'Bm', 'G'];

// --- La ficha ---------------------------------------------------------------

describe('La canción está en el cancionero con lo que dicen las dos fuentes', () => {
  it('con su título y su intérprete', () => {
    eq(CANCION.title, 'Nadie que no seas tú');
    eq(CANCION.artist, 'Alfareros');
  });

  it('se canta en la adoración, en cualquier tiempo del año', () => {
    eq(CANCION.categories, ['Adoración']);
    eq(getSongSeasons(CANCION), ['todo-el-ano']);
  });

  it('en Re y con capotraste en el primer traste, que es lo que suena en Mi bemol', () => {
    // originalKey son las formas que pisan los dedos, no el tono que suena.
    eq(CANCION.originalKey, 'D');
    eq(CANCION.recommendedCapo, 1);
    eq(transposeKey(CANCION.originalKey!, CANCION.recommendedCapo!), 'Eb');
  });

  it('sin tempo, compás ni año: las fuentes no los dan y no se inventan', () => {
    eq(CANCION.tempo, undefined);
    eq(CANCION.timeSignature, undefined);
    eq(CANCION.year, undefined);
  });

  it('y pasa la validación con la que entra a la base de datos', () => {
    eq(validateSongDraft(songToDraft(CANCION)).ok, true);
  });

  it('va y vuelve idéntica por la fila de Supabase', () => {
    assert.deepStrictEqual(songFromRow(songToRow(CANCION)), CANCION);
    checks++;
  });
});

// --- Los acordes ------------------------------------------------------------

describe('Los acordes son los nueve de la hoja, y ninguno más', () => {
  it('los declarados son exactamente los que aparecen en la letra', () => {
    eq(CANCION.chordsUsed, extractUniqueChords(CANCION.content));
  });

  it('cuatro de la primera mitad, cuatro de la segunda, y el dominante de cada una', () => {
    eq(CANCION.chordsUsed, ['D', 'A', 'Bm', 'G', 'F#', 'E', 'B', 'C#m', 'G#']);
    // F# lleva a Bm y G# lleva a C#m: los dos son mayores a propósito, no
    // menores mal escritos.
    eq(CANCION.chordsUsed.includes('F#m'), false);
    eq(CANCION.chordsUsed.includes('G#m'), false);
  });
});

// --- La estructura ----------------------------------------------------------

describe('La estructura sigue el orden de la letra autorizada', () => {
  it('entrada, verso, coro en Re, verso, coro en Mi, final, los «Oh» y el coro de cierre', () => {
    eq(SECCIONES.map(nombreDe), [
      'Intro',
      'Verso 1',
      'Coro en D',
      'Verso 2',
      'Coro en E',
      'Final',
      'Oh',
      'Coro en E',
    ]);
  });

  it('los dos versos llevan el mismo camino de acordes', () => {
    const esperado = ['Bm', 'G', 'D', 'F#', 'Bm', 'G', 'D', 'F#'];
    eq(acordesDe(porNombre('Verso 1')), esperado);
    eq(acordesDe(porNombre('Verso 2')), esperado);
    eq(versosDe(porNombre('Verso 1')).length, 8);
    eq(versosDe(porNombre('Verso 2')).length, 8);
  });

  it('los coros se escriben enteros: ninguno es una llamada al otro', () => {
    // Una llamada («Coro» a secas) no lleva acordes propios, y aquí los
    // acordes son justo lo que cambia entre uno y otro.
    for (const [nombre, cual] of [['Coro en D', 0], ['Coro en E', 0], ['Coro en E', 1]] as const) {
      const coro = porNombre(nombre, cual)!;
      eq(coro.repeatOf, undefined, `${nombre} ${cual}`);
      eq(acordesDe(coro).length > 0, true, `${nombre} ${cual}`);
    }
  });
});

// --- Las repeticiones cantadas ----------------------------------------------

describe('Las repeticiones vocales son las de la letra autorizada', () => {
  it('la entrada canta cuatro bloques de «Oh»', () => {
    const versos = versosDe(porNombre('Intro'));
    eq(versos.length, 16);
    eq(versos, [...BLOQUE_OH, ...BLOQUE_OH, ...BLOQUE_OH, ...BLOQUE_OH]);
  });

  it('y después del final vuelven tres, no cuatro', () => {
    const versos = versosDe(porNombre('Oh'));
    eq(versos.length, 12);
    eq(versos, [...BLOQUE_OH, ...BLOQUE_OH, ...BLOQUE_OH]);
    eq(acordesDe(porNombre('Oh')), [], 'la hoja no escribe acordes para esta vuelta');
  });

  it('la hoja repite el riff tres veces, y eso no se mezcla con los cuatro bloques', () => {
    // Las dos fuentes no coinciden en el número de vueltas y ninguna de las
    // dos se corrige con la otra: tres líneas de acordes, cuatro bloques
    // cantados, y ninguna marca de repetición que los ate.
    eq(acordesDe(porNombre('Intro')), [...RIFF, ...RIFF, ...RIFF]);
    eq(porNombre('Intro')!.header!.repeat, undefined);
  });

  it('el final conserva la progresión de la hoja y las dos llamadas con su respuesta', () => {
    eq(acordesDe(porNombre('Final')), [
      'A', 'E', 'B',
      'A', 'E', 'B',
      'C#m', 'A', 'E', 'G#',
      'C#m', 'A', 'E', 'G#',
      'E', 'B', 'C#m', 'A',
    ]);
    // La hoja da la progresión, no dice sobre qué sílaba cae cada acorde, y
    // aquí no se decide por ella.
    const versos = versosDe(porNombre('Final'));
    eq(versos, [
      'Uh, uh, uh, uh, uh, uh, uh (Oh, oh, no, no, no quiero a nadie)',
      'Uh, uh, uh, uh, uh, uh, uh (Oh, oh, oh, que no seas tú)',
    ]);
    for (const linea of porNombre('Final')!.lines) {
      const cantada = linea.segments?.some((s) => s.lyric.trim());
      if (cantada) eq(linea.segments!.every((s) => !s.chord), true, 'las llamadas van sin acordes');
    }
  });

  it('la canción acaba a media frase, como la letra', () => {
    // No hay «NADA...»: eso lo escribía la hoja de acordes, no la letra.
    const cierre = versosDe(porNombre('Coro en E', 1));
    eq(cierre.length, 8);
    eq(cierre.slice(-2), ['Nadie que no seas tú', 'Que no seas tú, que no seas tú']);
    eq(CANCION.content.includes('NADA'), false);
  });
});

// --- Lo que se ve en la hoja ------------------------------------------------

describe('La hoja se lee como lo que es', () => {
  const hoja = (showChords: boolean) =>
    renderToStaticMarkup(
      createElement(ChordSheet, { content: CANCION.content, fontSize: 'base', twoColumns: false, showChords })
    );

  /** Las veces que aparece un acorde pulsable con ese nombre. */
  const vecesQueSuena = (html: string, acorde: string) =>
    html.split(`title="Ver diagrama de ${acorde}"`).length - 1;

  it('las vueltas instrumentales son acordes, no letra: sin acordes desaparecen', () => {
    // Es la prueba de que el riff de entrada y la progresión del final no se
    // cuelan como texto cantado. Quien pide la hoja sin acordes quiere la
    // letra, y la letra no incluye tres vueltas de Re La Sim Sol.
    const con = hoja(true);
    const sin = hoja(false);
    const fila = 'flex flex-wrap items-center gap-y-1';
    eq(con.split(fila).length - 1, 8, 'tres del riff y cinco de la progresión final');
    eq(sin.includes(fila), false, 'sin acordes no queda ninguna fila instrumental');
    eq(vecesQueSuena(sin, 'D'), 0, 'ni un solo acorde pulsable');
    eq(vecesQueSuena(sin, 'G#'), 0);
  });

  it('las tres vueltas instrumentales no se pegan a los cuatro bloques de «Oh»', () => {
    // Si las dos cosas se hubieran atado —escribiendo el riff cuatro veces
    // para que cuadrara con los bloques, o marcando la sección entera con
    // una repetición— uno de estos dos números cambiaría. Son independientes
    // a propósito: la hoja dice tres y la letra dice cuatro.
    eq(vecesQueSuena(hoja(true), 'Bm'), 9, 'tres del riff, cuatro de los versos y dos del coro en Re');
    // Con acordes cada palabra va en su propio bloque para alinearse bajo el
    // suyo, así que la frase entera solo se lee seguida en la hoja sin ellos.
    eq(hoja(false).split('Oh, oh, oh').length - 1, 22, 'siete bloques de tres, más el «Oh, oh, oh» de la respuesta final');
  });

  it('la letra entera sigue ahí aunque se escondan los acordes', () => {
    const sin = hoja(false);
    for (const verso of ['Ya he llorado todo lo que debí llorar', 'Nada de nada, de nada, de na']) {
      eq(sin.includes(verso), true, verso);
    }
    eq(sin.includes('Uh, uh, uh, uh, uh, uh, uh'), true, 'las llamadas del final se cantan');
  });
});

// --- La modulación ----------------------------------------------------------

describe('El coro sube de Re a Mi, y sigue subiendo lo mismo se toque donde se toque', () => {
  it('el segundo coro es el primero dos semitonos más arriba', () => {
    eq(acordesDe(porNombre('Coro en D')), ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G']);
    eq(acordesDe(porNombre('Coro en E')), ['E', 'B', 'C#m', 'A', 'E', 'B', 'C#m', 'A']);
    eq(
      acordesDe(porNombre('Coro en D')).map((acorde) => transposeChordBetweenKeys(acorde, 'D', 'E')),
      acordesDe(porNombre('Coro en E')),
      'acorde por acorde, el mismo salto'
    );
  });

  it('y la distancia se mantiene al transportar la canción entera', () => {
    // Esto es lo que protege la canción: quien la baja para su voz baja las
    // dos mitades por igual, y la subida de la segunda sigue ahí.
    //
    // Se mide en semitonos y no en nombres a propósito. El nombre de un
    // acorde depende del tono en que se escriba —el segundo coro es C# si la
    // canción está en Si y Eb si está en Re bemol, y son la misma nota—, así
    // que comparar nombres comprobaría la ortografía y no la música.
    for (const pasos of [-5, -3, -1, 1, 2, 4, 7]) {
      const movida = parseSongSections(transposeSongContent(CANCION.content, pasos, CANCION.originalKey));
      const nombres = movida.map(nombreDe);
      const uno = acordesDe(movida[nombres.indexOf('Coro en D')]);
      const otro = acordesDe(movida[nombres.indexOf('Coro en E')]);
      eq(uno.length, 8, `${pasos}: el primer coro sigue entero`);
      eq(otro.length, 8, `${pasos}: y el segundo también`);
      for (let i = 0; i < uno.length; i++) {
        eq(distancia(uno[i], otro[i]), 2, `${pasos} semitonos: de ${uno[i]} a ${otro[i]}`);
        eq(calidadDe(otro[i]), calidadDe(uno[i]), `${pasos} semitonos: ${uno[i]} y ${otro[i]}`);
      }
    }
  });

  it('los nombres de las secciones no se mueven aunque los acordes sí', () => {
    // «Coro en D» es el nombre que le puso quien transcribió la hoja. Si la
    // canción se transporta, el nombre deja de describir lo que suena, pero
    // sigue siendo la referencia con la que el coro se entiende al ensayar.
    const movida = parseSongSections(transposeSongContent(CANCION.content, 3, CANCION.originalKey));
    eq(movida.map(nombreDe), SECCIONES.map(nombreDe));
  });
});

// --- Dónde cae cada acorde --------------------------------------------------

describe('Cada acorde cae donde lo pone la hoja', () => {
  it('en el coro, sobre el «tú» de cada frase', () => {
    // La letra parte el coro en tres líneas donde la hoja usaba dos, así que
    // los acordes se recolocaron sobre las mismas palabras: el primero en
    // «Nada», y los otros tres sobre el primer, segundo y tercer «tú».
    const coro = porNombre('Coro en D')!;
    const primera = coro.lines[0].segments!;
    eq(primera[0].chord, 'D');
    eq(primera[1].chord, 'A');
    eq(primera[1].lyric, 'tú');
    const segunda = coro.lines[1].segments!;
    eq(segunda.map((s) => s.chord), [undefined, 'Bm', 'G']);
    eq(segunda[1].lyric, 'tú, que no seas ');
    eq(segunda[2].lyric, 'tú');
  });

  it('salvo el último La del coro en Mi, que entra una frase más tarde', () => {
    // En las frases iguales el acorde cae sobre «tú». En ésta, y sólo en
    // ésta, la hoja lo pone más adelante, ya empezada la frase siguiente, y
    // además dentro de la palabra «de». Entrar a mitad de palabra no se
    // puede leer en una hoja, así que el acorde se apoya al principio de esa
    // misma palabra: se conserva dónde entra sin fingir una sincronía por
    // sílabas que la hoja no da.
    const ultima = porNombre('Coro en E')!.lines.at(-1)!.segments!;
    eq(ultima.map((s) => s.chord), [undefined, 'A']);
    eq(ultima[0].lyric, 'Nada ');
    eq(ultima[1].lyric, 'de nada, de nada, de na');
    // Y la frase anterior se queda sin el acorde que sus iguales sí llevan.
    eq(porNombre('Coro en E')!.lines.at(-2)!.segments!.map((s) => s.chord), [undefined, 'C#m']);
  });

  it('y ningún acorde de esta canción parte una palabra', () => {
    // En otras canciones del cancionero un acorde sí cambia dentro de una
    // sílaba larga, y ahí es correcto. Aquí no hay ninguno escrito así, y la
    // hoja tiene que poder leerse de un vistazo mientras se canta.
    for (const [n, linea] of CANCION.content.split('\n').entries()) {
      for (const marca of linea.matchAll(/\[[^\]]+\]/g)) {
        const antes = linea.slice(0, marca.index);
        eq(/[a-záéíóúñ]$/i.test(antes), false, `línea ${n + 1}: ${linea.trim()}`);
      }
    }
  });
});
