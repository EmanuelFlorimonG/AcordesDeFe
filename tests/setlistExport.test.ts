import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { MINISTRY_NAME, buildSetlistDocument, latinKeyName } from '../src/utils/setlistExport';
import { SetlistPrintSheet } from '../src/components/Setlists/SetlistPrintSheet';
import { SetlistSingersSheet } from '../src/components/Setlists/SetlistSingersSheet';

/**
 * Un Setlist puesto en papel para los músicos.
 *
 * Lo que se comprueba es lo que alguien necesita para tocar: el momento, el
 * título, en qué tono suena y qué formas hacen los dedos, los acordes encima
 * de su sílaba, y lo que diga el arreglo. Y, tan importante como eso, que la
 * hoja no promete nada que no pueda cumplir: una canción sin acordes lo dice
 * en vez de salir como una letra pelada que parece un fallo de impresión.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistExport.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);

const songOf = (overrides: Partial<Song> = {}): Song => ({
  id: 'pescador',
  title: 'Pescador de Hombres',
  artist: 'Cesáreo Gabaráin',
  originalKey: 'D',
  tempo: 75,
  timeSignature: '4/4',
  categories: [],
  tags: [],
  content: 'Coro:\n[D]Señor, me has mirado a los [A]ojos,\n[G]sonriendo has dicho mi [D]nombre.',
  chordsUsed: ['D', 'A', 'G'],
  ...overrides,
});

const SIN_ACORDES = songOf({
  id: 'bendecire',
  title: 'Bendeciré al Señor',
  artist: '',
  originalKey: 'C',
  tempo: undefined,
  timeSignature: undefined,
  content: 'Coro:\nBendeciré al Señor, con toda mi alma.',
  chordsUsed: [],
});

const songs = new Map<string, Song>([
  ['pescador', songOf()],
  ['bendecire', SIN_ACORDES],
]);

const item = (overrides: Partial<SetlistItem> = {}): SetlistItem => ({
  id: 'item-1',
  songId: 'pescador',
  moment: 'Comunión',
  transposeSteps: 0,
  capoFret: 0,
  notes: '',
  ...overrides,
});

const setlistOf = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'setlist-1',
  name: 'Misa Siervas de María',
  date: '2026-10-04',
  description: 'Ensayo el viernes a las 8.',
  participantIds: [],
  items: [item()],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const build = (setlist = setlistOf()) => buildSetlistDocument(setlist, songs);

// --- El documento ----------------------------------------------------------

describe('El Setlist puesto en papel', () => {
  it('lleva la cabecera del ministerio y lo que es la celebración', () => {
    const doc = build();
    eq(doc.ministry, MINISTRY_NAME);
    eq(doc.title, 'Misa Siervas de María');
    eq(doc.date.includes('octubre'), true, 'la fecha se lee, no se descifra');
    eq(doc.date.includes('-'), false);
    eq(doc.description, 'Ensayo el viernes a las 8.');
  });

  it('las canciones van en el orden en que se cantan, con su momento', () => {
    const doc = build(
      setlistOf({
        items: [
          item({ id: 'a', songId: 'bendecire', moment: 'Entrada' }),
          item({ id: 'b', songId: 'pescador', moment: 'Comunión' }),
        ],
      })
    );
    eq(doc.entries.map((entry) => [entry.moment, entry.title]), [
      ['ENTRADA', 'Bendeciré al Señor'],
      ['COMUNIÓN', 'Pescador de Hombres'],
    ]);
  });

  it('las canciones seguidas del mismo momento van bajo una sola cabecera', () => {
    const doc = build(
      setlistOf({
        items: [
          item({ id: 'a', songId: 'bendecire', moment: 'Comunión' }),
          item({ id: 'b', songId: 'pescador', moment: 'Comunión' }),
          item({ id: 'c', songId: 'pescador', moment: 'Salida' }),
        ],
      })
    );
    eq(doc.moments.map((m) => [m.moment, m.entries.length]), [
      ['COMUNIÓN', 2],
      ['SALIDA', 1],
    ]);
  });

  it('pero dos momentos iguales separados por otro no se juntan: el orden manda', () => {
    const doc = build(
      setlistOf({
        items: [
          item({ id: 'a', moment: 'Comunión' }),
          item({ id: 'b', moment: 'Paz' }),
          item({ id: 'c', moment: 'Comunión' }),
        ],
      })
    );
    eq(doc.moments.map((m) => m.moment), ['COMUNIÓN', 'PAZ', 'COMUNIÓN']);
  });

  it('el tono se escribe como lo escribe el ministerio, y los acordes no', () => {
    // «María mírame (Do)», «Oh Cordero (Mi-)»: así están las hojas de siempre.
    eq(build().entries[0].latinKey, 'Re', 'Re, no D');
    eq(build(setlistOf({ items: [item({ transposeSteps: 2, capoFret: 3 })] })).entries[0].latinKey, 'Sol');
    eq(latinKeyName('Am'), 'La-', 'el menor lleva guion');
    eq(latinKeyName('Bb'), 'Sib');
    eq(latinKeyName('F#m'), 'Fa#-');
    eq(latinKeyName(undefined), null);
    eq(latinKeyName('no es un tono'), null);
    // Y la letra sigue trayendo el cifrado de siempre para quien toca.
    eq(build().entries[0].content.includes('[D]'), true);
  });

  it('la letra llega ya en el tono que se va a tocar', () => {
    const doc = build(setlistOf({ items: [item({ transposeSteps: 2 })] }));
    // De Re a Mi: los acordes salen escritos como los espera un músico.
    eq(doc.entries[0].content.includes('[E]'), true);
    eq(doc.entries[0].content.includes('[B]'), true);
    eq(doc.entries[0].content.includes('[D]'), false, 'ya no queda nada del tono original');
  });

  it('con cejilla se dicen las dos cosas: lo que suena y lo que tocan los dedos', () => {
    const doc = build(setlistOf({ items: [item({ transposeSteps: 2, capoFret: 3 })] }));
    const key = doc.entries[0].key;
    // Escrita en Re, dos semitonos arriba son las formas de Mi, y con la
    // cejilla en el tercer traste suena en Sol.
    eq(key?.shape, 'E', 'las formas que hacen los dedos');
    eq(key?.sounding, 'G', 'lo que suena');
    eq(key?.original, 'D', 'y de dónde salió');
    eq(doc.entries[0].capoFret, 3);
  });

  it('sin tocar nada, no se habla de tonos que no cambiaron', () => {
    const key = build().entries[0].key;
    eq(key?.sounding, 'D');
    eq(key?.shape, null, 'sin cejilla no hay dos tonos');
    eq(key?.original, null, 'y nada que comparar');
  });

  it('lleva el tempo, el compás y lo que alguien escribió para ese día', () => {
    const doc = build(setlistOf({ items: [item({ notes: '  Entrar sólo con guitarra.  ' })] }));
    eq(doc.entries[0].tempo, 75);
    eq(doc.entries[0].timeSignature, '4/4');
    eq(doc.entries[0].notes, 'Entrar sólo con guitarra.', 'limpias');
  });

  it('una canción que se toca como está escrita no lleva arreglo', () => {
    eq(build().entries[0].arrangement, null);
  });

  it('y una con arreglo lo lleva resuelto, en el orden en que se toca', () => {
    const doc = build(
      setlistOf({
        items: [
          item({
            arrangement: {
              songVersion: 1,
              sections: [
                {
                  id: 'b1',
                  sourceSectionId: 'section-1',
                  label: 'Coro',
                  repeatCount: 2,
                  voices: ['women'],
                  instruction: 'Suave',
                  transition: { type: 'continue' },
                },
              ],
            },
          }),
        ],
      })
    );
    const blocks = doc.entries[0].arrangement;
    eq(blocks?.length, 1);
    eq(blocks?.[0].repeatCount, 2);
    eq(blocks?.[0].voices, ['women']);
    eq(blocks?.[0].instruction, 'Suave');
  });

  it('lo que pasa al terminar sólo se dice mientras haya una siguiente', () => {
    const transition = { type: 'direct' as const, instruction: 'Sin respirar' };
    const doc = build(
      setlistOf({
        items: [item({ id: 'a', transitionToNext: transition }), item({ id: 'b', transitionToNext: transition })],
      })
    );
    eq(doc.entries[0].transitionToNext, 'entra directa en la siguiente — Sin respirar');
    eq(doc.entries[1].transitionToNext, null, 'la última no va a ninguna parte');
  });

  it('una canción que este dispositivo no tiene se dice, no se inventa', () => {
    const doc = build(setlistOf({ items: [item({ songId: 'no-existe' })] }));
    eq(doc.entries[0].missing, true);
    eq(doc.entries[0].content, '');
    eq(doc.entries[0].key, null);
  });

  it('y una sin acordes también, que en una hoja de músico no es lo mismo', () => {
    eq(build(setlistOf({ items: [item({ songId: 'bendecire' })] })).entries[0].hasChords, false);
    eq(build().entries[0].hasChords, true);
  });

  it('no toca la canción: el cancionero se lee y nada más', () => {
    const original = songs.get('pescador') as Song;
    const antes = JSON.stringify(original);
    build(setlistOf({ items: [item({ transposeSteps: 5, capoFret: 2 })] }));
    eq(JSON.stringify(original), antes);
  });

  it('un Setlist vacío es un documento vacío, no un error', () => {
    const doc = build(setlistOf({ items: [] }));
    eq(doc.entries, []);
    eq(doc.title, 'Misa Siervas de María');
  });

  it('una celebración sin fecha no se inventa ninguna', () => {
    eq(build(setlistOf({ date: '' })).date, '');
  });
});

// --- La hoja ---------------------------------------------------------------

describe('La hoja del músico', () => {
  const sheet = (setlist = setlistOf()) =>
    renderToStaticMarkup(createElement(SetlistPrintSheet, { sheet: build(setlist) }));

  it('sigue la plantilla del ministerio: cabecera, momento, y canción con su tono', () => {
    const html = sheet();
    eq(html.includes(MINISTRY_NAME.toLocaleUpperCase('es')), true, 'el encabezado, en mayúsculas');
    eq(html.includes('Misa Siervas de María'), true);
    eq(html.includes('COMUNIÓN:'), true, 'el momento, en mayúsculas y con dos puntos');
    eq(html.includes('Pescador de Hombres (Re)'), true, 'el tono pegado al título');
    // Y en ese orden: encabezado, momento, canción.
    eq(html.indexOf('MINISTERIO') < html.indexOf('COMUNIÓN:'), true);
    eq(html.indexOf('COMUNIÓN:') < html.indexOf('Pescador de Hombres'), true);
  });

  it('no es un reporte: ni numeración, ni recuentos, ni fichas de datos', () => {
    const html = sheet();
    for (const forbidden of ['1. ', '2 canciones', 'Tono:', 'Cejilla en el traste', 'Canciones']) {
      eq(html.includes(forbidden), false, forbidden);
    }
  });

  it('un momento con dos canciones escribe el momento una sola vez', () => {
    const html = sheet(
      setlistOf({
        items: [
          item({ id: 'a', songId: 'bendecire', moment: 'Comunión' }),
          item({ id: 'b', songId: 'pescador', moment: 'Comunión' }),
        ],
      })
    );
    eq((html.match(/COMUNIÓN:/g) ?? []).length, 1);
    eq(html.includes('Bendeciré al Señor'), true);
    eq(html.includes('Pescador de Hombres'), true);
  });

  it('una canción sin momento no inventa una cabecera vacía', () => {
    const html = sheet(setlistOf({ items: [item({ moment: '' })] }));
    eq(html.includes('Pescador de Hombres'), true);
    eq(html.includes(':</h2>'), false);
  });

  it('los acordes van encima de la letra, no en una lista aparte', () => {
    const html = sheet();
    eq(html.includes('Señor,'), true, 'la letra');
    eq(html.includes('>D<'), true, 'y sus acordes');
    // El acorde de una sílaba y la sílaba viajan en el mismo bloque.
    eq(/data-lyric-word/.test(html), true);
  });

  it('con cejilla dice lo que suena y lo que tocan los dedos, en una línea', () => {
    const html = sheet(setlistOf({ items: [item({ transposeSteps: 2, capoFret: 3 })] }));
    eq(html.includes('Pescador de Hombres (Sol)'), true, 'lo que suena, junto al título');
    eq(html.includes('Capo 3 · formas de E · 4/4 · 75 BPM · escrita en D'), true, 'y el resto, en una sola línea');
  });

  it('sin nada que decir, no se escribe esa línea', () => {
    const html = sheet(setlistOf({ items: [item({ songId: 'bendecire' })] }));
    eq(html.includes('Bendeciré al Señor (Do)'), true);
    eq(html.includes('Capo'), false);
  });

  it('enseña el arreglo con sus repeticiones, sus voces y su indicación', () => {
    const html = sheet(
      setlistOf({
        items: [
          item({
            arrangement: {
              songVersion: 1,
              sections: [
                {
                  id: 'b1',
                  sourceSectionId: 'section-1',
                  label: 'Coro',
                  repeatCount: 2,
                  voices: ['women'],
                  instruction: 'Suave',
                  transition: { type: 'continue' },
                },
              ],
            },
          }),
        ],
      })
    );
    eq(html.includes('x2'), true, 'las repeticiones, escritas a mano');
    eq(html.includes('Suave'), true);
    eq(html.toLowerCase().includes('mujeres'), true);
    // Y como en un cancionero: "INTRO x2 - Mujeres - Suave", sin recuadros.
    eq(html.includes('rounded border'), false, 'ni un badge');
  });

  it('una canción sin acordes lo dice, para que no parezca una impresión a medias', () => {
    const html = sheet(setlistOf({ items: [item({ songId: 'bendecire' })] }));
    eq(html.includes('Todavía sin acordes'), true);
    eq(html.includes('Bendeciré al Señor, con toda mi alma'), true, 'la letra sí sale');
  });

  it('una canción que falta se dice igual de claro', () => {
    const html = sheet(setlistOf({ items: [item({ songId: 'no-existe' })] }));
    eq(html.includes('No está en el cancionero de este dispositivo'), true);
  });

  it('dice lo que hace la banda al terminar cada canción', () => {
    const html = sheet(
      setlistOf({
        items: [
          item({ id: 'a', transitionToNext: { type: 'instrumental', instruction: 'Dejar sonar' } }),
          item({ id: 'b' }),
        ],
      })
    );
    eq(html.includes('Al terminar: sigue la música entre las dos — Dejar sonar'), true);
  });

  it('las notas de ese día salen con la canción', () => {
    eq(sheet(setlistOf({ items: [item({ notes: 'Entrar sólo con guitarra' })] })).includes('Entrar sólo con guitarra'), true);
  });

  it('un Setlist vacío no imprime una hoja en blanco sin explicación', () => {
    eq(sheet(setlistOf({ items: [] })).includes('todavía no tiene canciones'), true);
  });

  it('es papel: ni un control de editar, borrar o sincronizar', () => {
    const html = sheet();
    for (const control of [
      'Editar',
      'Eliminar',
      'Duplicar',
      'Añadir canción',
      'Guardar en mi cuenta',
      'Sincronizar',
      'Compartir',
      '<input',
      '<textarea',
      'draggable',
    ]) {
      eq(html.includes(control), false, control);
    }
  });

  it('nada de cómo está guardado esto llega al papel', () => {
    const html = sheet();
    for (const interno of ['setlist-1', 'item-1', 'owner_id', 'revision', 'payload', 'token', 'supabase']) {
      eq(html.toLowerCase().includes(interno.toLowerCase()), false, interno);
    }
  });
});

// --- El papel -----------------------------------------------------------------

describe('La maqueta del cancionero', () => {
  const sheetFull = readFileSync('src/components/Setlists/SetlistPrintSheet.tsx', 'utf8').replace(/\r\n/g, '\n');
  // Sin comentarios: lo que se comprueba es lo que hace, no lo que cuenta.
  const sheetSource = sheetFull.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');
  const chordSheet = readFileSync('src/components/SongViewer/ChordSheet.tsx', 'utf8').replace(/\r\n/g, '\n');
  const css = readFileSync('src/index.css', 'utf8').replace(/\r\n/g, '\n');
  const app = readFileSync('src/App.tsx', 'utf8').replace(/\r\n/g, '\n');
  const screen = readFileSync('src/components/Setlists/SetlistPrintScreen.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('la hoja es Letter, como el cancionero que ya se reparte', () => {
    eq(css.includes('size: letter'), true);
    eq(css.includes('margin: 18mm'), true);
    eq(css.includes('size: A4'), false, 'ya no');
  });

  it('dos columnas, y el reparto lo hace el navegador', () => {
    eq(sheetSource.includes('columns-2'), true);
    // `column-fill` es justo lo que no hay que fijar: fuera de una altura
    // acotada hace que el bloque mida lo que todo el contenido en una sola
    // columna, y el PDF sale con páginas en blanco al final.
    eq(sheetSource.includes('column-fill'), false, 'sin column-fill, o vuelven las páginas vacías');
  });

  it('nada obliga a una canción a empezar arriba', () => {
    for (const forbidden of ['break-before-page', 'break-before:page', 'break-after-page']) {
      eq(sheetSource.includes(forbidden), false, forbidden);
    }
    // Lo único que se protege es la cabecera: que un título no se quede solo
    // al pie de una columna. La canción entera fluye.
    eq(sheetSource.includes('[break-after:avoid] break-inside-avoid'), true, 'sólo la cabecera');
    eq((sheetSource.match(/break-inside-avoid/g) ?? []).length, 1, 'y nada más');
  });

  it('en papel no hay ni un componente de la aplicación', () => {
    const paper = (name: string) => {
      const at = chordSheet.indexOf(name);
      return at === -1 ? '' : chordSheet.slice(at, at + 900);
    };
    // El acorde es texto, no un botón azul que se pueda pulsar.
    eq(chordSheet.includes("isPrint ? (\n    <span"), true, 'el acorde, en papel, es un span');
    eq(paper('const ChordButton').includes('text-slate-900'), true, 'y en negro, para la fotocopia');
    // Las repeticiones y las voces se escriben, no se encapsulan.
    eq(chordSheet.includes("<span className=\"shrink-0 text-[9pt] font-semibold text-slate-900\">x{entry.repeatCount}"), true);
    // Y las rayas y la barra del estribillo se quedan en la pantalla.
    eq(chordSheet.includes('{!isPrint && <span aria-hidden="true" className="h-px flex-1'), true);
    eq(chordSheet.includes('!isRefrain || isPrint'), true);
  });

  it('la hoja escapa del contenedor con scroll sólo al imprimir', () => {
    // La aplicación vive en una ventana con scroll propio; sin soltarla, el
    // papel sale recortado a lo que cabía en pantalla.
    eq(app.includes('print:h-auto print:overflow-visible print:block'), true);
    eq(app.includes('print:min-h-0 print:overflow-visible print:block'), true);
    // Y sólo al imprimir: en pantalla no cambia ni una clase.
    eq(app.includes('h-screen flex bg-white'), true, 'la ventana sigue siendo la ventana');
    eq(app.includes('flex-grow min-h-0 overflow-y-auto flex flex-col print:'), true, 'y el scroll, el scroll');
  });

  it('lo que es de la pantalla no sale en el papel', () => {
    eq(screen.includes('print:hidden'), true, 'la barra de la vista previa');
    eq(screen.includes('print:p-0'), true, 'y el marco de la hoja');
  });
});

// --- La hoja de quien canta -------------------------------------------------

describe('La hoja de quien canta', () => {
  const sing = (setlist = setlistOf()) =>
    renderToStaticMarkup(createElement(SetlistSingersSheet, { sheet: build(setlist) }));

  it('es el mismo documento: encabezado, momento, canción con su tono', () => {
    const html = sing();
    eq(html.includes(MINISTRY_NAME.toLocaleUpperCase('es')), true);
    eq(html.includes('COMUNIÓN:'), true);
    eq(html.includes('Pescador de Hombres (Re)'), true, 'el tono, en las notas de siempre');
    eq(html.includes('columns-2'), true, 'y las dos columnas');
  });

  it('lleva la letra entera', () => {
    const html = sing();
    eq(html.includes('Señor, me has mirado a los ojos,'), true);
    eq(html.includes('sonriendo has dicho mi nombre.'), true);
  });

  it('no lleva ni un acorde', () => {
    const html = sing(setlistOf({ items: [item({ transposeSteps: 2, capoFret: 3 })] }));
    // La canción de prueba se toca con D, A y G; ninguno puede asomar.
    for (const chord of ['>D<', '>A<', '>G<', '>E<', '>B<', 'font-mono']) {
      eq(html.includes(chord), false, chord);
    }
  });

  it('ni nada que sólo le importe a quien toca', () => {
    const html = sing(
      setlistOf({
        items: [
          item({
            transposeSteps: 2,
            capoFret: 3,
            notes: 'Entrar sólo con guitarra',
            transitionToNext: { type: 'instrumental', instruction: 'Dejar sonar' },
          }),
          item({ id: 'otro' }),
        ],
      })
    );
    for (const forbidden of [
      'Capo',
      'formas de',
      'escrita en',
      'BPM',
      '4/4',
      'Entrar sólo con guitarra',
      'Al terminar',
      'Dejar sonar',
    ]) {
      eq(html.includes(forbidden), false, forbidden);
    }
  });

  it('conserva quién canta cada parte, y cuántas veces', () => {
    const conVoces = setlistOf({
      items: [
        item({
          arrangement: {
            songVersion: 1,
            sections: [
              {
                id: 'b1',
                sourceSectionId: 'section-1',
                label: 'Coro',
                repeatCount: 2,
                voices: ['women'],
                instruction: 'Suave, sólo guitarra',
                transition: { type: 'continue' },
              },
            ],
          },
        }),
      ],
    });
    const html = sing(conVoces);
    eq(html.toLowerCase().includes('mujeres'), true, 'quién canta, sí');
    eq(html.includes('x2'), true, 'cuántas veces, también');
    eq(html.includes('Suave, sólo guitarra'), false, 'la indicación del instrumento, no');
  });

  it('un momento con dos canciones lo escribe una sola vez', () => {
    const html = sing(
      setlistOf({
        items: [
          item({ id: 'a', songId: 'bendecire', moment: 'Comunión' }),
          item({ id: 'b', songId: 'pescador', moment: 'Comunión' }),
        ],
      })
    );
    eq((html.match(/COMUNIÓN:/g) ?? []).length, 1);
    eq(html.includes('Bendeciré al Señor'), true);
    eq(html.includes('Pescador de Hombres'), true);
  });

  it('una canción sin acordes se ve igual que las demás: es sólo letra', () => {
    const html = sing(setlistOf({ items: [item({ songId: 'bendecire' })] }));
    eq(html.includes('Bendeciré al Señor, con toda mi alma.'), true);
    eq(html.includes('Todavía sin acordes'), false, 'a quien canta eso no le dice nada');
  });

  it('una canción que falta se dice', () => {
    eq(sing(setlistOf({ items: [item({ songId: 'no-existe' })] })).includes('No está en el cancionero'), true);
  });

  it('es papel: ni un control de la aplicación', () => {
    const html = sing();
    for (const control of ['Editar', 'Eliminar', 'Añadir canción', 'Sincronizar', '<input', '<button', 'rounded border']) {
      eq(html.includes(control), false, control);
    }
  });
});

// --- La arquitectura que viene ---------------------------------------------

describe('La hoja de quien canta, cuando llegue', () => {
  const model = readFileSync('src/utils/setlistExport.ts', 'utf8').replace(/\r\n/g, '\n');
  const sheetSource = readFileSync('src/components/Setlists/SetlistPrintSheet.tsx', 'utf8').replace(/\r\n/g, '\n');
  const detail = readFileSync('src/components/Setlists/SetlistDetail.tsx', 'utf8').replace(/\r\n/g, '\n');

  it('lo que las dos hojas comparten se decide una sola vez, y no en la que pinta', () => {
    // El documento sabe de momentos, títulos y tonos; no sabe de acordes ni
    // de páginas. Así la otra hoja se añade pintándolo de otra manera.
    for (const forbidden of ['React', 'className', 'ChordSheet', 'print:', 'window']) {
      eq(model.includes(forbidden), false, forbidden);
    }
    eq(model.includes('export function buildSetlistDocument'), true);
    eq(sheetSource.includes('buildSetlistDocument'), true, 'la hoja sólo pinta el documento');
  });

  it('las dos hojas se eligen desde el mismo sitio', () => {
    eq(detail.includes('Exportar PDF para músicos'), true);
    eq(detail.includes('Exportar PDF para quien canta'), true);
  });

  it('tocar la hoja de quien canta no puede cambiar la del músico', () => {
    // Son dos renderizadores. El de los músicos no sabe que el otro existe.
    const singers = readFileSync('src/components/Setlists/SetlistSingersSheet.tsx', 'utf8').replace(/\r\n/g, '\n');
    eq(sheetSource.includes('Singers'), false, 'la hoja del músico no lo nombra');
    eq(singers.includes('SetlistPrintSheet'), false, 'y la de quien canta tampoco');
    // Y la de quien canta no toca el pintor de acordes.
    eq(singers.includes('ChordSheet'), false);
    // Lo que sí comparten es el documento, que se resuelve una sola vez.
    eq(singers.includes('buildSetlistDocument'), true);
    eq(sheetSource.includes('buildSetlistDocument'), true);
  });

  it('el PDF lo hace el navegador, sin añadir dependencias para escribirlo', () => {
    const screen = readFileSync('src/components/Setlists/SetlistPrintScreen.tsx', 'utf8').replace(/\r\n/g, '\n');
    eq(screen.includes('window.print()'), true);
    const deps = JSON.parse(readFileSync('package.json', 'utf8')).dependencies as Record<string, string>;
    for (const forbidden of ['jspdf', 'pdfmake', 'react-pdf', '@react-pdf/renderer', 'html2canvas', 'puppeteer']) {
      eq(Object.keys(deps).includes(forbidden), false, forbidden);
    }
  });
});
