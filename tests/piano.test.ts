import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SUPPORTED_QUALITIES } from '../src/utils/chordQuality';
import {
  LETTERS,
  getNoteIndex,
  normalizeStep,
  parseChordSymbol,
  parseKey,
  spellKeyScale,
  transposeChordBetweenKeys,
  transposeKey,
} from '../src/utils/chordTransposer';
import {
  DISPLAY_OCTAVE_OFFSET,
  getPianoChord,
  getPianoVoicing,
  getVoicingCount,
  type PianoChord,
} from '../src/utils/pianoChords';
import { BASE_KEYBOARD_KEYS, getKeyboardLayout, isBlackKey } from '../src/utils/pianoKeyboard';

let chordsTested = 0;
let voicingsTested = 0;
let checks = 0;
const ok = (condition: boolean, message: string) => {
  checks++;
  assert.ok(condition, message);
};
after(() => {
  console.log(`piano.test: ${chordsTested} acordes, ${voicingsTested} voicings, ${checks} comprobaciones`);
});

/**
 * Chord theory written independently of the engine: each tone as
 * [semitones above the root, letters above the root]. A ninth is 14 semitones
 * and one letter (it is placed above the rest of the chord).
 */
const QUALITY_TABLE: Array<{ quality: string; suffix: string; tones: Array<[number, number]> }> = [
  { quality: 'major', suffix: '', tones: [[0, 0], [4, 2], [7, 4]] },
  { quality: 'minor', suffix: 'm', tones: [[0, 0], [3, 2], [7, 4]] },
  { quality: 'dom7', suffix: '7', tones: [[0, 0], [4, 2], [7, 4], [10, 6]] },
  { quality: 'maj7', suffix: 'maj7', tones: [[0, 0], [4, 2], [7, 4], [11, 6]] },
  { quality: 'm7', suffix: 'm7', tones: [[0, 0], [3, 2], [7, 4], [10, 6]] },
  { quality: 'sus2', suffix: 'sus2', tones: [[0, 0], [2, 1], [7, 4]] },
  { quality: 'sus4', suffix: 'sus4', tones: [[0, 0], [5, 3], [7, 4]] },
  { quality: 'dom7sus4', suffix: '7sus4', tones: [[0, 0], [5, 3], [7, 4], [10, 6]] },
  { quality: 'add9', suffix: 'add9', tones: [[0, 0], [4, 2], [7, 4], [14, 1]] },
  { quality: 'madd9', suffix: 'madd9', tones: [[0, 0], [3, 2], [7, 4], [14, 1]] },
  { quality: 'dim', suffix: 'dim', tones: [[0, 0], [3, 2], [6, 4]] },
  { quality: 'dim7', suffix: 'dim7', tones: [[0, 0], [3, 2], [6, 4], [9, 6]] },
  { quality: 'm7b5', suffix: 'm7b5', tones: [[0, 0], [3, 2], [6, 4], [10, 6]] },
  { quality: 'aug', suffix: 'aug', tones: [[0, 0], [4, 2], [8, 4]] },
  { quality: 'maj6', suffix: '6', tones: [[0, 0], [4, 2], [7, 4], [9, 5]] },
  { quality: 'min6', suffix: 'm6', tones: [[0, 0], [3, 2], [7, 4], [9, 5]] },
  { quality: 'dom9', suffix: '9', tones: [[0, 0], [4, 2], [7, 4], [10, 6], [14, 1]] },
  { quality: 'm9', suffix: 'm9', tones: [[0, 0], [3, 2], [7, 4], [10, 6], [14, 1]] },
  { quality: 'maj9', suffix: 'maj9', tones: [[0, 0], [4, 2], [7, 4], [11, 6], [14, 1]] },
];

const ROOT_SPELLINGS = ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B'];

const namesOf = (chord: string) => getPianoChord(chord)!.noteNames;
const voicingNames = (chord: PianoChord, inversion: number) =>
  getPianoVoicing(chord, inversion).notes.map((note) => note.name);

