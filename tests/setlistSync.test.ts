import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { CloudSetlistRead } from '../src/storage/cloudSetlists';
import type { SetlistDeletionMarker } from '../src/storage/setlistDeletions';
import { GUEST_SETLISTS, userSetlists } from '../src/storage/setlistStorage';
import {
  SETLIST_SYNC_VERSION,
  canonicalSetlist,
  createSetlistSyncStore,
  portableFingerprint,
  reconcileSetlist,
  reconcileSetlists,
  syncKey,
  type SetlistSyncBase,
  type SetlistSyncPlan,
} from '../src/storage/setlistSync';

/**
 * The reconciliation engine, which is arithmetic and nothing else.
 *
 * No fetch is mocked here because none is made: these are three values in and
 * a plan out. Nothing in this file carries a plan out either — that is the
 * next step, and this one only has to be right about what should happen.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistSync.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const JUAN = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const MARIA = '0f8fad5b-d9cb-469f-a165-70867728950e';

const section = (id: string, sourceSectionId: string, label: string, members: string[] = []) => ({
  id,
  sourceSectionId,
  source: { signature: `firma-${sourceSectionId}`, version: 2 },
  label,
  repeatCount: 2,
  voices: ['women' as const, 'soloist' as const],
  assignedMemberIds: members,
  instruction: 'Entrar suave',
  transition: { type: 'continue' as const },
});

const item = (id: string, songId: string, overrides: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  songId,
  moment: 'Entrada',
  transposeSteps: 2,
  capoFret: 3,
  notes: 'Último coro x2',
  ...overrides,
});

const setlistOf = (overrides: Partial<Setlist> = {}): Setlist => ({
  id: 'setlist-1234',
  name: 'Misa Domingo',
  date: '2026-10-04',
  description: 'Primera prueba',
  participantIds: ['miembro-ana'],
  items: [
    item('item-1', 'huracan-hakuna', {
      arrangement: {
        songVersion: 2,
        sections: [section('bloque-1', 'section-1', 'Coro', ['miembro-ana']), section('bloque-2', 'section-2', 'Verso 1')],
      },
      transitionToNext: { type: 'direct', instruction: 'Sin parar' },
    }),
    item('item-2', 'otra-cancion'),
  ],
  createdAt: NOW,
  updatedAt: NOW + 60_000,
  ...overrides,
});

/** A row as the cloud layer hands it over, already classified. */
const remoteOf = (setlist: Setlist, revision: number): CloudSetlistRead => ({
  state: 'setlist',
  id: setlist.id,
  setlist,
  revision,
  serverUpdatedAt: '2026-09-22T18:45:00+00:00',
});

const deleted = (id: string, revision: number): CloudSetlistRead => ({
  state: 'deleted',
  id,
  revision,
  deletedAt: '2026-09-16T08:00:00+00:00',
});

const baseOf = (setlist: Setlist, cloudRevision: number): SetlistSyncBase => ({
  setlistId: setlist.id,
  cloudRevision,
  fingerprint: portableFingerprint(setlist),
});

/** The same setlist with one portable thing changed. */
const renamed = (setlist: Setlist, name: string): Setlist => ({ ...setlist, name, updatedAt: setlist.updatedAt + 1000 });

// --- The fingerprint -----------------------------------------------------------------

