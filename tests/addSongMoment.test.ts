import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React, { type ReactElement, type ReactNode } from 'react';
import type { Setlist } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { AddSongsDialog } from '../src/components/Setlists/AddSongsDialog';
import { ADORATION_MOMENTS, MASS_MOMENTS } from '../src/utils/setlists';
import { runHook } from './hookHarness';

/**
 * En qué parte de la celebración entra una canción.
 *
 * El cancionero dice de qué va una canción; el Setlist dice cuándo se canta
 * esta vez. Son dos cosas distintas y por eso «Vamos Claretianos», que está
 * clasificada como Claretiana, se canta de Entrada tantas veces como haga
 * falta sin que su ficha cambie ni una letra.
 *
 * Lo que se vigila aquí es sobre todo que el filtro no mande sobre el momento:
 * ayuda mientras nadie ha elegido, y se calla en cuanto alguien elige.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`addSongMoment.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 9, 18, 12);

const song = (id: string, title: string, categories: string[]): Song =>
  ({
    id,
    title,
    artist: '',
    categories,
    liturgicalSeasons: ['todo-el-ano'],
    tags: [],
    content: '[G]Una letra',
    chordsUsed: ['G'],
  }) as unknown as Song;

const SONGS = [
  song('vamos-claretianos', 'Vamos Claretianos', ['Claretiana']),
  song('bendecire-al-senor', 'Bendeciré al Señor', ['Entrada']),
  song('pongo-en-tus-manos', 'Pongo en tus Manos', ['Ofertorio']),
];

const setlistOf = (kind?: 'misa' | 'adoracion'): Setlist => ({
  id: 'setlist-1',
  ...(kind === 'adoracion' ? { kind } : {}),
  name: kind === 'adoracion' ? 'Adoración del jueves' : 'Misa prueba',
  date: '2026-10-18',
  description: '',
  participantIds: [],
  items: [],
  createdAt: NOW,
  updatedAt: NOW,
});

// --- La ventana, de verdad, sin pantalla ----------------------------------

type Pulsable = ReactElement<{ children?: ReactNode; onClick?: () => void; 'aria-label'?: string }>;

/** Todo lo que se puede pulsar en el árbol que devuelve la ventana. */
function buttons(node: ReactNode): Pulsable[] {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!React.isValidElement<{ children?: ReactNode }>(node)) return [];
  const element = node as Pulsable;
  const propios = element.type === 'button' ? [element] : [];
  return [...propios, ...buttons(element.props.children)];
}

/** El selector de momento: se le pregunta por su etiqueta. */
function momentSelect(node: ReactNode): { value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void } | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = momentSelect(child);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement<{ children?: ReactNode; label?: string }>(node)) return null;
  const element = node as ReactElement<{ children?: ReactNode; label?: string; value?: unknown; options?: unknown; onChange?: unknown }>;
  if (element.props.label === 'Momento en la celebración') {
    return element.props as unknown as { value: string; options: Array<{ value: string; label: string }>; onChange: (v: string) => void };
  }
  return momentSelect(element.props.children ?? null);
}

/** Un chip de categoría, por su texto. */
function chip(node: ReactNode, name: string): Pulsable | null {
  for (const boton of buttons(node)) {
    const hijos = boton.props.children;
    const textos = (Array.isArray(hijos) ? hijos : [hijos]).filter((x) => typeof x === 'string');
    if (textos.includes(name)) return boton;
  }
  return null;
}

/** El botón de añadir de una canción, por su nombre accesible. */
function addButton(node: ReactNode, title: string): Pulsable | null {
  return (
    buttons(node).find((boton) => (boton.props['aria-label'] ?? '').startsWith(`Añadir ${title}`)) ?? null
  );
}

/** Abre la ventana con un Setlist, y apunta lo que se le pide añadir. */
function open(kind?: 'misa' | 'adoracion') {
  const added: Array<{ song: Song; moment: string }> = [];
  const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', {
    value: { setTimeout: () => 0, clearTimeout() {}, addEventListener() {}, removeEventListener() {} },
    configurable: true,
    writable: true,
  });
  const run = runHook(() =>
    AddSongsDialog({
      songs: SONGS,
      setlist: setlistOf(kind),
      onAdd: (song, moment) => added.push({ song, moment }),
      onClose() {},
    }) as ReactElement
  );
  return {
    run,
    added,
    /** Lo que diga el selector ahora mismo. */
    get moment() {
      return momentSelect(run.current)?.value ?? null;
    },
    get options() {
      return (momentSelect(run.current)?.options ?? []).map((option) => option.label);
    },
    /** Elegir un momento a mano, como quien abre la lista y pulsa. */
    choose(value: string) {
      momentSelect(run.current)?.onChange(value);
      run.flush();
    },
    /** Pulsar un chip de categoría. */
    filterBy(name: string) {
      chip(run.current, name)?.props.onClick?.();
      run.flush();
    },
    add(title: string) {
      addButton(run.current, title)?.props.onClick?.();
      run.flush();
    },
    close() {
      run.unmount();
      if (before) Object.defineProperty(globalThis, 'window', before);
      else delete (globalThis as { window?: unknown }).window;
    },
  };
}

// --- Lo que se añade -------------------------------------------------------