describe('Motor de piano: todas las calidades en todas las fundamentales', () => {
  it('la tabla de teoría cubre exactamente las calidades soportadas', () => {
    assert.deepEqual(
      [...QUALITY_TABLE.map((entry) => entry.quality)].sort(),
      [...SUPPORTED_QUALITIES].sort()
    );
  });

  it('notas, intervalos, ortografía e inversiones', () => {
    for (const root of ROOT_SPELLINGS) {
      const rootPitchClass = getNoteIndex(root)!;
      const rootLetter = LETTERS.indexOf(root[0]);

      for (const { suffix, tones: expectedTones } of QUALITY_TABLE) {
        const symbol = `${root}${suffix}`;
        const chord = getPianoChord(symbol);
        chordsTested++;

        ok(chord !== null, `${symbol}: reconocido`);
        ok(!chord!.approximate, `${symbol}: calidad exacta`);
        ok(chord!.root.name === root, `${symbol}: fundamental ${root}`);
        ok(chord!.tones.length === expectedTones.length, `${symbol}: ${expectedTones.length} notas`);

        chord!.tones.forEach((tone, index) => {
          const [semitones, letters] = expectedTones[index];
          ok(tone.pitchClass === normalizeStep(rootPitchClass + semitones), `${symbol}: nota ${index} a ${semitones} semitonos`);
          ok(tone.name[0] === LETTERS[(rootLetter + letters) % 7], `${symbol}: ${tone.name} en la letra correcta`);
          ok(getNoteIndex(tone.name) === tone.pitchClass, `${symbol}: el nombre ${tone.name} suena como la nota`);
        });
        ok(new Set(chord!.pitchClasses).size === chord!.pitchClasses.length, `${symbol}: sin notas repetidas`);
        ok(getVoicingCount(chord!) === expectedTones.length, `${symbol}: una inversión por nota`);

        for (let inversion = 0; inversion < expectedTones.length; inversion++) {
          const voicing = getPianoVoicing(chord!, inversion);
          const positions = voicing.notes.map((note) => note.position);
          voicingsTested++;

          ok(voicing.inversion === inversion, `${symbol} inv ${inversion}: índice`);
          ok(voicing.notes.length === expectedTones.length, `${symbol} inv ${inversion}: número de notas`);
          ok(positions.every((position, i) => i === 0 || position > positions[i - 1]), `${symbol} inv ${inversion}: orden ascendente`);
          ok(
            new Set(voicing.notes.map((note) => note.pitchClass)).size === voicing.notes.length,
            `${symbol} inv ${inversion}: sin duplicados`
          );
          ok(
            [...voicing.notes.map((note) => note.pitchClass)].sort().join() === [...chord!.pitchClasses].sort().join(),
            `${symbol} inv ${inversion}: mismas notas que el acorde`
          );

          const bassTone = chord!.tones[inversion];
          ok(voicing.notes[0].pitchClass === bassTone.pitchClass, `${symbol} inv ${inversion}: ${bassTone.name} en el bajo`);
          ok(positions[0] === bassTone.pitchClass, `${symbol} inv ${inversion}: el bajo empieza en la primera octava`);

          voicing.notes.forEach((note) => {
            ok(note.octave === Math.floor(note.position / 12), `${symbol} inv ${inversion}: octava de ${note.name}`);
            ok(note.isRoot === (note.pitchClass === rootPitchClass), `${symbol} inv ${inversion}: fundamental marcada`);
            ok(!note.isBass, `${symbol} inv ${inversion}: una inversión no tiene bajo escrito`);
          });

          if (inversion === 0) {
            // Root position is the chord as written, at its exact intervals.
            ok(
              positions.join() === expectedTones.map(([semitones]) => rootPitchClass + semitones).join(),
              `${symbol}: posición fundamental exacta`
            );
          } else {
            ok(
              positions.slice(1).every((position) => position > positions[0] && position < positions[0] + 12),
              `${symbol} inv ${inversion}: el resto cerrado sobre el bajo`
            );
            // Chords within an octave: an inversion is a rotation of the chord.
            if (expectedTones.every(([semitones]) => semitones < 12)) {
              const names = chord!.noteNames;
              ok(
                voicingNames(chord!, inversion).join() === [...names.slice(inversion), ...names.slice(0, inversion)].join(),
                `${symbol} inv ${inversion}: rotación de las notas`
              );
            }
          }

          const layout = getKeyboardLayout(Math.max(...positions));
          ok(layout.end >= Math.max(...positions) && !isBlackKey(layout.end), `${symbol} inv ${inversion}: teclado suficiente`);
          if (Math.max(...positions) < BASE_KEYBOARD_KEYS) {
            ok(layout.end === BASE_KEYBOARD_KEYS - 1, `${symbol} inv ${inversion}: mismo rango de siempre`);
          }
          for (const position of positions) {
            const key = [...layout.whiteKeys, ...layout.blackKeys].find((candidate) => candidate.position === position);
            ok(key !== undefined && key.pitchClass === normalizeStep(position), `${symbol}: tecla para la posición ${position}`);
          }
        }
      }
    }
  });
});

