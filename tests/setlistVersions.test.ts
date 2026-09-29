import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import { compareSetlistVersions, describeTranspose } from '../src/utils/setlistVersions';

/**
 * Dos versiones del mismo Setlist, escritas para que alguien elija.
 *
 * Lo que se comprueba aquí no es una estructura: es que una persona pueda leer
 * qué cambió sin saber nada de cómo se guarda esto, y que no aparezca como
 * diferencia algo que en realidad no viaja entre dispositivos.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistVersions.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);

const item = (id: string, overrides: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  songId: 'huracan',
  moment: 'Entrada',
  transposeSteps: 0,
  capoFret: 0,
  notes: '',
  ...overrides,
});

const setlistOf = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'setlist-1',
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Primera prueba',
  participantIds: [],
  items: [item('item-1')],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const TITLES = new Map([
  ['huracan', 'Huracán'],
  ['alma-mia', 'Alma mía'],
]);
const title = (songId: string) => TITLES.get(songId) ?? 'Canción';

const compare = (mine: Setlist, theirs: Setlist) => compareSetlistVersions(mine, theirs, title);
const fieldNamed = (mine: Setlist, theirs: Setlist, label: string) =>
  compare(mine, theirs).fields.find((field) => field.label === label);

describe('Comparar dos versiones de un Setlist', () => {
  it('dice qué cambió y qué no, con las dos versiones a la vista', () => {
    const mine = setlistOf({ name: 'Version de este dispositivo' });
    const theirs = setlistOf({ name: 'Version del otro dispositivo' });

    const nombre = fieldNamed(mine, theirs, 'Nombre');
    eq(nombre?.mine, 'Version de este dispositivo');
    eq(nombre?.theirs, 'Version del otro dispositivo');
    eq(nombre?.differs, true);
    eq(fieldNamed(mine, theirs, 'Descripción')?.differs, false, 'lo igual se marca igual');
    eq(compare(mine, theirs).identical, false);
  });

  it('las fechas se leen como fechas, no como se guardan', () => {
    const fecha = fieldNamed(setlistOf(), setlistOf({ date: '2026-12-25' }), 'Fecha');
    eq(fecha?.mine.includes('2026'), true);
    eq(fecha?.mine.includes('-'), false, 'nunca "2026-10-04"');
    eq(fecha?.theirs.includes('diciembre'), true);
    eq(fecha?.differs, true);
  });

  it('una fecha sin poner no se inventa', () => {
    const fecha = fieldNamed(setlistOf({ date: '' }), setlistOf(), 'Fecha');
    eq(fecha?.mine, '—');
    eq(fecha?.differs, true);
  });

  it('las canciones se cuentan en las palabras de siempre', () => {
    const una = setlistOf();
    const dos = setlistOf({ items: [item('item-1'), item('item-2', { songId: 'alma-mia' })] });
    const canciones = fieldNamed(una, dos, 'Canciones');
    eq(canciones?.mine, '1 canción');
    eq(canciones?.theirs, '2 canciones');
  });

  it('el orden se compara por el sitio que ocupa cada canción', () => {
    const mine = setlistOf({ items: [item('a'), item('b', { songId: 'alma-mia' })] });
    // Las mismas dos canciones, al revés.
    const theirs = setlistOf({ items: [item('b', { songId: 'alma-mia' }), item('a')] });

    const { songs } = compare(mine, theirs);
    eq(songs.length, 2);
    eq(songs[0].position, 1);
    eq(songs[0].mine, 'Huracán');
    eq(songs[0].theirs, 'Alma mía');
    eq(songs[0].differs, true, 'el primer puesto cambió de canción');
    eq(songs[1].mine, 'Alma mía');
    eq(songs[1].theirs, 'Huracán');
  });

  it('una canción que sólo está en una versión se ve como ausente en la otra', () => {
    const mine = setlistOf({ items: [item('a'), item('b', { songId: 'alma-mia' })] });
    const { songs } = compare(mine, setlistOf());
    eq(songs.length, 2);
    eq(songs[1].mine, 'Alma mía');
    eq(songs[1].theirs, null, 'no está');
    eq(songs[1].differs, true);
    eq(songs[1].details, [], 'y no se comparan detalles de algo que no está');
  });

  it('el tono y la cejilla se dicen en música, no en números sueltos', () => {
    eq(describeTranspose(0), 'Tono original');
    eq(describeTranspose(1), '1 semitono más alto');
    eq(describeTranspose(-3), '3 semitonos más bajo');

    const mine = setlistOf({ items: [item('a', { transposeSteps: 2, capoFret: 3 })] });
    const theirs = setlistOf({ items: [item('a', { transposeSteps: 0, capoFret: 0 })] });
    const detalles = compare(mine, theirs).songs[0].details;
    const tono = detalles.find((field) => field.label === 'Tono');
    eq(tono?.mine, '2 semitonos más alto');
    eq(tono?.theirs, 'Tono original');
    const cejilla = detalles.find((field) => field.label === 'Cejilla');
    eq(cejilla?.mine, 'Cejilla en el traste 3');
    eq(cejilla?.theirs, 'Sin cejilla');
  });

  it('un arreglo se resume por sus bloques, y una transición por lo que hará la banda', () => {
    const conArreglo = setlistOf({
      items: [
        item('a', {
          arrangement: {
            songVersion: 1,
            sections: [
              {
                id: 'b1',
                sourceSectionId: 'section-1',
                label: 'Coro',
                repeatCount: 2,
                voices: ['women'],
                instruction: '',
                transition: { type: 'continue' },
              },
            ],
          },
          transitionToNext: { type: 'direct', instruction: 'Sin respirar' },
        }),
      ],
    });
    const detalles = compare(conArreglo, setlistOf()).songs[0].details;

    const arreglo = detalles.find((field) => field.label === 'Arreglo');
    eq(arreglo?.mine, '1 bloque: Coro');
    eq(arreglo?.theirs, 'Se toca como está escrita');
    eq(detalles.find((field) => field.label === 'Repeticiones y saltos')?.mine, '1 bloque repetido');
    const alTerminar = detalles.find((field) => field.label === 'Al terminar');
    eq(alTerminar?.mine, 'entra directa en la siguiente — Sin respirar');
    eq(alTerminar?.theirs, 'Sin indicar');
  });

  it('sólo se enseña de cada canción lo que no coincide', () => {
    const mine = setlistOf({ items: [item('a', { moment: 'Entrada' })] });
    const theirs = setlistOf({ items: [item('a', { moment: 'Comunión' })] });
    const detalles = compare(mine, theirs).songs[0].details;
    eq(detalles.map((field) => field.label), ['Momento'], 'y nada más');
    eq(detalles[0].differs, true);
  });

  it('cambiar quién canta no es una diferencia con la cuenta', () => {
    // Lo mismo, con personas elegidas aquí: eso no viaja, así que no se
    // presenta como algo entre lo que haya que elegir.
    const conGente = setlistOf({
      participantIds: ['miembro-ana'],
      items: [
        item('a', {
          arrangement: {
            songVersion: 1,
            sections: [
              {
                id: 'b1',
                sourceSectionId: 'section-1',
                label: 'Coro',
                repeatCount: 1,
                voices: [],
                assignedMemberIds: ['miembro-ana'],
                instruction: '',
                transition: { type: 'continue' },
              },
            ],
          },
        }),
      ],
    });
    const sinGente = setlistOf({
      items: [
        item('a', {
          arrangement: {
            songVersion: 1,
            sections: [
              {
                id: 'b1',
                sourceSectionId: 'section-1',
                label: 'Coro',
                repeatCount: 1,
                voices: [],
                assignedMemberIds: [],
                instruction: '',
                transition: { type: 'continue' },
              },
            ],
          },
        }),
      ],
    });

    const comparison = compare(conGente, sinGente);
    eq(comparison.identical, true, 'para quien mira, son la misma');
    eq(comparison.songs[0].details, []);
  });

  it('dos versiones que se leen igual lo dicen, en vez de fingir una diferencia', () => {
    const comparison = compare(setlistOf(), setlistOf({ updatedAt: NOW + 5000 }));
    eq(comparison.identical, true);
  });

  it('no aparece nada de cómo funciona esto por dentro', () => {
    const mine = setlistOf({ name: 'Aqui', items: [item('a', { transposeSteps: 2 })] });
    const theirs = setlistOf({ name: 'Alla' });
    const comparison = compare(mine, theirs);
    const texto = [
      ...comparison.fields.flatMap((field) => [field.label, field.mine, field.theirs]),
      ...comparison.songs.flatMap((song) => [
        song.mine ?? '',
        song.theirs ?? '',
        ...song.details.flatMap((field) => [field.label, field.mine, field.theirs]),
      ]),
    ].join(' | ');

    for (const interno of ['revision', 'fingerprint', 'huella', 'payload', 'owner_id', 'token', 'sourceSectionId', 'songId', 'id']) {
      eq(texto.toLowerCase().includes(interno.toLowerCase()), false, `${interno}: ${texto}`);
    }
  });

  it('es una descripción y nada más: no escribe, no lee stores, no pide nada', () => {
    const code = readFileSync('src/utils/setlistVersions.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const forbidden of [
      'localStorage',
      'fetch',
      'await',
      'async',
      'useState',
      'react',
      'portableFingerprint',
      'cloud',
      'runSetlistSync',
    ]) {
      eq(code.includes(forbidden), false, forbidden);
    }
  });
});