describe('Qué cuenta como un cambio', () => {
  it('lo mismo dos veces da lo mismo, aquí y en cualquier navegador', () => {
    const setlist = setlistOf();
    eq(portableFingerprint(setlist), portableFingerprint(setlist));
    eq(portableFingerprint(setlist), portableFingerprint(structuredClone(setlist)), 'una copia idéntica');
    eq(portableFingerprint(setlist).length, 16, 'dieciséis caracteres, los mismos siempre');
    eq(/^[0-9a-f]{16}$/.test(portableFingerprint(setlist)), true);
    // Y no depende del reloj: el mismo setlist, calculado dos veces con un
    // rato en medio, da lo mismo. Nada aquí llama a Date.now().
    eq(portableFingerprint(setlistOf()), portableFingerprint(setlistOf()));
  });

  it('no depende del orden en que estén escritas las claves de un objeto', () => {
    const setlist = setlistOf();
    // El mismo setlist, construido al revés campo por campo.
    const backwards: Setlist = {
      updatedAt: setlist.updatedAt,
      createdAt: setlist.createdAt,
      items: setlist.items.map((entry) => ({
        transitionToNext: entry.transitionToNext,
        arrangement: entry.arrangement,
        notes: entry.notes,
        capoFret: entry.capoFret,
        transposeSteps: entry.transposeSteps,
        moment: entry.moment,
        songId: entry.songId,
        id: entry.id,
      })),
      participantIds: setlist.participantIds,
      description: setlist.description,
      date: setlist.date,
      name: setlist.name,
      id: setlist.id,
    };
    eq(canonicalSetlist(backwards), canonicalSetlist(setlist), 'la forma la fija el código, no el motor');
    eq(portableFingerprint(backwards), portableFingerprint(setlist));
  });

  it('cambiar cualquier cosa que viaja cambia la huella', () => {
    const setlist = setlistOf();
    const base = portableFingerprint(setlist);
    const differs = (changed: Setlist, what: string) => eq(portableFingerprint(changed) !== base, true, what);

    differs({ ...setlist, name: 'Otro nombre' }, 'el nombre');
    differs({ ...setlist, date: '2026-10-11' }, 'la fecha');
    differs({ ...setlist, description: 'Otra cosa' }, 'la descripción');
    differs({ ...setlist, createdAt: NOW + 1 }, 'cuándo se hizo');
    differs({ ...setlist, items: [setlist.items[1], setlist.items[0]] }, 'el orden de las canciones');
    differs({ ...setlist, items: [setlist.items[0]] }, 'quitar una canción');
    differs({ ...setlist, items: [{ ...setlist.items[0], transposeSteps: 5 }, setlist.items[1]] }, 'el tono');
    differs({ ...setlist, items: [{ ...setlist.items[0], capoFret: 5 }, setlist.items[1]] }, 'la cejilla');
    differs({ ...setlist, items: [{ ...setlist.items[0], moment: 'Salida' }, setlist.items[1]] }, 'el momento');
    differs({ ...setlist, items: [{ ...setlist.items[0], notes: 'Otra nota' }, setlist.items[1]] }, 'las notas');
    differs(
      { ...setlist, items: [{ ...setlist.items[0], transitionToNext: { type: 'stop', instruction: '' } }, setlist.items[1]] },
      'el enlace con la siguiente canción'
    );

    const sections = setlist.items[0].arrangement?.sections ?? [];
    const withSections = (next: typeof sections, what: string) =>
      differs(
        { ...setlist, items: [{ ...setlist.items[0], arrangement: { songVersion: 2, sections: next } }, setlist.items[1]] },
        what
      );
    withSections([sections[1], sections[0]], 'el orden de los bloques del arreglo');
    withSections([{ ...sections[0], repeatCount: 4 }, sections[1]], 'cuántas veces se repite un bloque');
    withSections([{ ...sections[0], voices: ['men'] }, sections[1]], 'quién canta, por voces');
    withSections([{ ...sections[0], instruction: 'Fuerte' }, sections[1]], 'la indicación de un bloque');
    withSections([{ ...sections[0], transition: { type: 'end' } }, sections[1]], 'lo que pasa al acabar un bloque');
    withSections([{ ...sections[0], needsReview: true }, sections[1]], 'que un bloque haya que revisarlo');
    withSections([{ ...sections[0], source: { signature: 'otra', version: 2 } }, sections[1]], 'qué sección toca un bloque');
    withSections([{ ...sections[0], sourceSectionId: 'section-9' }, sections[1]], 'de dónde sale un bloque');
  });

  it('cambiar personas no es un cambio que la nube pueda entender', () => {
    const setlist = setlistOf();
    const base = portableFingerprint(setlist);

    // El equipo de la celebración.
    eq(portableFingerprint({ ...setlist, participantIds: ['miembro-bruno', 'miembro-carla'] }), base);
    eq(portableFingerprint({ ...setlist, participantIds: [] }), base);

    // Quién canta cada bloque.
    const sections = setlist.items[0].arrangement?.sections ?? [];
    const reassigned = [{ ...sections[0], assignedMemberIds: ['miembro-bruno', 'miembro-carla'] }, sections[1]];
    eq(
      portableFingerprint({
        ...setlist,
        items: [{ ...setlist.items[0], arrangement: { songVersion: 2, sections: reassigned } }, setlist.items[1]],
      }),
      base
    );

    // Y el reloj de la última edición, que se mueve con cualquiera de las dos.
    eq(portableFingerprint({ ...setlist, updatedAt: NOW + 999_999 }), base, 'updatedAt no es señal de nada aquí');

    // Las mismas voces dichas en otro orden tampoco: significan lo mismo.
    const shuffled = [{ ...sections[0], voices: ['soloist' as const, 'women' as const] }, sections[1]];
    eq(
      portableFingerprint({
        ...setlist,
        items: [{ ...setlist.items[0], arrangement: { songVersion: 2, sections: shuffled } }, setlist.items[1]],
      }),
      base
    );
  });
});

// --- The table of cases ---------------------------------------------------------------