describe('El momento lo elige quien prepara, no la categoría', () => {
  it('una canción Claretiana entra de Entrada', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.add('Vamos Claretianos');

      eq(ventana.added.length, 1);
      eq(ventana.added[0].moment, 'Entrada');
      eq(ventana.added[0].song.id, 'vamos-claretianos');
    } finally {
      ventana.close();
    }
  });

  it('y su clasificación en el cancionero no se toca', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.add('Vamos Claretianos');

      eq(ventana.added[0].song.categories, ['Claretiana'], 'sigue siendo Claretiana');
      // Ni la canción del catálogo, que es la misma referencia.
      eq(SONGS[0].categories, ['Claretiana']);
    } finally {
      ventana.close();
    }
  });

  it('«Sin momento» deja la entrada sin momento, sin mirar su categoría', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.choose('');
      eq(ventana.moment, '');

      ventana.add('Bendeciré al Señor');
      eq(ventana.added[0].moment, '', 'y no hereda «Entrada» de su categoría');
    } finally {
      ventana.close();
    }
  });

  it('cambiar de momento antes de añadir cambia lo que se añade', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.choose('Salida');
      ventana.add('Vamos Claretianos');

      eq(ventana.added[0].moment, 'Salida');
    } finally {
      ventana.close();
    }
  });

  it('cada canción entra con el momento que hubiera en ese instante', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.add('Vamos Claretianos');
      ventana.choose('Piedad');
      ventana.add('Bendeciré al Señor');

      eq(
        ventana.added.map((entrada) => [entrada.song.title, entrada.moment]),
        [
          ['Vamos Claretianos', 'Entrada'],
          ['Bendeciré al Señor', 'Piedad'],
        ]
      );
    } finally {
      ventana.close();
    }
  });
});

// --- El filtro ayuda, pero no manda ---------------------------------------

describe('El filtro y el momento son dos cosas', () => {
  it('sin tocar nada, se empieza sin momento', () => {
    const ventana = open();
    try {
      eq(ventana.moment, '');
    } finally {
      ventana.close();
    }
  });

  it('pulsar un chip que es un momento lo propone', () => {
    const ventana = open();
    try {
      ventana.filterBy('Ofertorio');
      eq(ventana.moment, 'Ofertorio', 'el atajo de siempre sigue ahí');

      ventana.add('Pongo en tus Manos');
      eq(ventana.added[0].moment, 'Ofertorio');
    } finally {
      ventana.close();
    }
  });

  it('un chip que no es un momento no propone nada', () => {
    const ventana = open();
    try {
      ventana.filterBy('Claretiana');
      eq(ventana.moment, '', 'una categoría temática no es una parte de la misa');
    } finally {
      ventana.close();
    }
  });

  it('en cuanto se elige a mano, el chip deja de mandar', () => {
    const ventana = open();
    try {
      ventana.filterBy('Ofertorio');
      eq(ventana.moment, 'Ofertorio');

      ventana.choose('Entrada');
      eq(ventana.moment, 'Entrada');

      // El filtro sigue siendo Ofertorio y no vuelve a pisar la elección.
      ventana.add('Pongo en tus Manos');
      eq(ventana.added[0].moment, 'Entrada', 'manda lo que eligió la persona');
    } finally {
      ventana.close();
    }
  });

  it('ni siquiera al cambiar de filtro otra vez', () => {
    const ventana = open();
    try {
      ventana.choose('Entrada');
      ventana.filterBy('Ofertorio');
      eq(ventana.moment, 'Entrada', 'nada cambia por sorpresa');
    } finally {
      ventana.close();
    }
  });

  it('y elegir «Sin momento» también es elegir', () => {
    const ventana = open();
    try {
      ventana.choose('');
      ventana.filterBy('Ofertorio');
      eq(ventana.moment, '', 'el chip no lo resucita');
    } finally {
      ventana.close();
    }
  });
});

// --- Cada celebración, sus partes -----------------------------------------

describe('Los momentos que se ofrecen son los de esta celebración', () => {
  it('una misa ofrece las partes de la misa, y «Sin momento»', () => {
    const ventana = open();
    try {
      eq(ventana.options, [...MASS_MOMENTS, 'Sin momento']);
      eq(ventana.options.includes('Paz'), false, 'la Paz dejó de ofrecerse');
      for (const deAdoracion of ADORATION_MOMENTS.filter((m) => m !== 'Salida')) {
        eq(ventana.options.includes(deAdoracion), false, deAdoracion);
      }
    } finally {
      ventana.close();
    }
  });

  it('una adoración ofrece las suyas, y «Sin momento»', () => {
    const ventana = open('adoracion');
    try {
      eq(ventana.options, [...ADORATION_MOMENTS, 'Sin momento']);
      for (const deMisa of ['Ofertorio', 'Santo', 'Comunión', 'PostComunión']) {
        eq(ventana.options.includes(deMisa), false, deMisa);
      }
    } finally {
      ventana.close();
    }
  });

  it('y en una adoración un chip de la misa no propone nada', () => {
    const ventana = open('adoracion');
    try {
      ventana.filterBy('Ofertorio');
      eq(ventana.moment, '', 'Ofertorio no es una parte de una adoración');
    } finally {
      ventana.close();
    }
  });

  it('las listas salen de donde ya estaban, no de una copia nueva', () => {
    // Sin comentarios: ahí los momentos se nombran al explicar, y eso no es
    // una constante duplicada.
    const codigo = readFileSync('src/components/Setlists/AddSongsDialog.tsx', 'utf8')
      .replace(/\r\n/g, '\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');

    eq(codigo.includes('momentsFor(setlist.kind)'), true, 'se piden al proyecto');
    for (const copiado of ['Ofertorio', 'PostComunión', 'Peticiones al Espíritu Santo']) {
      eq(codigo.includes(copiado), false, `${copiado} escrito a mano`);
    }
  });
});
