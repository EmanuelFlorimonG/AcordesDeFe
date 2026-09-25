import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { Setlist } from '../src/types/setlist';
import {
  SETLIST_DELETIONS_VERSION,
  createSetlistDeletionRepository,
  deletionsKey,
  type SetlistDeletionMarker,
} from '../src/storage/setlistDeletions';
import { GUEST_SETLISTS, userSetlists } from '../src/storage/setlistStorage';
import { createSetlistSyncStore, portableFingerprint, reconcileSetlist } from '../src/storage/setlistSync';
import type { CloudSetlistRead } from '../src/storage/cloudSetlists';

/**
 * Deletions somebody meant, written down so they can travel.
 *
 * Nothing here talks to a cloud: a marker is a name and a moment in this
 * browser, and what to do with it is worked out elsewhere (setlistSync) and
 * carried out later still.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlistDeletions.test: ${checks} comprobaciones`));

const JUAN = '6f1c2a4e-8b3d-4c5e-9f70-1a2b3c4d5e6f';
const MARIA = '0f8fad5b-d9cb-469f-a165-70867728950e';
const NOW = Date.UTC(2026, 8, 15, 12);

/** One browser: every scope writes into the same storage, under its own key. */
const browser = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
};

/** Storage that is full, which is the realistic way writing fails. */
const fullBrowser = () => ({
  getItem: () => null,
  setItem: () => {
    throw new DOMException('QuotaExceededError');
  },
});

const setlistOf = (id: string, name = 'Misa Domingo'): Setlist => ({
  id,
  name,
  date: '2026-10-04',
  description: '',
  participantIds: ['miembro-ana'],
  items: [],
  createdAt: NOW,
  updatedAt: NOW,
});

// --- The store ------------------------------------------------------------------------

