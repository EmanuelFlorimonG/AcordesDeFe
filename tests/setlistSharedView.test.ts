import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { SetlistSongList } from '../src/components/Setlists/SetlistSongList';
import { SharedSetlistView } from '../src/components/Setlists/SharedSetlistScreen';
import { ARRANGEMENT_PENDING_TEXT } from '../src/components/Setlists/ArrangementPendingNotice';

/**
 * Las dos caras del mismo Setlist.
 *
 * La página que reparte un enlace y la que ve quien lo prepara son la misma
 * lista de canciones, el mismo componente y el mismo aspecto. Lo que las
 * separa no es el diseño: son las capacidades. A la compartida no se le
 * entrega ninguna función de editar, mover ni quitar, y por eso no tiene
 * menú, ni asa, ni nada que tocar.
 *
 * Eso es lo que se vigila aquí: que cada control aparezca solo cuando existe
 * la función que lo haría funcionar, y que no quede ninguno suelto en la
 * pantalla pública. Un botón desactivado seguiría siendo un botón; aquí no
 * hay botón.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSharedView.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 9, 4, 12);

const CANCIONES = new Map<string, Song>([
  ['huracan', { id: 'huracan', title: 'Huracán', artist: 'Hakuna', originalKey: 'G', tempo: 78, categories: [], tags: [], content: '[G]Letra', chordsUsed: ['G'] } as unknown as Song],
  ['alma', { id: 'alma', title: 'Alma mía', artist: 'Hakuna', categories: [], tags: [], content: 'Letra', chordsUsed: [] } as unknown as Song],
]);

const ENTRADAS: SetlistItem[] = [
  { id: 'item-1', songId: 'huracan', moment: 'Entrada', transposeSteps: 2, capoFret: 3, notes: 'Último coro x2' },
  { id: 'item-2', songId: 'alma', moment: 'Comunión', transposeSteps: 0, capoFret: 0, notes: '' },
];

const SETLIST: Setlist = {
  id: 'setlist-1',
  name: 'Misa del domingo',
  date: '2026-10-04',
  description: 'Ensayo el viernes',
  participantIds: ['miembro-1', 'miembro-2'],
  items: ENTRADAS,
  createdAt: NOW,
  updatedAt: NOW,
};

const nada = () => {};

/** La lista de canciones, con las capacidades que se le den. */
const lista = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    createElement(SetlistSongList, {
      items: ENTRADAS,
      songsById: CANCIONES,
      onOpenItem: nada,
      ...props,
    } as never)
  );

/** Todas las capacidades: la página de quien lo prepara. */
const CON_TODO = {
  onEditItem: nada,
  onRemoveItem: nada,
  onMoveItem: nada,
  onMoveItemBy: nada,
};

// --- La vista normal conserva lo suyo ---------------------------------------

describe('Con capacidades, los controles están', () => {
  const html = lista(CON_TODO);

  it('el menú de cada canción, con todo lo que se puede hacer', () => {
    eq(html.includes('Opciones de Huracán'), true, 'el menú');
    eq(html.includes('aria-live="polite"'), true, 'y los avisos de reordenación');
  });

  it('y el asa para arrastrar', () => {
    eq(html.includes('Reordenar Huracán'), true);
    eq(html.includes('Arrastra para reordenar'), true);
  });
});

// --- Cada capacidad, la suya ------------------------------------------------

describe('Cada control mira su propia capacidad, no una sola bandera', () => {
  it('solo editar: hay menú, pero sin mover ni quitar', () => {
    const html = lista({ onEditItem: nada });
    eq(html.includes('Opciones de Huracán'), true, 'el menú aparece');
    eq(html.includes('Reordenar Huracán'), false, 'pero no el asa');
    eq(html.includes('aria-live="polite"'), false, 'ni los avisos');
  });

  it('media capacidad de reordenar no es capacidad: hacen falta las dos', () => {
    // Mover con el ratón y mover con el teclado son la misma cosa vista de
    // dos maneras. Con una sola, el asa prometería algo que no cumple.
    for (const media of [{ onMoveItem: nada }, { onMoveItemBy: nada }]) {
      eq(lista(media).includes('Reordenar Huracán'), false, JSON.stringify(Object.keys(media)));
    }
    eq(lista({ onMoveItem: nada, onMoveItemBy: nada }).includes('Reordenar Huracán'), true);
  });

  it('sin ninguna, no hay menú: abrir ya se hace tocando el título', () => {
    const html = lista();
    eq(html.includes('Opciones de'), false);
    eq(html.includes('Abrir canción'), false);
  });
});

