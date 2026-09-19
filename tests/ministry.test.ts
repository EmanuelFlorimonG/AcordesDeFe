import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { MinistryMember } from '../src/types/ministry';
import type { Setlist, SetlistArrangement } from '../src/types/setlist';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { parseSongSections } from '../src/utils/chordParser';
import {
  assignedMembersOf,
  createArrangement,
  duplicateArrangementSection,
  removeMemberFromArrangement,
  resolveArrangement,
  updateArrangementSection,
} from '../src/utils/arrangement';
import { describeKey } from '../src/utils/keySettings';
import { FLATS, SHARPS, getKeySignature, getNoteIndex, parseKey } from '../src/utils/chordTransposer';
import {
  findKeyPreference,
  isSameKey,
  PRACTICAL_MAJOR_KEYS,
  PRACTICAL_MINOR_KEYS,
  isKeyName,
  keyOptionsFor,
  keySettingsForKey,
  keySuggestionsFor,
  preferencesForMember,
  preferencesForSong,
  removeKeyPreference,
  removeMemberKeyPreferences,
  setKeyPreference,
  soundsInKey,
} from '../src/utils/keyPreferences';
import {
  DEFAULT_MEMBER_FILTERS,
  createMember,
  describeMember,
  filterMembers,
  memberInitials,
  setMemberActive,
  updateMember,
} from '../src/utils/ministryMembers';
import { memberNames } from '../src/hooks/ministryContext';
import {
  KEY_PREFERENCES_STORAGE_KEY,
  MEMBERS_BACKUP_KEY,
  MEMBERS_STORAGE_KEY,
  createLocalKeyPreferenceRepository,
  createLocalMemberRepository,
  parseStoredKeyPreferences,
  parseStoredMembers,
} from '../src/storage/ministryStorage';
import { SETLIST_STORAGE_VERSION, createLocalSetlistRepository, parseStoredSetlists } from '../src/storage/setlistStorage';
import {
  addSetlistParticipants,
  addSongsToSetlist,
  countSetlistsWithMember,
  createSetlist,
  duplicateSetlist,
  removeMemberFromSetlist,
  setSetlistParticipants,
  updateSetlistItem,
} from '../src/utils/setlists';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`ministry.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 20, 10);
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

function song(id: string) {
  const found = MOCK_SONGS.find((candidate) => candidate.id === id);
  assert.ok(found, `falta la canción ${id}`);
  return found;
}

const ALFARERO = song('alfarero'); // D
const SONGS_BY_ID = new Map(MOCK_SONGS.map((entry) => [entry.id, entry]));

/** Emanuel, María, José y Laura, como en la prueba del ministerio. */
function team(makeId = idSequence('m')) {
  const at = { now: NOW, createId: makeId };
  return {
    emanuel: createMember({ name: 'Emanuel', roles: ['director', 'singer'] }, at),
    maria: createMember({ name: 'María', roles: ['singer'], vocalParts: ['soprano'] }, at),
    jose: createMember({ name: 'José', roles: ['musician'], instruments: ['guitar'] }, at),
    laura: createMember({ name: 'Laura', roles: ['singer'], vocalParts: ['alto'], instruments: ['keys'] }, at),
  };
}

describe('Miembros del ministerio', () => {
  it('crea un miembro con lo justo: solo el nombre es obligatorio', () => {
    const member = createMember({ name: '  María   Rodríguez ' }, { now: NOW, createId: () => 'm-1' });
    eq(member, {
      id: 'm-1',
      name: 'María Rodríguez',
      roles: [],
      instruments: [],
      vocalParts: [],
      notes: '',
      isActive: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  it('sin nombre no hay miembro', () => {
    assert.throws(() => createMember({ name: '   ' }, { now: NOW }));
    const member = createMember({ name: 'Laura' }, { now: NOW });
    assert.throws(() => updateMember(member, { name: '' }, LATER));
    checks += 2;
  });

  it('varios roles, varios instrumentos y parte vocal, sin valores inventados', () => {
    const member = createMember(
      {
        name: 'Emanuel',
        roles: ['singer', 'director', 'batman' as never, 'singer'],
        instruments: ['keys', 'guitar'],
        vocalParts: ['tenor', 'mezzo' as never],
      },
      { now: NOW }
    );
    eq(member.roles, ['director', 'singer'], 'en el orden de la lista, sin repetir');
    eq(member.instruments, ['guitar', 'keys']);
    eq(member.vocalParts, ['tenor']);
    eq(describeMember(member), 'Director · Cantante · Tenor · Guitarra · Piano / Teclado');
  });

  it('dos personas pueden llamarse igual: el id las distingue', () => {
    const makeId = idSequence('m');
    const first = createMember({ name: 'María' }, { now: NOW, createId: makeId });
    const second = createMember({ name: 'María' }, { now: NOW, createId: makeId });
    eq(first.name, second.name);
    eq(first.id === second.id, false);
  });

  it('editar cambia los datos y la fecha, no la identidad', () => {
    const { maria } = team();
    const edited = updateMember(maria, { name: 'María Pérez', notes: ' Solo domingos ' }, LATER);
    eq(edited.id, maria.id);
    eq(edited.name, 'María Pérez');
    eq(edited.notes, 'Solo domingos');
    eq(edited.createdAt, NOW);
    eq(edited.updatedAt, LATER);
  });

  it('desactivar y reactivar, sin perder nada', () => {
    const { maria } = team();
    const inactive = setMemberActive(maria, false, LATER);
    eq(inactive.isActive, false);
    eq(inactive.vocalParts, ['soprano']);
    eq(setMemberActive(inactive, true, LATER).isActive, true);
    eq(setMemberActive(maria, true, LATER), maria, 'sin cambio no hay nueva versión');
  });

  it('iniciales para el avatar', () => {
    eq(memberInitials('María Rodríguez'), 'MR');
    eq(memberInitials('Emanuel'), 'E');
    eq(memberInitials('josé   de la  paz'), 'JP');
  });

  it('buscar y filtrar', () => {
    const { emanuel, maria, jose, laura } = team();
    const all = [jose, setMemberActive(laura, false, LATER), maria, emanuel];
    eq(filterMembers(all, DEFAULT_MEMBER_FILTERS).map((m) => m.name), ['Emanuel', 'José', 'María'], 'activos, por nombre');
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, query: 'maria' }).map((m) => m.name), ['María'], 'sin acentos');
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, role: 'singer' }).map((m) => m.name), ['Emanuel', 'María']);
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, instrument: 'guitar' }).map((m) => m.name), ['José']);
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, vocalPart: 'soprano' }).map((m) => m.name), ['María']);
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, status: 'inactive' }).map((m) => m.name), ['Laura']);
    eq(filterMembers(all, { ...DEFAULT_MEMBER_FILTERS, status: 'all' }).length, 4);
  });
});

describe('Guardar miembros', () => {
  it('van al almacenamiento y vuelven iguales', () => {
    const storage = memoryStorage();
    const repository = createLocalMemberRepository(storage);
    const { emanuel, maria } = team();
    repository.save([emanuel, maria]);
    eq(JSON.parse(storage.data.get(MEMBERS_STORAGE_KEY)!).version, 1);
    eq(repository.load(), { items: [emanuel, maria], recoveredFromUnreadableData: false });
  });

  it('datos estropeados se arreglan o se descartan', () => {
    const raw = JSON.stringify({
      version: 1,
      members: [
        { id: 'a', name: '  Ana  ', roles: ['singer', 'x'], isActive: 'sí' },
        { id: 'a', name: 'Otra Ana' },
        { id: 'b', name: '' },
        'no es un miembro',
        { name: 'Sin id', instruments: 'guitar' },
      ],
    });
    const { members, unreadable } = parseStoredMembers(raw, NOW, idSequence('nuevo'));
    eq(unreadable, false);
    eq(members.map((m) => m.name), ['Ana', 'Otra Ana', 'Sin id']);
    eq(members[0].roles, ['singer']);
    eq(members[0].isActive, true, 'un valor raro no desactiva a nadie');
    eq(members[1].id === 'a', false, 'id repetido: el segundo recibe uno propio');
    eq(new Set(members.map((m) => m.id)).size, members.length);
    eq(members[2].instruments, []);
  });

  it('una versión desconocida no se adivina: se guarda aparte', () => {
    const raw = JSON.stringify({ version: 99, members: [] });
    eq(parseStoredMembers(raw).unreadable, true);
    eq(parseStoredMembers('{roto').unreadable, true);
    const storage = memoryStorage({ [MEMBERS_STORAGE_KEY]: raw });
    const result = createLocalMemberRepository(storage).load();
    eq(result.recoveredFromUnreadableData, true);
    eq(storage.data.get(MEMBERS_BACKUP_KEY), raw);
  });
});

describe('El equipo de un Setlist', () => {
  const base = () => createSetlist({ name: 'Misa Domingo' }, { now: NOW, createId: idSequence('s') });

  it('empieza sin nadie y guarda solo ids', () => {
    const setlist = base();
    eq(setlist.participantIds, []);
    const { emanuel, maria } = team();
    const withTeam = setSetlistParticipants(setlist, [emanuel.id, maria.id, emanuel.id, ''], LATER);
    eq(withTeam.participantIds, [emanuel.id, maria.id]);
    eq(withTeam.updatedAt, LATER);
  });

  it('añadir no quita a nadie; quitar sí', () => {
    const { emanuel, maria, laura } = team();
    let setlist = setSetlistParticipants(base(), [emanuel.id], LATER);
    setlist = addSetlistParticipants(setlist, [maria.id, emanuel.id], LATER);
    eq(setlist.participantIds, [emanuel.id, maria.id]);
    setlist = setSetlistParticipants(setlist, [maria.id, laura.id], LATER);
    eq(setlist.participantIds, [maria.id, laura.id]);
  });

  it('un miembro inactivo sigue en el equipo donde ya estaba', () => {
    const { maria } = team();
    const setlist = setSetlistParticipants(base(), [maria.id], LATER);
    const inactive = setMemberActive(maria, false, LATER);
    eq(setlist.participantIds.includes(inactive.id), true, 'desactivar no toca los Setlists');
  });

  it('eliminar a alguien lo quita del equipo y de los arreglos', () => {
    const { maria, laura } = team();
    const sections = parseSongSections(ALFARERO.content);
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { voices: ['soloist'], assignedMemberIds: [maria.id] });
    arrangement = updateArrangementSection(arrangement, 'arr-3', { assignedMemberIds: [maria.id, laura.id] });
    let setlist = addSongsToSetlist(base(), [ALFARERO], { now: NOW, createId: idSequence('i') });
    setlist = setSetlistParticipants(setlist, [maria.id, laura.id], NOW);
    setlist = updateSetlistItem(setlist, setlist.items[0].id, { arrangement }, NOW);

    const cleaned = removeMemberFromSetlist(setlist, maria.id, LATER);
    eq(cleaned.participantIds, [laura.id]);
    const blocks = cleaned.items[0].arrangement!.sections;
    eq(blocks[1].assignedMemberIds, []);
    eq(blocks[1].voices, ['soloist'], 'la voz sigue: sabemos que habrá solista');
    eq(blocks[2].assignedMemberIds, [laura.id]);
    eq(removeMemberFromSetlist(cleaned, maria.id, LATER), cleaned, 'nada más que limpiar');
  });

  it('duplicar el Setlist conserva equipo y asignaciones, con arreglo de ids nuevos', () => {
    const { maria } = team();
    const sections = parseSongSections(ALFARERO.content);
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { assignedMemberIds: [maria.id] });
    arrangement = updateArrangementSection(arrangement, 'arr-3', { transition: { type: 'jump', targetId: 'arr-4' } });
    let setlist = addSongsToSetlist(base(), [ALFARERO], { now: NOW, createId: idSequence('i') });
    setlist = setSetlistParticipants(setlist, [maria.id], NOW);
    setlist = updateSetlistItem(setlist, setlist.items[0].id, { arrangement }, NOW);

    const copy = duplicateSetlist(setlist, { name: 'Copia' }, { now: LATER, createId: idSequence('c') });
    eq(copy.participantIds, [maria.id]);
    eq(copy.participantIds === setlist.participantIds, false, 'lista propia');
    const copied = copy.items[0].arrangement!.sections;
    eq(copied[1].assignedMemberIds, [maria.id]);
    eq(copied[1].assignedMemberIds === arrangement.sections[1].assignedMemberIds, false);
    const jump = copied[2].transition;
    eq(jump.type === 'jump' && jump.targetId === copied[3].id, true, 'el salto apunta a la copia');
    eq(countSetlistsWithMember([setlist, copy], maria.id), 2);
  });
});

describe('Personas en las secciones del arreglo', () => {
  const sections = parseSongSections(ALFARERO.content);

  it('SOLISTA con María, y MUJERES · SOPRANO con María y Laura', () => {
    const { maria, laura } = team();
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { voices: ['soloist'], assignedMemberIds: [maria.id] });
    arrangement = updateArrangementSection(arrangement, 'arr-3', {
      voices: ['women', 'soprano'],
      assignedMemberIds: [maria.id, laura.id, maria.id],
    });
    const resolved = resolveArrangement(sections, arrangement);
    eq(resolved[1].voices, ['soloist']);
    eq(resolved[1].assignedMemberIds, [maria.id]);
    eq(resolved[2].voices, ['women', 'soprano']);
    eq(resolved[2].assignedMemberIds, [maria.id, laura.id], 'cada persona una vez');
    eq(resolved[2].section?.lines, sections[2].lines, 'la letra no cambia');
    eq(assignedMembersOf(arrangement), [maria.id, laura.id]);
  });

  it('sin personas sigue siendo válido: habrá solista, aún sin decidir quién', () => {
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { voices: ['soloist'] });
    eq(resolveArrangement(sections, arrangement)[1].assignedMemberIds, []);
    eq(resolveArrangement(sections, arrangement)[1].voices, ['soloist']);
  });

  it('un arreglo guardado antes de los miembros se sigue leyendo', () => {
    const old: SetlistArrangement = {
      sections: [
        {
          id: 'viejo',
          sourceSectionId: 'section-1',
          label: 'Intro',
          repeatCount: 1,
          voices: ['all'],
          instruction: '',
          transition: { type: 'continue' },
        },
      ],
    };
    eq(resolveArrangement(sections, old)[0].assignedMemberIds, []);
  });

  it('duplicar una sección copia a sus personas sin compartir la lista', () => {
    const { maria } = team();
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { assignedMemberIds: [maria.id] });
    const duplicated = duplicateArrangementSection(arrangement, 'arr-2', () => 'copia');
    eq(duplicated.sections[2].assignedMemberIds, [maria.id]);
    eq(duplicated.sections[2].assignedMemberIds === duplicated.sections[1].assignedMemberIds, false);
  });

  it('eliminar a un miembro lo quita de las secciones', () => {
    const { maria, laura } = team();
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-3', { assignedMemberIds: [maria.id, laura.id] });
    eq(removeMemberFromArrangement(arrangement, maria.id).sections[2].assignedMemberIds, [laura.id]);
    eq(removeMemberFromArrangement(arrangement, 'nadie'), arrangement);
  });

  it('se guardan y vuelven; los datos raros se limpian', () => {
    const { maria } = team();
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { assignedMemberIds: [maria.id] });
    let setlist = addSongsToSetlist(
      createSetlist({ name: 'Misa' }, { now: NOW, createId: idSequence('s') }),
      [ALFARERO],
      { now: NOW, createId: idSequence('i') }
    );
    setlist = setSetlistParticipants(setlist, [maria.id], NOW);
    setlist = updateSetlistItem(setlist, setlist.items[0].id, { arrangement }, NOW);

    const storage = memoryStorage();
    const repository = createLocalSetlistRepository(storage);
    repository.save([setlist]);
    eq(JSON.parse(storage.data.get('genesaret_setlists')!).version, SETLIST_STORAGE_VERSION);
    eq(SETLIST_STORAGE_VERSION, 4);
    const loaded = repository.load().setlists[0];
    eq(loaded.participantIds, [maria.id]);
    eq(loaded.items[0].arrangement?.sections[1].assignedMemberIds, [maria.id]);

    const raw = JSON.parse(storage.data.get('genesaret_setlists')!);
    raw.setlists[0].participantIds = ['ok', 42, '', 'ok'];
    raw.setlists[0].items[0].arrangement.sections[1].assignedMemberIds = 'maria';
    const { setlists } = parseStoredSetlists(JSON.stringify(raw), NOW);
    eq(setlists[0].participantIds, ['ok']);
    eq(setlists[0].items[0].arrangement?.sections[1].assignedMemberIds, []);
  });

  it('los Setlists de las versiones 1, 2 y 3 siguen abriéndose, sin equipo', () => {
    for (const version of [1, 2, 3]) {
      const legacy: Omit<Setlist, 'participantIds'> = {
        id: 'viejo',
        name: 'Misa vieja',
        date: '',
        description: '',
        items: [{ id: 'i', songId: 'alfarero', moment: '', transposeSteps: 0, capoFret: 0, notes: '' }],
        createdAt: NOW,
        updatedAt: NOW,
      };
      const { setlists, unreadable } = parseStoredSetlists(JSON.stringify({ version, setlists: [legacy] }), NOW);
      eq(unreadable, false, `versión ${version}`);
      eq(setlists[0].participantIds, []);
      eq(setlists[0].items.length, 1);
    }
  });
});

describe('Tonalidad preferida por cantante', () => {
  it('toda tonalidad existe; la interfaz ofrece una forma práctica de cada una', () => {
    eq(keyOptionsFor('G'), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    eq(keyOptionsFor('Em'), ['Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm']);
    eq(isKeyName('G#'), true, 'G# mayor existe: se escribe con F##, por eso no se ofrece');
    eq(isKeyName('Fb'), true);
    eq(isKeyName('Bb'), true);
    eq(isKeyName('H'), false);
    eq(isKeyName(' Bb'), false);
    eq(isSameKey('Bb', 'A#'), true);
    eq(isSameKey('C#', 'Db'), true);
    eq(isSameKey('G#', 'Ab'), true);
    eq(isSameKey('Bb', 'Bbm'), false);
  });

  it('la lista práctica: un nombre por sonido, el de menos alteraciones, y en empate el de sostenidos', () => {
    for (const [list, isMinor] of [[PRACTICAL_MAJOR_KEYS, false], [PRACTICAL_MINOR_KEYS, true]] as const) {
      const pitches = list.map((key) => getNoteIndex(parseKey(key)!.tonic));
      eq(new Set(pitches).size, 12, 'doce sonidos distintos');
      for (const key of list) {
        const parsed = parseKey(key)!;
        const pitch = getNoteIndex(parsed.tonic)!;
        const spellings = [SHARPS[pitch], FLATS[pitch]].map((tonic) => ({
          tonic,
          signature: getKeySignature({ tonic, isMinor }),
        }));
        const counts = spellings.map((entry) => entry.signature?.count ?? Infinity);
        const best = Math.min(...counts);
        const chosen = spellings.find((entry) => entry.tonic === parsed.tonic)!;
        eq(chosen.signature?.count, best, key);
        if (counts[0] === counts[1] && SHARPS[pitch] !== FLATS[pitch]) eq(parsed.tonic, SHARPS[pitch], `${key}: empate, sostenidos`);
      }
    }
  });

  it('una tonalidad guardada con otro nombre se conserva y se reconoce', () => {
    const preferences = setKeyPreference([], 'm', 'alfarero', 'C#', NOW);
    eq(preferences[0].key, 'C#');
    eq(keyOptionsFor('D').some((option) => isSameKey(option, 'C#')), true, 'se marca como Db en la lista');
  });

  it('crear, cambiar y quitar', () => {
    const { maria } = team();
    let preferences = setKeyPreference([], maria.id, 'alfarero', 'Bb', NOW);
    eq(findKeyPreference(preferences, maria.id, 'alfarero')?.key, 'Bb');
    preferences = setKeyPreference(preferences, maria.id, 'alfarero', 'C', LATER);
    eq(preferences.length, 1, 'una por cantante y canción');
    eq(preferences[0], { memberId: maria.id, songId: 'alfarero', key: 'C', updatedAt: LATER });
    eq(setKeyPreference(preferences, maria.id, 'alfarero', 'X#', LATER), preferences, 'tonalidad inválida: nada cambia');
    eq(removeKeyPreference(preferences, maria.id, 'alfarero'), []);
  });

  it('misma canción con dos personas, y una persona con dos canciones', () => {
    const { maria, emanuel } = team();
    let preferences = setKeyPreference([], maria.id, 'alfarero', 'Bb', NOW);
    preferences = setKeyPreference(preferences, emanuel.id, 'alfarero', 'G', NOW);
    preferences = setKeyPreference(preferences, maria.id, 'huracan-hakuna', 'A', NOW);
    eq(preferences.length, 3);
    eq(
      preferencesForMember(preferences, maria.id, SONGS_BY_ID).map((entry) => [entry.songTitle, entry.key]),
      [['Alfarero', 'Bb'], ['Huracán', 'A']]
    );
    eq(preferencesForSong(preferences, 'alfarero', new Set([maria.id, emanuel.id])).length, 2);
  });

  it('miembro eliminado y canción inexistente no rompen nada', () => {
    const { maria, emanuel } = team();
    let preferences = setKeyPreference([], maria.id, 'alfarero', 'Bb', NOW);
    preferences = setKeyPreference(preferences, maria.id, 'cancion-borrada', 'C', NOW);
    preferences = setKeyPreference(preferences, emanuel.id, 'alfarero', 'G', NOW);
    eq(preferencesForMember(preferences, maria.id, SONGS_BY_ID).length, 1, 'la canción que no existe se ignora');
    const withoutMaria = removeMemberKeyPreferences(preferences, maria.id);
    eq(withoutMaria.map((entry) => entry.memberId), [emanuel.id]);
    eq(preferencesForSong(preferences, 'alfarero', new Set([emanuel.id])).length, 1, 'solo miembros que existen');
  });

  it('se guardan, vuelven, y lo corrupto se descarta', () => {
    const { maria } = team();
    const storage = memoryStorage();
    const repository = createLocalKeyPreferenceRepository(storage);
    const preferences = setKeyPreference([], maria.id, 'alfarero', 'Bb', NOW);
    repository.save(preferences);
    eq(JSON.parse(storage.data.get(KEY_PREFERENCES_STORAGE_KEY)!).version, 1);
    eq(repository.load().items, preferences);

    const raw = JSON.stringify({
      version: 1,
      preferences: [
        { memberId: 'm', songId: 's', key: 'Bb', updatedAt: NOW },
        { memberId: 'm', songId: 's', key: 'C', updatedAt: LATER },
        { memberId: 'm', songId: 's2', key: 'teleport' },
        { memberId: '', songId: 's3', key: 'D' },
        null,
      ],
    });
    eq(parseStoredKeyPreferences(raw).preferences, [{ memberId: 'm', songId: 's', key: 'C', updatedAt: LATER }]);
    eq(parseStoredKeyPreferences('{"version":7,"preferences":[]}').unreadable, true);
  });
});

describe('Usar la tonalidad preferida', () => {
  const inG = { id: 'prueba', originalKey: 'G', recommendedCapo: 0 };

  it('canción en G, Setlist en G, María prefiere Bb: se transpone como a mano', () => {
    const settings = { transposeSteps: 0, capoFret: 0 };
    const target = keySettingsForKey(inG, settings, 'Bb')!;
    eq(target, { transposeSteps: 3, capoFret: 0 });
    eq(describeKey(inG.originalKey, target, 0)?.sounding, 'Bb');
    eq(inG.originalKey, 'G', 'la canción no cambia');
    eq(soundsInKey(inG, target, 'Bb'), true);
  });

  it('respeta la cejilla y va por el camino corto', () => {
    const withCapo = { transposeSteps: -2, capoFret: 2 }; // suena en G con cejilla 2
    const target = keySettingsForKey(inG, withCapo, 'A')!;
    eq(target.capoFret, 2, 'la cejilla no se mueve');
    eq(describeKey('G', target, 0)?.sounding, 'A');
    eq(keySettingsForKey(inG, { transposeSteps: 0, capoFret: 0 }, 'F')?.transposeSteps, -2);
    eq(keySettingsForKey(inG, { transposeSteps: 0, capoFret: 0 }, 'Em'), null, 'otro modo: no se aplica');
  });

  it('sugiere solo a quienes están asignados y suenan distinto; con varios, todos', () => {
    const { maria, laura, emanuel } = team();
    const sections = parseSongSections(ALFARERO.content);
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { assignedMemberIds: [maria.id, laura.id] });
    let preferences = setKeyPreference([], maria.id, 'alfarero', 'E', NOW);
    preferences = setKeyPreference(preferences, laura.id, 'alfarero', 'C', NOW);
    preferences = setKeyPreference(preferences, emanuel.id, 'alfarero', 'G', NOW);
    const existing = new Set([maria.id, laura.id, emanuel.id]);
    const settings = { transposeSteps: 0, capoFret: 0 };

    const suggestions = keySuggestionsFor(ALFARERO, { arrangement }, settings, preferences, existing);
    eq(suggestions.map((entry) => entry.key).sort(), ['C', 'E'], 'Emanuel no está asignado');

    const already = keySettingsForKey(ALFARERO, settings, 'E')!;
    eq(
      keySuggestionsFor(ALFARERO, { arrangement }, already, preferences, existing).map((entry) => entry.key),
      ['C'],
      'si ya suena en su tonalidad, no se sugiere'
    );
    eq(keySuggestionsFor(ALFARERO, { arrangement: undefined }, settings, preferences, existing), []);
  });
});

describe('Los nombres se leen del miembro', () => {
  it('renombrar cambia el nombre en todas partes', () => {
    const { maria, laura } = team();
    const byId = (members: MinistryMember[]) => new Map(members.map((member) => [member.id, member]));
    eq(memberNames([maria.id, laura.id], byId([maria, laura])), ['María', 'Laura']);
    const renamed = updateMember(maria, { name: 'María Pérez' }, LATER);
    eq(memberNames([maria.id, laura.id], byId([renamed, laura])), ['María Pérez', 'Laura']);
    eq(memberNames([maria.id, 'borrado'], byId([renamed])), ['María Pérez'], 'un id que ya no existe se salta');
    eq(memberNames(undefined, byId([renamed])), []);
  });
});