describe('Dónde se anota un borrado', () => {
  it('cada cuenta la suya; el invitado, ninguna', () => {
    eq(deletionsKey(GUEST_SETLISTS), null, 'sin cuenta no hay nube a la que propagar nada');
    eq(deletionsKey(userSetlists(JUAN)), `genesaret_setlist_deletions:u:${JUAN}`);
    eq(deletionsKey(userSetlists(MARIA)) !== deletionsKey(userSetlists(JUAN)), true);
    eq(deletionsKey(userSetlists('   ')), null, 'una identidad sin id no anota nada');
    eq(deletionsKey(userSetlists('a/b')), 'genesaret_setlist_deletions:u:a%2Fb', 'el id va codificado');
  });

  it('anotar, buscar, listar y olvidar', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));

    eq(repo.list(), []);
    eq(repo.get('setlist-1234'), null);

    const marker = repo.mark('setlist-1234', NOW, 7);
    eq(marker, { setlistId: 'setlist-1234', deletedAt: NOW, baseRevision: 7 });
    eq(repo.get('setlist-1234'), marker);
    eq(repo.list(), [marker]);

    // Sin base conocida no se inventa ninguna revisión.
    const other = repo.mark('setlist-5678', NOW + 1000);
    eq(other, { setlistId: 'setlist-5678', deletedAt: NOW + 1000 });
    eq('baseRevision' in other!, false, 'ausente, no cero ni uno');
    eq(repo.list().length, 2);

    repo.clear('setlist-1234');
    eq(repo.get('setlist-1234'), null);
    eq(repo.list(), [other], 'y sólo esa');
    repo.clear('no-existe');
    eq(repo.list(), [other], 'olvidar lo que no está no rompe nada');
  });

  it('anotar otra vez el mismo setlist reemplaza lo anterior', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    repo.mark('setlist-1234', NOW, 4);
    repo.mark('setlist-1234', NOW + 5000, 9);
    eq(repo.list(), [{ setlistId: 'setlist-1234', deletedAt: NOW + 5000, baseRevision: 9 }]);
    eq(repo.list().length, 1, 'una anotación por setlist');
  });

  it('el invitado no escribe ni lee nada', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, GUEST_SETLISTS);
    eq(repo.key, null);
    eq(repo.mark('setlist-1234', NOW, 4), null);
    eq(storage.data.size, 0, 'ni una clave');
    eq(repo.list(), []);
    repo.clear('setlist-1234');
    eq(storage.data.size, 0);
  });

  it('lo de Juan no lo ve María', () => {
    const storage = browser();
    const juan = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    const maria = createSetlistDeletionRepository(storage, userSetlists(MARIA));

    juan.mark('setlist-1234', NOW, 4);
    eq(maria.list(), [], 'María no ve el borrado de Juan');
    maria.mark('setlist-1234', NOW + 1, 9);
    eq(juan.get('setlist-1234')?.baseRevision, 4, 'y Juan sigue con el suyo');
    // Y borrar en una cuenta no toca la otra.
    juan.clear('setlist-1234');
    eq(maria.get('setlist-1234')?.baseRevision, 9);
    eq([...storage.data.keys()].sort(), [
      `genesaret_setlist_deletions:u:${MARIA}`,
      `genesaret_setlist_deletions:u:${JUAN}`,
    ].sort());
  });

  it('una anotación ilegible se descarta sola; el resto sigue', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    const key = `genesaret_setlist_deletions:u:${JUAN}`;

    for (const broken of ['esto no es json', '{}', '[]', 'null', '{"version":99,"deletions":[]}', '{"version":1}']) {
      storage.setItem(key, broken);
      eq(repo.list(), [], broken);
    }

    storage.setItem(
      key,
      JSON.stringify({
        version: SETLIST_DELETIONS_VERSION,
        deletions: [
          { setlistId: 'bueno', deletedAt: NOW, baseRevision: 4 },
          { setlistId: 'sin-revision', deletedAt: NOW },
          { setlistId: '', deletedAt: NOW },
          { setlistId: 'con espacios', deletedAt: NOW },
          { setlistId: 'sin-momento' },
          { setlistId: 'momento-cero', deletedAt: 0 },
          { setlistId: 'momento-negativo', deletedAt: -1 },
          { setlistId: 'momento-con-coma', deletedAt: NOW + 0.5 },
          { setlistId: 'momento-infinito', deletedAt: Number.POSITIVE_INFINITY },
          { setlistId: 'momento-texto', deletedAt: '2026-09-15' },
          { setlistId: 'revision-cero', deletedAt: NOW, baseRevision: 0 },
          { setlistId: 'revision-con-coma', deletedAt: NOW, baseRevision: 2.5 },
          { setlistId: 'revision-texto', deletedAt: NOW, baseRevision: '4' },
          { setlistId: 'revision-nula', deletedAt: NOW, baseRevision: null },
          'ni siquiera es un objeto',
          null,
        ],
      })
    );
    eq(repo.list().map((marker) => marker.setlistId), ['bueno', 'sin-revision']);
    // Y nada se repara con la hora de ahora: lo que no se entiende, se va.
    eq(repo.get('momento-texto'), null);
  });

  it('dos anotaciones del mismo setlist: gana la más reciente, siempre la misma', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    const key = `genesaret_setlist_deletions:u:${JUAN}`;
    const write = (deletions: unknown[]) =>
      storage.setItem(key, JSON.stringify({ version: SETLIST_DELETIONS_VERSION, deletions }));

    write([
      { setlistId: 'repetido', deletedAt: NOW, baseRevision: 4 },
      { setlistId: 'repetido', deletedAt: NOW + 5000, baseRevision: 9 },
    ]);
    eq(repo.get('repetido')?.baseRevision, 9, 'la más reciente');
    // El orden en el archivo no decide nada.
    write([
      { setlistId: 'repetido', deletedAt: NOW + 5000, baseRevision: 9 },
      { setlistId: 'repetido', deletedAt: NOW, baseRevision: 4 },
    ]);
    eq(repo.get('repetido')?.baseRevision, 9, 'aunque venga escrita primero');

    // Empate exacto: se queda la que sabe contra qué revisión se decidió, que
    // es la única sobre la que se puede actuar.
    write([
      { setlistId: 'empate', deletedAt: NOW },
      { setlistId: 'empate', deletedAt: NOW, baseRevision: 4 },
    ]);
    eq(repo.get('empate')?.baseRevision, 4);
    write([
      { setlistId: 'empate', deletedAt: NOW, baseRevision: 4 },
      { setlistId: 'empate', deletedAt: NOW },
    ]);
    eq(repo.get('empate')?.baseRevision, 4, 'en cualquier orden');
    // Empate sin nada que elegir: se queda la primera, y siempre la misma.
    write([
      { setlistId: 'iguales', deletedAt: NOW, baseRevision: 4 },
      { setlistId: 'iguales', deletedAt: NOW, baseRevision: 8 },
    ]);
    eq(repo.get('iguales')?.baseRevision, 4);
    eq(repo.get('iguales')?.baseRevision, 4, 'y la misma la próxima vez');
  });

  it('anotar con información más vieja no pisa la más nueva', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    repo.mark('setlist-1234', NOW + 5000, 9);

    // Más nueva: manda.
    eq(repo.mark('setlist-1234', NOW + 9000, 12)?.baseRevision, 12);
    // Más vieja: se queda lo que había, y se devuelve lo que de verdad está
    // guardado, no lo que se pidió.
    eq(repo.mark('setlist-1234', NOW, 4), { setlistId: 'setlist-1234', deletedAt: NOW + 9000, baseRevision: 12 });
    eq(repo.get('setlist-1234')?.baseRevision, 12, 'sigue siendo la que sabía más');

    // Mismo momento: gana la que sabe contra qué revisión se decidió…
    const otro = createSetlistDeletionRepository(browser(), userSetlists(JUAN));
    otro.mark('setlist-5678', NOW);
    eq(otro.mark('setlist-5678', NOW, 4)?.baseRevision, 4);
    // …y no al revés: una sin revisión no borra la que sí la tiene.
    eq(otro.mark('setlist-5678', NOW)?.baseRevision, 4);
    eq(otro.list().length, 1, 'y sigue habiendo una sola anotación');
  });

  it('olvidar un borrado toca esa anotación y nada más', () => {
    const storage = browser();
    const repo = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    const bases = createSetlistSyncStore(storage, userSetlists(JUAN));
    const setlist = setlistOf('setlist-1234');
    const base = { setlistId: setlist.id, cloudRevision: 4, fingerprint: portableFingerprint(setlist) };

    storage.setItem(`genesaret_setlists:u:${JUAN}`, 'los setlists, intactos');
    bases.save(new Map([[setlist.id, base]]));
    repo.mark('setlist-1234', NOW, 4);
    repo.mark('setlist-5678', NOW + 1000, 2);

    repo.clear('setlist-1234');
    eq(repo.get('setlist-1234'), null, 'esa sí');
    eq(repo.get('setlist-5678')?.baseRevision, 2, 'la de al lado no');
    eq(bases.load().get('setlist-1234'), base, 'la base tampoco');
    eq(storage.data.get(`genesaret_setlists:u:${JUAN}`), 'los setlists, intactos');
    // Y nadie llama a clear por su cuenta: hoy no lo usa nada de la aplicación.
    eq(
      ['src/hooks/useSetlists.ts', 'src/App.tsx'].some((file) => readFileSync(file, 'utf8').includes('.clear(')),
      false,
      'ninguna pantalla olvida borrados por su cuenta'
    );
  });

  it('si no se puede anotar, se dice: no se traga el error', () => {
    const repo = createSetlistDeletionRepository(fullBrowser(), userSetlists(JUAN));
    assert.throws(() => repo.mark('setlist-1234', NOW, 4));
    checks++;
    // Y un id o un momento imposibles tampoco se anotan a medias.
    const storage = browser();
    const ok = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    assert.throws(() => ok.mark('  ', NOW));
    assert.throws(() => ok.mark('setlist-1234', 0));
    assert.throws(() => ok.mark('setlist-1234', NOW, 0));
    checks += 3;
    eq(ok.list(), [], 'nada a medias');
  });

  it('el repositorio no mira nunca el reloj', () => {
    const source = readFileSync('src/storage/setlistDeletions.ts', 'utf8');
    for (const forbidden of ['Date.now', 'new Date', 'fetch(', 'localStorage', 'cloudSetlists']) {
      eq(source.includes(forbidden), false, forbidden);
    }
  });
});