describe('Ortografía de los acordes pedidos', () => {
  const expected: Record<string, string[]> = {
    C: ['C', 'E', 'G'], D: ['D', 'F#', 'A'], E: ['E', 'G#', 'B'], F: ['F', 'A', 'C'],
    G: ['G', 'B', 'D'], A: ['A', 'C#', 'E'], B: ['B', 'D#', 'F#'],
    Cm: ['C', 'Eb', 'G'], Dm: ['D', 'F', 'A'], Em: ['E', 'G', 'B'], Fm: ['F', 'Ab', 'C'],
    Gm: ['G', 'Bb', 'D'], Am: ['A', 'C', 'E'], Bm: ['B', 'D', 'F#'],
    C7: ['C', 'E', 'G', 'Bb'], D7: ['D', 'F#', 'A', 'C'], G7: ['G', 'B', 'D', 'F'], A7: ['A', 'C#', 'E', 'G'],
    Cmaj7: ['C', 'E', 'G', 'B'], Dmaj7: ['D', 'F#', 'A', 'C#'], Fmaj7: ['F', 'A', 'C', 'E'], Gmaj7: ['G', 'B', 'D', 'F#'],
    Cm7: ['C', 'Eb', 'G', 'Bb'], Dm7: ['D', 'F', 'A', 'C'], Em7: ['E', 'G', 'B', 'D'], Am7: ['A', 'C', 'E', 'G'], Bm7: ['B', 'D', 'F#', 'A'],
    Csus2: ['C', 'D', 'G'], Dsus2: ['D', 'E', 'A'], Asus2: ['A', 'B', 'E'],
    Csus4: ['C', 'F', 'G'], Dsus4: ['D', 'G', 'A'], Gsus4: ['G', 'C', 'D'], Asus4: ['A', 'D', 'E'],
    Cadd9: ['C', 'E', 'G', 'D'], Dadd9: ['D', 'F#', 'A', 'E'], Gadd9: ['G', 'B', 'D', 'A'],
    Cdim: ['C', 'Eb', 'Gb'], Ddim: ['D', 'F', 'Ab'], Bdim: ['B', 'D', 'F'],
    Caug: ['C', 'E', 'G#'],
    // The fifth of E augmented is a raised fifth: B#, the same key as C.
    Eaug: ['E', 'G#', 'B#'],
    Eb: ['Eb', 'G', 'Bb'], Ab: ['Ab', 'C', 'Eb'], Bb: ['Bb', 'D', 'F'], Db: ['Db', 'F', 'Ab'],
    'F#': ['F#', 'A#', 'C#'], 'C#': ['C#', 'E#', 'G#'], Gb: ['Gb', 'Bb', 'Db'],
    // Theoretical spellings are kept, never simplified.
    Abm: ['Ab', 'Cb', 'Eb'], Dbm: ['Db', 'Fb', 'Ab'], Cb: ['Cb', 'Eb', 'Gb'], 'D#': ['D#', 'F##', 'A#'],
  };

  for (const [symbol, names] of Object.entries(expected)) {
    it(`${symbol} = ${names.join(' ')}`, () => {
      assert.deepEqual(namesOf(symbol), names);
      ok(true, symbol);
    });
  }

  it('Eaug suena E G# C aunque se escriba B#', () => {
    assert.deepEqual(getPianoChord('Eaug')!.pitchClasses, [4, 8, 0]);
  });
});

describe('Inversiones y octavas', () => {
  it('C: C4 E4 G4 · E4 G4 C5 · G4 C5 E5', () => {
    const chord = getPianoChord('C')!;
    const labels = [0, 1, 2].map((inversion) =>
      getPianoVoicing(chord, inversion)
        .notes.map((note) => `${note.name}${note.octave + DISPLAY_OCTAVE_OFFSET}`)
        .join(' ')
    );
    assert.deepEqual(labels, ['C4 E4 G4', 'E4 G4 C5', 'G4 C5 E5']);
    assert.deepEqual(getPianoVoicing(chord, 1).notes.map((note) => note.position), [4, 7, 12]);
    assert.deepEqual(getPianoVoicing(chord, 2).notes.map((note) => note.position), [7, 12, 16]);
  });

  it('Cmaj7 tiene 4 posiciones', () => {
    const chord = getPianoChord('Cmaj7')!;
    assert.equal(getVoicingCount(chord), 4);
    assert.deepEqual(
      [0, 1, 2, 3].map((inversion) => voicingNames(chord, inversion).join(' ')),
      ['C E G B', 'E G B C', 'G B C E', 'B C E G']
    );
  });

  it('la cantidad sale del número de notas', () => {
    assert.equal(getVoicingCount(getPianoChord('C')!), 3);
    assert.equal(getVoicingCount(getPianoChord('G7')!), 4);
    assert.equal(getVoicingCount(getPianoChord('Cadd9')!), 4);
    assert.equal(getVoicingCount(getPianoChord('C9')!), 5);
    assert.equal(getVoicingCount(getPianoChord('D/F#')!), 1);
  });
});

