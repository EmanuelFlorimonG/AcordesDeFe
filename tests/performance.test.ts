import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MinistryEvent } from '../src/types/event';
import type { MinistryMember } from '../src/types/ministry';
import type { PerformanceRecord } from '../src/types/performance';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import type { Song } from '../src/types/song';
import { parseSongSections } from '../src/utils/chordParser';
import {
  createEvent,
  findOccurrence,
  getEventsForSetlist,
  getOccurrenceStatus,
  getUpcomingEvents,
  isDateLocked,
  occurrencesBetween,
  setOccurrenceStatus,
  statusChangeError,
  updateEvent,
} from '../src/utils/ministryEvents';
import {
  EMPTY_PERFORMANCE_FILTERS,
  canFinishCelebration,
  countSoloSongsForMember,
  createPerformanceSnapshot,
  describeCapoShapes,
  describePerformedKey,
  describeRecordSize,
  filterPerformances,
  getPerformanceForOccurrence,
  getPerformancesForEvent,
  getPerformancesForMember,
  getPerformancesForSetlist,
  getPerformancesForSong,
  getRecentPerformances,
  getSongPerformanceCount,
  groupPerformancesByMonth,
  listHistoryPeople,
  listHistorySongs,
  occurrenceActions,
  performedSongs,
  soloistsOf,
  updatePerformanceRecord,
  validatePerformanceChanges,
  type PerformanceSources,
} from '../src/utils/performanceHistory';
import {
  PERFORMANCE_BACKUP_KEY,
  PERFORMANCE_STORAGE_KEY,
  PERFORMANCE_STORAGE_VERSION,
  createLocalPerformanceRepository,
  parseStoredPerformances,
} from '../src/storage/performanceStorage';
import {
  EVENTS_STORAGE_KEY,
  EVENTS_STORAGE_VERSION,
  createLocalEventRepository,
  parseStoredEvents,
} from '../src/storage/eventStorage';
import { updateSetlistItem } from '../src/utils/setlists';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`performance.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 20, 22);

function idSequence(prefix = 'p') {
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

// --- Fixtures ----------------------------------------------------------------

const song = (id: string, title: string, originalKey: string, content = '[Verso]\nLetra', artist?: string): Song => ({
  id,
  title,
  artist,
  originalKey,
  categories: [],
  tags: [],
  content,
  chordsUsed: [],
});

const SENCILLAMENTE = song(
  'sencillamente-dios',
  'Sencillamente Dios',
  'G',
  '[Verso 1]\nLetra del verso\n\n[Coro]\nLetra del coro',
  'Autor de prueba'
);
const GLORIA = song('gloria', 'Gloria', 'D');
const OFERTORIO = song('ofertorio', 'Ofertorio', 'C');
const SONGS = new Map([SENCILLAMENTE, GLORIA, OFERTORIO].map((entry) => [entry.id, entry]));
const [VERSO, CORO] = parseSongSections(SENCILLAMENTE.content).map((section) => section.id);

const member = (id: string, name: string, roles: MinistryMember['roles'] = ['singer']): MinistryMember => ({
  id,
  name,
  roles,
  instruments: [],
  vocalParts: [],
  notes: '',
  isActive: true,
  createdAt: NOW,
  updatedAt: NOW,
});

const MARIA = member('maria', 'María Rodríguez', ['singer']);
const EMANUEL = member('emanuel', 'Emanuel', ['director']);
const JOSE = member('jose', 'José', ['musician']);
const LAURA = member('laura', 'Laura', ['singer']);
const MEMBERS = new Map([MARIA, EMANUEL, JOSE, LAURA].map((entry) => [entry.id, entry]));

const item = (id: string, songId: string, extra: Partial<SetlistItem> = {}): SetlistItem => ({
  id,
  songId,
  moment: '',
  transposeSteps: 0,
  capoFret: 0,
  notes: '',
  ...extra,
});

const SETLIST: Setlist = {
  id: 'misa-domingo',
  name: 'Misa Domingo',
  date: '2026-09-20',
  description: '',
  participantIds: ['maria', 'emanuel'],
  items: [
    item('i-gloria', 'gloria', {
      moment: 'Gloria',
      capoFret: 2,
      transitionToNext: { type: 'direct', instruction: 'Sin pausa' },
    }),
    item('i-ofertorio', 'ofertorio', { moment: 'Ofertorio' }),
    item('i-sencillamente', 'sencillamente-dios', {
      moment: 'Comunión',
      transposeSteps: 3,
      notes: 'Entrar suave',
      transitionToNext: { type: 'stop', instruction: '' },
      arrangement: {
        songVersion: 1,
        songStructure: ['Verso 1', 'Coro'],
        sections: [
          {
            id: 'a-verso',
            sourceSectionId: VERSO,
            label: 'Verso 1',
            repeatCount: 1,
            voices: ['soloist'],
            assignedMemberIds: ['maria'],
            instruction: 'Solo voz y piano',
            transition: { type: 'continue' },
          },
          {
            id: 'a-coro',
            sourceSectionId: CORO,
            label: 'Coro',
            repeatCount: 2,
            voices: ['all'],
            assignedMemberIds: ['laura'],
            instruction: '',
            transition: { type: 'jump', targetId: 'a-verso' },
          },
        ],
      },
    }),
    item('i-perdida', 'cancion-borrada', { moment: 'Envío' }),
  ],
  createdAt: NOW,
  updatedAt: NOW,
};

const EVENT: MinistryEvent = createEvent(
  {
    title: 'Misa de Jóvenes',
    type: 'mass',
    date: '2026-09-20',
    startTime: '18:00',
    location: 'Templo',
    setlistId: SETLIST.id,
    participantIds: ['maria', 'emanuel', 'jose', 'laura'],
  },
  { now: NOW, createId: () => 'misa-jovenes' }
);

const sources = (overrides: Partial<PerformanceSources> = {}): PerformanceSources => ({
  event: EVENT,
  occurrenceDate: '2026-09-20',
  setlist: SETLIST,
  songsById: SONGS,
  membersById: MEMBERS,
  performedItemIds: ['i-gloria', 'i-sencillamente'],
  notes: ' Se omitió el Ofertorio por falta de tiempo. ',
  ...overrides,
});

const snapshot = (overrides: Partial<PerformanceSources> = {}, prefix = 'r') =>
  createPerformanceSnapshot(sources(overrides), { now: NOW, createId: idSequence(prefix) }) as PerformanceRecord;

// --- Snapshot ----------------------------------------------------------------

describe('Snapshot del día', () => {
  const record = snapshot();
  const sencillamente = record.songs.find((entry) => entry.songId === 'sencillamente-dios')!;
  const gloria = record.songs.find((entry) => entry.songId === 'gloria')!;

  it('identifica la fecha y copia la actividad y el Setlist', () => {
    eq(record.eventId, 'misa-jovenes');
    eq(record.occurrenceDate, '2026-09-20');
    eq(record.event, { title: 'Misa de Jóvenes', type: 'mass', allDay: false, startTime: '18:00', location: 'Templo' });
    eq(record.setlistId, 'misa-domingo');
    eq(record.setlistName, 'Misa Domingo');
    eq(record.notes, 'Se omitió el Ofertorio por falta de tiempo.');
  });

  it('el equipo es el de la actividad, con nombre y roles de ese día', () => {
    eq(record.participants, [
      { memberId: 'emanuel', name: 'Emanuel', roles: ['director'] },
      { memberId: 'jose', name: 'José', roles: ['musician'] },
      { memberId: 'laura', name: 'Laura', roles: ['singer'] },
      { memberId: 'maria', name: 'María Rodríguez', roles: ['singer'] },
    ]);
  });

  it('todas las canciones preparadas, marcando cuáles se interpretaron', () => {
    eq(record.songs.map((entry) => [entry.title, entry.performed]), [
      ['Gloria', true],
      ['Ofertorio', false],
      ['Sencillamente Dios', true],
    ]);
    eq(performedSongs(record).length, 2);
  });

  it('una canción que ya no está en el cancionero no entra: no hay título que guardar', () => {
    eq(record.songs.some((entry) => entry.songId === 'cancion-borrada'), false);
  });

  it('título, artista, momento, notas y transición', () => {
    eq(sencillamente.title, 'Sencillamente Dios');
    eq(sencillamente.artist, 'Autor de prueba');
    eq(sencillamente.moment, 'Comunión');
    eq(sencillamente.notes, 'Entrar suave');
    eq(gloria.artist, '');
    eq(gloria.transitionToNext, { type: 'direct', instruction: 'Sin pausa' });
    eq(sencillamente.transitionToNext, { type: 'stop', instruction: '' });
  });

  it('tonalidad: el mismo cálculo que el Setlist (G + 3 = Bb)', () => {
    eq(sencillamente.key, 'Bb');
    eq(sencillamente.chordKey, null);
    eq(sencillamente.transposeSteps, 3);
    eq(sencillamente.capoFret, 0);
  });

  it('cejilla: tonalidad que sonó y acordes que se tocaron', () => {
    eq(gloria.key, 'E');
    eq(gloria.chordKey, 'D');
    eq(gloria.capoFret, 2);
    eq(describePerformedKey(gloria), 'E (acordes en D, cejilla 2)');
    eq(describePerformedKey(sencillamente), 'Bb');
    eq(describeCapoShapes(gloria), 'Acordes en D · cejilla 2');
    eq(describeCapoShapes(sencillamente), '');
  });

  it('arreglo: etiquetas, voces, personas, repeticiones, indicación y salto', () => {
    eq(sencillamente.sections, [
      {
        label: 'Verso 1',
        sourceSectionId: VERSO,
        repeatCount: 1,
        voices: ['soloist'],
        assigned: [{ memberId: 'maria', name: 'María Rodríguez' }],
        instruction: 'Solo voz y piano',
        transition: { type: 'continue' },
      },
      {
        label: 'Coro',
        sourceSectionId: CORO,
        repeatCount: 2,
        voices: ['all'],
        assigned: [{ memberId: 'laura', name: 'Laura' }],
        instruction: '',
        transition: { type: 'jump', targetLabel: 'Verso 1' },
      },
    ]);
    eq(gloria.sections, null, 'sin arreglo: se tocó como está escrita');
  });

  it('solista: solo quien estaba asignado a un bloque "Solista"', () => {
    eq(soloistsOf(sencillamente), [{ memberId: 'maria', name: 'María Rodríguez' }]);
    eq(soloistsOf(gloria), []);
  });

  it('no guarda letra, acordes, YouTube ni la canción entera', () => {
    const stored = JSON.stringify(record);
    eq(stored.includes('Letra del verso'), false);
    eq(stored.includes('youtube'), false);
    eq(stored.includes('chordsUsed'), false);
  });

  it('nada interpretado: no hay registro vacío', () => {
    eq(createPerformanceSnapshot(sources({ performedItemIds: [] }), { now: NOW }), null);
    eq(createPerformanceSnapshot(sources({ performedItemIds: ['i-perdida'] }), { now: NOW }), null);
  });
});

describe('Snapshot después de una nueva versión de la canción', () => {
  const at = (changes: Partial<Song>) => new Map([...SONGS, [SENCILLAMENTE.id, { ...SENCILLAMENTE, ...changes }]]);
  const sectionsOf = (songsById: Map<string, Song>) =>
    snapshot({ songsById }).songs.find((entry) => entry.songId === 'sencillamente-dios')!.sections;

  it('un arreglo reasignado sin duda se registra como se tocó', () => {
    const moved = sectionsOf(at({ version: 2, content: `[Intro]