// --- La vista compartida ----------------------------------------------------

describe('La página compartida enseña lo mismo y no deja tocar nada', () => {
  const html = renderToStaticMarkup(
    createElement(SharedSetlistView, {
      setlist: SETLIST,
      songsById: CANCIONES,
      onGoToSongbook: nada,
      onOpenSong: nada,
      onRehearsal: nada,
      onLive: nada,
    })
  );

  it('con la cabecera de siempre: fecha, nombre y cuántas son', () => {
    eq(html.includes('Misa del domingo'), true, 'el nombre');
    eq(html.includes('2026'), true, 'la fecha');
    eq(html.includes('2 canciones'), true, 'el recuento');
    eq(html.includes('Ensayo el viernes'), true, 'la descripción');
  });

  it('y las canciones en filas compactas, como en la vista normal', () => {
    eq(html.includes('Huracán'), true);
    eq(html.includes('Alma mía'), true);
    eq(html.includes('Entrada'), true, 'el momento');
    eq(html.includes('Comunión'), true);
    eq(html.includes('Hakuna'), true, 'el artista');
    eq(html.includes('78 BPM'), true, 'el tempo');
    eq(html.includes('Cej. 3'), true, 'la cejilla');
  });

  it('en su orden', () => {
    eq(html.indexOf('Huracán') < html.indexOf('Alma mía'), true);
  });

  it('sin menú, sin asa y sin avisos de reordenación', () => {
    for (const control of [
      'Opciones de',
      'Reordenar',
      'Arrastra para reordenar',
      'aria-live="polite"',
      'Quitar del Setlist',
      'Tono, momento y arreglo',
      'Mover arriba',
      'Mover abajo',
      'draggable',
      '<input',
      '<textarea',
    ]) {
      eq(html.includes(control), false, control);
    }
  });

  it('sin decir quién toca: eso no sale en un enlace público', () => {
    // Los participantes viajan en el Setlist, pero sus nombres son de ellos.
    eq(html.includes('miembro-1'), false);
    eq(html.includes('Equipo'), false);
    eq(html.includes('Añadir miembros'), false);
  });

  it('sin etiqueta de sólo lectura: la fecha abre la cabecera', () => {
    eq(html.includes('Setlist compartido · sólo lectura'), false);
    eq(html.includes('sólo lectura'), false, 'ni ninguna otra que lo anuncie');
    // Lo primero que se lee es la fecha, antes que el nombre.
    eq(html.indexOf('DOMINGO') < html.indexOf('Misa del domingo'), true);
  });

  it('ni nota al final: solo la salida al cancionero', () => {
    eq(html.includes('aquí no se puede cambiar nada'), false);
    eq(html.includes('Ver el cancionero'), true);
  });

  it('y con los dos modos, que también son de leer', () => {
    eq(html.includes('Modo Ensayo'), true);
    eq(html.includes('Modo Misa'), true, 'un Setlist sin tipo es una misa');
  });

  it('los modos sólo cuando hay a dónde ir', () => {
    const solo = renderToStaticMarkup(
      createElement(SharedSetlistView, { setlist: SETLIST, songsById: CANCIONES, onGoToSongbook: nada })
    );
    eq(solo.includes('Modo Ensayo'), false);
    eq(solo.includes('Modo Misa'), false);
  });
});

// --- Nada que escriba -------------------------------------------------------