describe('Qué hacer con un setlist', () => {
  const local = setlistOf();

  it('todo igual: nada que hacer', () => {
    eq(reconcileSetlist({ local, remote: remoteOf(local, 4), base: baseOf(local, 4) }), { kind: 'noop', reason: 'in-sync' });
    eq(reconcileSetlist({}), { kind: 'noop', reason: 'nothing-anywhere' });
  });

  it('cambiar sólo personas no sube nada', () => {
    const base = baseOf(local, 4);
    const remote = remoteOf(local, 4);
    // El equipo…
    const team = { ...local, participantIds: ['miembro-bruno'], updatedAt: NOW + 900_000 };
    eq(reconcileSetlist({ local: team, remote, base }), { kind: 'noop', reason: 'in-sync' });
    // …y quién canta cada bloque.
    const sections = local.items[0].arrangement?.sections ?? [];
    const sung = {
      ...local,
      updatedAt: NOW + 900_000,
      items: [
        {
          ...local.items[0],
          arrangement: { songVersion: 2, sections: [{ ...sections[0], assignedMemberIds: ['miembro-zoe'] }, sections[1]] },
        },
        local.items[1],
      ],
    };
    eq(reconcileSetlist({ local: sung, remote, base }), { kind: 'noop', reason: 'in-sync' });
  });

  it('cambió aquí y allí sigue igual: se sube, diciendo qué revisión se leyó', () => {
    const changed = renamed(local, 'Misa del domingo');
    eq(reconcileSetlist({ local: changed, remote: remoteOf(local, 4), base: baseOf(local, 4) }), {
      kind: 'upload-changes',
      setlist: changed,
      expectedRevision: 4,
    });
  });

  it('cambió allí y aquí sigue igual: se baja', () => {
    const changed = renamed(local, 'Misa del domingo');
    const plan = reconcileSetlist({ local, remote: remoteOf(changed, 5), base: baseOf(local, 4) });
    eq(plan, {
      kind: 'apply-remote',
      setlist: changed,
      base: { setlistId: local.id, cloudRevision: 5, fingerprint: portableFingerprint(changed) },
    });
  });

  it('cambiaron los dos: se pregunta, no se elige', () => {
    const here = renamed(local, 'Lo que escribí yo');
    const there = renamed(local, 'Lo que escribió el otro');
    eq(reconcileSetlist({ local: here, remote: remoteOf(there, 5), base: baseOf(local, 4) }), {
      kind: 'ask',
      question: 'both-changed',
      setlistId: local.id,
    });
    // Salvo que los dos hayan escrito lo mismo, que no le cuesta nada a nadie.
    const same = renamed(local, 'Lo mismo');
    eq(reconcileSetlist({ local: same, remote: remoteOf(same, 5), base: baseOf(local, 4) }).kind, 'adopt-baseline');
  });

  it('la revisión y el contenido son dos cosas distintas', () => {
    // Referencia: revisión 4, contenido A. La fila avanzó a la 5 en los cuatro
    // casos; lo que decide qué hacer es lo que dice, no cuántas veces se
    // escribió.
    const A = local;
    const B = renamed(local, 'Lo que escribí yo');
    const C = renamed(local, 'Lo que escribió el otro');
    const base = baseOf(A, 4);
    const fingerprintOf = (setlist: Setlist, revision: number) => ({
      setlistId: local.id,
      cloudRevision: revision,
      fingerprint: portableFingerprint(setlist),
    });

    // A) La fila se reescribió diciendo lo mismo: nada que bajar ni que subir,
    //    sólo apuntar la revisión nueva.
    eq(reconcileSetlist({ local: A, remote: remoteOf(A, 5), base }), {
      kind: 'adopt-baseline',
      base: fingerprintOf(A, 5),
    });

    // B) Aquí se cambió, y la fila acabó diciendo exactamente lo de la
    //    referencia: el único cambio portable pendiente sigue siendo el de
    //    aquí, y se escribe contra la revisión que la fila tiene ahora.
    eq(reconcileSetlist({ local: B, remote: remoteOf(A, 5), base }), {
      kind: 'upload-changes',
      setlist: B,
      expectedRevision: 5,
    });

    // C) Los dos llegaron a lo mismo por caminos distintos: nadie pierde nada.
    eq(reconcileSetlist({ local: B, remote: remoteOf(B, 5), base }), {
      kind: 'adopt-baseline',
      base: fingerprintOf(B, 5),
    });

    // D) Dicen cosas distintas, y ninguna es la de la referencia.
    eq(reconcileSetlist({ local: B, remote: remoteOf(C, 5), base }), {
      kind: 'ask',
      question: 'both-changed',
      setlistId: local.id,
    });
  });

  it('una revisión que va hacia atrás no es otra versión: es una lectura vieja', () => {
    // Las revisiones sólo suben. Una fila que llega por debajo de la
    // referencia viene de una réplica retrasada o de una caché, y escribir
    // contra ella nombraría una revisión ya superada.
    const base = baseOf(local, 5);
    const changed = renamed(local, 'Lo de aquí');

    eq(reconcileSetlist({ local, remote: remoteOf(local, 4), base }), {
      kind: 'ask',
      question: 'revision-regressed',
      setlistId: local.id,
    });
    eq(reconcileSetlist({ local: changed, remote: remoteOf(local, 4), base }).kind, 'ask', 'ni siquiera para subir');
    eq(reconcileSetlist({ local: changed, remote: remoteOf(changed, 4), base }), {
      kind: 'ask',
      question: 'revision-regressed',
      setlistId: local.id,
    });
    eq(reconcileSetlist({ remote: remoteOf(local, 4), base }).kind, 'ask', 'sin nada aquí, tampoco se baja');

    // La misma revisión que la referencia sí es normal: es el caso corriente.
    eq(reconcileSetlist({ local, remote: remoteOf(local, 5), base }), { kind: 'noop', reason: 'in-sync' });
  });

  it('una revisión que no es un número entero positivo no llega hasta aquí', () => {
    // La capa cloud la clasifica como corrupta antes (ver cloudSetlists), así
    // que el motor sólo ve revisiones de 1 en adelante. Y si llegara, sigue
    // siendo una lectura por debajo de cualquier referencia.
    eq(reconcileSetlist({ local, remote: { state: 'corrupt', id: local.id }, base: baseOf(local, 4) }), {
      kind: 'blocked',
      setlistId: local.id,
      reason: 'corrupt',
    });
  });
});

// --- Meeting for the first time -------------------------------------------------------

describe('La primera vez que se ven', () => {
  const local = setlistOf();

  it('si dicen lo mismo, se apunta que están de acuerdo y nada más', () => {
    eq(reconcileSetlist({ local, remote: remoteOf(local, 4) }), {
      kind: 'adopt-baseline',
      base: { setlistId: local.id, cloudRevision: 4, fingerprint: portableFingerprint(local) },
    });
    // Y las personas siguen siendo locales: el mismo plan aunque difieran.
    const otherTeam = { ...local, participantIds: ['miembro-zoe'] };
    eq(reconcileSetlist({ local: otherTeam, remote: remoteOf(local, 4) }).kind, 'adopt-baseline');
  });

  it('si dicen cosas distintas, se pregunta: nunca gana el último que escribió', () => {
    const there = renamed(local, 'Lo del otro dispositivo');
    eq(reconcileSetlist({ local, remote: remoteOf(there, 9) }), {
      kind: 'ask',
      question: 'first-meeting',
      setlistId: local.id,
    });
    // Ni siquiera cuando lo de un lado es visiblemente más nuevo o va por una
    // revisión muy alta: sin referencia, no se sabe cuál viene de cuál.
    const muchNewer = { ...local, updatedAt: NOW + 10_000_000 };
    eq(reconcileSetlist({ local: muchNewer, remote: remoteOf(there, 99) }).kind, 'ask');
  });
});

// --- Only on one side ------------------------------------------------------------------