describe('Slash chords', () => {
  const cases: Array<{ symbol: string; tones: string[]; voicing: string[]; positions: number[]; bassInChord: boolean }> = [
    { symbol: 'D/F#', tones: ['D', 'F#', 'A'], voicing: ['F#', 'A', 'D'], positions: [6, 9, 14], bassInChord: true },
    { symbol: 'G/B', tones: ['G', 'B', 'D'], voicing: ['B', 'D', 'G'], positions: [11, 14, 19], bassInChord: true },
    { symbol: 'C/E', tones: ['C', 'E', 'G'], voicing: ['E', 'G', 'C'], positions: [4, 7, 12], bassInChord: true },
    { symbol: 'Am/G', tones: ['A', 'C', 'E'], voicing: ['G', 'A', 'C', 'E'], positions: [7, 9, 12, 16], bassInChord: false },
    { symbol: 'Eb/G', tones: ['Eb', 'G', 'Bb'], voicing: ['G', 'Bb', 'Eb'], positions: [7, 10, 15], bassInChord: true },
    { symbol: 'Ab/C', tones: ['Ab', 'C', 'Eb'], voicing: ['C', 'Eb', 'Ab'], positions: [0, 3, 8], bassInChord: true },
    { symbol: 'C/Bb', tones: ['C', 'E', 'G'], voicing: ['Bb', 'C', 'E', 'G'], positions: [10, 12, 16, 19], bassInChord: false },
  ];

  for (const { symbol, tones, voicing, positions, bassInChord } of cases) {
    it(`${symbol}: acorde ${tones.join(' ')}, bajo ${symbol.split('/')[1]}`, () => {
      const chord = getPianoChord(symbol)!;
      const notes = getPianoVoicing(chord).notes;
      chordsTested++;
      voicingsTested++;
      assert.deepEqual(chord.noteNames, tones);
      assert.equal(chord.bass!.name, symbol.split('/')[1]);
      assert.equal(chord.bass!.isChordTone, bassInChord);
      assert.deepEqual(notes.map((note) => note.name), voicing);
      assert.deepEqual(notes.map((note) => note.position), positions);
      assert.deepEqual(notes.map((note) => note.isBass), [true, ...notes.slice(1).map(() => false)]);
      // The bass is never repeated as a second, separate note.
      assert.equal(new Set(notes.map((note) => note.pitchClass)).size, notes.length);
      assert.equal(getVoicingCount(chord), 1);
      assert.deepEqual(getPianoVoicing(chord, 2).notes, notes);
    });
  }
});

describe('Teclado físico: nombre → pitch class → tecla', () => {
  const layout = getKeyboardLayout(0);
  const allKeys = [...layout.whiteKeys, ...layout.blackKeys];
  const keyAt = (position: number) => allKeys.find((key) => key.position === position)!;

  it('dos octavas completas: 14 blancas y 10 negras', () => {
    assert.equal(layout.whiteKeys.length, 14);
    assert.equal(layout.blackKeys.length, 10);
  });

  it('cada negra está entre sus dos blancas vecinas', () => {
    for (const black of layout.blackKeys) {
      const left = keyAt(black.position - 1);
      const right = keyAt(black.position + 1);
      ok(!left.isBlack && !right.isBlack, `${black.position}: vecinas blancas`);
      ok(black.x > left.x && black.x + black.width < right.x + right.width, `${black.position}: dentro de sus vecinas`);
      ok(black.x < right.x && black.x + black.width > right.x, `${black.position}: sobre la separación`);
    }
  });

  it('las escrituras enarmónicas iluminan la misma tecla', () => {
    const pairs: Array<[string, string, boolean]> = [
      ['C#', 'Db', true], ['D#', 'Eb', true], ['F#', 'Gb', true], ['G#', 'Ab', true], ['A#', 'Bb', true],
      ['E#', 'F', false], ['B#', 'C', false], ['Cb', 'B', false], ['Fb', 'E', false], ['F##', 'G', false], ['Bbb', 'A', false],
    ];
    for (const [a, b, black] of pairs) {
      ok(getNoteIndex(a) === getNoteIndex(b), `${a} y ${b} son la misma tecla`);
      ok(keyAt(getNoteIndex(a)!).isBlack === black, `${a}: tecla ${black ? 'negra' : 'blanca'}`);
    }
    const expectedPositions: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, 'G#': 8, Ab: 8, 'A#': 10, Bb: 10, B: 11 };
    for (const [name, position] of Object.entries(expectedPositions)) {
      ok(getNoteIndex(name) === position, `${name} en la posición ${position}`);
    }
  });

  it('Db ilumina la negra entre C y D, F y la negra entre G y A', () => {
    const positions = getPianoVoicing(getPianoChord('Db')!).notes.map((note) => note.position);
    assert.deepEqual(positions, [1, 5, 8]);
    assert.deepEqual(positions.map((position) => keyAt(position).isBlack), [true, false, true]);
  });

  it('solo las novenas en posición fundamental sobre A# o B necesitan más teclas', () => {
    assert.equal(getKeyboardLayout(Math.max(...getPianoVoicing(getPianoChord('B9')!).notes.map((n) => n.position))).end, 26);
    assert.equal(getKeyboardLayout(Math.max(...getPianoVoicing(getPianoChord('B9')!, 1).notes.map((n) => n.position))).end, 23);
  });
});

