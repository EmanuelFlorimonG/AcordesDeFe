import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Setlist } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { copySharedSetlist, sharedCopyId } from '../src/utils/setlists';
import { SharedSetlistView } from '../src/components/Setlists/SharedSetlistScreen';

/**
 * Guardar en tu cuenta la copia de un Setlist que te pasaron por enlace.
 *
 * Lo que se copia es lo que se canta: canciones, orden, momentos, reservas,
 * tonos, cejillas, notas, arreglos y transiciones. Lo que no se copia es lo
 * que es de otros: el equipo del coro que lo preparó y quién cantaba cada
 * bloque. El enlace tampoco lo enseña, pero aquí queda dicho para que siga
 * siendo verdad el día que el enlace enseñe más.
 *
 * Y la copia es de quien la guarda: ids nuevos en todo, saltos del arreglo
 * reescritos a sus propias secciones, y el original intacto.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`sharedSetlistCopy.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 9, 29, 12);
let contador = 0;
const nuevoId = () => `nuevo-${++contador}`;

const CANCIONES = new Map<string, Song>([
  ['huracan', { id: 'huracan', title: 'Huracán', artist: 'Hakuna', originalKey: 'G', tempo: 78, categories: [], tags: [], content: '[G]x', chordsUsed: ['G'] } as unknown as Song],
  ['alma', { id: 'alma', title: 'Alma mía', artist: 'Hakuna', categories: [], tags: [], content: 'x', chordsUsed: [] } as unknown as Song],
]);

/** Un Setlist como llega por un enlace, con todo lo que puede traer. */
const compartido = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'original-abc',
  name: 'Adoración 29/10',
  kind: 'adoracion',
  date: '2026-10-29',
  description: 'Ensayo el viernes',
  participantIds: [],
  items: [
    {
      id: 'item-1',
      songId: 'huracan',
      moment: 'Entrada del Señor',
      transposeSteps: 2,
      capoFret: 3,
      notes: 'Último coro x2',
      arrangement: {
        songVersion: 1,
        sections: [
          { id: 'b1', sourceSectionId: 's1', label: 'Coro', repeatCount: 2, voices: [], instruction: 'Entrar suave', transition: { type: 'jump', targetId: 'b2' } },
          { id: 'b2', sourceSectionId: 's2', label: 'Puente', repeatCount: 1, voices: [], instruction: '', transition: { type: 'end' } },
        ],
      },
      transitionToNext: { type: 'direct', instruction: 'Sin respirar' },
    },
    { id: 'item-2', songId: 'alma', moment: 'Backup', transposeSteps: 0, capoFret: 0, notes: '' },
  ],
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
});

const copiar = (origen = compartido(), attempt = 1) => {
  contador = 0;
  return copySharedSetlist(origen, { now: NOW + 1000, createId: nuevoId, attempt });
};

// --- Una copia propia -------------------------------------------------------

describe('La copia es de quien la guarda', () => {
  it('estrena id, y el id dice de qué Setlist salió', () => {
    const copia = copiar();
    eq(copia.id, 'copia-original-abc');
    eq(copia.id === compartido().id, false);
  });

  it('cada entrada estrena el suyo', () => {
    const copia = copiar();
    eq(copia.items.map((item) => item.id), ['nuevo-2', 'nuevo-5']);
    for (const item of copia.items) {
      eq(compartido().items.some((original) => original.id === item.id), false, item.id);
    }
  });

  it('y los bloques del arreglo también', () => {
    const bloques = copiar().items[0].arrangement!.sections;
    eq(bloques.map((b) => b.id), ['nuevo-3', 'nuevo-4']);
  });

  it('los saltos apuntan a las secciones de la copia, no a las del original', () => {
    const bloques = copiar().items[0].arrangement!.sections;
    const salto = bloques[0].transition;
    eq(salto.type === 'jump' && salto.targetId, bloques[1].id);
    eq(salto.type === 'jump' && salto.targetId === 'b2', false, 'ya no apunta al original');
  });

  it('una segunda copia voluntaria tiene su propio id', () => {
    eq(sharedCopyId('original-abc', 2), 'copia-original-abc-2');
    eq(copiar(compartido(), 2).id, 'copia-original-abc-2');
  });

  it('el id lleva el original entero, nunca cortado', () => {
    // Cortarlo haría que dos originales con el mismo principio acabaran con
    // el mismo id. Lo que cabe va entero; lo que no cabe, no se copia.
    eq(sharedCopyId('original-abc'), 'copia-original-abc');
    eq(sharedCopyId('z'.repeat(56)), null, 'no deja sitio ni para el sufijo');
  });
});