describe('Cuando sólo está en un sitio', () => {
  const local = setlistOf();

  it('sólo aquí y sin referencia: es un candidato, no una subida', () => {
    // Puede ser nuevo, puede ser de antes de que existiera la nube, o puede
    // ser uno cuya referencia se perdió. Subirlo es de quien lo hizo.
    eq(reconcileSetlist({ local }), { kind: 'upload-candidate', setlist: local });
  });

  it('sólo en la nube y sin referencia: se baja', () => {
    const plan = reconcileSetlist({ remote: remoteOf(local, 4) });
    eq(plan, {
      kind: 'apply-remote',
      setlist: local,
      base: { setlistId: local.id, cloudRevision: 4, fingerprint: portableFingerprint(local) },
    });
  });

  it('estaba compartido y ya no está aquí: no reaparece solo', () => {
    // O alguien lo borró, o se limpió el almacenamiento de este navegador.
    // Devolverlo desharía lo primero; borrar la fila desharía lo segundo.
    eq(reconcileSetlist({ remote: remoteOf(local, 4), base: baseOf(local, 4) }), {
      kind: 'ask',
      question: 'gone-locally',
      setlistId: local.id,
    });
  });

  it('estaba compartido y la fila ya no está: tampoco se recrea sola', () => {
    eq(reconcileSetlist({ local, base: baseOf(local, 4) }), {
      kind: 'ask',
      question: 'gone-remotely',
      setlistId: local.id,
    });
  });

  it('no queda en ningún sitio: la referencia sobra, y el plan lo dice sin hacerlo', () => {
    eq(reconcileSetlist({ base: baseOf(local, 4) }), { kind: 'forget-baseline', setlistId: local.id });
  });
});

// --- Tombstones -------------------------------------------------------------------------

describe('Cuando se borró en otro dispositivo', () => {
  const local = setlistOf();

  it('sin tocarlo aquí desde entonces: se borra aquí también', () => {
    eq(reconcileSetlist({ local, remote: deleted(local.id, 5), base: baseOf(local, 4) }), {
      kind: 'delete-local',
      setlistId: local.id,
      cloudRevision: 5,
    });
  });

  it('pero si aquí se había cambiado, eso es una decisión de alguien', () => {
    const changed = renamed(local, 'Con las canciones de la novena');
    eq(reconcileSetlist({ local: changed, remote: deleted(local.id, 5), base: baseOf(local, 4) }), {
      kind: 'ask',
      question: 'deleted-elsewhere-edited-here',
      setlistId: local.id,
    });
  });

  it('sin referencia, no se borra nada y no se resucita nada', () => {
    eq(reconcileSetlist({ local, remote: deleted(local.id, 5) }), {
      kind: 'ask',
      question: 'deleted-elsewhere-unknown-here',
      setlistId: local.id,
    });
  });

  it('borrado allí y ausente aquí: ya está', () => {
    eq(reconcileSetlist({ remote: deleted(local.id, 5) }), { kind: 'noop', reason: 'already-deleted' });
    eq(reconcileSetlist({ remote: deleted(local.id, 5), base: baseOf(local, 4) }), { kind: 'noop', reason: 'already-deleted' });
  });

  it('una lápida vieja no borra trabajo más nuevo', () => {
    // La referencia va por la 5 y la lápida llega en la 4: ese borrado ocurrió
    // antes de lo que este dispositivo ya sabe. No se toca nada.
    eq(reconcileSetlist({ local, remote: deleted(local.id, 4), base: baseOf(local, 5) }), {
      kind: 'ask',
      question: 'revision-regressed',
      setlistId: local.id,
    });
    // Y en la revisión que corresponde, sí se borra.
    eq(reconcileSetlist({ local, remote: deleted(local.id, 6), base: baseOf(local, 5) }).kind, 'delete-local');
  });

  it('una lápida nunca se convierte en una subida con el mismo id', () => {
    for (const input of [{ local }, { local, base: baseOf(local, 4) }, {}]) {
      const plan = reconcileSetlist({ ...input, remote: deleted(local.id, 5) });
      eq(['upload-candidate', 'upload-changes', 'apply-remote'].includes(plan.kind), false, plan.kind);
    }
  });
});

// --- Rows this build must not touch -------------------------------------------------------

describe('Filas que este cliente no puede tocar', () => {
  const local = setlistOf();
  const newer: CloudSetlistRead = { state: 'newer', id: local.id, revision: 5, payloadVersion: 2 };
  const corrupt: CloudSetlistRead = { state: 'corrupt', id: local.id };

  it('una versión futura bloquea, haya lo que haya aquí', () => {
    for (const input of [{}, { local }, { local, base: baseOf(local, 4) }, { base: baseOf(local, 4) }]) {
      eq(reconcileSetlist({ ...input, remote: newer }), { kind: 'blocked', setlistId: local.id, reason: 'newer' });
    }
    // Ni siquiera cuando aquí cambió algo: no se sube encima de ella.
    eq(reconcileSetlist({ local: renamed(local, 'X'), remote: newer, base: baseOf(local, 4) }).kind, 'blocked');
  });

  it('una fila corrupta bloquea igual', () => {
    for (const input of [{}, { local }, { local, base: baseOf(local, 4) }]) {
      eq(reconcileSetlist({ ...input, remote: corrupt }), { kind: 'blocked', setlistId: local.id, reason: 'corrupt' });
    }
    // Y una tan rota que ni el id se sostiene sigue sin tocarse.
    eq(reconcileSetlist({ remote: { state: 'corrupt', id: null } }), { kind: 'blocked', setlistId: '', reason: 'corrupt' });
  });
});

// --- Nothing here decides by clock or by server ---------------------------------------------

