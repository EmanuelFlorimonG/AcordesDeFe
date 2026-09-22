import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { Setlist, SetlistArrangement } from '../src/types/setlist';
import type { SongSection } from '../src/types/song';
import { parseSongSections } from '../src/utils/chordParser';
import type { ArrangementBinding } from '../src/utils/arrangement';
import {
  MAX_REPEAT_COUNT,
  addArrangementSection,
  arrangementSaveState,
  arrangementVersionOf,
  bindArrangement,
  clampRepeatCount,
  createArrangement,
  describeArrangement,
  duplicateArrangement,
  duplicateArrangementSection,
  formatVoices,
  listArrangementSources,
  matchesSongStructure,
  moveArrangementSection,
  moveArrangementSectionBy,
  normalizeVoices,
  playableArrangement,
  rebindArrangementSection,
  removeArrangementSection,
  resolveArrangement,
  resolvedSectionName,
  sanitizeArrangement,
  songStructureOf,
  stampArrangement,
  summarizeArrangement,
  updateArrangementSection,
} from '../src/utils/arrangement';
import {
  SETLIST_STORAGE_KEY,
  SETLIST_STORAGE_VERSION,
  createLocalSetlistRepository,
  parseStoredSetlists,
} from '../src/storage/setlistStorage';
import { createSetlist, duplicateSetlist, updateSetlistItem } from '../src/utils/setlists';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`arrangement.test: ${checks} comprobaciones`));

const NOW = Date.UTC(2026, 8, 15, 12);