// --- Lo que se canta viaja entero ------------------------------------------

describe('Se copia todo lo que hace falta para cantarla', () => {
  const copia = copiar();

  it('el nombre, tal cual: sin «(copia)»', () => {
    eq(copia.name, 'Adoración 29/10');
  });

  it('la fecha, la descripción y la clase de celebración', () => {
    eq([copia.date, copia.description, copia.kind], ['2026-10-29', 'Ensayo el viernes', 'adoracion']);
  });

  it('las canciones, en su orden, con sus momentos y su reserva', () => {
    eq(copia.items.map((item) => [item.songId, item.moment]), [
      ['huracan', 'Entrada del Señor'],
      ['alma', 'Backup'],
    ]);
  });

  it('el tono, la cejilla y las notas de esta ocasión', () => {
    eq([copia.items[0].transposeSteps, copia.items[0].capoFret, copia.items[0].notes], [2, 3, 'Último coro x2']);
  });

  it('el arreglo con sus repeticiones y sus indicaciones', () => {
    const bloques = copia.items[0].arrangement!.sections;
    eq(bloques.map((b) => [b.label, b.repeatCount, b.instruction]), [
      ['Coro', 2, 'Entrar suave'],
      ['Puente', 1, ''],
    ]);
    eq(copia.items[0].arrangement!.songVersion, 1);
  });

  it('y la transición a la siguiente', () => {
    eq(copia.items[0].transitionToNext, { type: 'direct', instruction: 'Sin respirar' });
  });
});

// --- Lo que es de otros, no -------------------------------------------------

describe('Lo del coro que lo preparó se queda con ellos', () => {
  it('el equipo no viaja, aunque el original lo tuviera', () => {
    const conEquipo = compartido({ participantIds: ['miembro-ana', 'miembro-bruno'] });
    eq(copiar(conEquipo).participantIds, []);
  });

  it('ni quién cantaba cada bloque', () => {
    const origen = compartido();
    origen.items[0].arrangement!.sections[0].assignedMemberIds = ['miembro-ana'];
    const bloques = copiar(origen).items[0].arrangement!.sections;
    for (const bloque of bloques) {
      eq('assignedMemberIds' in bloque, false, bloque.label);
    }
  });
});

// --- El original no se toca -------------------------------------------------

describe('El Setlist de quien lo compartió no se toca', () => {
  it('ni una letra, después de copiarlo', () => {
    const origen = compartido();
    const antes = JSON.stringify(origen);
    copiar(origen);
    eq(JSON.stringify(origen), antes);
  });

  it('y editar la copia no llega al original', () => {
    const origen = compartido();
    const copia = copiar(origen);
    copia.items[0].arrangement!.sections[0].label = 'Otra cosa';
    copia.items[0].notes = 'Cambiado';
    eq(origen.items[0].arrangement!.sections[0].label, 'Coro');
    eq(origen.items[0].notes, 'Último coro x2');
  });
});

// --- La misma copia, dos veces ---------------------------------------------

describe('Dos copias del mismo enlace chocan a propósito', () => {
  it('el id no depende del nombre: dos celebraciones pueden llamarse igual', () => {
    const uno = copiar(compartido({ id: 'original-uno', name: 'Adoración 29/10' }));
    const otro = copiar(compartido({ id: 'original-dos', name: 'Adoración 29/10' }));
    eq(uno.id === otro.id, false, 'mismo nombre, distinto origen, distinto id');
  });

  it('y dos copias del mismo origen sí comparten id, que es lo que avisa', () => {
    eq(copiar(compartido()).id, copiar(compartido()).id);
  });

  it('el id viaja con la fila, así que el aviso funciona en otro dispositivo', () => {
    // No hay columna que guarde el enlace de origen: la pista va dentro de la
    // clave primaria (owner_id, id), que es lo único que sube y baja.
    const esquema = readFileSync('supabase/migrations/20260925120000_user_setlists.sql', 'utf8');
    eq(esquema.includes('primary key (owner_id, id)'), true);
    eq(copiar().id.startsWith('copia-'), true);
  });
});