describe('Nada se decide por el reloj', () => {
  const local = setlistOf();

  it('ni por updatedAt, ni por la hora del servidor', () => {
    const base = baseOf(local, 4);
    // Lo de aquí, marcado como mucho más nuevo, sin un solo cambio portable.
    const touched = { ...local, updatedAt: NOW + 50_000_000, participantIds: ['miembro-zoe'] };
    eq(reconcileSetlist({ local: touched, remote: remoteOf(local, 4), base }), { kind: 'noop', reason: 'in-sync' });

    // La hora del servidor, movida sola, no cambia ningún plan.
    const later: CloudSetlistRead = { state: 'setlist', id: local.id, setlist: local, revision: 4, serverUpdatedAt: '2099-01-01T00:00:00+00:00' };
    eq(reconcileSetlist({ local, remote: later, base }), { kind: 'noop', reason: 'in-sync' });
    const none: CloudSetlistRead = { state: 'setlist', id: local.id, setlist: local, revision: 4, serverUpdatedAt: null };
    eq(reconcileSetlist({ local, remote: none, base }), { kind: 'noop', reason: 'in-sync' });
  });

  it('el mismo caso da siempre el mismo plan', () => {
    const inputs = { local: renamed(local, 'Otro'), remote: remoteOf(local, 4), base: baseOf(local, 4) };
    eq(reconcileSetlist(inputs), reconcileSetlist(inputs));
  });

  it('la huella se calcula sobre números y caracteres, nada más', () => {
    // Valores fijos: si el algoritmo cambiara, o dependiera de algo del
    // entorno, estos dejarían de salir. Son los mismos en cualquier navegador
    // porque sólo intervienen charCodeAt, Math.imul y >>> 0.
    eq(portableFingerprint(setlistOf({ id: 'setlist-fijo', items: [], createdAt: 0, participantIds: [] })), 'ceba3ecb3aca702e');
    eq(canonicalSetlist(setlistOf({ id: 'a', items: [], createdAt: 0 })), '["a","Misa Domingo","2026-10-04","Primera prueba",0,[]]');

    // Siempre dieciséis hex, para cualquier entrada: los dos carriles se
    // normalizan a 32 bits sin signo en cada vuelta, así que ni el
    // desbordamiento ni el signo cambian el resultado.
    for (const text of ['', 'á', '😀', 'x'.repeat(5000), '\u0000', '￿']) {
      const fingerprint = portableFingerprint(setlistOf({ description: text }));
      eq(/^[0-9a-f]{16}$/.test(fingerprint), true, JSON.stringify(text));
    }
    // Y no hay nada que dependa del idioma del dispositivo.
    eq(canonicalSetlist(setlistOf({ createdAt: 1234.5 })).includes('1234.5'), true, 'los números, tal cual');
  });
});

// --- All of them at once -----------------------------------------------------------------

describe('Todos los setlists a la vez', () => {
  it('mira los de aquí, los de allí y los que sólo recuerda la referencia', () => {
    const uno = setlistOf({ id: 'setlist-uno' });
    const dos = setlistOf({ id: 'setlist-dos' });
    const tres = setlistOf({ id: 'setlist-tres' });
    const soloAqui = setlistOf({ id: 'setlist-solo-aqui' });

    const plans = reconcileSetlists(
      [uno, renamed(dos, 'Cambiado aquí'), soloAqui],
      [remoteOf(uno, 4), remoteOf(dos, 4), remoteOf(tres, 2)],
      new Map([
        ['setlist-uno', baseOf(uno, 4)],
        ['setlist-dos', baseOf(dos, 4)],
        ['setlist-olvidado', { setlistId: 'setlist-olvidado', cloudRevision: 1, fingerprint: 'abc' }],
      ])
    );

    eq([...plans.keys()].sort(), [
      'setlist-dos',
      'setlist-olvidado',
      'setlist-solo-aqui',
      'setlist-tres',
      'setlist-uno',
    ]);
    eq(plans.get('setlist-uno')?.kind, 'noop');
    eq(plans.get('setlist-dos')?.kind, 'upload-changes');
    eq(plans.get('setlist-tres')?.kind, 'apply-remote', 'sólo en la nube');
    eq(plans.get('setlist-solo-aqui')?.kind, 'upload-candidate');
    eq(plans.get('setlist-olvidado')?.kind, 'forget-baseline');
  });

  it('el orden de entrada no cambia ninguna decisión, y cada id se mira una vez', () => {
    const uno = setlistOf({ id: 'setlist-uno' });
    const dos = setlistOf({ id: 'setlist-dos' });
    const locals = [uno, renamed(dos, 'Cambiado aquí')];
    const remotes = [remoteOf(uno, 4), remoteOf(dos, 4), { state: 'newer' as const, id: 'setlist-futuro', revision: 3, payloadVersion: 2 }];
    const bases = new Map([
      ['setlist-uno', baseOf(uno, 4)],
      ['setlist-dos', baseOf(dos, 4)],
    ]);

    const plans = reconcileSetlists(locals, remotes, bases);
    const reversed = reconcileSetlists([...locals].reverse(), [...remotes].reverse(), new Map([...bases].reverse()));
    eq(new Map([...reversed].sort()), new Map([...plans].sort()), 'los mismos planes, dados en otro orden');

    // Una fila que este cliente no puede tocar no bloquea a las demás.
    eq(plans.get('setlist-futuro')?.kind, 'blocked');
    eq(plans.get('setlist-uno')?.kind, 'noop');
    eq(plans.get('setlist-dos')?.kind, 'upload-changes');
    eq(plans.size, 3, 'un plan por id, ni uno más');

    // Y el mismo setlist repetido en la entrada sigue siendo un solo plan.
    eq(reconcileSetlists([uno, uno], [remoteOf(uno, 4), remoteOf(uno, 4)], bases).size, 2);
  });

  it('una fila corrupta no impide leer las demás', () => {
    const uno = setlistOf({ id: 'setlist-uno' });
    const plans = reconcileSetlists(
      [uno],
      [{ state: 'corrupt', id: 'setlist-roto' }, remoteOf(uno, 4), { state: 'corrupt', id: null }],
      new Map([['setlist-uno', baseOf(uno, 4)]])
    );
    eq(plans.get('setlist-uno')?.kind, 'noop');
    eq(plans.get('setlist-roto')?.kind, 'blocked');
    eq(plans.size, 2, 'la que ni id tiene no se mete en el camino de nadie');
  });
});

// --- Deleted here, on purpose -----------------------------------------------------------------