describe('Sin a quién avisar, no se busca a quién avisar', () => {
  /** Una entrada con un arreglo de una versión que ya no es la de la canción. */
  const conArregloViejo: SetlistItem[] = [
    {
      ...ENTRADAS[0],
      arrangement: {
        songVersion: 1,
        sections: [
          {
            id: 'b1',
            sourceSectionId: 'section-99',
            label: 'Coro',
            repeatCount: 2,
            voices: [],
            instruction: '',
            transition: { type: 'continue' },
            needsReview: true,
          },
        ],
      },
    },
  ];

  const pintar = (props: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(SetlistSongList, {
        items: conArregloViejo,
        songsById: CANCIONES,
        onOpenItem: nada,
        ...props,
      } as never)
    );

  it('con quien lo anote, se avisa de que el arreglo necesita revisión', () => {
    eq(pintar({ ...CON_TODO, onArrangementNeedsReview: nada }).includes(ARRANGEMENT_PENDING_TEXT), true);
  });

  it('sin quien lo anote, ni se calcula: no hay efecto que pueda escribir', () => {
    // Anotar la revisión es escribir en el Setlist. La página compartida no
    // tiene dónde escribir, así que el aviso no se busca siquiera.
    eq(pintar({}).includes(ARRANGEMENT_PENDING_TEXT), false);
  });

  it('y la página compartida nunca entrega esa función', () => {
    const fuente = readFileSync('src/components/Setlists/SharedSetlistScreen.tsx', 'utf8');
    eq(fuente.includes('onArrangementNeedsReview'), false);
    eq(fuente.includes('onEditItem'), false);
    eq(fuente.includes('onRemoveItem'), false);
    eq(fuente.includes('onMoveItem'), false);
  });
});

// --- Lo que va debajo de la fila -------------------------------------------

describe('El detalle de cada canción, solo cuando se dijo algo', () => {
  /** Una entrada con arreglo y con transición a la siguiente. */
  const conDetalle: SetlistItem = {
    ...ENTRADAS[0],
    arrangement: {
      songVersion: 1,
      sections: [
        {
          id: 'b1',
          sourceSectionId: 'section-1',
          label: 'Coro',
          repeatCount: 2,
          voices: [],
          instruction: 'Entrar suave',
          transition: { type: 'continue' },
        },
      ],
    },
    transitionToNext: { type: 'direct', instruction: 'Sin respirar' },
  };

  const compartida = (items: SetlistItem[]) =>
    renderToStaticMarkup(
      createElement(SharedSetlistView, {
        setlist: { ...SETLIST, items },
        songsById: CANCIONES,
        onGoToSongbook: nada,
        onOpenSong: nada,
      })
    );

  it('con arreglo y transición, se enseñan los dos', () => {
    const html = compartida([conDetalle, ENTRADAS[1]]);
    eq(html.includes('Arreglo'), true, 'el título del resumen');
    eq(html.includes('Entrar suave'), true, 'la indicación');
    eq(html.includes('×2'), true, 'las repeticiones');
    eq(html.includes('Al terminar:'), true, 'la transición');
    eq(html.includes('Sin respirar'), true);
  });

  it('sin nada que decir, no se abre ninguna caja', () => {
    const html = compartida(ENTRADAS);
    eq(html.includes('Arreglo'), false);
    eq(html.includes('Al terminar:'), false);
  });

  it('la última no habla de a dónde va, porque no va a ninguna parte', () => {
    const sola = compartida([conDetalle]);
    eq(sola.includes('Al terminar:'), false, 'es la última');
    eq(sola.includes('Entrar suave'), true, 'pero su arreglo sigue ahí');
  });

  it('el detalle no cambia el orden ni la numeración', () => {
    const html = compartida([conDetalle, ENTRADAS[1]]);
    eq(html.indexOf('Huracán') < html.indexOf('Alma mía'), true, 'el orden');
    eq(html.includes('>01<'), true, 'la primera sigue siendo la 01');
    eq(html.includes('>02<'), true);
  });

  it('y sigue sin haber por dónde tocarlo', () => {
    const html = compartida([conDetalle, ENTRADAS[1]]);
    for (const control of ['Opciones de', 'Reordenar', 'aria-live="polite"', '<input', '<textarea']) {
      eq(html.includes(control), false, control);
    }
  });

  it('la vista normal no estrena ese detalle: allí se entra a la canción', () => {
    const html = lista({ ...CON_TODO, items: [conDetalle, ENTRADAS[1]] });
    eq(html.includes('Entrar suave'), false);
    eq(html.includes('Al terminar:'), false);
    eq(html.includes('Opciones de Huracán'), true, 'y conserva sus controles');
  });
});