// --- El menú de la vista compartida ----------------------------------------

describe('El menú compartido ofrece guardar, y nada más', () => {
  const pintar = (props: Record<string, unknown> = {}) =>
    renderToStaticMarkup(
      createElement(SharedSetlistView, {
        setlist: compartido(),
        songsById: CANCIONES,
        onGoToSongbook: () => {},
        onOpenSong: () => {},
        onRehearsal: () => {},
        onLive: () => {},
        ...props,
      } as never)
    );

  it('sin forma de guardar, no hay menú', () => {
    const html = pintar();
    eq(html.includes('Opciones del Setlist compartido'), false);
    eq(html.includes('Guardar una copia'), false);
  });

  it('con ella, el menú aparece', () => {
    eq(pintar({ onSaveCopy: () => {} }).includes('Opciones del Setlist compartido'), true);
  });

  it('y su única acción es guardar la copia', () => {
    // Las opciones viven en el desplegable, que no se pinta hasta abrirlo.
    const fuente = readFileSync('src/components/Setlists/SharedSetlistScreen.tsx', 'utf8');
    const menu = fuente.slice(fuente.indexOf('<ActionMenu'), fuente.indexOf('/>', fuente.indexOf('items={[')));
    eq(menu.includes("'Guardar una copia'"), true);
    eq((menu.match(/onSelect:/g) ?? []).length, 1, 'una sola entrada');
    eq(menu.includes('disabled: savingCopy'), true, 'y desactivada mientras guarda');
  });

  it('y nunca ofrece tocar el original', () => {
    const html = pintar({ onSaveCopy: () => {} });
    for (const control of [
      'Editar nombre y fecha',
      'Duplicar Setlist',
      'Eliminar',
      'Compartir Setlist',
      'Quitar del Setlist',
      'Tono, momento y arreglo',
      'Mover arriba',
      'Reordenar',
      'aria-live="polite"',
    ]) {
      eq(html.includes(control), false, control);
    }
  });

  it('mientras guarda, el menú sigue ahí y la acción está desactivada', () => {
    const html = pintar({ onSaveCopy: () => {}, savingCopy: true });
    eq(html.includes('Opciones del Setlist compartido'), true);
    const fuente = readFileSync('src/components/Setlists/SharedSetlistScreen.tsx', 'utf8');
    eq(fuente.includes("savingCopy ? 'Guardando una copia…' : 'Guardar una copia'"), true);
  });

  it('si falla, lo explica donde se ve', () => {
    const html = pintar({ onSaveCopy: () => {}, saveCopyError: 'No se pudo guardar la copia.' });
    eq(html.includes('No se pudo guardar la copia.'), true);
    eq(html.includes('role="alert"'), true);
  });

  it('y el resto de la página sigue igual', () => {
    const html = pintar({ onSaveCopy: () => {} });
    eq(html.includes('Adoración 29/10'), true, 'el nombre');
    eq(html.includes('Modo Ensayo'), true);
    eq(html.includes('Modo Adoración'), true, 'una adoración no se llama misa');
    eq(html.includes('Entrar suave'), true, 'el arreglo');
    eq(html.includes('Al terminar:'), true, 'la transición');
    eq(html.includes('Ver el cancionero'), true);
  });
});

// --- La frontera con la nube ------------------------------------------------

describe('La copia no se salta ninguna frontera', () => {
  const app = readFileSync('src/App.tsx', 'utf8');

  it('la aplicación no habla con la capa de nube por su cuenta', () => {
    // Los límites y la escritura los comprueba quien sabe de ellos; App pide
    // la subida por el mismo camino que el botón «Guardar en mi cuenta».
    eq(app.includes("from './storage/cloudSetlists'"), false);
    eq(app.includes('cloudSync.sync('), true);
  });

  it('y nunca dice de quién es la copia: eso lo decide la base de datos', () => {
    eq(app.includes('owner_id'), false);
  });
});
