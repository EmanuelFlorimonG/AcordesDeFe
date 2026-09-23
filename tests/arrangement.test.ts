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
  certifyArrangement,
  sanitizeArrangement,
  summarizeArrangement,
  updateArrangementSection,
  withReviewNeeded,
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
    eq(
      [item.arrangement?.songVersion, item.arrangement?.sections.map((section) => section.source)],
      [undefined, [undefined, undefined]],
      'sin versión ni evidencia: cuenta como la 1'
    );
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
  const sourceIn = (sections: SongSection[], label: string) => listArrangementSources(sections).find((source) => source.label === label)!;
  /** Intro · Coro ×2 (mujeres) · Puente, saved on version 1 (so each block wrote down what it plays). */
  const custom = (): SetlistArrangement => {
    let arrangement = createArrangement(SECTIONS, idSequence());
    arrangement = removeArrangementSection(arrangement, 'arr-2');
    arrangement = removeArrangementSection(arrangement, 'arr-4');
    arrangement = removeArrangementSection(arrangement, 'arr-5');
    arrangement = updateArrangementSection(arrangement, 'arr-3', { repeatCount: 2, voices: ['women'] });
    return certifyArrangement(arrangement, 1, SECTIONS)!;
  };
  const pendingOf = (binding: ArrangementBinding) => (binding.state === 'pending' ? binding.pendingIds : binding.state);

  it('al guardarse, cada bloque anota qué sección toca (no su posición ni solo su nombre)', () => {
    const saved = custom();
    eq(saved.songVersion, 1);
    eq(
      saved.sections.map((entry) => [entry.label, entry.source?.version, JSON.parse(entry.source!.signature)[0]]),
      [
        ['Intro', 1, 'Intro'],
        ['Coro', 1, 'Coro'],
        ['Puente', 1, 'Puente'],
      ]
    );
    // La firma incluye la letra: dos secciones con el mismo nombre y distinta letra no son la misma.
    const coro = sourceIn(SECTIONS, 'Coro').signature;
    eq(coro === sourceIn(parseSongSections('[Coro]\nOtra letra'), 'Coro').signature, false);
    eq(coro === sourceIn(parseSongSections('[Coro]\nLetra del coro'), 'Coro').signature, true);
  });

  it('en la misma versión se usa tal como está (y sin versión cuenta como la 1)', () => {
    const arrangement = custom();
    eq(bindArrangement(SECTIONS, arrangement, 1).state, 'current');
    eq(playableArrangement(bindArrangement(SECTIONS, arrangement, 1)), arrangement);
    eq(bindArrangement(SECTIONS, undefined, 2), { state: 'none' });
  });

  it('en otra versión, un bloque se mueve solo si su sección sigue diciendo exactamente lo mismo', () => {
    const binding = bindArrangement(V2, custom(), 2);
    eq(binding.state, 'rebound');
    const playable = playableArrangement(binding)!;
    eq(
      playable.sections.map((entry) => [entry.label, entry.sourceSectionId]),
      [
        ['Intro', sourceIn(V2, 'Intro').sectionId],
        ['Coro', sourceIn(V2, 'Coro').sectionId],
        ['Puente', sourceIn(V2, 'Puente').sectionId],
      ]
    );
    eq([playable.sections[1].repeatCount, playable.sections[1].voices], [2, ['women']]);
    eq(resolveArrangement(V2, playable).map((entry) => entry.section?.header?.label), ['Intro', 'Coro', 'Puente']);
  });

  it('el nombre no demuestra identidad: un Coro nuevo con otra letra nunca hereda el arreglo', () => {
    // v1: Coro = AAA, Puente = BBB. v2: Final = AAA, Coro = BBB.
    const v1 = parseSongSections(['[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    const v2 = parseSongSections(['[Final]', 'AAA', '', '[Coro]', 'BBB'].join('\n'));
    const onlyChorus = certifyArrangement(removeArrangementSection(createArrangement(v1, idSequence()), 'arr-2'), 1, v1)!;
    eq(onlyChorus.sections.map((entry) => entry.label), ['Coro']);
    const binding = bindArrangement(v2, onlyChorus, 2);
    eq(pendingOf(binding), ['arr-1'], 'el Coro viejo no se va al Coro nuevo');
    eq(playableArrangement(binding), undefined);
    eq(binding.state === 'pending' ? binding.arrangement.sections[0].sourceSectionId : '', 'section-1', 'y sigue apuntando donde apuntaba');
  });

  it('dos coros antes y uno solo después: pendiente, aunque el nombre sea único ahora', () => {
    const twoChoruses = parseSongSections(['[Coro]', 'Primero', '', '[Coro]', 'Segundo'].join('\n'));
    const first = certifyArrangement(removeArrangementSection(createArrangement(twoChoruses, idSequence()), 'arr-2'), 1, twoChoruses)!;
    eq(first.sections.map((entry) => entry.sourceSectionId), ['section-1']);
    const onlySecond = parseSongSections(['[Coro]', 'Segundo'].join('\n'));
    eq(pendingOf(bindArrangement(onlySecond, first, 2)), ['arr-1']);
  });

  it('un nombre repetido en la canción nueva queda pendiente', () => {
    const twice = parseSongSections(`${SONG}\n\n[Coro]\nLetra del coro`);
    eq(pendingOf(bindArrangement(twice, custom(), 2)), ['arr-3']);
  });

  it('un arreglo guardado antes de anotar nada se revisa entero a mano', () => {
    const legacy = { ...custom(), sections: custom().sections.map(({ source: _evidence, ...entry }) => entry) };
    eq(bindArrangement(SECTIONS, legacy, 1).state, 'current', 'en su propia versión no hay nada que probar');
    eq(pendingOf(bindArrangement(V2, legacy, 2)), ['arr-1', 'arr-3', 'arr-6']);
  });

  it('sección eliminada, renombrada, añadida, reordenada, y cambios de letra o acordes', () => {
    const renamed = parseSongSections(SONG.replace('[Puente]', '[Final]'));
    eq(pendingOf(bindArrangement(renamed, custom(), 2)), ['arr-6'], 'renombrada: pendiente');

    const removed = parseSongSections(SONG.replace('[Puente]\nLetra del puente', ''));
    eq(pendingOf(bindArrangement(removed, custom(), 2)), ['arr-6'], 'eliminada: pendiente');

    const added = parseSongSections(`${SONG}\n\n[Final]\nUn final nuevo`);
    eq(bindArrangement(added, custom(), 2).state, 'rebound', 'añadida: el resto sigue demostrable');

    const reordered = parseSongSections(['[Puente]', 'Letra del puente', '', '[Intro]', '[C]  [G]', '', '[Verso 1]', 'Letra del verso uno', '', '[Coro]', 'Letra del coro', '', '[Verso 2]', 'Letra del verso dos'].join('\n'));
    eq(
      playableArrangement(bindArrangement(reordered, custom(), 2))!.sections.map((entry) => [entry.label, entry.sourceSectionId]),
      [
        ['Intro', sourceIn(reordered, 'Intro').sectionId],
        ['Coro', sourceIn(reordered, 'Coro').sectionId],
        ['Puente', sourceIn(reordered, 'Puente').sectionId],
      ],
      'reordenada: cada bloque sigue a su sección'
    );

    const newLyrics = parseSongSections(SONG.replace('Letra del coro', 'Otra letra del coro'));
    eq(pendingOf(bindArrangement(newLyrics, custom(), 2)), ['arr-3'], 'letra del coro cambiada: ese bloque se revisa');
    const newChords = parseSongSections(SONG.replace('[C]  [G]', '[D]  [A]'));
    eq(pendingOf(bindArrangement(newChords, custom(), 2)), ['arr-1'], 'acordes de la intro cambiados: ese bloque se revisa');
  });

  it('un bloque que necesitó revisión no deja de necesitarla porque la canción vuelva atrás', () => {
    // v1: Coro = AAA, y el arreglo lo usa.
    const v1 = parseSongSections(['[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    const saved = certifyArrangement(createArrangement(v1, idSequence()), 1, v1)!;

    // v2: el coro cambia → el bloque entra en revisión, y queda anotado en él.
    const v2 = parseSongSections(['[Coro]', 'CCC', '', '[Puente]', 'BBB'].join('\n'));
    const inV2 = bindArrangement(v2, saved, 2);
    eq(pendingOf(inV2), ['arr-1']);
    if (inV2.state !== 'pending') throw new Error('pendiente');
    eq(inV2.arrangement.sections[0].needsReview, true, 'el bloque anota que necesita revisión');

    // v3: vuelve exactamente lo de v1. Sigue pendiente: solo una persona lo resuelve.
    const v3 = parseSongSections(['[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    eq(pendingOf(bindArrangement(v3, inV2.arrangement, 3)), ['arr-1'], 'v3 idéntica a v1 no lo da por revisado');
    eq(certifyArrangement(inV2.arrangement, 3, v3), null, 'y no se puede guardar así');

    // Resolverlo explícitamente en v3 sí lo quita de la lista.
    const chosen = rebindArrangementSection(inV2.arrangement, 'arr-1', listArrangementSources(v3)[0], 3);
    eq(chosen.sections[0].needsReview, undefined);
    eq(bindArrangement(v3, chosen, 3).state, 'rebound');
    eq(certifyArrangement(chosen, 3, v3)?.sections[0].source?.version, 3);

    // Duplicar, borrar el original, reordenar, guardar y recargar no lo limpian.
    const duplicated = duplicateArrangementSection(inV2.arrangement, 'arr-1', idSequence('copia'));
    const onlyCopy = removeArrangementSection(duplicated, 'arr-1');
    eq(pendingOf(bindArrangement(v3, onlyCopy, 3)), ['copia-1'], 'la copia hereda la obligación');
    eq(pendingOf(bindArrangement(v3, moveArrangementSection(onlyCopy, 'copia-1', 1), 3)), ['copia-1'], 'reordenar tampoco');
    const stored = sanitizeArrangement(JSON.parse(JSON.stringify(onlyCopy)));
    eq(stored?.sections[0].needsReview, true, 'se guarda y se vuelve a leer con la anotación');
    eq(pendingOf(bindArrangement(v3, stored, 3)), ['copia-1']);

    // Un arreglo que nunca fue dudoso sí puede seguir automáticamente.
    eq(bindArrangement(v3, saved, 3).state, 'rebound', 'evidencia exacta y nada ambiguo: continúa');
  });

  it('la obligación se anota desde cualquier pantalla, y solo se añade', () => {
    const v1 = parseSongSections(['[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    const saved = certifyArrangement(createArrangement(v1, idSequence()), 1, v1)!;
    const v2 = parseSongSections(['[Coro]', 'CCC', '', '[Puente]', 'BBB'].join('\n'));

    // Lo que cualquier pantalla escribiría al descubrirlo: lo guardado, más la marca.
    const binding = bindArrangement(v2, saved, 2);
    const hardened = withReviewNeeded(saved, binding)!;
    eq(hardened.sections.map((entry) => [entry.label, entry.needsReview ?? false]), [
      ['Coro', true],
      ['Puente', false],
    ]);
    eq(hardened.songVersion, saved.songVersion, 'no cambia la versión anotada');
    eq(
      hardened.sections.map((entry) => [entry.sourceSectionId, entry.source?.signature]),
      saved.sections.map((entry) => [entry.sourceSectionId, entry.source?.signature]),
      'ni a qué apuntaba cada bloque ni su evidencia'
    );

    // Ya anotado, no hay nada que volver a escribir: ni bucles ni escrituras repetidas.
    eq(withReviewNeeded(hardened, bindArrangement(v2, hardened, 2)), null);
    const v3 = parseSongSections(['[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    eq(withReviewNeeded(hardened, bindArrangement(v3, hardened, 3)), null, 'en v3 tampoco: ya está escrito');
    eq(bindArrangement(v3, hardened, 3).state, 'pending', 'y sigue pendiente');

    // Un arreglo que se puede seguir no provoca ninguna escritura.
    eq(withReviewNeeded(saved, bindArrangement(v1, saved, 1)), null, 'al día');
    const v1Again = parseSongSections(['[Intro]', 'X', '', '[Coro]', 'AAA', '', '[Puente]', 'BBB'].join('\n'));
    eq(bindArrangement(v1Again, saved, 2).state, 'rebound');
    eq(withReviewNeeded(saved, bindArrangement(v1Again, saved, 2)), null, 'reasignado sin dudas');
    eq(withReviewNeeded(undefined, binding), null, 'sin arreglo guardado no hay nada que anotar');

    // Nunca quita la marca: eso solo lo hace elegir la sección.
    const resolved = rebindArrangementSection(hardened, 'arr-1', listArrangementSources(v3)[0], 3);
    eq(resolved.sections[0].needsReview, undefined);
    eq(withReviewNeeded(resolved, bindArrangement(v3, resolved, 3)), null);
    eq(withReviewNeeded(hardened, bindArrangement(v3, resolved, 3)), null, 'una lectura limpia no borra lo anotado');

    // Y lo que se escribe es solo el arreglo: el resto de la entrada no viaja.
    const stored = sanitizeArrangement(JSON.parse(JSON.stringify(hardened)));
    eq(stored?.sections[0].needsReview, true);
    eq(bindArrangement(v3, stored, 3).state, 'pending');
  });

  it('duplicar un bloque pendiente y borrar el original deja la copia pendiente', () => {
    const renamed = parseSongSections(SONG.replace('[Puente]', '[Final]'));
    const binding = bindArrangement(renamed, custom(), 2);
    if (binding.state !== 'pending') throw new Error('pendiente');
    eq(binding.pendingIds, ['arr-6']);

    // El usuario duplica el bloque pendiente y borra el original.
    const duplicated = duplicateArrangementSection(binding.arrangement, 'arr-6', idSequence('copia'));
    const onlyCopy = removeArrangementSection(duplicated, 'arr-6');
    eq(onlyCopy.sections.map((entry) => entry.id), ['arr-1', 'arr-3', 'copia-1']);
    // La copia sigue sin poder demostrar qué toca: sigue pendiente y no se guarda.
    eq(pendingOf(bindArrangement(renamed, onlyCopy, 2)), ['copia-1']);
    eq(certifyArrangement(onlyCopy, 2, renamed), null, 'guardar sigue bloqueado');
    eq(arrangementSaveState({ arrangement: onlyCopy, pendingIds: ['copia-1'], reviewedVersion: 2, currentVersion: 2 }), 'pending');

    // Solo al elegir su sección explícitamente deja de estarlo.
    const chosen = rebindArrangementSection(onlyCopy, 'copia-1', sourceIn(renamed, 'Final'), 2);
    eq(pendingOf(bindArrangement(renamed, chosen, 2)), 'rebound');
    const saved = certifyArrangement(chosen, 2, renamed);
    eq([saved?.songVersion, saved?.sections.map((entry) => entry.source?.version)], [2, [2, 2, 2]]);
  });

  it('una versión más nueva no convierte un pendiente en revisado', () => {
    const v2Text = SONG.replace('[Puente]', '[Final]');
    const v2 = parseSongSections(v2Text);
    const v3 = parseSongSections(`${v2Text}

[Extra]
Otra cosa`);
    const pendingInV2 = bindArrangement(v2, custom(), 2);
    eq(pendingOf(pendingInV2), ['arr-6']);
    // Llega la versión 3 y se revisa otra vez: el bloque sigue sin poder demostrar nada.
    const inV3 = bindArrangement(v3, pendingInV2.state === 'pending' ? pendingInV2.arrangement : custom(), 3);
    eq(pendingOf(inV3), ['arr-6']);
    eq(playableArrangement(inV3), undefined);
    eq(certifyArrangement(pendingInV2.state === 'pending' ? pendingInV2.arrangement : custom(), 3, v3), null);
  });

  it('el arreglo se guarda entero: ni a medias ni contra otra versión', () => {
    const renamedAndTwice = parseSongSections(`${SONG.replace('[Puente]', '[Final]')}\n\n[Coro]\nLetra del coro`);
    const binding = bindArrangement(renamedAndTwice, custom(), 2);
    if (binding.state !== 'pending') throw new Error('pendiente');
    eq(binding.pendingIds, ['arr-3', 'arr-6'], 'dos bloques sin resolver');

    const ready = (arrangement: SetlistArrangement | null, pendingIds: string[], reviewed: number, current: number) =>
      arrangementSaveState({ arrangement, pendingIds, reviewedVersion: reviewed, currentVersion: current });
    eq(ready(binding.arrangement, binding.pendingIds, 2, 2), 'pending');

    const half = rebindArrangementSection(binding.arrangement, 'arr-3', listArrangementSources(renamedAndTwice)[2], 2);
    eq(pendingOf(bindArrangement(renamedAndTwice, half, 2)), ['arr-6'], 'resolver uno no certifica el otro');
    eq(certifyArrangement(half, 2, renamedAndTwice), null);

    const whole = certifyArrangement(rebindArrangementSection(half, 'arr-6', sourceIn(renamedAndTwice, 'Final'), 2), 2, renamedAndTwice)!;
    eq(ready(whole, [], 2, 2), 'ready');

    // Guardado y vuelto a leer desde el almacenamiento, no vuelve a quedar pendiente.
    const setlist = createSetlist({ name: 'Domingo', date: '', description: '' }, { now: NOW, createId: idSequence('s') });
    const storedOf = (arrangement: SetlistArrangement) =>
      parseStoredSetlists(
        JSON.stringify({
          version: SETLIST_STORAGE_VERSION,
          setlists: [{ ...setlist, items: [{ id: 'i-1', songId: 'x', moment: '', transposeSteps: 0, capoFret: 0, notes: '', arrangement }] }],
        })
      ).setlists[0].items[0].arrangement;
    eq(bindArrangement(renamedAndTwice, storedOf(whole), 2).state, 'current');
    eq(pendingOf(bindArrangement(renamedAndTwice, storedOf(half), 2)), ['arr-6'], 'lo guardado a medias sigue pendiente al reabrir');
  });

  it('una canción que cambia con el editor abierto no certifica lo revisado contra la anterior', () => {
    const reviewed = custom();
    const state = (current: number) =>
      arrangementSaveState({ arrangement: reviewed, pendingIds: [], reviewedVersion: 1, currentVersion: current });
    eq(state(1), 'ready');
    eq(state(2), 'song-changed', 'la canción cambió mientras se revisaba: no se guarda');
    eq(arrangementSaveState({ arrangement: null, pendingIds: [], reviewedVersion: 1, currentVersion: 2 }), 'ready');
    const again = bindArrangement(parseSongSections(SONG.replace('[Puente]', '[Final]')), reviewed, 2);
    eq(pendingOf(again), ['arr-6']);
    eq(again.state === 'pending' ? again.arrangement.sections[1].voices : [], ['women'], 'las voces elegidas siguen ahí');
  });

  it('las ediciones, las copias y el almacenamiento conservan la evidencia de cada bloque', () => {
    const saved = custom();
    const evidence = (arrangement: SetlistArrangement) => arrangement.sections.map((entry) => entry.source?.signature ?? null);
    eq(evidence(moveArrangementSection(saved, 'arr-6', 0)).length, 3);
    eq(evidence(removeArrangementSection(saved, 'arr-1')), evidence(saved).slice(1));
    eq(evidence(updateArrangementSection(saved, 'arr-1', { repeatCount: 2 })), evidence(saved));
    eq(evidence(duplicateArrangement(saved, idSequence('c'))), evidence(saved));
    eq(duplicateArrangementSection(saved, 'arr-3', idSequence('d')).sections[2].source, saved.sections[1].source, 'la copia hereda la evidencia del original');
    const stored = sanitizeArrangement(JSON.parse(JSON.stringify(saved)));
    eq([stored?.songVersion, evidence(stored!)], [1, evidence(saved)]);
    for (const source of [{ signature: 'x' }, { version: 2 }, { signature: 3, version: 2 }, 'x', null]) {
      const broken = sanitizeArrangement({ ...saved, sections: saved.sections.map((entry) => ({ ...entry, source })) });
      eq(broken?.sections.every((entry) => entry.source === undefined), true);
    }
    eq(arrangementVersionOf({ sections: saved.sections }), 1);
    eq(arrangementVersionOf(saved), 1);
  });
});