describe('Cuando se borró aquí a propósito', () => {
  const local = setlistOf();
  const marker = (baseRevision?: number): SetlistDeletionMarker => ({
    setlistId: local.id,
    deletedAt: NOW + 900_000,
    ...(baseRevision === undefined ? {} : { baseRevision }),
  });

  it('la fila sigue siendo la que se borró: se borra allí también', () => {
    eq(reconcileSetlist({ remote: remoteOf(local, 4), base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'delete-remote',
      setlistId: local.id,
      expectedRevision: 4,
    });
    // La revisión que se manda es la que se conocía al borrar, no la que la
    // fila tenga: eso es lo que lo convierte en borrar lo que alguien vio.
    const plan = reconcileSetlist({ remote: remoteOf(local, 4), base: baseOf(local, 4), deletion: marker(4) });
    eq(plan.kind === 'delete-remote' && plan.expectedRevision, 4);
  });

  it('pero si la fila cambió después, eso lo decide alguien', () => {
    // Un dispositivo borra la revisión 4 sin conexión. Otro edita, y la fila
    // va por la 5. El primero vuelve: no puede borrar una revisión que nadie
    // aquí ha visto nunca.
    eq(reconcileSetlist({ remote: remoteOf(local, 5), base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'ask',
      question: 'deleted-here-changed-there',
      setlistId: local.id,
    });
    // Y da igual que el contenido de la fila sea idéntico al de la base: la
    // revisión se movió por algo, y ese algo no se ha visto.
    eq(reconcileSetlist({ remote: remoteOf(local, 5), base: baseOf(local, 5), deletion: marker(4) }).kind, 'ask');
    const changed = renamed(local, 'Editado en otro sitio');
    eq(reconcileSetlist({ remote: remoteOf(changed, 5), base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'ask',
      question: 'deleted-here-changed-there',
      setlistId: local.id,
    });
  });

  it('sin saber contra qué revisión se borró, no se borra nada', () => {
    eq(reconcileSetlist({ remote: remoteOf(local, 4), deletion: marker() }), {
      kind: 'ask',
      question: 'deleted-here-unknown-revision',
      setlistId: local.id,
    });
    // Ni siquiera existiendo una base: la decisión se tomó sin mirarla.
    eq(reconcileSetlist({ remote: remoteOf(local, 4), base: baseOf(local, 4), deletion: marker() }), {
      kind: 'ask',
      question: 'deleted-here-unknown-revision',
      setlistId: local.id,
    });
  });

  it('la fila ya es una lápida: el borrado está hecho por los dos lados', () => {
    // Se borró sabiendo la revisión 4, el último acuerdo era la 4, y la fila
    // es una lápida en la 5: entre una cosa y la otra no pasó nada que este
    // dispositivo no tuviera en cuenta.
    eq(reconcileSetlist({ remote: deleted(local.id, 5), base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'confirm-deletion',
      setlistId: local.id,
    });
    // También cuando la borró otro dispositivo primero, y con la lápida mucho
    // más adelante: el final es el que se pidió.
    eq(reconcileSetlist({ remote: deleted(local.id, 9), base: baseOf(local, 4), deletion: marker(4) }).kind, 'confirm-deletion');
  });

  it('se borró sin línea base, y la nube ya dice borrado: confirmado', () => {
    // El setlist se borró aquí antes de que hubiera ningún acuerdo, así que
    // la decisión no tenía nada que pudiera quedarse anticuado. La nube dice
    // borrado, que es el final que se pidió, y confirmar no borra nada: sólo
    // deja de guardar una nota que ya no sirve. Los relojes no intervienen:
    // deletedAt nunca se compara con ninguna hora de la nube.
    eq(reconcileSetlist({ remote: deleted(local.id, 7), deletion: marker() }), {
      kind: 'confirm-deletion',
      setlistId: local.id,
    });
    // Pero si además hay un acuerdo que la nota no conocía, ya no está claro
    // de qué es esa lápida: se conserva todo.
    eq(reconcileSetlist({ remote: deleted(local.id, 7), base: baseOf(local, 6), deletion: marker() }), {
      kind: 'ask',
      question: 'deleted-here-changed-there',
      setlistId: local.id,
    });
  });

  it('si el dispositivo supo más que la nota, la lápida no se da por confirmada', () => {
    // Se borró sabiendo la revisión 4, pero después este dispositivo acordó
    // la 5: algo pasó allí que la decisión de borrar no tuvo en cuenta, y no
    // hay forma de saber si esta lápida es ese algo o es el borrado llegando.
    // Ante la duda, no se limpia nada.
    eq(reconcileSetlist({ remote: deleted(local.id, 5), base: baseOf(local, 5), deletion: marker(4) }), {
      kind: 'ask',
      question: 'deleted-here-changed-there',
      setlistId: local.id,
    });
    // Con la fila todavía activa, lo mismo: no se borra allí.
    eq(reconcileSetlist({ remote: remoteOf(local, 5), base: baseOf(local, 5), deletion: marker(4) }), {
      kind: 'ask',
      question: 'deleted-here-changed-there',
      setlistId: local.id,
    });
    // Y una lápida por debajo del último acuerdo sigue siendo la anomalía de
    // siempre, que se detecta antes que nada de esto.
    eq(reconcileSetlist({ remote: deleted(local.id, 5), base: baseOf(local, 6), deletion: marker(4) }), {
      kind: 'ask',
      question: 'revision-regressed',
      setlistId: local.id,
    });
  });

  it('una lápida por debajo de la base sigue siendo una anomalía', () => {
    eq(reconcileSetlist({ remote: deleted(local.id, 3), base: baseOf(local, 5), deletion: marker(5) }), {
      kind: 'ask',
      question: 'revision-regressed',
      setlistId: local.id,
    });
    // Y una fila activa por debajo, igual.
    eq(reconcileSetlist({ remote: remoteOf(local, 3), base: baseOf(local, 5), deletion: marker(5) }).kind, 'ask');
  });

  it('sin fila: nunca se da por hecho un éxito que no ocurrió', () => {
    // Nunca llegó a la nube: no hay nada que quitar y nada que esperar.
    eq(reconcileSetlist({ deletion: marker() }), { kind: 'confirm-deletion', setlistId: local.id });
    // Pero si había base, la fila tendría que estar, aunque fuera como lápida.
    eq(reconcileSetlist({ base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'ask',
      question: 'gone-remotely',
      setlistId: local.id,
    });
  });

  it('marcado como borrado y aquí presente: nadie gana, diga lo que diga la nube', () => {
    // Otra pestaña, una recreación a mano, un almacenamiento que no aceptó la
    // lista más corta. Se comprueban todas las combinaciones, porque esta
    // regla va por delante de cualquier rama que pudiera ejecutar algo.
    const rows = [undefined, remoteOf(local, 4), remoteOf(renamed(local, 'Otro'), 9), deleted(local.id, 5), deleted(local.id, 2)];
    for (const remote of rows) {
      for (const base of [undefined, baseOf(local, 4), baseOf(local, 9)]) {
        for (const deletion of [marker(), marker(4), marker(9)]) {
          const plan = reconcileSetlist({ local, remote, base, deletion });
          eq(plan, { kind: 'ask', question: 'inconsistent-local-deletion', setlistId: local.id },
            `${remote?.state ?? 'sin fila'} / ${base ? `base ${base.cloudRevision}` : 'sin base'} / ${deletion.baseRevision ?? 'sin revisión'}`);
        }
      }
    }
    // Sólo una fila que este cliente no puede leer manda por encima, y esa
    // tampoco ejecuta nada.
    const newer: CloudSetlistRead = { state: 'newer', id: local.id, revision: 5, payloadVersion: 2 };
    eq(reconcileSetlist({ local, remote: newer, base: baseOf(local, 4), deletion: marker(4) }).kind, 'blocked');
  });

  it('una anotación nunca resucita ni sube un setlist', () => {
    const cases = [
      { remote: remoteOf(local, 4), base: baseOf(local, 4), deletion: marker(4) },
      { remote: remoteOf(local, 9), base: baseOf(local, 4), deletion: marker(4) },
      { remote: remoteOf(local, 4), deletion: marker() },
      { remote: deleted(local.id, 5), deletion: marker(4) },
      { deletion: marker() },
      { base: baseOf(local, 4), deletion: marker(4) },
      { local, remote: remoteOf(local, 4), deletion: marker(4) },
    ];
    for (const input of cases) {
      const plan = reconcileSetlist(input);
      eq(['apply-remote', 'upload-candidate', 'upload-changes', 'adopt-baseline'].includes(plan.kind), false, plan.kind);
    }
  });

  it('una fila que este cliente no puede tocar sigue mandando sobre todo', () => {
    const newer: CloudSetlistRead = { state: 'newer', id: local.id, revision: 5, payloadVersion: 2 };
    eq(reconcileSetlist({ remote: newer, base: baseOf(local, 4), deletion: marker(4) }), {
      kind: 'blocked',
      setlistId: local.id,
      reason: 'newer',
    });
    eq(reconcileSetlist({ remote: { state: 'corrupt', id: local.id }, deletion: marker(4) }).kind, 'blocked');
  });

  it('la anotación de una cuenta no entra en la reconciliación de otra', () => {
    // Los planes se hacen con lo que se les da: un marcador de otra cuenta no
    // está en esta lista, porque vive bajo otra clave (ver setlistDeletions).
    const plans = reconcileSetlists([], [remoteOf(local, 4)], new Map([[local.id, baseOf(local, 4)]]), [marker(4)]);
    eq(plans.get(local.id)?.kind, 'delete-remote');
    const sinMarcador = reconcileSetlists([], [remoteOf(local, 4)], new Map([[local.id, baseOf(local, 4)]]), []);
    eq(sinMarcador.get(local.id)?.kind, 'ask', 'sin su marcador, es sólo un setlist que ya no está aquí');
  });

  it('un setlist borrado que no está en ningún otro sitio tiene su propio plan', () => {
    const plans = reconcileSetlists([], [], new Map(), [marker()]);
    eq([...plans.keys()], [local.id]);
    eq(plans.get(local.id)?.kind, 'confirm-deletion');
  });
});

// --- Where the baseline lives ---------------------------------------------------------------

describe('Dónde se guarda lo que los dos acordaron', () => {
  const browser = () => {
    const data = new Map<string, string>();
    return {
      data,
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
  };
  const local = setlistOf();

  it('cada cuenta la suya, y el invitado ninguna', () => {
    eq(syncKey(GUEST_SETLISTS), null, 'sin cuenta no hay nube, y sin nube no hay nada que acordar');
    eq(syncKey(userSetlists(JUAN)), `genesaret_setlist_sync:u:${JUAN}`);
    eq(syncKey(userSetlists(MARIA)) !== syncKey(userSetlists(JUAN)), true);
    eq(syncKey(userSetlists('  ')), null, 'una identidad sin id no guarda nada');
    // Y ninguna cuenta puede escribir donde escriben los setlists.
    eq(syncKey(userSetlists('a/b')), 'genesaret_setlist_sync:u:a%2Fb', 'el id va codificado');
  });

  it('lo de Juan no se lee como lo de María', () => {
    const storage = browser();
    const juan = createSetlistSyncStore(storage, userSetlists(JUAN));
    const maria = createSetlistSyncStore(storage, userSetlists(MARIA));

    juan.save(new Map([[local.id, baseOf(local, 4)]]));
    eq(maria.load().size, 0, 'María no ve lo de Juan');
    eq(juan.load().get(local.id), baseOf(local, 4));

    maria.save(new Map([[local.id, baseOf(local, 9)]]));
    eq(juan.load().get(local.id)?.cloudRevision, 4, 'y Juan sigue con lo suyo');
    eq([...storage.data.keys()].sort(), [`genesaret_setlist_sync:u:${MARIA}`, `genesaret_setlist_sync:u:${JUAN}`].sort());
  });

  it('el invitado no escribe ni lee nada', () => {
    const storage = browser();
    const guest = createSetlistSyncStore(storage, GUEST_SETLISTS);
    guest.save(new Map([[local.id, baseOf(local, 4)]]));
    eq(storage.data.size, 0, 'ni una clave');
    eq(guest.load().size, 0);
    eq(guest.key, null);
  });

  it('metadata ilegible no tumba nada: se vuelve a empezar, que no cuesta nada', () => {
    const storage = browser();
    const store = createSetlistSyncStore(storage, userSetlists(JUAN));
    const key = `genesaret_setlist_sync:u:${JUAN}`;

    for (const broken of ['esto no es json', '{}', '[]', 'null', '{"version":99,"bases":[]}', '{"version":1}']) {
      storage.setItem(key, broken);
      eq(store.load().size, 0, broken);
    }
    // Una entrada ilegible es un setlist que vuelve a presentarse, no todos.
    storage.setItem(
      key,
      JSON.stringify({
        version: SETLIST_SYNC_VERSION,
        bases: [
          { setlistId: 'bueno', cloudRevision: 4, fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: '', cloudRevision: 4, fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: 'sin-revision', fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: 'revision-cero', cloudRevision: 0, fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: 'revision-con-coma', cloudRevision: 4.5, fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: 'sin-huella', cloudRevision: 4 },
          // Una huella que no pudo salir de aquí nunca volvería a coincidir
          // con nada: reportaría un cambio para siempre.
          { setlistId: 'huella-rara', cloudRevision: 4, fingerprint: 'abc' },
          { setlistId: 'huella-larga', cloudRevision: 4, fingerprint: 'ceba3ecb3aca702e0' },
          { setlistId: 'huella-mayusculas', cloudRevision: 4, fingerprint: 'CEBA3ECB3ACA702E' },
          'ni siquiera es un objeto',
        ],
      })
    );
    eq([...store.load().keys()], ['bueno']);

    // Dos entradas del mismo setlist no las escribe este código; si aparecen
    // a mano, gana la última, que al menos es siempre la misma respuesta.
    storage.setItem(
      key,
      JSON.stringify({
        version: SETLIST_SYNC_VERSION,
        bases: [
          { setlistId: 'repetido', cloudRevision: 2, fingerprint: 'ceba3ecb3aca702e' },
          { setlistId: 'repetido', cloudRevision: 9, fingerprint: 'ceba3ecb3aca702e' },
        ],
      })
    );
    eq(store.load().get('repetido')?.cloudRevision, 9);
    eq(store.load().get('repetido')?.cloudRevision, 9, 'y la misma la próxima vez');

    // Y lo ilegible no se respalda: no es el trabajo de nadie, y perderlo sólo
    // significa que los dos lados se vuelven a presentar.
    eq([...storage.data.keys()], [key], 'ninguna clave de respaldo');
  });

  it('hacer un plan no toca nada: ni la metadata, ni los setlists', () => {
    const storage = browser();
    const store = createSetlistSyncStore(storage, userSetlists(JUAN));
    storage.setItem('genesaret_setlists:u:' + JUAN, 'los setlists de Juan, intactos');
    store.save(new Map([[local.id, baseOf(local, 4)]]));
    const before = new Map(storage.data);

    // Todos los planes que existen, incluido el que pide olvidar una
    // referencia y el que pide borrar: ninguno escribe nada por su cuenta.
    reconcileSetlist({ base: store.load().get(local.id) });
    reconcileSetlist({ local, remote: deleted(local.id, 5), base: store.load().get(local.id) });
    reconcileSetlist({ local: renamed(local, 'Otro'), remote: remoteOf(local, 4), base: store.load().get(local.id) });
    reconcileSetlists([local], [remoteOf(local, 9)], store.load());

    eq(storage.data, before, 'el almacenamiento, exactamente como estaba');
  });

  it('lo guardado se vuelve a leer igual', () => {
    const storage = browser();
    const store = createSetlistSyncStore(storage, userSetlists(JUAN));
    const bases = new Map([
      [local.id, baseOf(local, 4)],
      ['otro', { setlistId: 'otro', cloudRevision: 12, fingerprint: portableFingerprint(setlistOf({ id: 'otro' })) }],
    ]);
    store.save(bases);
    eq(store.load(), bases);
    // Y sirve para reconciliar tal cual sale del almacén.
    eq(reconcileSetlist({ local, remote: remoteOf(local, 4), base: store.load().get(local.id) }), {
      kind: 'noop',
      reason: 'in-sync',
    });
  });
});

// --- Still nothing runs ---------------------------------------------------------------------

describe('Este paso sigue sin sincronizar nada', () => {
  it('el motor no toca la red ni el almacén de la aplicación', () => {
    const source = readFileSync('src/storage/setlistSync.ts', 'utf8');
    for (const forbidden of ['fetch(', 'Date.now', 'localStorage', 'createCloudSetlistRepository', 'useState', 'await ']) {
      eq(source.includes(forbidden), false, forbidden);
    }
    // Del módulo cloud sólo toma el tipo de lo que ya se leyó.
    eq(source.includes("import type { CloudSetlistRead } from './cloudSetlists'"), true);
  });

  it('la aplicación sigue sin usar nada de esto', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name)) files.push(path);
      }
    };
    walk('src');
    const reads = (file: string) => readFileSync(file, 'utf8');
    const others = files.filter((file) => !['src/storage/setlistSync.ts', 'src/storage/cloudSetlists.ts'].includes(file));

    // La capa cloud sigue sin que nadie la llame.
    eq(others.filter((file) => reads(file).includes('cloudSetlists')), [], 'nadie llama a la nube');

    // De este módulo, la aplicación usa una cosa y sólo una: dónde se guarda
    // lo que los dos lados acordaron, para anotar contra qué revisión se
    // borró. El motor en sí no lo llama nadie todavía.
    eq(others.filter((file) => reads(file).includes('setlistSync')), ['src/hooks/useSetlists.ts']);
    eq(
      others.filter((file) => /reconcileSetlists?\(/.test(reads(file))),
      [],
      'nadie pide todavía un plan, y menos aún lo ejecuta'
    );
  });
});

/** A plan is a value: it can be read, compared and printed, and it does nothing. */
const _typeCheck: SetlistSyncPlan = { kind: 'noop', reason: 'in-sync' };
void _typeCheck;