[G]

${SENCILLAMENTE.content}` }));
    eq(moved?.map((entry) => entry.label), ['Verso 1', 'Coro']);
  });

  it('un arreglo pendiente de revisar se registra como la canción tal como está escrita', () => {
    eq(sectionsOf(at({ version: 2, content: `${SENCILLAMENTE.content}

[Coro]
Otra letra` })), null);
  });
});

// --- Immutability ------------------------------------------------------------

describe('El historial no cambia con lo que venga después', () => {
  it('cambiar el Setlist a C no cambia el Bb de aquel día', () => {
    const record = snapshot();
    const before = JSON.stringify(record);
    const changed = updateSetlistItem(SETLIST, 'i-sencillamente', { transposeSteps: 5 }, NOW + 1);
    eq(changed.items[2].transposeSteps, 5);
    const later = snapshot({ setlist: changed }, 'q');
    eq(later.songs[2].key, 'C', 'un cierre nuevo sí usa el Setlist actual');
    eq(JSON.stringify(record), before);
    eq(record.songs[2].key, 'Bb');
  });

  it('publicar otra versión de la canción, o revisar su arreglo, no toca lo ya registrado', () => {
    const record = snapshot();
    const before = JSON.stringify(record);
    // La canción pasa a la versión 2 y su arreglo queda pendiente de revisar.
    const v2 = new Map([...SONGS, [SENCILLAMENTE.id, { ...SENCILLAMENTE, version: 2, content: `${SENCILLAMENTE.content}