describe('Transposición + piano en los 12 semitonos', () => {
  const cases: Array<[string, string]> = [
    ['G', 'G'], ['Em', 'G'], ['Cmaj7', 'G'], ['Am7', 'G'], ['Dsus4', 'G'], ['Gadd9', 'G'],
    ['Bdim', 'C'], ['Caug', 'C'], ['D/F#', 'G'], ['G/B', 'G'], ['Eb/G', 'Eb'], ['Ab/C', 'Ab'],
  ];

  it('G sube Ab, A, Bb, B, C, Db, D, Eb, E, F, F#', () => {
    const names = Array.from({ length: 12 }, (_, steps) =>
      steps === 0 ? 'G' : transposeChordBetweenKeys('G', 'G', transposeKey('G', steps))
    );
    assert.deepEqual(names, ['G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#']);
  });

  it('fundamental, calidad, notas, inversiones, bajo y ortografía', () => {
    for (const [symbol, key] of cases) {
      const base = getPianoChord(symbol)!;
      const baseParsed = parseChordSymbol(symbol)!;

      for (let steps = 0; steps < 12; steps++) {
        const toKey = transposeKey(key, steps);
        const moved = steps === 0 ? symbol : transposeChordBetweenKeys(symbol, key, toKey);
        const parsed = parseChordSymbol(moved)!;
        const chord = getPianoChord(moved)!;
        const label = `${symbol} ${steps >= 0 ? '+' : ''}${steps} → ${moved} (en ${toKey})`;
        chordsTested++;

        ok(chord.root.pitchClass === normalizeStep(base.root.pitchClass + steps), `${label}: fundamental`);
        ok(parsed.suffix === baseParsed.suffix, `${label}: calidad conservada`);
        ok(
          chord.pitchClasses.join() === base.pitchClasses.map((pc) => normalizeStep(pc + steps)).join(),
          `${label}: notas del piano`
        );
        ok(chord.tones.every((tone) => getNoteIndex(tone.name) === tone.pitchClass), `${label}: nombres coherentes`);
        ok((chord.bass === null) === (base.bass === null), `${label}: slash conservado`);
        if (chord.bass && base.bass) {
          ok(chord.bass.pitchClass === normalizeStep(base.bass.pitchClass + steps), `${label}: bajo`);
          ok(chord.bass.isChordTone === base.bass.isChordTone, `${label}: el bajo sigue siendo nota del acorde`);
        }

        ok(getVoicingCount(chord) === getVoicingCount(base), `${label}: número de inversiones`);
        for (let inversion = 0; inversion < getVoicingCount(chord); inversion++) {
          const shape = (c: PianoChord) => {
            const notes = getPianoVoicing(c, inversion).notes;
            return notes.map((note) => note.position - notes[0].position).join();
          };
          voicingsTested++;
          ok(shape(chord) === shape(base), `${label} inv ${inversion}: misma forma`);
        }

        const scale = spellKeyScale(parseKey(toKey)!);
        ok(scale !== null, `${label}: tonalidad escribible`);
        for (const note of [parsed.root, parsed.bass].filter((n): n is string => n !== null)) {
          ok(!/##|bb/.test(note), `${label}: ${note} sin dobles alteraciones`);
          const diatonic = scale!.find((scaleNote) => getNoteIndex(scaleNote) === getNoteIndex(note));
          if (diatonic) ok(diatonic === note, `${label}: ${note} se escribe ${diatonic} en ${toKey}`);
        }
      }
    }
  });
});
