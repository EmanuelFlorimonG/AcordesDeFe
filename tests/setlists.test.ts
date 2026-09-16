import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Song } from '../src/types/song';
import type { Setlist } from '../src/types/setlist';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { describeKey, moveCapoBy, normalizeKeySettings, transposeBy } from '../src/utils/keySettings';
import {
  MAX_NOTES_LENGTH,
  addSongsToSetlist,
  createSetlist,
  duplicateSetlist,
  formatDurationSummary,
  getFirstPlayableItem,
  getSetlistPosition,
  groupSetlistsByDate,
  isValidIsoDate,
  listSongCategories,
  moveSetlistItem,
  moveSetlistItemBy,
  moveSetlistItemCapo,
  removeSetlistItem,
  summarizeSetlistDuration,
  toLocalIsoDate,
  transposeSetlistItem,
  updateSetlistDetails,
  updateSetlistItem,
} from '../src/utils/setlists';
import {
  SETLIST_BACKUP_KEY,
  SETLIST_STORAGE_KEY,
  SETLIST_STORAGE_VERSION,
  createLocalSetlistRepository,
  parseStoredSetlists,
} from '../src/storage/setlistStorage';
import {
  SONG_DURATIONS_KEY,
  createSongDurationStore,
  parseSongDurations,
  shouldRecordDuration,
} from '../src/storage/songDurationStorage';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`setlists.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);
const LATER = NOW + 60_000;

function idSequence(prefix = 'id') {
  let count = 0;
  return () => `${prefix}-${++count}`;
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function song(id: string): Song {
  const found = MOCK_SONGS.find((candidate) => candidate.id === id);
  assert.ok(found, `falta la canción ${id}`);
  return found;
}

const HURACAN = song('huracan-hakuna'); // G, cejilla recomendada 5
const NADIE = song('nadie-te-ama-como-yo'); // C
const CONTIGO = song('contigo-maria'); // G
const ALFARERO = song('alfarero'); // D

/** "Misa Domingo" with Huracán, Nadie te ama como yo and Contigo María. */
function sampleSetlist(makeId = idSequence()): Setlist {
  const empty = createSetlist({ name: 'Misa Domingo', date: '2026-09-20' }, { now: NOW, createId: makeId });
  return addSongsToSetlist(empty, [HURACAN, NADIE, CONTIGO], { now: NOW, createId: makeId });
}

const titles = (setlist: Setlist) => setlist.items.map((item) => item.songId);

describe('Crear y editar un Setlist', () => {
  it('crea un Setlist vacío con nombre, fecha y descripción limpios', () => {
    const setlist = createSetlist(
      { name: '  Misa Domingo  ', date: '2026-09-20', description: '  Coro juvenil ' },
      { now: NOW, createId: idSequence('s') }
    );
    eq(setlist, {
      id: 's-1',
      name: 'Misa Domingo',
      date: '2026-09-20',
      description: 'Coro juvenil',
      items: [],
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('exige un nombre y descarta fechas que no existen', () => {
    assert.throws(() => createSetlist({ name: '   ' }, { now: NOW }));
    checks++;
    eq(createSetlist({ name: 'Retiro', date: '2026-02-30' }, { now: NOW }).date, '');
    eq(createSetlist({ name: 'Retiro', date: '20/09/2026' }, { now: NOW }).date, '');
    eq(createSetlist({ name: 'Retiro' }, { now: NOW }).date, '');
  });

  it('edita los detalles sin tocar canciones ni fecha de creación', () => {
    const original = deepFreeze(sampleSetlist());
    const edited = updateSetlistDetails(original, { name: 'Misa de las 12', description: 'Con violín' }, LATER);
    eq(edited.name, 'Misa de las 12');
    eq(edited.description, 'Con violín');
    eq(edited.date, '2026-09-20');
    eq(edited.items, original.items);
    eq(edited.createdAt, NOW);
    eq(edited.updatedAt, LATER);
    eq(updateSetlistDetails(original, { date: '' }, LATER).date, '');
    assert.throws(() => updateSetlistDetails(original, { name: '' }, LATER));
    checks++;
  });

  it('valida fechas del calendario', () => {
    eq(isValidIsoDate('2028-02-29'), true);
    eq(isValidIsoDate('2026-02-29'), false);
    eq(isValidIsoDate('2026-13-01'), false);
    eq(isValidIsoDate('2026-9-20'), false);
    eq(toLocalIsoDate(new Date(2026, 0, 5)), '2026-01-05');
  });
});

describe('Duplicar y eliminar', () => {
  it('duplica canciones, orden, tonos, cejillas, momentos y notas con ids nuevos', () => {
    const makeId = idSequence();
    let original = sampleSetlist(makeId);
    const [first, second] = original.items;
    original = transposeSetlistItem(original, first.id, 2, NOW);
    original = updateSetlistItem(original, second.id, { moment: 'Comunión', notes: 'Último coro x2', capoFret: 3 }, NOW);
    deepFreeze(original);

    const copy = duplicateSetlist(original, { name: 'Misa Domingo 27', date: '2026-09-27' }, { now: LATER, createId: makeId });
    eq(copy.name, 'Misa Domingo 27');
    eq(copy.date, '2026-09-27');
    eq(copy.createdAt, LATER);
    assert.notEqual(copy.id, original.id);
    checks++;

    const withoutIds = (setlist: Setlist) => setlist.items.map(({ id: _id, ...rest }) => rest);
    eq(withoutIds(copy), withoutIds(original));
    const originalIds = new Set(original.items.map((item) => item.id));
    eq(copy.items.some((item) => originalIds.has(item.id)), false, 'la copia no comparte ids de entradas');

    const editedCopy = updateSetlistItem(copy, copy.items[0].id, { notes: 'Solo en la copia' }, LATER);
    eq(original.items[0].notes, '', 'editar la copia no cambia el original');
    eq(editedCopy.items[0].notes, 'Solo en la copia');
  });

  it('eliminar un Setlist conserva los demás y las canciones', () => {
    const storage = memoryStorage();
    const repository = createLocalSetlistRepository(storage);
    const a = sampleSetlist(idSequence('a'));
    const b = createSetlist({ name: 'Ensayo viernes' }, { now: NOW, createId: idSequence('b') });
    repository.save([a, b]);
    repository.save(repository.load().setlists.filter((setlist) => setlist.id !== a.id));
    eq(repository.load().setlists, [b]);
    eq(MOCK_SONGS.includes(HURACAN), true);
  });
});

describe('Canciones del Setlist', () => {
  it('añade canciones al final con su tono y cejilla recomendada', () => {
    const setlist = sampleSetlist();
    eq(titles(setlist), ['huracan-hakuna', 'nadie-te-ama-como-yo', 'contigo-maria']);
    eq(setlist.items[0], {
      id: 'id-2',
      songId: 'huracan-hakuna',
      moment: '',
      transposeSteps: 0,
      capoFret: 5,
      notes: '',
    });
    eq(setlist.items[1].capoFret, 0);
  });

  it('la misma canción puede estar dos veces, con configuración propia', () => {
    const makeId = idSequence();
    let setlist = addSongsToSetlist(sampleSetlist(makeId), [HURACAN], { now: LATER, createId: makeId });
    const [opening, , , closing] = setlist.items;
    assert.notEqual(opening.id, closing.id);
    checks++;
    setlist = transposeSetlistItem(setlist, closing.id, 2, LATER);
    eq(setlist.items[0].transposeSteps, 0);
    eq(setlist.items[3].transposeSteps, 2);
    eq(setlist.updatedAt, LATER);
  });

  it('quita solo la entrada indicada', () => {
    const setlist = deepFreeze(sampleSetlist());
    const removed = removeSetlistItem(setlist, setlist.items[1].id, LATER);
    eq(titles(removed), ['huracan-hakuna', 'contigo-maria']);
    eq(removeSetlistItem(setlist, 'no-existe', LATER) === setlist, true);
    eq(addSongsToSetlist(setlist, [], { now: LATER }) === setlist, true);
  });

  it('reordena a una posición, hacia arriba y hacia abajo', () => {
    const setlist = deepFreeze(sampleSetlist());
    const [a, b, c] = setlist.items;
    eq(titles(moveSetlistItem(setlist, a.id, 2, LATER)), ['nadie-te-ama-como-yo', 'contigo-maria', 'huracan-hakuna']);
    eq(titles(moveSetlistItem(setlist, c.id, 0, LATER)), ['contigo-maria', 'huracan-hakuna', 'nadie-te-ama-como-yo']);
    eq(titles(moveSetlistItem(setlist, a.id, 99, LATER)), ['nadie-te-ama-como-yo', 'contigo-maria', 'huracan-hakuna']);
    eq(titles(moveSetlistItem(setlist, c.id, -4, LATER)), ['contigo-maria', 'huracan-hakuna', 'nadie-te-ama-como-yo']);
    eq(titles(moveSetlistItemBy(setlist, b.id, -1, LATER)), ['nadie-te-ama-como-yo', 'huracan-hakuna', 'contigo-maria']);
    eq(titles(moveSetlistItemBy(setlist, b.id, 1, LATER)), ['huracan-hakuna', 'contigo-maria', 'nadie-te-ama-como-yo']);
    eq(moveSetlistItemBy(setlist, a.id, -1, LATER) === setlist, true, 'la primera no sube');
    eq(moveSetlistItemBy(setlist, c.id, 1, LATER) === setlist, true, 'la última no baja');
    eq(moveSetlistItem(setlist, b.id, 1, LATER) === setlist, true);
    eq(moveSetlistItem(setlist, b.id, 2, LATER).updatedAt, LATER);
  });

  it('guarda momento y nota, recortados y con límite', () => {
    const setlist = sampleSetlist();
    const itemId = setlist.items[0].id;
    const updated = updateSetlistItem(setlist, itemId, { moment: '  Entrada ', notes: '  Intro solo piano  ' }, LATER);
    eq(updated.items[0].moment, 'Entrada');
    eq(updated.items[0].notes, 'Intro solo piano');
    eq(updated.items[0].transposeSteps, 0, 'guardar la nota no cambia el tono');
    eq(updateSetlistItem(setlist, itemId, { notes: 'x'.repeat(900) }, LATER).items[0].notes.length, MAX_NOTES_LENGTH);
    eq(updateSetlistItem(setlist, 'no-existe', { notes: 'x' }, LATER) === setlist, true);
  });
});

describe('Tono por Setlist sin tocar la canción', () => {
  it('Huracán: G en el cancionero, A en un Setlist y Bb en otro', () => {
    const frozenSong = deepFreeze(structuredClone(HURACAN));
    let setlistA = addSongsToSetlist(createSetlist({ name: 'A' }, { now: NOW }), [frozenSong], { now: NOW });
    let setlistB = addSongsToSetlist(createSetlist({ name: 'B' }, { now: NOW }), [frozenSong], { now: NOW });
    setlistA = transposeSetlistItem(setlistA, setlistA.items[0].id, 2, LATER);
    setlistB = transposeSetlistItem(setlistB, setlistB.items[0].id, 3, LATER);

    const keyA = describeKey(frozenSong.originalKey, setlistA.items[0], frozenSong.recommendedCapo);
    const keyB = describeKey(frozenSong.originalKey, setlistB.items[0], frozenSong.recommendedCapo);
    eq(keyA?.shape, 'A');
    eq(keyB?.shape, 'Bb');
    eq(keyA?.originalSounding, 'C', 'con cejilla 5, G suena en C');
    eq(keyA?.sounding, 'D');
    eq(keyA?.original, 'C');
    eq(keyA?.isModified, true);

    eq(frozenSong, HURACAN, 'la canción no cambia');
    eq(HURACAN.originalKey, 'G');
  });

  it('sin cambios, el tono es el original y no cuenta como modificado', () => {
    const setlist = sampleSetlist();
    const key = describeKey(HURACAN.originalKey, setlist.items[0], HURACAN.recommendedCapo);
    eq(key, { sounding: 'C', shape: 'G', original: null, originalSounding: 'C', isModified: false });
    eq(describeKey(undefined, setlist.items[0]), null, 'canción sin tonalidad registrada');
  });

  it('la cejilla reactiva mantiene lo que suena', () => {
    let setlist = sampleSetlist();
    const itemId = setlist.items[1].id; // Nadie te ama como yo, C
    setlist = moveSetlistItemCapo(setlist, itemId, 1, LATER);
    setlist = moveSetlistItemCapo(setlist, itemId, 1, LATER);
    eq(setlist.items[1].capoFret, 2);
    eq(setlist.items[1].transposeSteps, -2);
    const key = describeKey(NADIE.originalKey, setlist.items[1], NADIE.recommendedCapo);
    eq(key?.sounding, 'C');
    eq(key?.shape, 'Bb');
    eq(key?.original, null);
  });

  it('respeta los límites de tono y cejilla', () => {
    let settings = { transposeSteps: 0, capoFret: 0 };
    for (let step = 0; step < 20; step++) settings = transposeBy(settings, 1);
    eq(settings.transposeSteps, 11);
    eq(transposeBy(settings, 1) === settings, true);
    eq(moveCapoBy({ transposeSteps: 0, capoFret: 0 }, -1), { transposeSteps: 0, capoFret: 0 });
    eq(moveCapoBy({ transposeSteps: 0, capoFret: 11 }, 1), { transposeSteps: 0, capoFret: 11 });
    eq(moveCapoBy({ transposeSteps: 0, capoFret: 0 }, 1), { transposeSteps: -1, capoFret: 1 });
    eq(normalizeKeySettings({ transposeSteps: 'x', capoFret: undefined }, 2), { transposeSteps: 0, capoFret: 2 });
    eq(normalizeKeySettings({ transposeSteps: -40, capoFret: 30 }), { transposeSteps: -11, capoFret: 11 });

    let setlist = sampleSetlist();
    const itemId = setlist.items[2].id;
    for (let step = 0; step < 15; step++) setlist = transposeSetlistItem(setlist, itemId, -1, LATER);
    eq(setlist.items[2].transposeSteps, -11);
    eq(transposeSetlistItem(setlist, itemId, -1, LATER) === setlist, true);
  });
});

describe('Anterior y siguiente en el ensayo', () => {
  const setlist = sampleSetlist();
  const [first, middle, last] = setlist.items;

  it('la primera no tiene anterior', () => {
    const position = getSetlistPosition(setlist, first.id);
    eq(position?.index, 0);
    eq(position?.total, 3);
    eq(position?.previous, null);
    eq(position?.next?.id, middle.id);
    eq(position?.isFirst, true);
    eq(position?.isLast, false);
  });

  it('en medio hay anterior y siguiente, en el orden del Setlist', () => {
    const position = getSetlistPosition(setlist, middle.id);
    eq(position?.previous?.id, first.id);
    eq(position?.next?.id, last.id);
  });

  it('la última no vuelve a empezar', () => {
    const position = getSetlistPosition(setlist, last.id);
    eq(position?.next, null);
    eq(position?.isLast, true);
    eq(position?.previous?.id, middle.id);
  });

  it('sigue el orden después de reordenar', () => {
    const reordered = moveSetlistItem(setlist, last.id, 0, LATER);
    eq(getSetlistPosition(reordered, last.id)?.isFirst, true);
    eq(getSetlistPosition(reordered, middle.id)?.isLast, true);
  });

  it('salta canciones que ya no están en el cancionero', () => {
    const isPlayable = (item: { songId: string }) => item.songId !== 'nadie-te-ama-como-yo';
    const position = getSetlistPosition(setlist, first.id, isPlayable);
    eq(position?.next?.id, last.id);
    eq(position?.total, 2);
    eq(getSetlistPosition(setlist, middle.id, isPlayable), null);
    eq(getSetlistPosition(setlist, 'no-existe'), null);
    eq(getFirstPlayableItem(setlist, (item) => item.songId !== 'huracan-hakuna')?.id, middle.id);
    eq(getFirstPlayableItem(createSetlist({ name: 'Vacío' }, { now: NOW })), null);
  });
});

describe('Persistencia', () => {
  it('guarda y vuelve a cargar exactamente lo mismo, con versión', () => {
    const storage = memoryStorage();
    let setlist = sampleSetlist();
    setlist = updateSetlistItem(setlist, setlist.items[0].id, { moment: 'Entrada', notes: 'Intro solo piano' }, LATER);
    setlist = transposeSetlistItem(setlist, setlist.items[0].id, 2, LATER);
    createLocalSetlistRepository(storage).save([setlist]);

    const stored = JSON.parse(storage.data.get(SETLIST_STORAGE_KEY) ?? 'null');
    eq(stored.version, SETLIST_STORAGE_VERSION);
    const loaded = createLocalSetlistRepository(storage).load();
    eq(loaded, { setlists: [setlist], recoveredFromUnreadableData: false });
  });

  it('sin datos guardados empieza vacío', () => {
    eq(createLocalSetlistRepository(memoryStorage()).load(), { setlists: [], recoveredFromUnreadableData: false });
    eq(createLocalSetlistRepository(null).load(), { setlists: [], recoveredFromUnreadableData: false });
  });

  it('migra el formato sin versión (una lista simple)', () => {
    const storage = memoryStorage({
      [SETLIST_STORAGE_KEY]: JSON.stringify([{ id: 'old', name: 'Vigilia', createdAt: NOW, items: [{ songId: 'alfarero' }] }]),
    });
    const repository = createLocalSetlistRepository(storage);
    const { setlists } = repository.load();
    eq(setlists.length, 1);
    eq(setlists[0].name, 'Vigilia');
    eq(setlists[0].items[0].songId, ALFARERO.id);
    eq(setlists[0].items[0].transposeSteps, 0);
    eq(typeof setlists[0].items[0].id, 'string');
    repository.save(setlists);
    eq(JSON.parse(storage.data.get(SETLIST_STORAGE_KEY) ?? '{}').version, SETLIST_STORAGE_VERSION);
  });
});

describe('Datos corruptos', () => {
  it('repara valores inválidos y descarta lo irrecuperable', () => {
    const raw = JSON.stringify({
      version: 1,
      setlists: [
        {
          id: 's1',
          name: '  Retiro  ',
          date: '2026-13-40',
          description: 42,
          createdAt: 'ayer',
          items: [
            { id: 'i1', songId: 'huracan-hakuna', transposeSteps: 99, capoFret: -3, moment: 7, notes: null },
            { id: 'i1', songId: 'contigo-maria', transposeSteps: 2.4, capoFret: '3' },
            { id: 'i3' },
            'basura',
            null,
          ],
        },
        { id: 's1', name: '', items: 'no es una lista' },
        42,
        null,
      ],
    });
    const { setlists, unreadable } = parseStoredSetlists(raw, NOW, idSequence('nuevo'));
    eq(unreadable, false);
    eq(setlists.length, 2);

    const [retiro, sinNombre] = setlists;
    eq(retiro.name, 'Retiro');
    eq(retiro.date, '');
    eq(retiro.description, '');
    eq(retiro.createdAt, NOW);
    eq(retiro.items.length, 2);
    eq(retiro.items[0], { id: 'i1', songId: 'huracan-hakuna', moment: '', transposeSteps: 11, capoFret: 0, notes: '' });
    eq(retiro.items[1].transposeSteps, 2);
    eq(retiro.items[1].capoFret, 0);
    assert.notEqual(retiro.items[1].id, 'i1', 'ids repetidos se separan');
    checks++;

    assert.notEqual(sinNombre.id, 's1');
    checks++;
    eq(sinNombre.name, 'Setlist sin nombre');
    eq(sinNombre.items, []);
  });

  it('JSON roto o de una versión futura: no se adivina, se guarda copia de seguridad', () => {
    for (const raw of ['{roto', JSON.stringify({ version: 99, setlists: [] }), JSON.stringify('texto'), '42']) {
      const storage = memoryStorage({ [SETLIST_STORAGE_KEY]: raw });
      const result = createLocalSetlistRepository(storage).load();
      eq(result, { setlists: [], recoveredFromUnreadableData: true }, raw);
      eq(storage.data.get(SETLIST_BACKUP_KEY), raw, 'copia de seguridad');
      eq(storage.data.get(SETLIST_STORAGE_KEY), raw, 'cargar no sobrescribe');
    }
  });

  it('un almacenamiento bloqueado o lleno no rompe la app', () => {
    const blocked = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('lleno');
      },
    };
    const repository = createLocalSetlistRepository(blocked);
    eq(repository.load(), { setlists: [], recoveredFromUnreadableData: false });
    repository.save([sampleSetlist()]);
    eq(createSongDurationStore(blocked).load(), {});
    createSongDurationStore(blocked).save({ a: 1 });
  });
});

describe('Duración', () => {
  it('suma solo las duraciones conocidas y nunca inventa', () => {
    const setlist = sampleSetlist();
    const durations = { 'huracan-hakuna': 300, 'nadie-te-ama-como-yo': 1140 };
    eq(summarizeSetlistDuration(setlist, durations), { songCount: 3, knownSeconds: 1440, unknownCount: 1 });
    eq(formatDurationSummary(summarizeSetlistDuration(setlist, durations)), '~24 min + 1 canción sin duración');
    eq(formatDurationSummary({ songCount: 8, knownSeconds: 1440, unknownCount: 2 }), '~24 min + 2 canciones sin duración');
    eq(formatDurationSummary({ songCount: 3, knownSeconds: 1440, unknownCount: 0 }), '~24 min');
    eq(formatDurationSummary(summarizeSetlistDuration(setlist, {})), 'Duración desconocida');
    eq(formatDurationSummary({ songCount: 0, knownSeconds: 0, unknownCount: 0 }), '');
    eq(formatDurationSummary({ songCount: 1, knownSeconds: 20, unknownCount: 0 }), '~1 min');
  });

  it('lee y guarda duraciones reales del reproductor', () => {
    eq(parseSongDurations('{"a": 245.3, "b": -1, "c": "300", "d": 99999, "": 10}'), { a: 245.3 });
    eq(parseSongDurations('{roto'), {});
    eq(parseSongDurations('[1,2]'), {});
    eq(shouldRecordDuration({ a: 245 }, 'a', 245.4), false);
    eq(shouldRecordDuration({ a: 245 }, 'a', 250), true);
    eq(shouldRecordDuration({}, 'b', 0), false);
    eq(shouldRecordDuration({}, 'b', Number.NaN), false);
    eq(shouldRecordDuration({}, '', 200), false);

    const storage = memoryStorage();
    createSongDurationStore(storage).save({ 'huracan-hakuna': 301 });
    eq(JSON.parse(storage.data.get(SONG_DURATIONS_KEY) ?? '{}'), { 'huracan-hakuna': 301 });
    eq(createSongDurationStore(storage).load(), { 'huracan-hakuna': 301 });
  });
});

describe('Próximos y recientes', () => {
  it('agrupa por fecha: hoy cuenta como próximo', () => {
    const make = (name: string, date: string, updatedAt = NOW) => ({
      ...createSetlist({ name, date }, { now: NOW, createId: () => name }),
      updatedAt,
    });
    const today = make('hoy', '2026-09-15');
    const soon = make('pronto', '2026-09-20');
    const later = make('luego', '2026-10-01');
    const past = make('pasado', '2026-09-01');
    const older = make('antiguo', '2026-08-01');
    const undatedNew = make('sin-fecha-nuevo', '', LATER);
    const undatedOld = make('sin-fecha-viejo', '', NOW);

    const groups = groupSetlistsByDate([later, undatedOld, past, today, older, undatedNew, soon], '2026-09-15');
    eq(groups.upcoming.map((setlist) => setlist.id), ['hoy', 'pronto', 'luego']);
    eq(groups.recent.map((setlist) => setlist.id), ['pasado', 'antiguo', 'sin-fecha-nuevo', 'sin-fecha-viejo']);
  });
});

describe('Clasificar por momento de la misa', () => {
  it('ofrece las partes de la misa en su orden y después los temas', () => {
    const categories = listSongCategories(MOCK_SONGS);
    eq(
      categories.filter((entry) => entry.isMassMoment).map((entry) => entry.name),
      ['Entrada', 'Piedad', 'Gloria', 'Aclamación', 'Ofertorio', 'Santo', 'Paz', 'Cordero', 'Comunión', 'Salida']
    );

    const others = categories.filter((entry) => entry.isMassMoment === false);
    eq(categories.findIndex((entry) => !entry.isMassMoment), 10, 'los temas van después de la misa');
    eq(
      others.every((entry, index) => index === 0 || others[index - 1].count >= entry.count),
      true,
      'los temas van del más usado al menos'
    );

    const entrada = categories.find((entry) => entry.name === 'Entrada');
    eq(entrada?.count, MOCK_SONGS.filter((song) => song.categories.includes('Entrada')).length);
  });

  it('solo ofrece categorías que existen en el cancionero', () => {
    eq(
      listSongCategories([
        { categories: ['Comunión'] },
        { categories: ['Adoración', 'Comunión'] },
        { categories: ['  '] },
      ]),
      [
        { name: 'Comunión', count: 2, isMassMoment: true },
        { name: 'Adoración', count: 1, isMassMoment: false },
      ]
    );
    eq(listSongCategories([]), []);
  });

  it('añadir desde un momento deja la canción ya clasificada', () => {
    const makeId = idSequence();
    const setlist = addSongsToSetlist(
      createSetlist({ name: 'Misa' }, { now: NOW, createId: makeId }),
      [HURACAN, NADIE],
      { now: NOW, createId: makeId, moment: '  Entrada  ' }
    );
    eq(setlist.items.map((item) => item.moment), ['Entrada', 'Entrada']);
    eq(setlist.items[0].capoFret, 5, 'sigue tomando la cejilla recomendada de la canción');
    eq(setlist.items[0].transposeSteps, 0, 'y su tono original');
    eq(
      addSongsToSetlist(setlist, [CONTIGO], { now: LATER, createId: makeId }).items[2].moment,
      '',
      'sin momento, la canción entra sin clasificar'
    );
  });
});
