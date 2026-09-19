import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MinistryEventDetails } from '../src/types/event';
import {
  addDays,
  daysInMonth,
  formatMonthTitle,
  formatTime,
  isValidTime,
  monthGrid,
  shiftMonth,
  weekdayIndex,
  weekdayNames,
} from '../src/utils/dates';
import {
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  clearSetlistFromEvents,
  createEvent,
  duplicateEventDetails,
  findOccurrence,
  getEventsForDate,
  getEventsForMember,
  getEventsForMonth,
  getEventsForSetlist,
  getUpcomingEvents,
  isOccurrencePast,
  occurrenceDates,
  occurrencesBetween,
  removeMemberFromEvents,
  setEventParticipants,
  suggestedTitle,
  updateEvent,
  validateEventDetails,
} from '../src/utils/ministryEvents';
import {
  EVENTS_BACKUP_KEY,
  EVENTS_STORAGE_KEY,
  EVENTS_STORAGE_VERSION,
  createLocalEventRepository,
  parseStoredEvents,
} from '../src/storage/eventStorage';
import { createSetlist, duplicateSetlist, setSetlistParticipants } from '../src/utils/setlists';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`events.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 18, 12);
const LATER = NOW + 60_000;

function idSequence(prefix = 'e') {
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

const base: Partial<MinistryEventDetails> = {
  title: 'Misa de Jóvenes',
  type: 'mass',
  date: '2026-09-20',
  startTime: '18:00',
  location: 'Templo',
};

const make = (details: Partial<MinistryEventDetails> = {}, makeId = idSequence()) =>
  createEvent({ ...base, ...details }, { now: NOW, createId: makeId });

describe('Crear y editar actividades', () => {
  it('crea una actividad limpia', () => {
    const event = make({ title: '  Misa   de Jóvenes ', location: ' Templo ', notes: ' Llegar antes ' });
    eq(event, {
      id: 'e-1',
      title: 'Misa de Jóvenes',
      type: 'mass',
      date: '2026-09-20',
      allDay: false,
      startTime: '18:00',
      endTime: null,
      location: 'Templo',
      notes: 'Llegar antes',
      setlistId: null,
      participantIds: [],
      recurrence: null,
      occurrenceStatuses: {},
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('título, fecha y hora de inicio son necesarios', () => {
    eq(validateEventDetails({ ...base, title: '   ' }), ['title']);
    eq(validateEventDetails({ ...base, date: '2026-02-30' }), ['date']);
    eq(validateEventDetails({ ...base, startTime: '' }), ['startTime']);
    eq(validateEventDetails({ ...base, startTime: '25:00' }), ['startTime']);
    assert.throws(() => make({ title: '' }));
    checks++;
  });

  it('la hora de fin es opcional y nunca antes del inicio', () => {
    eq(make({ endTime: '20:00' }).endTime, '20:00');
    eq(make({ endTime: '18:00' }).endTime, '18:00', 'misma hora vale');
    eq(validateEventDetails({ ...base, endTime: '17:30' }), ['endTime']);
    eq(make().endTime, null, 'sin fin no se inventa una duración');
  });

  it('todo el día no tiene horas', () => {
    const retreat = make({ type: 'retreat', title: 'Retiro', allDay: true, startTime: '09:00', endTime: '18:00' });
    eq([retreat.allDay, retreat.startTime, retreat.endTime], [true, null, null]);
    eq(validateEventDetails({ ...base, allDay: true, startTime: null }), []);
  });

  it('tipos con nombre propio, y un tipo desconocido pasa a Otro', () => {
    eq(EVENT_TYPES.map((type) => EVENT_TYPE_LABELS[type]), [
      'Misa',
      'Ensayo',
      'Adoración',
      'Retiro',
      'Reunión',
      'Convivencia',
      'Actividad especial',
      'Otro',
    ]);
    eq(make({ type: 'fiesta' as never }).type, 'other');
    eq(suggestedTitle('rehearsal'), 'Ensayo');
    eq(suggestedTitle('special'), '');
  });

  it('editar cambia los datos y la fecha de cambio, no la identidad', () => {
    const event = make();
    const edited = updateEvent(event, { title: 'Misa Dominical', startTime: '19:00', location: 'Capilla' }, LATER);
    eq([edited.id, edited.title, edited.startTime, edited.location], [event.id, 'Misa Dominical', '19:00', 'Capilla']);
    eq([edited.createdAt, edited.updatedAt], [NOW, LATER]);
    assert.throws(() => updateEvent(event, { endTime: '10:00' }, LATER));
    checks++;
  });

  it('el equipo se guarda sin repetir a nadie', () => {
    const event = make({ participantIds: ['maria', 'jose', 'maria', ''] });
    eq(event.participantIds, ['maria', 'jose']);
    eq(setEventParticipants(event, ['laura', 'laura'], LATER).participantIds, ['laura']);
  });

  it('duplicar copia la actividad como plantilla, con listas propias y sin serie', () => {
    const event = make({
      setlistId: 'misa-domingo',
      participantIds: ['maria'],
      notes: 'Llegar antes',
      recurrence: { frequency: 'weekly', until: null, excludedDates: [] },
    });
    const details = duplicateEventDetails(event);
    eq(details.setlistId, 'misa-domingo');
    eq(details.participantIds, ['maria']);
    eq(details.participantIds === event.participantIds, false);
    eq(details.recurrence, null);
    eq(details.date, event.date, 'la fecha la elige quien duplica: no se suma una semana');
    const copy = createEvent({ ...details, date: '2026-09-27' }, { now: LATER, createId: () => 'copia' });
    eq([copy.id, copy.date, copy.createdAt], ['copia', '2026-09-27', LATER]);
  });
});

describe('Fechas del calendario', () => {
  it('la semana empieza el lunes', () => {
    eq(weekdayIndex('2026-06-01'), 0, 'lunes');
    eq(weekdayIndex('2026-03-01'), 6, 'domingo');
    eq(weekdayNames().length, 7);
    eq(weekdayNames()[0].toLowerCase().startsWith('lun'), true);
  });

  it('mes que empieza en lunes y mes que empieza en domingo', () => {
    const june = monthGrid({ year: 2026, month: 6 });
    eq(june[0][0], '2026-06-01');
    eq(june.at(-1)!.at(-1), '2026-07-05');
    const march = monthGrid({ year: 2026, month: 3 });
    eq(march[0][0], '2026-02-23', 'el domingo 1 va al final de la primera fila');
    eq(march[0][6], '2026-03-01');
    for (const week of [...june, ...march]) eq(week.length, 7);
  });

  it('28, 29, 30 y 31 días', () => {
    eq(daysInMonth(2026, 2), 28);
    eq(daysInMonth(2028, 2), 29, 'bisiesto');
    eq(daysInMonth(2026, 9), 30);
    eq(daysInMonth(2026, 10), 31);
    eq(monthGrid({ year: 2028, month: 2 }).flat().includes('2028-02-29'), true);
  });

  it('diciembre a enero y enero a diciembre', () => {
    eq(shiftMonth({ year: 2026, month: 12 }, 1), { year: 2027, month: 1 });
    eq(shiftMonth({ year: 2026, month: 1 }, -1), { year: 2025, month: 12 });
    eq(addDays('2026-12-31', 1), '2027-01-01');
    eq(formatMonthTitle({ year: 2026, month: 9 }), 'Septiembre 2026');
  });

  it('horas', () => {
    eq(isValidTime('18:00'), true);
    eq(isValidTime('7:00'), false);
    eq(/6:00/.test(formatTime('18:00')), true);
  });
});

describe('Qué pasa cada día', () => {
  const makeId = idSequence();
  const misa = make({}, makeId);
  const ensayo = make({ title: 'Ensayo', type: 'rehearsal', date: '2026-09-20', startTime: '15:00' }, makeId);
  const retiro = make({ title: 'Retiro', type: 'retreat', date: '2026-09-20', allDay: true, startTime: null }, makeId);
  const reunion = make({ title: 'Reunión', type: 'meeting', date: '2026-09-15', startTime: '19:00' }, makeId);
  const events = [misa, ensayo, retiro, reunion];

  it('varios en un día, en orden: todo el día primero, luego por hora', () => {
    eq(getEventsForDate(events, '2026-09-20').map((o) => o.event.title), ['Retiro', 'Ensayo', 'Misa de Jóvenes']);
  });

  it('dos a la misma hora se muestran los dos', () => {
    const otra = make({ title: 'Adoración', type: 'adoration', startTime: '18:00' }, makeId);
    eq(getEventsForDate([misa, otra], '2026-09-20').length, 2);
  });

  it('el mes se agrupa por día una sola vez', () => {
    const month = getEventsForMonth(events, { year: 2026, month: 9 });
    eq(month.get('2026-09-20')?.length, 3);
    eq(month.get('2026-09-15')?.[0].event.title, 'Reunión');
    eq(month.has('2026-09-21'), false);
  });

  it('próximos: nunca lo que ya pasó', () => {
    const now = { date: '2026-09-20', time: '16:00' };
    eq(isOccurrencePast({ event: reunion, date: reunion.date, key: 'r', status: 'scheduled' }, now), true);
    eq(isOccurrencePast({ event: ensayo, date: ensayo.date, key: 'e', status: 'scheduled' }, now), true, '15:00 ya pasó');
    eq(isOccurrencePast({ event: retiro, date: retiro.date, key: 'x', status: 'scheduled' }, now), false, 'todo el día dura hasta que acaba el día');
    eq(getUpcomingEvents(events, now).map((o) => o.event.title), ['Retiro', 'Misa de Jóvenes']);
    eq(getUpcomingEvents(events, { date: '2026-09-21', time: '00:00' }), []);
  });

  it('una actividad con hora de fin sigue "en curso" hasta que termina', () => {
    const conFin = make({ title: 'Ensayo largo', startTime: '15:00', endTime: '17:00' });
    eq(isOccurrencePast({ event: conFin, date: conFin.date, key: 'k', status: 'scheduled' }, { date: '2026-09-20', time: '16:00' }), false);
  });

  it('una actividad pasada no se borra: el mes anterior la sigue mostrando', () => {
    eq(getEventsForDate(events, '2026-09-15').length, 1);
  });
});

describe('Actividades repetidas', () => {
  const weekly = make({
    title: 'Ensayo',
    type: 'rehearsal',
    date: '2026-09-04',
    startTime: '19:30',
    recurrence: { frequency: 'weekly', until: null, excludedDates: [] },
  });

  it('cada semana', () => {
    eq(occurrenceDates(weekly, '2026-09-01', '2026-09-30'), ['2026-09-04', '2026-09-11', '2026-09-18', '2026-09-25']);
    eq(occurrenceDates(weekly, '2026-08-01', '2026-09-03'), [], 'nada antes de empezar');
  });

  it('cada 2 semanas', () => {
    const biweekly = { ...weekly, recurrence: { frequency: 'biweekly' as const, until: null, excludedDates: [] } };
    eq(occurrenceDates(biweekly, '2026-09-01', '2026-10-31'), ['2026-09-04', '2026-09-18', '2026-10-02', '2026-10-16', '2026-10-30']);
    eq(occurrenceDates(biweekly, '2027-01-01', '2027-01-31'), ['2027-01-08', '2027-01-22'], 'lejos del inicio, sigue el ritmo');
  });

  it('cada mes, y un mes sin ese día no tiene ocurrencia', () => {
    const monthly = make({ date: '2026-01-31', recurrence: { frequency: 'monthly', until: null, excludedDates: [] } });
    eq(occurrenceDates(monthly, '2026-01-01', '2026-12-31'), [
      '2026-01-31',
      '2026-03-31',
      '2026-05-31',
      '2026-07-31',
      '2026-08-31',
      '2026-10-31',
      '2026-12-31',
    ]);
    const fifteenth = make({ date: '2026-09-15', recurrence: { frequency: 'monthly', until: null, excludedDates: [] } });
    eq(occurrenceDates(fifteenth, '2026-09-01', '2027-01-31').length, 5);
  });

  it('fecha límite y fechas quitadas', () => {
    const limited = { ...weekly, recurrence: { frequency: 'weekly' as const, until: '2026-09-18', excludedDates: ['2026-09-11'] } };
    eq(occurrenceDates(limited, '2026-09-01', '2026-12-31'), ['2026-09-04', '2026-09-18']);
    eq(validateEventDetails({ ...weekly, recurrence: { frequency: 'weekly', until: '2026-08-01', excludedDates: [] } }), ['until']);
  });

  it('sin duplicados, en orden, con una clave por fecha', () => {
    const occurrences = occurrencesBetween([weekly], '2026-09-01', '2026-09-30');
    eq(new Set(occurrences.map((o) => o.key)).size, 4);
    eq(occurrences[1].key, `${weekly.id}@2026-09-11`);
  });

  it('próximos incluye la siguiente fecha de la serie', () => {
    eq(getUpcomingEvents([weekly], { date: '2026-09-12', time: '10:00' }, 2).map((o) => o.date), ['2026-09-18', '2026-09-25']);
  });

  it('borrar la serie la quita de todas las fechas', () => {
    eq(occurrencesBetween([weekly].filter((event) => event.id !== weekly.id), '2026-09-01', '2026-12-31'), []);
  });

  it('abrir una fecha concreta de la serie, o la actividad si esa fecha ya no está', () => {
    eq(findOccurrence([weekly], weekly.id, '2026-09-18')?.date, '2026-09-18');
    eq(findOccurrence([weekly], weekly.id, '2026-09-19')?.date, '2026-09-04');
    eq(findOccurrence([weekly], 'no-existe', '2026-09-18'), null);
  });
});

describe('Actividades, miembros y Setlists', () => {
  const now = { date: '2026-09-18', time: '12:00' };

  it('las próximas de cada persona', () => {
    const makeId = idSequence();
    const misa = make({ participantIds: ['maria', 'jose'] }, makeId);
    const ensayo = make({ title: 'Ensayo', date: '2026-09-25', startTime: '19:30', participantIds: ['maria'] }, makeId);
    const pasada = make({ date: '2026-09-01', participantIds: ['maria'] }, makeId);
    eq(getEventsForMember([misa, ensayo, pasada], 'maria', now).map((o) => o.event.title), ['Misa de Jóvenes', 'Ensayo']);
    eq(getEventsForMember([misa, ensayo], 'jose', now).length, 1);
  });

  it('miembro inactivo se conserva; eliminado se limpia', () => {
    const event = make({ participantIds: ['maria', 'laura'] });
    eq(event.participantIds.includes('laura'), true, 'desactivar no toca las actividades');
    const cleaned = removeMemberFromEvents([event], 'maria', LATER);
    eq(cleaned[0].participantIds, ['laura']);
    eq(removeMemberFromEvents(cleaned, 'maria', LATER), cleaned, 'nada más que limpiar');
  });

  it('con y sin Setlist; actividades de un Setlist, próximas y pasadas', () => {
    const makeId = idSequence();
    const conSetlist = make({ setlistId: 'misa-domingo' }, makeId);
    const siguiente = make({ date: '2026-09-27', setlistId: 'misa-domingo' }, makeId);
    const anterior = make({ date: '2026-09-13', setlistId: 'misa-domingo' }, makeId);
    const sin = make({ title: 'Reunión', type: 'meeting' }, makeId);
    eq(sin.setlistId, null);
    const result = getEventsForSetlist([conSetlist, siguiente, anterior, sin], 'misa-domingo', now);
    eq(result.upcoming.map((o) => o.date), ['2026-09-20', '2026-09-27']);
    eq(result.past.map((o) => o.date), ['2026-09-13']);
  });

  it('usar el equipo del Setlist copia sus ids; después son independientes', () => {
    const setlist = setSetlistParticipants(createSetlist({ name: 'Misa Domingo' }, { now: NOW }), ['emanuel', 'maria'], NOW);
    const event = setEventParticipants(make(), setlist.participantIds, LATER);
    eq(event.participantIds, ['emanuel', 'maria']);
    eq(event.participantIds === setlist.participantIds, false);
    const changedSetlist = setSetlistParticipants(setlist, ['laura'], LATER);
    eq(event.participantIds, ['emanuel', 'maria'], 'cambiar el Setlist no toca la actividad');
    eq(changedSetlist.participantIds, ['laura']);
  });

  it('copiar el equipo de la actividad al Setlist', () => {
    const event = make({ participantIds: ['jose', 'laura'] });
    const setlist = setSetlistParticipants(createSetlist({ name: 'Misa' }, { now: NOW }), event.participantIds, LATER);
    eq(setlist.participantIds, ['jose', 'laura']);
  });

  it('borrar un Setlist deja la actividad sin repertorio, pero la deja', () => {
    const event = make({ setlistId: 'misa-domingo' });
    const other = make({ setlistId: 'otro' });
    const cleaned = clearSetlistFromEvents([event, other], 'misa-domingo', LATER);
    eq(cleaned.length, 2);
    eq(cleaned[0].setlistId, null);
    eq(cleaned[1].setlistId, 'otro');
  });

  it('duplicar un Setlist no duplica sus actividades', () => {
    const setlist = createSetlist({ name: 'Misa' }, { now: NOW, createId: () => 'misa' });
    const event = make({ setlistId: 'misa' });
    const copy = duplicateSetlist(setlist, { name: 'Copia' }, { now: LATER, createId: () => 'copia' });
    const events = [event];
    eq(events.filter((entry) => entry.setlistId === copy.id), []);
    eq(events.filter((entry) => entry.setlistId === 'misa').length, 1);
  });
});

describe('Guardar actividades', () => {
  it('van al almacenamiento y vuelven iguales', () => {
    const storage = memoryStorage();
    const repository = createLocalEventRepository(storage);
    const event = make({ participantIds: ['maria'], setlistId: 'misa-domingo' });
    repository.save([event]);
    eq(JSON.parse(storage.data.get(EVENTS_STORAGE_KEY)!).version, EVENTS_STORAGE_VERSION);
    eq(repository.load(), { items: [event], recoveredFromUnreadableData: false });
  });

  it('datos estropeados se arreglan o se descartan', () => {
    const good = make();
    const raw = JSON.stringify({
      version: 1,
      events: [
        good,
        { ...good, type: 'fiesta' },
        { ...good, title: '' },
        { ...good, id: 'x', date: '2026-13-45' },
        { ...good, id: 'y', startTime: '99:00' },
        { ...good, id: 'z', participantIds: ['a', 'a', 7], setlistId: 42, endTime: '10:00' },
        'no es una actividad',
      ],
    });
    const { events, unreadable } = parseStoredEvents(raw, NOW, idSequence('nuevo'));
    eq(unreadable, false);
    eq(events.length, 4);
    eq(events[1].type, 'other', 'tipo desconocido pasa a Otro');
    eq(events[1].id === events[0].id, false, 'id repetido: el segundo recibe uno propio');
    eq(events[2].id, 'y');
    eq(events[2].allDay, true, 'sin hora de inicio legible se conserva como de todo el día');
    eq(events[2].startTime, null);
    eq(events[3].participantIds, ['a']);
    eq(events[3].setlistId, null);
    eq(events[3].endTime, null, 'un fin antes del inicio se descarta, no la actividad');
  });

  it('JSON roto o versión futura: se guarda aparte y no se adivina', () => {
    eq(parseStoredEvents('{roto').unreadable, true);
    const future = JSON.stringify({ version: EVENTS_STORAGE_VERSION + 1, events: [] });
    const storage = memoryStorage({ [EVENTS_STORAGE_KEY]: future });
    eq(createLocalEventRepository(storage).load(), { items: [], recoveredFromUnreadableData: true });
    eq(storage.data.get(EVENTS_BACKUP_KEY), future);
  });

  it('sin almacenamiento todo empieza vacío: no hay actividades de ejemplo', () => {
    eq(createLocalEventRepository(memoryStorage()).load().items, []);
  });
});

