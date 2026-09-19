import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Setlist, SetlistItem } from '../src/types/setlist';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { parseSongSections } from '../src/utils/chordParser';
import { createArrangement, resolveArrangement, updateArrangementSection } from '../src/utils/arrangement';
import { describeKey } from '../src/utils/keySettings';
import {
  getMassKey,
  getMassPosition,
  getMassProgress,
  listMassStops,
  resolveMassItemId,
} from '../src/utils/massMode';
import {
  MAX_TRANSITION_INSTRUCTION_LENGTH,
  SONG_TRANSITION_TYPES,
  cleanTransitionInstruction,
  createSongTransition,
  describeSongTransition,
  getTransitionToNext,
  isSongTransitionType,
  sanitizeSongTransition,
} from '../src/utils/songTransition';
import {
  MASS_SESSION_KEY,
  createMassSessionRepository,
  parseMassSession,
  serializeMassSession,
} from '../src/storage/massSessionStorage';
import {
  SETLIST_STORAGE_VERSION,
  createLocalSetlistRepository,
  parseStoredSetlists,
} from '../src/storage/setlistStorage';
import {
  addSongsToSetlist,
  createSetlist,
  duplicateSetlist,
  moveSetlistItem,
  updateSetlistItem,
} from '../src/utils/setlists';
import { createWakeLockController, type WakeLockSentinelLike } from '../src/utils/wakeLock';
import { isFullscreenSupported, toggleFullscreen } from '../src/utils/fullscreen';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`massMode.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 20, 10);

function idSequence(prefix = 'item') {
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
    removeItem: (key: string) => {
      data.delete(key);
    },
  };
}

function song(id: string) {
  const found = MOCK_SONGS.find((candidate) => candidate.id === id);
  assert.ok(found, `falta la canción ${id}`);
  return found;
}

const ENTRADA = song('huracan-hakuna'); // G, cejilla recomendada 5
const GLORIA = song('nadie-te-ama-como-yo'); // C
const COMUNION = song('alfarero'); // D

/** Entrada · Gloria · Comunión, en ese orden. */
function sampleSetlist(makeId = idSequence()): Setlist {
  const empty = createSetlist({ name: 'Misa Domingo', date: '2026-09-20' }, { now: NOW, createId: makeId });
  return addSongsToSetlist(empty, [ENTRADA, GLORIA, COMUNION], { now: NOW, createId: makeId });
}

const KNOWN_SONGS = new Set(MOCK_SONGS.map((entry) => entry.id));
const isPlayable = (item: SetlistItem) => KNOWN_SONGS.has(item.songId);

describe('Transición entre canciones', () => {
  it('por defecto no hay ninguna: no decir nada no es decir "pausa"', () => {
    const setlist = sampleSetlist();
    eq(setlist.items[0].transitionToNext, undefined);
    eq(getTransitionToNext(setlist.items[0], true), null);
  });

  it('los cuatro tipos se guardan tal cual', () => {
    eq(SONG_TRANSITION_TYPES, ['stop', 'direct', 'instrumental', 'custom']);
    for (const type of SONG_TRANSITION_TYPES) {
      eq(createSongTransition(type), { type, instruction: '' });
      eq(isSongTransitionType(type), true);
    }
  });

  it('la indicación se limpia y se acota', () => {
    eq(createSongTransition('direct', '  Mantener G  ').instruction, 'Mantener G');
    eq(cleanTransitionInstruction('x'.repeat(400)).length, MAX_TRANSITION_INSTRUCTION_LENGTH);
    eq(cleanTransitionInstruction(42), '');
  });

  it('un tipo inventado no es una transición', () => {
    eq(sanitizeSongTransition({ type: 'teleport' }), undefined);
    eq(sanitizeSongTransition({ type: 'teleport', instruction: 'algo' }), undefined);
    eq(sanitizeSongTransition('directa'), undefined);
    eq(sanitizeSongTransition(null), undefined);
    eq(sanitizeSongTransition({ type: 'direct', instruction: 7 }), { type: 'direct', instruction: '' });
  });

  it('se lee como una sola línea', () => {
    eq(describeSongTransition(createSongTransition('stop')), 'Pausa');
    eq(
      describeSongTransition(createSongTransition('direct', 'Mantener G durante 2 compases')),
      'Directa · Mantener G durante 2 compases'
    );
  });

  it('la última canción no aplica su transición, pero no la pierde', () => {
    const setlist = updateSetlistItem(
      sampleSetlist(),
      'item-4',
      { transitionToNext: createSongTransition('direct', 'Enlazar') },
      NOW
    );
    const last = setlist.items[2];
    eq(last.transitionToNext, { type: 'direct', instruction: 'Enlazar' }, 'sigue guardada');
    eq(getTransitionToNext(last, false), null, 'pero no se muestra mientras sea la última');
  });

  it('pertenece a la canción de la que sales, así que reordenar la reinterpreta', () => {
    const setlist = updateSetlistItem(
      sampleSetlist(),
      'item-3',
      { transitionToNext: createSongTransition('direct', 'Enlazar con la siguiente') },
      NOW
    );
    // Entrada · Gloria(directa) · Comunión  ->  Entrada · Comunión · Gloria(directa)
    const reordered = moveSetlistItem(setlist, 'item-4', 1, NOW);
    eq(
      reordered.items.map((item) => item.songId),
      [ENTRADA.id, COMUNION.id, GLORIA.id]
    );
    eq(reordered.items[2].transitionToNext?.type, 'direct', 'la indicación viaja con su canción');
    eq(reordered.items[1].transitionToNext, undefined, 'y no se queda en la posición');
  });

  it('quitarla la borra de la entrada', () => {
    const withTransition = updateSetlistItem(
      sampleSetlist(),
      'item-2',
      { transitionToNext: createSongTransition('instrumental') },
      NOW
    );
    const cleared = updateSetlistItem(withTransition, 'item-2', { transitionToNext: null }, NOW);
    eq('transitionToNext' in cleared.items[0], false);
    eq(cleared.items[0].moment, '', 'lo demás sigue igual');
  });
});

describe('Guardar transiciones', () => {
  const withTransitions = () => {
    let setlist = updateSetlistItem(
      sampleSetlist(),
      'item-2',
      { transitionToNext: createSongTransition('direct', 'Terminar en G') },
      NOW
    );
    setlist = updateSetlistItem(setlist, 'item-3', { transitionToNext: createSongTransition('stop') }, NOW);
    return setlist;
  };

  it('viaja al almacenamiento y vuelve igual', () => {
    const storage = memoryStorage();
    const repository = createLocalSetlistRepository(storage);
    repository.save([withTransitions()]);
    eq(JSON.parse(storage.data.get('genesaret_setlists')!).version, SETLIST_STORAGE_VERSION);
    const loaded = repository.load().setlists[0];
    eq(loaded.items[0].transitionToNext, { type: 'direct', instruction: 'Terminar en G' });
    eq(loaded.items[1].transitionToNext, { type: 'stop', instruction: '' });
    eq(loaded.items[2].transitionToNext, undefined);
  });

  it('los Setlists de las versiones 1 y 2 siguen abriéndose', () => {
    for (const version of [1, 2]) {
      const stored = JSON.stringify({ version, setlists: [sampleSetlist()] });
      const { setlists, unreadable } = parseStoredSetlists(stored, NOW, idSequence('leido'));
      eq(unreadable, false, `versión ${version}`);
      eq(setlists[0].items.length, 3);
      eq(setlists[0].items[0].transitionToNext, undefined);
    }
  });

  it('datos estropeados no rompen nada', () => {
    const broken = {
      version: 3,
      setlists: [
        {
          id: 'roto',
          name: 'Roto',
          items: [
            { id: 'a', songId: ENTRADA.id, transitionToNext: { type: 'teleport' } },
            { id: 'b', songId: GLORIA.id, transitionToNext: 'directa' },
            { id: 'c', songId: COMUNION.id, transitionToNext: { type: 'custom', instruction: 'y'.repeat(500) } },
          ],
        },
      ],
    };
    const { setlists, unreadable } = parseStoredSetlists(JSON.stringify(broken), NOW, idSequence('limpio'));
    eq(unreadable, false);
    const items = setlists[0].items;
    eq(items[0].transitionToNext, undefined);
    eq(items[1].transitionToNext, undefined);
    eq(items[2].transitionToNext?.instruction.length, MAX_TRANSITION_INSTRUCTION_LENGTH);
  });

  it('duplicar el Setlist copia las transiciones sin compartirlas', () => {
    const original = withTransitions();
    const copy = duplicateSetlist(original, { name: 'Copia' }, { now: NOW, createId: idSequence('copia') });
    eq(copy.items[0].transitionToNext, original.items[0].transitionToNext);
    eq(
      copy.items[0].transitionToNext === original.items[0].transitionToNext,
      false,
      'objetos distintos: editar una copia no toca la otra'
    );
    copy.items[0].transitionToNext!.instruction = 'cambiada';
    eq(original.items[0].transitionToNext?.instruction, 'Terminar en G');
  });
});

describe('Moverse por el Setlist en Modo Misa', () => {
  it('anterior, actual y siguiente', () => {
    const setlist = sampleSetlist();
    const middle = getMassPosition(setlist, 'item-3', isPlayable)!;
    eq(middle.previous?.id, 'item-2');
    eq(middle.item.id, 'item-3');
    eq(middle.next?.id, 'item-4');
    eq(middle.index, 1);
    eq(middle.total, 3);
  });

  it('la primera no tiene anterior y la última no tiene siguiente', () => {
    const setlist = sampleSetlist();
    const first = getMassPosition(setlist, 'item-2', isPlayable)!;
    eq(first.previous, null);
    eq(first.isFirst, true);
    const last = getMassPosition(setlist, 'item-4', isPlayable)!;
    eq(last.next, null);
    eq(last.isLast, true);
  });

  it('una canción que ya no está en el cancionero se salta', () => {
    const setlist = sampleSetlist();
    const withGhost: Setlist = {
      ...setlist,
      items: [
        setlist.items[0],
        { ...setlist.items[1], id: 'fantasma', songId: 'cancion-borrada' },
        setlist.items[2],
      ],
    };
    const position = getMassPosition(withGhost, 'item-2', isPlayable)!;
    eq(position.total, 2, 'solo cuenta lo que se puede tocar');
    eq(position.next?.id, 'item-4', 'el siguiente salta por encima de la que falta');
    eq(getMassPosition(withGhost, 'fantasma', isPlayable), null);
  });

  it('si la canción actual desaparece, se sigue por la primera que se pueda tocar', () => {
    const setlist = sampleSetlist();
    eq(resolveMassItemId(setlist, 'item-3', isPlayable), 'item-3');
    eq(resolveMassItemId(setlist, 'ya-no-existe', isPlayable), 'item-2');
    eq(resolveMassItemId(setlist, null, isPlayable), 'item-2');
    eq(resolveMassItemId(null, 'item-2', isPlayable), null);
    eq(resolveMassItemId({ ...setlist, items: [] }, 'item-2', isPlayable), null);
  });

  it('el navegador lista todo, numerando solo lo que se puede tocar', () => {
    const setlist = sampleSetlist();
    const withGhost: Setlist = {
      ...setlist,
      items: [setlist.items[0], { ...setlist.items[1], songId: 'cancion-borrada' }, setlist.items[2]],
    };
    eq(
      listMassStops(withGhost, isPlayable).map((stop) => [stop.position, stop.isPlayable]),
      [
        [1, true],
        [null, false],
        [2, true],
      ]
    );
  });

  it('el progreso es la posición sobre el total', () => {
    const setlist = sampleSetlist();
    eq(getMassProgress(getMassPosition(setlist, 'item-2', isPlayable)), 1 / 3);
    eq(getMassProgress(getMassPosition(setlist, 'item-4', isPlayable)), 1);
    eq(getMassProgress(null), 0);
  });

  it('la tonalidad es la misma que calcula el resto de la app', () => {
    const setlist = sampleSetlist();
    const item = setlist.items[0];
    const description = describeKey(ENTRADA.originalKey, item, ENTRADA.recommendedCapo ?? 0)!;
    const massKey = getMassKey(ENTRADA, item, false)!;
    eq(massKey.displayed, description.shape ?? description.sounding);
    eq(massKey.sounding, description.shape ? description.sounding : null);
    eq(massKey.capoFret, item.capoFret);

    const onPiano = getMassKey(ENTRADA, item, true)!;
    eq(onPiano.displayed, description.sounding, 'en piano los acordes ya suenan donde se leen');
    eq(onPiano.capoFret, 0);
    eq(getMassKey(undefined, item, false), null);
  });
});

describe('La sesión de Modo Misa', () => {
  it('guarda dónde nos quedamos y lo devuelve', () => {
    const storage = memoryStorage();
    const repository = createMassSessionRepository(storage, () => NOW);
    eq(repository.read(), null);
    repository.write({ setlistId: 'misa', itemId: 'item-3' });
    eq(repository.read(), { setlistId: 'misa', itemId: 'item-3', updatedAt: NOW });
    repository.clear();
    eq(repository.read(), null);
    eq(storage.data.has(MASS_SESSION_KEY), false);
  });

  it('lo guardado se lee tal cual', () => {
    const session = { setlistId: 'misa', itemId: 'item-3', updatedAt: NOW };
    eq(parseMassSession(serializeMassSession(session)), session);
  });

  it('datos corruptos son "no hay sesión", nunca un error', () => {
    eq(parseMassSession(null), null);
    eq(parseMassSession(''), null);
    eq(parseMassSession('{no es json'), null);
    eq(parseMassSession('[]'), null);
    eq(parseMassSession(JSON.stringify({ version: 99, setlistId: 'a', itemId: 'b' })), null);
    eq(parseMassSession(JSON.stringify({ version: 1, setlistId: '  ', itemId: 'b' })), null);
    eq(parseMassSession(JSON.stringify({ version: 1, setlistId: 'a' })), null);
    eq(parseMassSession(JSON.stringify({ version: 1, setlistId: 'a', itemId: 'b' })), {
      setlistId: 'a',
      itemId: 'b',
      updatedAt: 0,
    });
  });

  it('una sesión de otro Setlist no se usa aquí', () => {
    const setlist = sampleSetlist();
    const stored = parseMassSession(
      serializeMassSession({ setlistId: 'otro', itemId: 'item-3', updatedAt: NOW })
    )!;
    const itemId = stored.setlistId === setlist.id ? stored.itemId : null;
    eq(resolveMassItemId(setlist, itemId, isPlayable), 'item-2', 'se empieza por la primera');
  });

  it('una entrada que ya no existe no deja la Misa en blanco', () => {
    const setlist = sampleSetlist();
    const shorter: Setlist = { ...setlist, items: [setlist.items[0]] };
    eq(resolveMassItemId(shorter, 'item-4', isPlayable), 'item-2');
  });
});

describe('Modo Misa toca el arreglo preparado', () => {
  it('respeta orden, voces, repeticiones e indicaciones, sin duplicar la letra', () => {
    const sections = parseSongSections(COMUNION.content);
    let arrangement = createArrangement(sections, idSequence('arr'));
    arrangement = updateArrangementSection(arrangement, 'arr-2', { voices: ['soloist'] });
    arrangement = updateArrangementSection(arrangement, 'arr-4', {
      repeatCount: 2,
      voices: ['all'],
      instruction: 'Entrar suave',
    });
    arrangement = updateArrangementSection(arrangement, 'arr-7', { transition: { type: 'end' } });

    const setlist = updateSetlistItem(sampleSetlist(), 'item-4', { arrangement }, NOW);
    const item = setlist.items[2];
    eq(item.songId, COMUNION.id);
    const resolved = resolveArrangement(parseSongSections(COMUNION.content), item.arrangement);

    eq(resolved.length, arrangement.sections.length, 'los mismos bloques que se prepararon');
    eq(resolved[1].voices, ['soloist']);
    eq(resolved[3].repeatCount, 2);
    eq(resolved[3].instruction, 'Entrar suave');
    eq(resolved[6].transition, { type: 'end' });

    const chorusBlocks = resolved.filter((entry) => entry.sourceSectionId === resolved[3].sourceSectionId);
    eq(chorusBlocks.length, 1, 'cantar dos veces no crea un segundo bloque');
    eq(chorusBlocks[0].section?.lines.length, resolved[3].section?.lines.length, 'la letra se escribe una vez');
  });

  it('sin arreglo se toca la canción tal como está escrita', () => {
    const setlist = sampleSetlist();
    const item = setlist.items[0];
    eq(item.arrangement, undefined);
    const sections = parseSongSections(ENTRADA.content);
    eq(
      resolveArrangement(sections, item.arrangement).map((entry) => entry.sourceSectionId),
      createArrangement(sections, idSequence('x')).sections.map((entry) => entry.sourceSectionId)
    );
  });
});

describe('Pantalla encendida', () => {
  function fakeSentinel() {
    const listeners: Array<() => void> = [];
    let released = false;
    const sentinel: WakeLockSentinelLike & { fireRelease: () => void; isReleased: () => boolean } = {
      get released() {
        return released;
      },
      release: async () => {
        released = true;
      },
      addEventListener: (_type, listener) => listeners.push(listener),
      fireRelease: () => {
        released = true;
        for (const listener of listeners) listener();
      },
      isReleased: () => released,
    };
    return sentinel;
  }

  it('sin API del navegador no se promete nada', async () => {
    const controller = createWakeLockController({});
    eq(controller.isSupported, false);
    eq(await controller.request(), false);
    eq(controller.isActive(), false);
    await controller.release();
  });

  it('se pide al entrar y se suelta al salir', async () => {
    const sentinel = fakeSentinel();
    const states: boolean[] = [];
    const controller = createWakeLockController(
      { wakeLock: { request: async () => sentinel } },
      (active) => states.push(active)
    );
    eq(controller.isSupported, true);
    eq(await controller.request(), true);
    eq(controller.isActive(), true);
    await controller.release();
    eq(controller.isActive(), false);
    eq(sentinel.isReleased(), true);
    eq(states, [true, false]);
  });

  it('si el navegador lo rechaza, la Misa sigue', async () => {
    const controller = createWakeLockController({
      wakeLock: {
        request: async () => {
          throw new Error('denegado');
        },
      },
    });
    eq(await controller.request(), false);
    eq(controller.isActive(), false);
  });

  it('el bloqueo que el sistema quita vuelve al volver a la pantalla', async () => {
    let granted = 0;
    const sentinels = [fakeSentinel(), fakeSentinel()];
    const controller = createWakeLockController({
      wakeLock: { request: async () => sentinels[granted++] },
    });

    await controller.request();
    eq(controller.isActive(), true);
    sentinels[0].fireRelease(); // la pantalla se bloqueó
    eq(controller.isActive(), false);

    await controller.handleVisibility(false);
    eq(controller.isActive(), false, 'oculta no se pide nada');
    await controller.handleVisibility(true);
    eq(controller.isActive(), true, 'al volver se pide otra vez');
    eq(granted, 2);
  });

  it('después de salir, volver a la pestaña no lo vuelve a pedir', async () => {
    let granted = 0;
    const controller = createWakeLockController({
      wakeLock: {
        request: async () => {
          granted++;
          return fakeSentinel();
        },
      },
    });
    await controller.request();
    await controller.release();
    await controller.handleVisibility(true);
    eq(granted, 1);
    eq(controller.isActive(), false);
  });
});

describe('Pantalla completa', () => {
  it('se detecta antes de ofrecerla', () => {
    eq(isFullscreenSupported({}), false);
    eq(isFullscreenSupported({ documentElement: {} }), false);
    eq(
      isFullscreenSupported({
        documentElement: { requestFullscreen: async () => {} },
        exitFullscreen: async () => {},
      }),
      true
    );
  });

  it('entra, sale y aguanta un error sin romper nada', async () => {
    let element: Element | null = null;
    const doc = {
      get fullscreenElement() {
        return element;
      },
      documentElement: {
        requestFullscreen: async () => {
          element = {} as Element;
        },
      },
      exitFullscreen: async () => {
        element = null;
      },
    };
    eq(await toggleFullscreen(doc), true);
    eq(await toggleFullscreen(doc), false);

    const failing = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: async () => {
          throw new Error('no se puede');
        },
      },
      exitFullscreen: async () => {},
    };
    eq(await toggleFullscreen(failing), false);
    eq(await toggleFullscreen(null), false);
  });
});
