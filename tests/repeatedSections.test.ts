import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { SongSection } from '../src/types/song';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { parseSongSections, transposeSongContent } from '../src/utils/chordParser';
import {
  createArrangement,
  matchesSongStructure,
  resolveArrangement,
  updateArrangementSection,
} from '../src/utils/arrangement';

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`repeatedSections.test: ${checks} comprobaciones`));

function idSequence(prefix = 'arr') {
  let count = 0;
  return () => `${prefix}-${++count}`;
}

/** The chords of a section, in order, as they are printed. */
const chordsOf = (section: SongSection | null | undefined) =>
  (section?.lines ?? []).flatMap((line) => (line.segments ?? []).flatMap((segment) => segment.chord ?? []));

const song = (...lines: string[]) => lines.join('\n');

describe('Una sección repetida trae su letra', () => {
  it('Verso · Coro · Verso · "Coro": el segundo coro muestra la letra completa', () => {
    const sections = parseSongSections(
      song('[Verso 1]', 'Primera estrofa', '', '[Coro]', 'Letra del coro', 'Segunda línea del coro', '', '[Verso 2]', 'Segunda estrofa', '', 'Coro')
    );
    eq(sections.map((section) => section.header?.label), ['Verso 1', 'Coro', 'Verso 2', 'Coro']);
    const [, first, , second] = sections;
    eq(second.repeatOf, first.id);
    eq(second.lines, first.lines, 'las mismas líneas, no una frase que las sustituya');
    eq(second.lines.map((line) => line.raw), ['Letra del coro', 'Segunda línea del coro']);
    eq(second.id === first.id, false, 'cada aparición conserva su propio id');
  });

  it('conserva acordes y su posición sobre las palabras', () => {
    const sections = parseSongSections(
      song('[Coro]', '[G]Sencillamente [D]Dios', 'Es[Em]tás aquí [C]conmigo', '', '[Verso]', 'Letra de la estrofa', '', 'Coro')
    );
    const first = sections[0];
    const repeated = sections[2];
    eq(chordsOf(repeated), ['G', 'D', 'Em', 'C']);
    eq(
      repeated.lines.map((line) => line.segments),
      first.lines.map((line) => line.segments),
      'mismos segmentos: cada acorde sobre la misma sílaba'
    );
  });

  it('transponer mueve todas las apariciones por igual', () => {
    const content = song('[Coro]', '[G]Canto [C]nuevo [D]hoy', '', '[Verso]', '[Em]Letra de la estrofa', '', 'Coro');
    const sections = parseSongSections(transposeSongContent(content, 2, 'G'));
    eq(chordsOf(sections[0]), ['A', 'D', 'E']);
    eq(chordsOf(sections[2]), ['A', 'D', 'E'], 'el coro repetido también sube un tono');
  });

  it('no repetir la letra cuando no se sabe cuál coro es', () => {
    const sections = parseSongSections(
      song('[Coro 1]', 'Primer coro', '', '[Coro 2]', 'Segundo coro distinto', '', '[Verso]', 'Letra de la estrofa', '', 'Coro')
    );
    const cue = sections[3];
    eq(cue.header?.label, 'Coro');
    eq(cue.repeatOf, undefined, 'dos coros distintos: no se elige uno al azar');
    eq(cue.lines, []);
  });

  it('un número dice cuál: "Coro 2" repite el segundo', () => {
    const sections = parseSongSections(
      song('[Coro 1]', 'Primer coro', '', '[Coro 2]', 'Segundo coro', '', '[Verso]', 'Letra de la estrofa', '', 'Coro 2')
    );
    eq(sections[3].repeatOf, sections[1].id);
    eq(sections[3].lines.map((line) => line.raw), ['Segundo coro']);
  });

  it('Coro y Estribillo no se confunden cuando la canción tiene los dos', () => {
    const sections = parseSongSections(
      song('[Coro]', 'Esto es el coro', '', '[Estribillo]', 'Esto es el estribillo', '', '[Verso]', 'Letra de la estrofa', '', 'Estribillo')
    );
    eq(sections[3].repeatOf, sections[1].id);
    eq(sections[3].lines.map((line) => line.raw), ['Esto es el estribillo']);
  });

  it('el mismo coro escrito dos veces sigue siendo uno solo', () => {
    const sections = parseSongSections(
      song('[Coro]', 'Igual', '', '[Verso]', 'Letra de la estrofa', '', '[Coro]', 'Igual', '', '[Verso]', 'Otra', '', 'Coro')
    );
    eq(sections[4].lines.map((line) => line.raw), ['Igual']);
  });

  it('no solo coros: cualquier sección que se vuelve a cantar', () => {
    const sections = parseSongSections(
      song('[Puente]', 'Puente escrito', '', '[Coro]', 'Coro escrito', '', 'Puente', 'Coro')
    );
    eq(sections[2].lines.map((line) => line.raw), ['Puente escrito']);
    eq(sections[3].lines.map((line) => line.raw), ['Coro escrito']);
  });

  it('Intro · V1 · Coro · V2 · Coro · Puente · Coro son siete secciones', () => {
    const sections = parseSongSections(
      song('[Intro]', '[C] [G]', '', '[Verso 1]', 'Uno', '', '[Coro]', 'Letra del coro', '', '[Verso 2]', 'Dos', '', 'Coro', '', '[Puente]', 'Letra del puente', '', 'Coro')
    );
    eq(sections.length, 7);
    eq(new Set(sections.map((section) => section.id)).size, 7, 'siete ids distintos');
    eq(
      sections.filter((section) => section.header?.label === 'Coro').map((section) => section.lines[0]?.raw),
      ['Letra del coro', 'Letra del coro', 'Letra del coro']
    );
  });
});

