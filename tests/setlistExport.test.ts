import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { MINISTRY_NAME, buildSetlistDocument } from '../src/utils/setlistExport';
import { SetlistPrintSheet } from '../src/components/Setlists/SetlistPrintSheet';

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
      ['Entrada', 'Bendeciré al Señor'],
      ['Comunión', 'Pescador de Hombres'],
    ]);
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

  it('sigue la plantilla del ministerio: cabecera, momento, título y tono', () => {
    const html = sheet();
    eq(html.includes(MINISTRY_NAME), true);
    eq(html.includes('Misa Siervas de María'), true);
    eq(html.includes('Ensayo el viernes'), true);
    eq(html.includes('1. Comunión'), true, 'el momento, numerado');
    eq(html.includes('Pescador de Hombres'), true);
    eq(html.includes('Cesáreo Gabaráin'), true);
    eq(html.includes('Tono: D'), true);
    // Y en ese orden: primero el momento, después el título, después el tono.
    eq(html.indexOf('1. Comunión') < html.indexOf('Pescador de Hombres'), true);
    eq(html.indexOf('Pescador de Hombres') < html.indexOf('Tono: D'), true);
  });

  it('los acordes van encima de la letra, no en una lista aparte', () => {
    const html = sheet();
    eq(html.includes('Señor,'), true, 'la letra');
    eq(html.includes('>D<'), true, 'y sus acordes');
    // El acorde de una sílaba y la sílaba viajan en el mismo bloque.
    eq(/data-lyric-word/.test(html), true);
  });

  it('con cejilla dice lo que suena y lo que tocan los dedos', () => {
    const html = sheet(setlistOf({ items: [item({ transposeSteps: 2, capoFret: 3 })] }));
    eq(html.includes('Tono: G'), true);
    eq(html.includes('Formas de E'), true);
    eq(html.includes('Escrita en D'), true);
    eq(html.includes('Cejilla en el traste 3'), true);
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
    eq(html.includes('×2'), true);
    eq(html.includes('Suave'), true);
    eq(html.toLowerCase().includes('mujeres'), true);
  });

  it('una canción sin acordes lo dice, para que no parezca una impresión a medias', () => {
    const html = sheet(setlistOf({ items: [item({ songId: 'bendecire' })] }));
    eq(html.includes('todavía no tiene acordes en el cancionero'), true);
    eq(html.includes('Bendeciré al Señor, con toda mi alma'), true, 'la letra sí sale');
  });

  it('una canción que falta se dice igual de claro', () => {
    const html = sheet(setlistOf({ items: [item({ songId: 'no-existe' })] }));
    eq(html.includes('no está en el cancionero de este dispositivo'), true);
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

  it('hoy sólo existe la del músico: no hay media pantalla de la otra', () => {
    eq(detail.includes('Exportar PDF para músicos'), true);
    for (const forbidden of ['no músicos', 'cantantes', 'Siervas', 'audience', 'variant=']) {
      eq(detail.includes(forbidden), false, forbidden);
      eq(sheetSource.includes(forbidden), false, `hoja: ${forbidden}`);
    }
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