[Coro]
Otra letra` }]]);
    const later = snapshot({ songsById: v2 }, 'v');
    eq(later.songs.find((entry) => entry.songId === 'sencillamente-dios')?.sections, null, 'un cierre nuevo no usa un arreglo pendiente');
    eq(JSON.stringify(record), before, 'y el registro anterior sigue igual');
    eq(record.songs[2].sections?.map((entry) => entry.label), ['Verso 1', 'Coro'], 'con el arreglo que se tocó aquel día');
  });

  it('renombrar a María: el registro dice María Rodríguez, los datos activos María Pérez', () => {
    const record = snapshot();
    const renamed = new Map(MEMBERS);
    renamed.set('maria', { ...MARIA, name: 'María Pérez' });
    eq(renamed.get('maria')?.name, 'María Pérez');
    eq(record.participants.find((entry) => entry.memberId === 'maria')?.name, 'María Rodríguez');
    eq(soloistsOf(record.songs[2])[0].name, 'María Rodríguez');
  });

  it('borrar canción, Setlist, actividad o miembro: el registro sigue legible', () => {
    const record = snapshot();
    const noSongs = new Map<string, Song>();
    eq(noSongs.has(record.songs[2].songId), false);
    eq(record.songs[2].title, 'Sencillamente Dios');
    eq(record.songs[2].key, 'Bb');
    eq(getPerformancesForSetlist([record], 'misa-domingo').length, 1, 'la referencia al Setlist borrado se conserva');
    eq(record.setlistName, 'Misa Domingo');
    eq(findOccurrence([], record.eventId, record.occurrenceDate), null, 'actividad borrada: no hay ocurrencia');
    eq(record.event.title, 'Misa de Jóvenes');
    eq(listHistoryPeople([record]).some((entry) => entry.name === 'María Rodríguez'), true);
  });
});

// --- Corrections -------------------------------------------------------------

describe('Editar un registro', () => {
  const record = snapshot();
  const [gloria, ofertorio, sencillamente] = record.songs;

  it('corrige canciones interpretadas, tonalidad y notas', () => {
    const edited = updatePerformanceRecord(
      record,
      {
        performedSongIds: [gloria.id, ofertorio.id, sencillamente.id],
        keys: { [sencillamente.id]: 'C', [gloria.id]: 'F' },
        notes: 'Al final sí se cantó el Ofertorio.',
      },
      NOW + 5
    );
    eq(performedSongs(edited).length, 3);
    eq(edited.songs[2].key, 'C');
    eq(edited.songs[0].key, 'F');
    eq(edited.songs[0].chordKey, 'Eb', 'con cejilla 2, los acordes siguen a la tonalidad corregida');
    eq(edited.notes, 'Al final sí se cantó el Ofertorio.');
    eq(edited.updatedAt, NOW + 5);
    eq(record.songs[2].key, 'Bb', 'el original no se toca');
  });

  it('corrige el equipo', () => {
    const edited = updatePerformanceRecord(
      record,
      { participants: [record.participants[0], record.participants[0], record.participants[3]] },
      NOW
    );
    eq(edited.participants.map((entry) => entry.memberId), ['emanuel', 'maria']);
  });

  it('una tonalidad inválida se ignora', () => {
    eq(updatePerformanceRecord(record, { keys: { [gloria.id]: 'H#' } }, NOW).songs[0].key, 'E');
  });

  it('no puede quedarse sin canciones: para eso se elimina el registro', () => {
    eq(validatePerformanceChanges(record, { performedSongIds: [] }), 'no-songs');
    assert.throws(() => updatePerformanceRecord(record, { performedSongIds: [] }, NOW));
    checks++;
  });
});

// --- Selectors ---------------------------------------------------------------

describe('Buscar en el historial', () => {
  const adoracionEvent = { ...EVENT, id: 'adoracion', title: 'Adoración', type: 'adoration' as const, startTime: '20:00' };
  const septiembre = snapshot({}, 'a');
  const agosto = snapshot(
    {
      event: adoracionEvent,
      occurrenceDate: '2026-08-13',
      setlist: {
        ...SETLIST,
        id: 'adoracion-setlist',
        items: [
          item('x-1', 'sencillamente-dios', { transposeSteps: 5 }),
          item('x-2', 'sencillamente-dios', { moment: 'Salida' }),
        ],
      },
      performedItemIds: ['x-1', 'x-2'],
    },
    'b'
  );
  const sinMaria = snapshot(
    {
      occurrenceDate: '2026-09-13',
      event: { ...EVENT, participantIds: ['jose'] },
      performedItemIds: ['i-gloria'],
    },
    'c'
  );
  const records = [agosto, septiembre, sinMaria];

  it('por fecha de una actividad: uno como máximo', () => {
    eq(getPerformanceForOccurrence(records, 'misa-jovenes', '2026-09-20')?.id, septiembre.id);
    eq(getPerformanceForOccurrence(records, 'misa-jovenes', '2026-09-27'), null);
    eq(getPerformancesForEvent(records, 'misa-jovenes').map((entry) => entry.occurrenceDate), ['2026-09-20', '2026-09-13']);
  });

  it('por canción: veces = registros, no repeticiones del coro ni reprises', () => {
    const found = getPerformancesForSong(records, 'sencillamente-dios');
    eq(found.map((entry) => entry.record.occurrenceDate), ['2026-09-20', '2026-08-13']);
    eq(found[1].songs.length, 2, 'la reprise se ve dentro del mismo día');
    eq(getSongPerformanceCount(records, 'sencillamente-dios'), 2);
    eq(getSongPerformanceCount(records, 'ofertorio'), 0, 'preparada pero no interpretada no cuenta');
    eq(found[0].songs[0].key, 'Bb');
    eq(found[1].songs[0].key, 'C');
  });

  it('por miembro: equipo o asignado; solista exacto', () => {
    eq(getPerformancesForMember(records, 'maria').map((entry) => entry.occurrenceDate), ['2026-09-20', '2026-08-13']);
    eq(getPerformancesForMember(records, 'jose').length, 3);
    eq(countSoloSongsForMember(records, 'maria'), 1, 'solo la canción donde estaba asignada como Solista');
    eq(countSoloSongsForMember(records, 'laura'), 0, 'cantar el coro asignada no es ser solista');
    eq(countSoloSongsForMember(records, 'emanuel'), 0);
  });

  it('por Setlist, recientes y agrupado por mes', () => {
    eq(getPerformancesForSetlist(records, 'misa-domingo').length, 2);
    eq(getRecentPerformances(records, 2).map((entry) => entry.occurrenceDate), ['2026-09-20', '2026-09-13']);
    eq(
      groupPerformancesByMonth(records).map((group) => [group.key, group.records.length]),
      [
        ['2026-09', 2],
        ['2026-08', 1],
      ]
    );
  });

  it('filtros: rango, tipo, canción y miembro', () => {
    const f = EMPTY_PERFORMANCE_FILTERS;
    eq(filterPerformances(records, f).length, 3);
    eq(filterPerformances(records, { ...f, from: '2026-09-01' }).length, 2);
    eq(filterPerformances(records, { ...f, to: '2026-08-31' }).length, 1);
    eq(filterPerformances(records, { ...f, type: 'adoration' }).map((entry) => entry.event.title), ['Adoración']);
    eq(filterPerformances(records, { ...f, songId: 'ofertorio' }).length, 0);
    eq(filterPerformances(records, { ...f, songId: 'gloria' }).length, 2);
    eq(filterPerformances(records, { ...f, memberId: 'maria', type: 'mass' }).length, 1);
  });

  it('opciones de filtros y tamaño del registro', () => {
    eq(listHistorySongs(records).map((entry) => entry.title), ['Gloria', 'Sencillamente Dios']);
    eq(listHistoryPeople(records).map((entry) => entry.name), ['Emanuel', 'José', 'Laura', 'María Rodríguez']);
    eq(describeRecordSize(septiembre), '2 canciones · 4 participantes');
    eq(describeRecordSize(sinMaria), '1 canción · 1 participante');
  });
});

// --- Storage -----------------------------------------------------------------

describe('Guardar el historial', () => {
  it('va al almacenamiento y vuelve igual', () => {
    const storage = memoryStorage();
    const repository = createLocalPerformanceRepository(storage);
    const record = snapshot();
    repository.save([record]);
    eq(JSON.parse(storage.data.get(PERFORMANCE_STORAGE_KEY)!).version, PERFORMANCE_STORAGE_VERSION);
    eq(repository.load(), { items: [record], recoveredFromUnreadableData: false });
  });

  it('datos estropeados se arreglan o se descartan', () => {
    const good = snapshot();
    const raw = JSON.stringify({
      version: PERFORMANCE_STORAGE_VERSION,
      records: [
        good,
        { ...good, id: 'sin-evento', eventId: '' },
        { ...good, id: 'sin-fecha', occurrenceDate: '2026-02-31' },
        { ...good, id: 'sin-canciones', songs: [] },
        {
          ...good,
          id: 'raro',
          eventId: 'otra',
          event: { ...good.event, type: 'fiesta', startTime: '99:00' },
          songs: [
            { ...good.songs[0], key: 'H', capoFret: 40, sections: [{ label: 'Coro', voices: ['all', 'nadie'], repeatCount: 9 }] },
            { ...good.songs[0] },
          ],
          participants: [{ memberId: 'x' }, { memberId: 'y', name: 'Ana', roles: ['singer', 'rey'] }],
        },
        'no es un registro',
      ],
    });
    const { records, unreadable } = parseStoredPerformances(raw, NOW, idSequence('nuevo'));
    eq(unreadable, false);
    eq(records.map((entry) => entry.id), [good.id, 'raro']);
    const raro = records[1];
    eq(raro.event.type, 'other');
    eq(raro.event.startTime, null);
    eq(raro.event.allDay, true);
    eq(raro.songs[0].key, null, 'una tonalidad ilegible no se inventa');
    eq(raro.songs[0].capoFret, 11);
    eq(raro.songs[0].chordKey, null);
    eq(raro.songs[0].sections?.[0].voices, ['all']);
    eq(raro.songs[0].sections?.[0].repeatCount, 4);
    eq(raro.songs[0].id === raro.songs[1].id, false, 'ids de canción únicos dentro del registro');
    eq(raro.participants, [{ memberId: 'y', name: 'Ana', roles: ['singer'] }]);
  });

  it('dos registros para la misma fecha: se conserva el corregido más reciente', () => {
    const first = snapshot({}, 'uno');
    const second = { ...snapshot({}, 'dos'), updatedAt: NOW + 100 };
    const raw = JSON.stringify({ version: PERFORMANCE_STORAGE_VERSION, records: [first, second] });
    eq(parseStoredPerformances(raw).records.map((entry) => entry.id), [second.id]);
  });

  it('JSON roto o versión desconocida: se guarda aparte y no se adivina', () => {
    eq(parseStoredPerformances('{roto').unreadable, true);
    const future = JSON.stringify({ version: PERFORMANCE_STORAGE_VERSION + 1, records: [] });
    const storage = memoryStorage({ [PERFORMANCE_STORAGE_KEY]: future });
    eq(createLocalPerformanceRepository(storage).load(), { items: [], recoveredFromUnreadableData: true });
    eq(storage.data.get(PERFORMANCE_BACKUP_KEY), future);
    eq(createLocalPerformanceRepository(memoryStorage()).load().items, []);
  });
});

// --- Event status ------------------------------------------------------------

describe('Estado de las actividades', () => {
  const at = (date: string, time = '12:00') => ({ date, time });

  it('las actividades v1 migran como programadas, aunque su fecha haya pasado', () => {
    const v1 = JSON.stringify({
      version: 1,
      events: [{ ...EVENT, occurrenceStatuses: undefined, date: '2020-01-05' }],
    });
    const { events, unreadable } = parseStoredEvents(v1, NOW);
    eq(unreadable, false);
    eq(events[0].occurrenceStatuses, {});
    eq(getOccurrenceStatus(events[0], '2020-01-05'), 'scheduled');
  });

  it('v2 guarda el estado por fecha y descarta lo que no es un estado', () => {
    const storage = memoryStorage();
    const repository = createLocalEventRepository(storage);
    const closed = setOccurrenceStatus(EVENT, '2026-09-20', 'completed', NOW);
    repository.save([closed]);
    eq(JSON.parse(storage.data.get(EVENTS_STORAGE_KEY)!).version, EVENTS_STORAGE_VERSION);
    eq(repository.load().items[0].occurrenceStatuses, { '2026-09-20': 'completed' });
    const raw = JSON.stringify({
      version: 2,
      events: [{ ...EVENT, occurrenceStatuses: { '2026-09-20': 'cancelled', malo: 'completed', '2026-09-27': 'quizás' } }],
    });
    eq(parseStoredEvents(raw).events[0].occurrenceStatuses, { '2026-09-20': 'cancelled' });
  });

  it('programada, realizada, cancelada; restaurar', () => {
    eq(getOccurrenceStatus(EVENT, '2026-09-20'), 'scheduled');
    const done = setOccurrenceStatus(EVENT, '2026-09-20', 'completed', NOW);
    eq(getOccurrenceStatus(done, '2026-09-20'), 'completed');
    const cancelled = setOccurrenceStatus(EVENT, '2026-09-20', 'cancelled', NOW);
    eq(getOccurrenceStatus(cancelled, '2026-09-20'), 'cancelled');
    const restored = setOccurrenceStatus(cancelled, '2026-09-20', 'scheduled', NOW);
    eq(restored.occurrenceStatuses, {});
    eq(setOccurrenceStatus(EVENT, '2026-09-20', 'scheduled', NOW), EVENT, 'sin cambios devuelve lo mismo');
  });

  it('pasar la fecha nunca la marca como realizada', () => {
    eq(findOccurrence([EVENT], EVENT.id, '2026-09-20')?.status, 'scheduled');
    eq(getUpcomingEvents([EVENT], at('2027-01-01')), []);
    eq(getEventsForSetlist([EVENT], SETLIST.id, at('2026-10-01')).past[0].status, 'scheduled');
  });

  it('canceladas y realizadas no son próximas; siguen en el calendario', () => {
    const cancelled = setOccurrenceStatus(EVENT, '2026-09-20', 'cancelled', NOW);
    const done = setOccurrenceStatus(EVENT, '2026-09-20', 'completed', NOW);
    eq(getUpcomingEvents([cancelled], at('2026-09-19')), []);
    eq(getUpcomingEvents([done], at('2026-09-19')), []);
    eq(getUpcomingEvents([EVENT], at('2026-09-19')).length, 1);
    eq(occurrencesBetween([cancelled], '2026-09-01', '2026-09-30')[0].status, 'cancelled');
    eq(getEventsForSetlist([cancelled], SETLIST.id, at('2026-09-19')).upcoming, []);
  });

  it('reglas de cambio de estado', () => {
    eq(statusChangeError('scheduled', 'completed', false), null);
    eq(statusChangeError('scheduled', 'cancelled', false), null);
    eq(statusChangeError('cancelled', 'scheduled', false), null);
    eq(statusChangeError('completed', 'scheduled', false), null);
    eq(statusChangeError('completed', 'scheduled', true), 'has-performance', 'con registro no se reabre en silencio');
    eq(statusChangeError('completed', 'cancelled', false), 'not-allowed');
    eq(statusChangeError('cancelled', 'completed', false), 'not-allowed');
  });

  it('editar la actividad no cambia estados; una actividad única cerrada no cambia de fecha', () => {
    const done = setOccurrenceStatus(EVENT, '2026-09-20', 'completed', NOW);
    eq(updateEvent(done, { title: 'Misa' }, NOW).occurrenceStatuses, { '2026-09-20': 'completed' });
    eq(isDateLocked(done), true);
    eq(isDateLocked(EVENT), false);
    eq(isDateLocked({ ...done, recurrence: { frequency: 'weekly', until: null, excludedDates: [] } }), false);
  });

  it('acciones por estado (EventDetail)', () => {
    eq(occurrenceActions({ status: 'scheduled', hasPerformance: false, canRecord: true }), ['complete', 'cancel']);
    eq(occurrenceActions({ status: 'completed', hasPerformance: true, canRecord: true }), ['view-performance', 'reopen']);
    eq(occurrenceActions({ status: 'completed', hasPerformance: false, canRecord: true }), ['record-performance', 'reopen']);
    eq(occurrenceActions({ status: 'completed', hasPerformance: false, canRecord: false }), ['reopen']);
    eq(occurrenceActions({ status: 'cancelled', hasPerformance: false, canRecord: true }), ['restore']);
  });

  it('Modo Misa: "Finalizar celebración" solo desde una actividad programada', () => {
    eq(canFinishCelebration(null), false, 'abierto desde el Setlist');
    eq(canFinishCelebration(findOccurrence([EVENT], EVENT.id, '2026-09-20')), true);
    const done = setOccurrenceStatus(EVENT, '2026-09-20', 'completed', NOW);
    eq(canFinishCelebration(findOccurrence([done], EVENT.id, '2026-09-20')), false);
  });
});

// --- Recurrence ----------------------------------------------------------------

describe('Una serie se cierra fecha por fecha', () => {
  const ensayo = createEvent(
    {
      title: 'Ensayo',
      type: 'rehearsal',
      date: '2026-09-20',
      startTime: '19:30',
      setlistId: SETLIST.id,
      participantIds: ['maria'],
      recurrence: { frequency: 'weekly', until: null, excludedDates: [] },
    },
    { now: NOW, createId: () => 'ensayo' }
  );

  it('completar el 27 deja el 20 y el 4 de octubre programados', () => {
    const closed = setOccurrenceStatus(ensayo, '2026-09-27', 'completed', NOW);
    eq(
      occurrencesBetween([closed], '2026-09-20', '2026-10-04').map((entry) => [entry.date, entry.status]),
      [
        ['2026-09-20', 'scheduled'],
        ['2026-09-27', 'completed'],
        ['2026-10-04', 'scheduled'],
      ]
    );
    eq(isDateLocked(closed), false);
  });

  it('el registro es solo para el 27', () => {
    const record = snapshot({ event: ensayo, occurrenceDate: '2026-09-27' });
    eq([record.eventId, record.occurrenceDate], ['ensayo', '2026-09-27']);
    eq(getPerformanceForOccurrence([record], 'ensayo', '2026-09-27')?.id, record.id);
    eq(getPerformanceForOccurrence([record], 'ensayo', '2026-09-20'), null);
    eq(getPerformanceForOccurrence([record], 'ensayo', '2026-10-04'), null);
  });

  it('dos viernes distintos pueden tener registros distintos', () => {
    const a = snapshot({ event: ensayo, occurrenceDate: '2026-09-20', performedItemIds: ['i-gloria'] }, 'x');
    const b = snapshot({ event: ensayo, occurrenceDate: '2026-09-27' }, 'y');
    eq(getPerformancesForEvent([a, b], 'ensayo').map((entry) => performedSongs(entry).length), [2, 1]);
  });
});