describe('Las repeticiones y los arreglos', () => {
  const sections = parseSongSections(
    song('[Verso 1]', 'Uno', '', '[Coro]', '[G]Letra del coro', '', '[Verso 2]', 'Dos', '', 'Coro')
  );

  it('×2 en el arreglo sigue siendo un solo bloque', () => {
    let arrangement = createArrangement(sections, idSequence());
    arrangement = updateArrangementSection(arrangement, 'arr-2', { repeatCount: 2 });
    const resolved = resolveArrangement(sections, arrangement);
    eq(resolved.length, 4);
    eq(resolved[1].repeatCount, 2);
    eq(resolved.filter((entry) => entry.repeatCount === 2).length, 1, 'un bloque marcado ×2, no dos bloques');
  });

  it('dos apariciones del coro son dos bloques, cada uno con su letra', () => {
    const resolved = resolveArrangement(sections, createArrangement(sections, idSequence()));
    const coros = resolved.filter((entry) => entry.label === 'Coro');
    eq(coros.length, 2);
    eq(coros.map((entry) => entry.sourceSectionId), ['section-2', 'section-4']);
    eq(coros[1].section?.lines, coros[0].section?.lines);
  });

  it('un arreglo guardado antes, que apuntaba al coro escrito, sigue siendo el original', () => {
    const old = createArrangement(sections, idSequence());
    old.sections[3] = { ...old.sections[3], sourceSectionId: 'section-2' };
    eq(matchesSongStructure(sections, old), true);
    eq(resolveArrangement(sections, old)[3].section?.lines, sections[1].lines);
  });
});

describe('El cancionero', () => {
  it('ninguna canción sustituye un coro por una frase', () => {
    for (const entry of MOCK_SONGS) {
      eq(/se repite el coro|repetir (el )?coro|repite (el )?coro|coro nuevamente|volver al coro/i.test(entry.content), false, entry.id);
    }
  });

  it('toda sección repetida del catálogo tiene su letra', () => {
    let repeated = 0;
    for (const entry of MOCK_SONGS) {
      for (const section of parseSongSections(entry.content)) {
        const isEmptyRepeat = section.header && section.header.kind !== 'otro' && section.lines.length === 0;
        eq(Boolean(isEmptyRepeat), false, `${entry.id} · ${section.id}`);
        if (section.repeatOf) {
          repeated++;
          eq(section.lines.length > 0, true, `${entry.id} · ${section.id}`);
        }
      }
    }
    eq(repeated, 38, 'las 38 repeticiones del catálogo, todas resueltas');
  });

  it('Vienen con alegría y Cirineo vuelven a mostrar su coro', () => {
    for (const id of ['vienen-con-alegria', 'cirineo']) {
      const found = MOCK_SONGS.find((entry) => entry.id === id)!;
      const sections = parseSongSections(found.content);
      const coros = sections.filter((section) => section.header?.label === 'Coro');
      eq(coros.length, 2, id);
      eq(coros[1].lines, coros[0].lines, id);
    }
  });
});