function idSequence(prefix = 'arr') {
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

/** Intro · Verso 1 · Coro · Verso 2 · "Coro" (cue) · Puente */
const SONG = [
  '[Intro]',
  '[C]  [G]',
  '',
  '[Verso 1]',
  'Letra del verso uno',
  '',
  '[Coro]',
  'Letra del coro',
  '',
  '[Verso 2]',
  'Letra del verso dos',
  '',
  'Coro',
  '',
  '[Puente]',
  'Letra del puente',
].join('\n');

const SECTIONS = parseSongSections(SONG);
const INTRO = 'section-1';
const VERSO_1 = 'section-2';
const CORO = 'section-3';
const VERSO_2 = 'section-4';
const CORO_REPETIDO = 'section-5';
const PUENTE = 'section-6';

const arrangementOf = (makeId = idSequence()) => createArrangement(SECTIONS, makeId);

describe('El arreglo nace de la canción', () => {
  it('toma su estructura, en su orden, y cada aparición del coro es su propia sección', () => {
    const arrangement = arrangementOf();
    eq(
      arrangement.sections.map((section) => section.sourceSectionId),
      [INTRO, VERSO_1, CORO, VERSO_2, CORO_REPETIDO, PUENTE]
    );
    eq(
      arrangement.sections.map((section) => section.label),
      ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro', 'Puente']
    );
  });

  it('cada aparición tiene identidad propia', () => {
    const arrangement = arrangementOf();
    const ids = arrangement.sections.map((section) => section.id);
    eq(new Set(ids).size, ids.length, 'ningún id repetido');
    eq(ids[2] === ids[4], false, 'los dos coros no comparten id aunque sean la misma sección');
  });

  it('empieza sin nada decidido: una vez, sin voces, sin indicación y continuando', () => {
    const [first] = arrangementOf().sections;
    eq(first.repeatCount, 1);
    eq(first.voices, []);
    eq(first.instruction, '');
    eq(first.transition, { type: 'continue' });
  });

  it('las secciones que se pueden añadir son las escritas, sin repetir el coro suelto', () => {
    eq(
      listArrangementSources(SECTIONS).map((source) => source.label),
      ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Puente']
    );
  });

  it('un arreglo igual a la canción no es un arreglo propio', () => {
    eq(matchesSongStructure(SECTIONS, undefined), true);
    eq(matchesSongStructure(SECTIONS, arrangementOf()), true);
    const changed = updateArrangementSection(arrangementOf(), 'arr-3', { repeatCount: 2 });
    eq(matchesSongStructure(SECTIONS, changed), false);
  });

  it('nunca toca la canción', () => {
    const before = JSON.stringify(SECTIONS);
    const arrangement = removeArrangementSection(arrangementOf(), 'arr-1');
    eq(arrangement.sections.length, 5);
    eq(JSON.stringify(SECTIONS), before, 'la canción sigue igual');
  });
});

describe('Ordenar, duplicar, quitar y añadir', () => {
  it('mover cambia el orden y solo el orden', () => {
    const arrangement = arrangementOf();
    const moved = moveArrangementSection(arrangement, 'arr-6', 0);
    eq(
      moved.sections.map((section) => section.label),
      ['Puente', 'Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro']
    );
    eq(moveArrangementSectionBy(arrangement, 'arr-1', -1), arrangement, 'la primera no sube más');
    eq(moveArrangementSection(arrangement, 'no-existe', 0), arrangement);
  });

  it('duplicar deja dos apariciones independientes de la misma sección', () => {
    const arrangement = duplicateArrangementSection(arrangementOf(), 'arr-3', idSequence('copia'));
    eq(arrangement.sections.length, 7);
    eq(
      arrangement.sections.map((section) => section.label),
      ['Intro', 'Verso 1', 'Coro', 'Coro', 'Verso 2', 'Coro', 'Puente']
    );
    const ids = arrangement.sections.map((section) => section.id);
    eq(new Set(ids).size, 7, 'siete identidades distintas');

    const withVoices = updateArrangementSection(arrangement, 'copia-1', { voices: ['women'] });
    eq(withVoices.sections[2].voices, [], 'el primer coro no cambia');
    eq(withVoices.sections[3].voices, ['women'], 'solo cambia la copia');
  });

  it('quitar del arreglo no quita de la canción, y se puede volver a añadir', () => {
    const removed = removeArrangementSection(arrangementOf(), 'arr-3');
    eq(
      removed.sections.map((section) => section.label),
      ['Intro', 'Verso 1', 'Verso 2', 'Coro', 'Puente']
    );
    const source = listArrangementSources(SECTIONS).find((entry) => entry.sectionId === CORO)!;
    const added = addArrangementSection(removed, source, idSequence('nuevo'));
    eq(added.sections.length, 6);
    eq(added.sections[5].sourceSectionId, CORO, 'se añade al final');
    eq(added.sections[5].id, 'nuevo-1');
  });

  it('se puede añadir la misma sección más de una vez', () => {
    const source = listArrangementSources(SECTIONS).find((entry) => entry.sectionId === PUENTE)!;
    const makeId = idSequence('extra');
    const twice = addArrangementSection(addArrangementSection(arrangementOf(), source, makeId), source, makeId);
    eq(twice.sections.filter((section) => section.sourceSectionId === PUENTE).length, 3);
    eq(new Set(twice.sections.map((section) => section.id)).size, twice.sections.length);
  });
});

describe('Voces, repeticiones e indicaciones', () => {
  it('varias voces a la vez, sin repetir y siempre en el mismo orden', () => {
    eq(normalizeVoices(['women', 'all', 'women']), ['all', 'women']);
    eq(formatVoices(['all', 'women']), 'Todos · Mujeres');
    const arrangement = updateArrangementSection(arrangementOf(), 'arr-3', {
      voices: ['soloist', 'choir'],
    });
    eq(arrangement.sections[2].voices, ['soloist', 'choir']);
  });

  it('una voz inventada se ignora', () => {
    eq(normalizeVoices(['BATMAN', 'men', 42, null]), ['men']);
    eq(normalizeVoices('mujeres'), []);
  });

  it('las repeticiones son un número razonable, nunca 0, -5 ni 99', () => {
    eq(clampRepeatCount(0), 1);
    eq(clampRepeatCount(-5), 1);
    eq(clampRepeatCount(99), MAX_REPEAT_COUNT);
    eq(clampRepeatCount(2.4), 2);
    eq(clampRepeatCount('dos'), 1);
    eq(updateArrangementSection(arrangementOf(), 'arr-3', { repeatCount: 7 }).sections[2].repeatCount, 4);
  });

  it('la indicación es texto libre, limpio y acotado', () => {
    const arrangement = updateArrangementSection(arrangementOf(), 'arr-1', {
      instruction: '  Piano solo  ',
    });
    eq(arrangement.sections[0].instruction, 'Piano solo');
    eq(
      updateArrangementSection(arrangementOf(), 'arr-1', { instruction: 'x'.repeat(300) }).sections[0]
        .instruction.length,
      120
    );
  });
});

describe('Saltos y finales', () => {
  const withJump = () =>
    updateArrangementSection(arrangementOf(), 'arr-6', { transition: { type: 'jump', targetId: 'arr-3' } });

  it('un salto apunta a una aparición concreta, no a "el coro"', () => {
    const arrangement = withJump();
    eq(arrangement.sections[5].transition, { type: 'jump', targetId: 'arr-3' });
    const resolved = resolveArrangement(SECTIONS, arrangement);
    eq(resolved[5].transitionTargetLabel, 'Coro (1)');
    eq(resolved[4].transitionTargetLabel, null, 'sin salto no hay destino');
  });

  it('terminar aquí se guarda tal cual', () => {
    const arrangement = updateArrangementSection(arrangementOf(), 'arr-6', { transition: { type: 'end' } });
    eq(arrangement.sections[5].transition, { type: 'end' });
    eq(summarizeArrangement(resolveArrangement(SECTIONS, arrangement)).endings, 1);
  });

  it('quitar la sección de destino deja el salto en "continuar"', () => {
    const arrangement = removeArrangementSection(withJump(), 'arr-3');
    eq(arrangement.sections.some((section) => section.transition.type === 'jump'), false);
    eq(arrangement.sections[arrangement.sections.length - 1].transition, { type: 'continue' });
  });

  it('una sección no puede saltar a sí misma', () => {
    const arrangement = updateArrangementSection(arrangementOf(), 'arr-3', {
      transition: { type: 'jump', targetId: 'arr-3' },
    });
    eq(arrangement.sections[2].transition, { type: 'continue' });
  });

  it('volver al coro y seguir es un arreglo válido, no un bucle que se ejecuta', () => {
    const arrangement = withJump();
    const resolved = resolveArrangement(SECTIONS, arrangement);
    eq(resolved.length, 6, 'el salto no añade ni repite bloques');
  });
});

describe('Leer el arreglo contra la canción', () => {
  it('sin arreglo se lee la canción tal como está escrita', () => {
    const resolved = resolveArrangement(SECTIONS);
    eq(
      resolved.map((entry) => entry.label),
      ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro', 'Puente']
    );
    eq(new Set(resolved.map((entry) => entry.id)).size, 6, 'cada bloque con su propia identidad');
  });

  it('respeta el orden del arreglo', () => {
    const arrangement = moveArrangementSection(arrangementOf(), 'arr-6', 0);
    eq(
      resolveArrangement(SECTIONS, arrangement).map((entry) => entry.label),
      ['Puente', 'Intro', 'Verso 1', 'Coro', 'Verso 2', 'Coro']
    );
  });

  it('dos apariciones del coro son dos bloques y se distinguen', () => {
    const resolved = resolveArrangement(SECTIONS, arrangementOf());
    const coros = resolved.filter((entry) => entry.label === 'Coro');
    eq(coros.length, 2);
    eq(coros.map(resolvedSectionName), ['Coro (1)', 'Coro (2)']);
    eq(resolvedSectionName(resolved[5]), 'Puente', 'lo que solo aparece una vez no se numera');
  });

  it('repetir dos veces no duplica la letra', () => {
    const arrangement = updateArrangementSection(arrangementOf(), 'arr-3', { repeatCount: 2 });
    const resolved = resolveArrangement(SECTIONS, arrangement);
    eq(resolved.length, 6, 'sigue habiendo seis bloques');
    eq(resolved[2].repeatCount, 2);
    eq(resolved[2].section?.lines.length, 1, 'la letra se escribe una vez');
  });

  it('cada bloque lleva la letra de su sección', () => {
    const resolved = resolveArrangement(SECTIONS, arrangementOf());
    eq(resolved[2].section?.id, CORO);
    eq(resolved[4].section?.id, CORO_REPETIDO, 'la segunda aparición conserva su identidad');
    eq(resolved[4].section?.lines, resolved[2].section?.lines, 'y trae la letra completa del coro');
  });

  it('una sección que la canción ya no tiene no rompe nada', () => {
    const arrangement: SetlistArrangement = {
      sections: [
        ...arrangementOf().sections,
        {
          id: 'huerfana',
          sourceSectionId: 'section-99',
          label: 'Final',
          repeatCount: 1,
          voices: [],
          instruction: '',
          transition: { type: 'end' },
        },
      ],
    };
    const resolved = resolveArrangement(SECTIONS, arrangement);
    eq(resolved.length, 7);
    eq(resolved[6].section, null, 'no se inventa ninguna letra');
    eq(resolved[6].label, 'Final', 'conserva el nombre que tenía');
    eq(summarizeArrangement(resolved).missing, 1);
  });

  it('cuenta lo que hay, sin inventar estadísticas', () => {
    let arrangement = updateArrangementSection(arrangementOf(), 'arr-3', {
      repeatCount: 2,
      voices: ['all'],
    });
    arrangement = updateArrangementSection(arrangement, 'arr-1', { instruction: 'Piano solo' });
    const summary = summarizeArrangement(resolveArrangement(SECTIONS, arrangement));
    eq(summary, {
      sections: 6,
      repeated: 1,
      withVoices: 1,
      withInstructions: 1,
      jumps: 0,
      endings: 0,
      missing: 0,
    });
    eq(describeArrangement(summary), '6 secciones · 1 repetición · 1 con voces · 1 indicación');
  });
});

describe('Guardar y volver a abrir', () => {
  const customized = () => {
    let arrangement = updateArrangementSection(arrangementOf(), 'arr-3', {
      repeatCount: 2,
      voices: ['all', 'women'],
      instruction: 'Entrar suave',
    });
    arrangement = updateArrangementSection(arrangement, 'arr-6', {
      transition: { type: 'jump', targetId: 'arr-3' },
    });
    return arrangement;
  };

  const setlistWith = (arrangement?: SetlistArrangement): Setlist => {
    const makeId = idSequence('item');
    const setlist = createSetlist({ name: 'Misa Domingo' }, { now: NOW, createId: makeId });
    return {
      ...setlist,
      items: [
        {
          id: 'item-cancion',
          songId: 'una-cancion',
          moment: 'Entrada',
          transposeSteps: 0,
          capoFret: 0,
          notes: '',
          ...(arrangement ? { arrangement } : {}),
        },
      ],
    };
  };

  it('un Setlist de antes, sin arreglos, sigue funcionando', () => {
    const stored = JSON.stringify({ version: 1, setlists: [setlistWith()] });
    const { setlists, unreadable } = parseStoredSetlists(stored, NOW, idSequence('leido'));
    eq(unreadable, false);
    eq(setlists[0].items[0].arrangement, undefined);
    eq(setlists[0].items[0].moment, 'Entrada', 'lo demás se conserva');
  });

  it('un Setlist con arreglo vuelve exactamente igual', () => {
    const arrangement = customized();
    const stored = JSON.stringify({ version: SETLIST_STORAGE_VERSION, setlists: [setlistWith(arrangement)] });
    const { setlists } = parseStoredSetlists(stored, NOW, idSequence('leido'));
    eq(setlists[0].items[0].arrangement, arrangement);
  });

  it('pasa por el navegador y vuelve', () => {
    const storage = memoryStorage();
    const repository = createLocalSetlistRepository(storage);
    repository.save([setlistWith(customized())]);
    eq(
      JSON.parse(storage.data.get(SETLIST_STORAGE_KEY)!).version,
      SETLIST_STORAGE_VERSION,
      'se guarda en la versión actual'
    );
    eq(repository.load().setlists[0].items[0].arrangement, customized());
  });

  it('datos estropeados se arreglan en vez de romper', () => {
    const broken = {
      version: 2,
      setlists: [
        {
          id: 'setlist-roto',
          name: 'Roto',
          items: [
            {
              id: 'item-roto',
              songId: 'una-cancion',
              arrangement: {
                sections: [
                  { id: 'a', sourceSectionId: CORO, repeatCount: -5, voices: ['BATMAN', 'men'] },
                  { id: 'a', sourceSectionId: VERSO_1, repeatCount: 99, instruction: 42 },
                  { sourceSectionId: '   ', repeatCount: 2 },
                  'esto no es una sección',
                  { id: 'd', sourceSectionId: PUENTE, transition: { type: 'jump', targetId: 'no-existe' } },
                  { id: 'e', sourceSectionId: INTRO, transition: { type: 'bailar' } },
                ],
              },
            },
          ],
        },
      ],
    };
    const { setlists, unreadable } = parseStoredSetlists(JSON.stringify(broken), NOW, idSequence('limpio'));
    eq(unreadable, false);
    const sections = setlists[0].items[0].arrangement!.sections;
    eq(sections.length, 4, 'se descartan las que no se pueden arreglar');
    eq(sections[0].repeatCount, 1);
    eq(sections[0].voices, ['men'], 'la voz inventada se ignora');
    eq(sections[1].repeatCount, MAX_REPEAT_COUNT);
    eq(sections[1].instruction, '');
    eq(sections[1].id, 'limpio-1', 'el id repetido se sustituye');
    eq(sections[2].transition, { type: 'continue' }, 'un salto a ninguna parte se convierte en continuar');
    eq(sections[3].transition, { type: 'continue' });
  });

  it('un arreglo vacío o absurdo es simplemente "como está escrita"', () => {
    eq(sanitizeArrangement(undefined), undefined);
    eq(sanitizeArrangement({ sections: [] }), undefined);
    eq(sanitizeArrangement('un arreglo'), undefined);
    eq(sanitizeArrangement({ sections: [{ id: 'x' }] }), undefined, 'sin sección de origen no hay bloque');
  });

  it('guardar un arreglo en una entrada no toca las demás', () => {
    const arrangement = customized();
    const setlist = {
      ...setlistWith(),
      items: [
        setlistWith().items[0],
        { ...setlistWith().items[0], id: 'item-2', songId: 'otra-cancion' },
      ],
    };
    const updated = updateSetlistItem(setlist, 'item-cancion', { arrangement }, NOW + 1000);
    eq(updated.items[0].arrangement, arrangement);
    eq(updated.items[1].arrangement, undefined);
    eq(setlist.items[0].arrangement, undefined, 'el setlist original no cambia');
  });

  it('restablecer borra el arreglo de la entrada', () => {
    const setlist = setlistWith(customized());
    const reset = updateSetlistItem(setlist, 'item-cancion', { arrangement: null }, NOW + 1000);
    eq('arrangement' in reset.items[0], false);
    eq(reset.items[0].notes, '', 'lo demás sigue ahí');
  });

  it('duplicar el Setlist copia el arreglo con identidades propias', () => {
    const original = setlistWith(customized());
    const copy = duplicateSetlist(original, { name: 'Misa (copia)' }, { now: NOW, createId: idSequence('copia') });
    const source = original.items[0].arrangement!;
    const copied = copy.items[0].arrangement!;

    eq(copied.sections.length, source.sections.length);
    eq(
      copied.sections.map((section) => section.sourceSectionId),
      source.sections.map((section) => section.sourceSectionId)
    );
    eq(
      copied.sections.some((section) => source.sections.some((other) => other.id === section.id)),
      false,
      'ningún id compartido'
    );

    const jump = copied.sections[5].transition;
    eq(jump.type, 'jump');
    eq(
      jump.type === 'jump' && jump.targetId === copied.sections[2].id,
      true,
      'el salto apunta al coro de la copia'
    );
    eq(copied.sections[2].voices === source.sections[2].voices, false, 'sin listas compartidas');
  });

  it('duplicar un arreglo sin saltos también funciona', () => {
    const copy = duplicateArrangement(arrangementOf(), idSequence('copia'));
    eq(copy.sections.map((section) => section.id).join(','), 'copia-1,copia-2,copia-3,copia-4,copia-5,copia-6');
    eq(copy.sections[0].transition, { type: 'continue' });
  });
});

// --- Local data written before any of this ------------------------------------------

describe('Los datos ya guardados en el navegador se siguen leyendo igual', () => {
  it('un Setlist guardado antes de las versiones conserva sus ids y su arreglo', () => {
    const stored = {
      version: SETLIST_STORAGE_VERSION,
      setlists: [
        {
          id: 'setlist-guardado',
          name: 'Misa Domingo',
          date: '2026-09-20',
          description: '',
          participantIds: ['maria'],
          items: [
            {
              id: 'item-guardado',
              songId: 'huracan-hakuna',
              moment: 'Entrada',
              transposeSteps: 2,
              capoFret: 1,
              notes: 'Entrar suave',
              arrangement: {
                sections: [
                  { id: 'bloque-1', sourceSectionId: 'section-1', label: 'Verso 1', repeatCount: 1, voices: ['women'], assignedMemberIds: ['maria'], instruction: '', transition: { type: 'continue' } },
                  { id: 'bloque-2', sourceSectionId: 'section-2', label: 'Coro', repeatCount: 2, voices: [], assignedMemberIds: [], instruction: 'Fuerte', transition: { type: 'end' } },
                ],
              },
            },
          ],
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    const [setlist] = parseStoredSetlists(JSON.stringify(stored)).setlists;
    const item = setlist.items[0];
    eq([setlist.id, item.id, item.songId], ['setlist-guardado', 'item-guardado', 'huracan-hakuna'], 'nada se reasigna al leerlo');
    eq([item.transposeSteps, item.capoFret, item.notes], [2, 1, 'Entrar suave']);
    eq(item.arrangement?.sections.map((section) => [section.id, section.sourceSectionId, section.label]), [
      ['bloque-1', 'section-1', 'Verso 1'],
      ['bloque-2', 'section-2', 'Coro'],
    ]);
    eq([item.arrangement?.songVersion, item.arrangement?.songStructure], [undefined, undefined], 'sin versión ni estructura: cuenta como la 1');
    // En la versión 1 de su canción se toca tal cual, como siempre.
    eq(bindArrangement(SECTIONS, item.arrangement, 1).state, 'current');
  });
});

// --- The song got a new version ------------------------------------------------------

describe('El arreglo después de una nueva versión de la canción', () => {
  /** Version 2 of SONG: a new Pre-coro before the chorus shifts every position after it. */
  const V2 = parseSongSections(
    ['[Intro]', '[C]  [G]', '', '[Verso 1]', 'Letra del verso uno', '', '[Pre-coro]', 'Nuevo', '', '[Coro]', 'Letra del coro', '', '[Verso 2]', 'Letra del verso dos', '', 'Coro', '', '[Puente]', 'Letra del puente'].join('\n')
  );
  const byLabel = (sections: SongSection[], label: string) => listArrangementSources(sections).find((source) => source.label === label)?.sectionId;
  /** Intro · Coro ×2 (mujeres) · Puente, made on version 1 and saved there (so it records that version's names). */
  const custom = (): SetlistArrangement => {
    let arrangement = createArrangement(SECTIONS, idSequence());
    arrangement = removeArrangementSection(arrangement, 'arr-2');
    arrangement = removeArrangementSection(arrangement, 'arr-4');
    arrangement = removeArrangementSection(arrangement, 'arr-5');
    arrangement = updateArrangementSection(arrangement, 'arr-3', { repeatCount: 2, voices: ['women'] });
    return stampArrangement(arrangement, 1, SECTIONS);
  };
  const pendingOf = (binding: ArrangementBinding) => (binding.state === 'pending' ? binding.pendingIds : binding.state);

  it('al guardarse, el arreglo anota los nombres de las secciones de esa versión', () => {
    eq(custom().songStructure, ['Intro', 'Verso 1', 'Coro', 'Verso 2', 'Puente']);
    eq(songStructureOf(V2), ['Intro', 'Verso 1', 'Pre-coro', 'Coro', 'Verso 2', 'Puente']);
  });

  it('en la misma versión se usa tal como está (y sin versión cuenta como la 1)', () => {
    const arrangement = custom();
    const binding = bindArrangement(SECTIONS, arrangement, 1);
    eq(binding.state, 'current');
    eq(playableArrangement(binding), arrangement);
    eq(bindArrangement(SECTIONS, stampArrangement(arrangement, 3, SECTIONS), 3).state, 'current');
    eq(bindArrangement(SECTIONS, undefined, 2), { state: 'none' });
  });

  it('en otra versión, cada bloque con un nombre único en las dos se reasigna a su sección nueva', () => {
    const binding = bindArrangement(V2, custom(), 2);
    eq(binding.state, 'rebound');
    const playable = playableArrangement(binding)!;
    eq(
      playable.sections.map((entry) => [entry.label, entry.sourceSectionId]),
      [
        ['Intro', byLabel(V2, 'Intro')],
        ['Coro', byLabel(V2, 'Coro')],
        ['Puente', byLabel(V2, 'Puente')],
      ]
    );
    // Voces y repeticiones siguen con su bloque; la versión se guarda solo al guardar el arreglo.
    eq([playable.sections[1].repeatCount, playable.sections[1].voices, playable.songVersion], [2, ['women'], 1]);
    eq(resolveArrangement(V2, playable).map((entry) => entry.section?.header?.label), ['Intro', 'Coro', 'Puente']);
  });

  it('dos coros antes y uno solo después: nunca se reasigna, aunque el nombre sea único ahora', () => {
    // v1: "Coro" escrito dos veces, con letras distintas. El arreglo usa solo el primero.
    const twoChoruses = parseSongSections(['[Coro]', 'Primero', '', '[Coro]', 'Segundo'].join('\n'));
    eq(songStructureOf(twoChoruses), ['Coro', 'Coro']);
    let arrangement = createArrangement(twoChoruses, idSequence());
    arrangement = removeArrangementSection(arrangement, 'arr-2');
    arrangement = stampArrangement(arrangement, 1, twoChoruses);
    eq(arrangement.sections.map((entry) => [entry.label, entry.sourceSectionId]), [['Coro', 'section-1']]);

    // v2: se quitó el primero y queda el segundo, con su letra.
    const onlySecond = parseSongSections(['[Coro]', 'Segundo'].join('\n'));
    const binding = bindArrangement(onlySecond, arrangement, 2);
    eq(binding.state, 'pending');
    eq(pendingOf(binding), ['arr-1']);
    eq(playableArrangement(binding), undefined);
    // Y el bloque sigue apuntando a donde apuntaba: nada se reasignó por detrás.
    eq(binding.state === 'pending' ? binding.arrangement.sections[0].sourceSectionId : '', 'section-1');
  });

  it('un nombre repetido en la canción nueva queda pendiente: no se adivina cuál de los dos es', () => {
    const twice = parseSongSections(`${SONG}\n\n[Coro]\nOtra letra del coro`);
    eq(pendingOf(bindArrangement(twice, custom(), 2)), ['arr-3']);
  });

  it('el coro escrito y su repetición son el mismo coro: los dos bloques van a él', () => {
    // "Coro" nombra una sola sección en las dos versiones (la repetición no es otra sección),
    // así que no hay nada que adivinar: los dos bloques tocan esas mismas líneas.
    const whole = stampArrangement(createArrangement(SECTIONS, idSequence()), 1, SECTIONS);
    const binding = bindArrangement(V2, whole, 2);
    eq(binding.state, 'rebound');
    const coro = byLabel(V2, 'Coro');
    eq(
      playableArrangement(binding)!.sections.filter((entry) => entry.label === 'Coro').map((entry) => entry.sourceSectionId),
      [coro, coro]
    );
  });

  it('un arreglo guardado antes de anotar la estructura se revisa entero a mano', () => {
    const { songStructure: _old, ...legacy } = custom();
    void _old;
    eq(bindArrangement(SECTIONS, legacy, 1).state, 'current', 'en su propia versión no hay nada que probar');
    eq(pendingOf(bindArrangement(V2, legacy, 2)), ['arr-1', 'arr-3', 'arr-6']);
  });

  it('sección eliminada, renombrada, añadida, reordenada, y cambios de letra o acordes', () => {
    const renamed = parseSongSections(SONG.replace('[Puente]', '[Final]'));
    eq(pendingOf(bindArrangement(renamed, custom(), 2)), ['arr-6'], 'renombrada: pendiente');

    const removed = parseSongSections(SONG.replace('[Puente]\nLetra del puente', ''));
    eq(pendingOf(bindArrangement(removed, custom(), 2)), ['arr-6'], 'eliminada: pendiente');

    const added = parseSongSections(`${SONG}\n\n[Final]\nUn final nuevo`);
    eq(bindArrangement(added, custom(), 2).state, 'rebound', 'añadida con nombre nuevo: el resto se reasigna');

    const reordered = parseSongSections(['[Puente]', 'Letra del puente', '', '[Intro]', '[C]  [G]', '', '[Verso 1]', 'Letra del verso uno', '', '[Coro]', 'Letra del coro', '', '[Verso 2]', 'Letra del verso dos'].join('\n'));
    const afterReorder = playableArrangement(bindArrangement(reordered, custom(), 2))!;
    eq(
      afterReorder.sections.map((entry) => [entry.label, entry.sourceSectionId]),
      [
        ['Intro', byLabel(reordered, 'Intro')],
        ['Coro', byLabel(reordered, 'Coro')],
        ['Puente', byLabel(reordered, 'Puente')],
      ],
      'reordenada: cada bloque sigue a su sección'
    );

    const newLyrics = parseSongSections(SONG.replace('Letra del coro', 'Otra letra del coro'));
    eq(bindArrangement(newLyrics, custom(), 2).state, 'rebound', 'letra cambiada: la estructura no cambia');
    const newChords = parseSongSections(SONG.replace('[C]  [G]', '[D]  [A]'));
    eq(bindArrangement(newChords, custom(), 2).state, 'rebound', 'acordes cambiados: la estructura no cambia');
  });

  it('elegir la sección de cada bloque pendiente y guardar con la versión nueva', () => {
    const renamed = parseSongSections(SONG.replace('[Puente]', '[Final]'));
    const binding = bindArrangement(renamed, custom(), 2);
    if (binding.state !== 'pending') throw new Error('pendiente');
    const final = listArrangementSources(renamed).find((source) => source.label === 'Final')!;
    const chosen = stampArrangement(rebindArrangementSection(binding.arrangement, 'arr-6', final), 2, renamed);
    eq([chosen.sections[2].sourceSectionId, chosen.sections[2].label, chosen.songVersion], [final.sectionId, 'Final', 2]);
    eq(chosen.songStructure, songStructureOf(renamed));
    eq(bindArrangement(renamed, chosen, 2).state, 'current');
    eq(rebindArrangementSection(chosen, 'no-existe', final), chosen);
  });

  it('el arreglo se guarda entero: ni a medias ni contra otra versión', () => {
    const twice = parseSongSections(`${SONG}

[Coro]
Otra letra del coro`);
    const renamedAndTwice = parseSongSections(`${SONG.replace('[Puente]', '[Final]')}

[Coro]
Otra letra del coro`);
    const binding = bindArrangement(renamedAndTwice, custom(), 2);
    if (binding.state !== 'pending') throw new Error('pendiente');
    eq(binding.pendingIds, ['arr-3', 'arr-6'], 'dos bloques sin resolver');

    const ready = (arrangement: SetlistArrangement | null, pendingIds: string[], reviewed: number, current: number) =>
      arrangementSaveState({ arrangement, pendingIds, reviewedVersion: reviewed, currentVersion: current });
    eq(ready(binding.arrangement, binding.pendingIds, 2, 2), 'pending');

    // Resolver uno solo no certifica el otro: sigue sin poder guardarse.
    const coro = listArrangementSources(renamedAndTwice).filter((source) => source.label === 'Coro')[0];
    const half = rebindArrangementSection(binding.arrangement, 'arr-3', coro);
    eq(ready(half, ['arr-6'], 2, 2), 'pending');

    // Resueltos los dos, se guarda con la versión revisada y su estructura.
    const final = listArrangementSources(renamedAndTwice).find((source) => source.label === 'Final')!;
    const whole = stampArrangement(rebindArrangementSection(half, 'arr-6', final), 2, renamedAndTwice);
    eq(ready(whole, [], 2, 2), 'ready');

    // Guardado y vuelto a leer desde el almacenamiento, no vuelve a quedar pendiente.
    const setlist = createSetlist({ name: 'Domingo', date: '', description: '' }, { now: NOW, createId: idSequence('s') });
    const stored = parseStoredSetlists(
      JSON.stringify({
        version: SETLIST_STORAGE_VERSION,
        setlists: [{ ...setlist, items: [{ id: 'i-1', songId: 'x', moment: '', transposeSteps: 0, capoFret: 0, notes: '', arrangement: whole }] }],
      })
    ).setlists[0].items[0].arrangement;
    eq([stored?.songVersion, stored?.songStructure], [2, songStructureOf(renamedAndTwice)]);
    eq(bindArrangement(renamedAndTwice, stored, 2).state, 'current');

    // Un arreglo guardado mientras quedaban pendientes conserva su versión vieja: sigue pendiente al reabrir.
    const kept = parseStoredSetlists(
      JSON.stringify({
        version: SETLIST_STORAGE_VERSION,
        setlists: [{ ...setlist, items: [{ id: 'i-1', songId: 'x', moment: '', transposeSteps: 0, capoFret: 0, notes: '', arrangement: half }] }],
      })
    ).setlists[0].items[0].arrangement;
    eq(pendingOf(bindArrangement(renamedAndTwice, kept, 2)), ['arr-3', 'arr-6']);
    eq(bindArrangement(twice, custom(), 2).state, 'pending', 'y el caso original sigue pendiente');
  });

  it('una canción que cambia con el editor abierto no certifica lo revisado contra la anterior', () => {
    const reviewed = stampArrangement(custom(), 1, SECTIONS);
    const state = (current: number) =>
      arrangementSaveState({ arrangement: reviewed, pendingIds: [], reviewedVersion: 1, currentVersion: current });
    eq(state(1), 'ready');
    eq(state(2), 'song-changed', 'la canción cambió mientras se revisaba: no se guarda');
    // Sin arreglo propio no hay nada que certificar.
    eq(arrangementSaveState({ arrangement: null, pendingIds: [], reviewedVersion: 1, currentVersion: 2 }), 'ready');
    // Al revisar otra vez contra la versión nueva, el trabajo se conserva y lo dudoso vuelve a quedar pendiente.
    const again = bindArrangement(parseSongSections(SONG.replace('[Puente]', '[Final]')), reviewed, 2);
    eq(pendingOf(again), ['arr-6']);
    eq(again.state === 'pending' ? again.arrangement.sections[1].voices : [], ['women'], 'las voces elegidas siguen ahí');
  });

  it('las ediciones, las copias y el almacenamiento conservan la versión y la estructura', () => {
    const stamped = stampArrangement(custom(), 4, SECTIONS);
    const structure = songStructureOf(SECTIONS);
    eq(moveArrangementSection(stamped, 'arr-6', 0).songStructure, structure);
    eq(duplicateArrangementSection(stamped, 'arr-3', idSequence('d')).songVersion, 4);
    eq(removeArrangementSection(stamped, 'arr-1').songStructure, structure);
    eq(addArrangementSection(stamped, listArrangementSources(SECTIONS)[0], idSequence('n')).songVersion, 4);
    eq(updateArrangementSection(stamped, 'arr-1', { repeatCount: 2 }).songStructure, structure);
    eq(duplicateArrangement(stamped, idSequence('c')).songStructure, structure);
    const stored = sanitizeArrangement(JSON.parse(JSON.stringify(stamped)));
    eq([stored?.songVersion, stored?.songStructure], [4, structure]);
    for (const songVersion of [0, -1, 1.5, '2', null]) {
      eq('songVersion' in (sanitizeArrangement({ ...stamped, songVersion }) ?? {}), false);
    }
    for (const songStructure of [['Coro', 3], 'Coro', 7]) {
      eq('songStructure' in (sanitizeArrangement({ ...stamped, songStructure }) ?? {}), false);
    }
    eq(arrangementVersionOf(custom()), 1);
    eq(arrangementVersionOf(stamped), 4);
  });
});