// --- Deleting, in the app -----------------------------------------------------------------

describe('Borrar un setlist deja constancia', () => {
  /**
   * What useSetlists does when somebody deletes, without React: the marker
   * goes down first, and only then does the setlist go. The hook's own copy
   * of this is in useSetlists; here it is checked as the rule it is.
   */
  const deleteSetlist = (
    deletions: ReturnType<typeof createSetlistDeletionRepository>,
    bases: ReturnType<typeof createSetlistSyncStore>,
    setlists: Setlist[],
    id: string,
    deletedAt: number
  ): { setlists: Setlist[]; done: boolean } => {
    if (!setlists.some((setlist) => setlist.id === id)) return { setlists, done: false };
    try {
      deletions.mark(id, deletedAt, bases.load().get(id)?.cloudRevision);
    } catch {
      return { setlists, done: false };
    }
    return { setlists: setlists.filter((setlist) => setlist.id !== id), done: true };
  };

  const scenario = (scope = userSetlists(JUAN), storage = browser()) => ({
    storage,
    deletions: createSetlistDeletionRepository(storage, scope),
    bases: createSetlistSyncStore(storage, scope),
  });

  it('con cuenta y sin base conocida: queda anotado, sin revisión', () => {
    const { deletions, bases } = scenario();
    const result = deleteSetlist(deletions, bases, [setlistOf('setlist-1234')], 'setlist-1234', NOW);
    eq(result.done, true);
    eq(result.setlists, []);
    eq(deletions.get('setlist-1234'), { setlistId: 'setlist-1234', deletedAt: NOW });
  });

  it('con cuenta y base en la revisión 4: queda anotada esa revisión', () => {
    const { deletions, bases } = scenario();
    const setlist = setlistOf('setlist-1234');
    bases.save(
      new Map([[setlist.id, { setlistId: setlist.id, cloudRevision: 4, fingerprint: portableFingerprint(setlist) }]])
    );

    const result = deleteSetlist(deletions, bases, [setlist], setlist.id, NOW);
    eq(result.done, true);
    eq(deletions.get('setlist-1234'), { setlistId: 'setlist-1234', deletedAt: NOW, baseRevision: 4 });
    // La revisión anotada es lo que este dispositivo sabía, no una promesa
    // sobre lo que la fila tiene ahora.
    eq(deletions.get('setlist-1234')?.baseRevision, bases.load().get('setlist-1234')?.cloudRevision);
  });

  it('borrar el setlist no borra la base: hace falta para razonar después', () => {
    const { deletions, bases } = scenario();
    const setlist = setlistOf('setlist-1234');
    const base = { setlistId: setlist.id, cloudRevision: 4, fingerprint: portableFingerprint(setlist) };
    bases.save(new Map([[setlist.id, base]]));

    deleteSetlist(deletions, bases, [setlist], setlist.id, NOW);
    eq(bases.load().get('setlist-1234'), base, 'la base sigue ahí');
    eq(deletions.get('setlist-1234')?.baseRevision, 4, 'y la anotación también');
    // Limpiarlas es cosa de quien confirme la lápida remota, más adelante.
  });

  it('como invitado no se anota nada, y se borra igual que siempre', () => {
    const { deletions, bases, storage } = scenario(GUEST_SETLISTS);
    const result = deleteSetlist(deletions, bases, [setlistOf('setlist-1234')], 'setlist-1234', NOW);
    eq(result.done, true);
    eq(result.setlists, []);
    eq(deletions.list(), []);
    eq(storage.data.size, 0, 'ninguna metadata de nube para quien no tiene cuenta');
  });

  it('si la anotación no se puede guardar, el setlist no se borra', () => {
    // Es mejor tener que volver a intentarlo que perder la única prueba de
    // que el borrado fue intencionado: sin ella, la copia de la nube vuelve.
    const storage = fullBrowser();
    const deletions = createSetlistDeletionRepository(storage, userSetlists(JUAN));
    const bases = createSetlistSyncStore(storage, userSetlists(JUAN));
    const setlist = setlistOf('setlist-1234');

    const result = deleteSetlist(deletions, bases, [setlist], setlist.id, NOW);
    eq(result.done, false, 'se dice que no se pudo');
    eq(result.setlists, [setlist], 'y el setlist sigue donde estaba');
  });

  it('un id que no nombra nada no se anota', () => {
    // Una anotación dice "alguien borró este setlist", que es una frase sobre
    // algo que existía. Un id suelto dejaría una nota que más tarde podría
    // leerse como una orden de quitar la copia de otro dispositivo.
    const { deletions, bases, storage } = scenario();
    const setlist = setlistOf('setlist-1234');
    const result = deleteSetlist(deletions, bases, [setlist], 'id-que-no-existe', NOW);

    eq(result.done, false);
    eq(result.setlists, [setlist], 'y nada cambia');
    eq(deletions.list(), [], 'ninguna anotación');
    eq(storage.data.size, 0, 'ni una clave escrita');
  });

  it('borrar dos veces: la segunda no hace nada', () => {
    const { deletions, bases } = scenario();
    const setlist = setlistOf('setlist-1234');
    const primera = deleteSetlist(deletions, bases, [setlist], setlist.id, NOW);
    eq(primera.done, true);
    const anotacion = deletions.get(setlist.id);
    eq(anotacion?.deletedAt, NOW);

    // Ya no está: no hay nada que borrar, y la anotación no se toca.
    const segunda = deleteSetlist(deletions, bases, primera.setlists, setlist.id, NOW + 900_000);
    eq(segunda.done, false);
    eq(deletions.get(setlist.id), anotacion, 'el mismo momento y la misma revisión de antes');
    eq(deletions.list().length, 1);
  });

  it('la revisión anotada es la que se sabía al borrar, y ahí se queda', () => {
    const { deletions, bases } = scenario();
    const setlist = setlistOf('setlist-1234');
    const fingerprint = portableFingerprint(setlist);
    bases.save(new Map([[setlist.id, { setlistId: setlist.id, cloudRevision: 4, fingerprint }]]));
    deleteSetlist(deletions, bases, [setlist], setlist.id, NOW);
    eq(deletions.get(setlist.id)?.baseRevision, 4);

    // La base avanza después, por lo que sea. La anotación es una fotografía
    // de lo que se sabía al decidir, y no se revela otra vez.
    bases.save(new Map([[setlist.id, { setlistId: setlist.id, cloudRevision: 9, fingerprint }]]));
    eq(deletions.get(setlist.id)?.baseRevision, 4, 'sigue diciendo 4');
  });

  it('borrar en una cuenta no toca lo de la otra', () => {
    const storage = browser();
    const juan = scenario(userSetlists(JUAN), storage);
    const maria = scenario(userSetlists(MARIA), storage);
    maria.deletions.mark('setlist-1234', NOW - 1000, 2);

    deleteSetlist(juan.deletions, juan.bases, [setlistOf('setlist-1234')], 'setlist-1234', NOW);
    eq(maria.deletions.get('setlist-1234'), { setlistId: 'setlist-1234', deletedAt: NOW - 1000, baseRevision: 2 });
    eq(juan.deletions.get('setlist-1234')?.deletedAt, NOW);
  });

  it('si el setlist no llega a guardarse borrado, el estado resultante es seguro', () => {
    // El almacén de setlists se traga los fallos de escritura a propósito (la
    // lista se queda en memoria por esta visita). Así que es posible acabar
    // con la anotación guardada y el setlist todavía en el almacenamiento.
    // No es un estado bonito, pero sí es un estado seguro: el motor lo ve
    // como lo que es y no toca nada en ninguno de los dos lados.
    const local = setlistOf('setlist-1234');
    const marker = { setlistId: local.id, deletedAt: NOW, baseRevision: 4 };
    const base = { setlistId: local.id, cloudRevision: 4, fingerprint: portableFingerprint(local) };
    const remote: CloudSetlistRead = {
      state: 'setlist',
      id: local.id,
      setlist: local,
      revision: 4,
      serverUpdatedAt: '2026-09-22T18:45:00+00:00',
    };

    eq(reconcileSetlist({ local, remote, base, deletion: marker }), {
      kind: 'ask',
      question: 'inconsistent-local-deletion',
      setlistId: local.id,
    });
    // Y nunca, bajo ninguna combinación, un borrado remoto.
    const tombstone: CloudSetlistRead = { state: 'deleted', id: local.id, revision: 5, deletedAt: '2026-09-16T08:00:00+00:00' };
    for (const row of [undefined, remote, tombstone]) {
      for (const known of [undefined, base]) {
        const plan = reconcileSetlist({ local, remote: row, base: known, deletion: marker });
        eq(plan.kind, 'ask', `${row?.state ?? 'sin fila'} / ${known ? 'con base' : 'sin base'}`);
      }
    }
  });

  it('el hook borra en ese orden, y avisa cuando no puede', () => {
    // La regla vive en useSetlists; esto comprueba que sigue estando escrita
    // allí, porque es donde un cambio descuidado la rompería.
    const source = readFileSync('src/hooks/useSetlists.ts', 'utf8');
    const existsAt = source.indexOf('setlists.some((setlist) => setlist.id === id)');
    const markAt = source.indexOf('deletions.mark(');
    const filterAt = source.indexOf('current.filter((setlist) => setlist.id !== id)');
    eq(existsAt > 0 && markAt > existsAt, true, 'primero comprobar que existe');
    eq(filterAt > markAt, true, 'después la anotación, y sólo entonces el borrado');
    eq(source.includes('return false;'), true, 'y un borrado que no se pudo anotar se dice');
    // Y la pantalla no navega ni da por hecho nada cuando dice que no.
    const app = readFileSync('src/App.tsx', 'utf8');
    eq(app.includes('if (!setlists.remove(setlistId)) {'), true, 'la pantalla mira la respuesta');
  });
});

/** Type-level: a marker is these three fields and nothing else. */
const _shape: SetlistDeletionMarker = { setlistId: 'setlist-1234', deletedAt: NOW, baseRevision: 4 };
void _shape;
