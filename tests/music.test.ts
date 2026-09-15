import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MOCK_SONGS } from '../src/data/mockSongs';
import { CHORD_DATABASE, CHORD_VARIATIONS } from '../src/data/chordDictionary';
import {
  SHARPS,
  getNoteIndex,
  parseChordSymbol,
  parseKey,
  spellKeyScale,
  transposeChordBetweenKeys,
  transposeKey,
} from '../src/utils/chordTransposer';
import {
  extractUniqueChords,
  groupIntoWords,
  inferKeyFromContent,
  parseBracketLine,
  transposeSongContent,
} from '../src/utils/chordParser';
import { OPEN_STRING_PITCH_CLASSES, getGuitarPositions } from '../src/utils/guitarChords';
import { getPianoChord } from '../src/utils/pianoChords';

let checks = 0;
const ok = (condition: boolean, message: string) => {
  checks++;
  assert.ok(condition, message);
};
after(() => console.log(`music.test: ${checks} comprobaciones`));

const range = (length: number) => Array.from({ length }, (_, index) => index);

describe('Nombre de la tonalidad al transponer', () => {
  it('elige la armadura con menos alteraciones', () => {
    assert.deepEqual(range(12).map((steps) => transposeKey('C', steps)), ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
    assert.deepEqual(range(12).map((steps) => transposeKey('Am', steps)), ['Am', 'Bbm', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m']);
  });

  it('G sube por Ab, A, Bb, B, C, Db, D, Eb, E, F, F#', () => {
    assert.deepEqual(range(12).map((steps) => transposeKey('G', steps)), ['G', 'Ab', 'A', 'Bb', 'B', 'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#']);
  });

  it('en empate (F#/Gb, D#m/Ebm) mantiene la dirección de la tonalidad original', () => {
    assert.equal(transposeKey('D', 4), 'F#');
    assert.equal(transposeKey('F', 1), 'Gb');
    assert.equal(transposeKey('Bb', 8), 'Gb');
    assert.equal(transposeKey('Em', 11), 'D#m');
    assert.equal(transposeKey('Dm', 1), 'Ebm');
  });

  it('sin transposición conserva el nombre escrito', () => {
    assert.equal(transposeKey('C#', 0), 'C#');
    assert.equal(transposeKey('C#', 12), 'C#');
    assert.equal(transposeKey('Gb', -12), 'Gb');
  });

  it('nunca produce una tonalidad con dobles alteraciones', () => {
    for (const tonic of ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']) {
      for (const minor of ['', 'm']) {
        for (let steps = 1; steps < 12; steps++) {
          const key = transposeKey(`${tonic}${minor}`, steps);
          ok(spellKeyScale(parseKey(key)!) !== null, `${tonic}${minor} +${steps} → ${key}`);
        }
      }
    }
  });
});

describe('Acordes escritos según la tonalidad destino', () => {
  const move = (chords: string[], from: string, to: string) => chords.map((chord) => transposeChordBetweenKeys(chord, from, to));

  it('G → Ab', () => {
    assert.deepEqual(
      move(['G', 'C', 'D', 'Em', 'Am7', 'D/F#', 'G/B', 'B7', 'A7', 'C/E', 'Cadd9', 'Dsus4'], 'G', 'Ab'),
      ['Ab', 'Db', 'Eb', 'Fm', 'Bbm7', 'Eb/G', 'Ab/C', 'C7', 'Bb7', 'Db/F', 'Dbadd9', 'Ebsus4']
    );
  });

  it('Ab → A: de bemoles a sostenidos', () => {
    assert.deepEqual(move(['Ab', 'Db', 'Eb', 'Fm', 'Eb/G', 'Ab/C'], 'Ab', 'A'), ['A', 'D', 'E', 'F#m', 'E/G#', 'A/C#']);
  });

  it('G → Bb, Eb y Db', () => {
    const song = ['G', 'D/F#', 'Em', 'C', 'Am7', 'B7'];
    assert.deepEqual(move(song, 'G', 'Bb'), ['Bb', 'F/A', 'Gm', 'Eb', 'Cm7', 'D7']);
    assert.deepEqual(move(song, 'G', 'Eb'), ['Eb', 'Bb/D', 'Cm', 'Ab', 'Fm7', 'G7']);
    assert.deepEqual(move(song, 'G', 'Db'), ['Db', 'Ab/C', 'Bbm', 'Gb', 'Ebm7', 'F7']);
  });

  it('G → F# y C#: E# y B# cuando la tonalidad los usa', () => {
    const song = ['G', 'D/F#', 'Em', 'C', 'Am7', 'B7'];
    assert.deepEqual(move(song, 'G', 'F#'), ['F#', 'C#/E#', 'D#m', 'B', 'G#m7', 'A#7']);
    assert.deepEqual(move(song, 'G', 'C#'), ['C#', 'G#/B#', 'A#m', 'F#', 'D#m7', 'E#7']);
  });

  it('un acorde cromático conserva su función: D#dim en G es Edim en Ab', () => {
    assert.equal(transposeChordBetweenKeys('D#dim', 'G', 'Ab'), 'Edim');
  });

  it('una canción sin tonalidad toma su primer acorde', () => {
    assert.equal(inferKeyFromContent('[Em]Hola [C]mundo'), 'Em');
    assert.equal(inferKeyFromContent('[D]Hola [A]mundo'), 'D');
    assert.equal(inferKeyFromContent('Sin acordes'), null);
  });
});

describe('Las 80 canciones en los 12 tonos', () => {
  it('conservan sonido y calidad, se escriben en la tonalidad y vuelven intactas', () => {
    let transpositions = 0;
    for (const song of MOCK_SONGS) {
      const original = extractUniqueChords(song.content);
      if (original.length === 0) continue;
      const fromKey = song.originalKey || inferKeyFromContent(song.content)!;

      for (let steps = 1; steps < 12; steps++) {
        const toKey = transposeKey(fromKey, steps);
        const scale = spellKeyScale(parseKey(toKey)!);
        const moved = transposeSongContent(song.content, steps, song.originalKey);
        const movedChords = extractUniqueChords(moved);
        transpositions++;

        ok(scale !== null, `${song.id} +${steps}: ${toKey} es escribible`);
        ok(movedChords.length === original.length, `${song.id} +${steps}: mismos acordes`);

        original.forEach((chord, index) => {
          const before = parseChordSymbol(chord)!;
          const after = parseChordSymbol(movedChords[index])!;
          const label = `${song.id} +${steps}: ${chord} → ${movedChords[index]} (en ${toKey})`;
          ok(getNoteIndex(after.root) === (getNoteIndex(before.root)! + steps) % 12, `${label}: fundamental`);
          ok(after.suffix === before.suffix, `${label}: calidad`);
          ok((before.bass === null) === (after.bass === null), `${label}: bajo`);
          if (before.bass && after.bass) {
            ok(getNoteIndex(after.bass) === (getNoteIndex(before.bass)! + steps) % 12, `${label}: bajo transpuesto`);
          }
          for (const note of [after.root, after.bass].filter((n): n is string => n !== null)) {
            ok(!/##|bb/.test(note), `${label}: sin dobles alteraciones`);
            const diatonic = scale!.find((scaleNote) => getNoteIndex(scaleNote) === getNoteIndex(note));
            if (diatonic) ok(diatonic === note, `${label}: ${note} debería ser ${diatonic}`);
          }
        });

        ok(transposeSongContent(moved, 12 - steps, toKey) === song.content, `${song.id} +${steps}: ida y vuelta`);
      }
    }
    ok(transpositions > 0, 'hubo canciones con acordes');
  });
});

describe('Guitarra', () => {
  const soundedPitchClasses = (frets: number[]) =>
    frets.flatMap((fret, string) => (fret < 0 ? [] : [(OPEN_STRING_PITCH_CLASSES[string] + fret) % 12]));
  // By real pitch, not string order: the lowest string isn't always the lowest note.
  const TUNING_MIDI = [40, 45, 50, 55, 59, 64];
  const lowestPitchClass = (frets: number[]) =>
    Math.min(...frets.flatMap((fret, string) => (fret < 0 ? [] : [TUNING_MIDI[string] + fret]))) % 12;

  const checkShape = (chordName: string, frets: number[], source: string) => {
    const piano = getPianoChord(chordName)!;
    const allowed = new Set([...piano.pitchClasses, ...(piano.bass ? [piano.bass.pitchClass] : [])]);
    const sounded = soundedPitchClasses(frets);
    ok(sounded.every((pc) => allowed.has(pc)), `${source} ${chordName} [${frets}]: solo notas del acorde`);
    ok(sounded.includes(piano.root.pitchClass), `${source} ${chordName} [${frets}]: con fundamental`);
    if (piano.bass) ok(lowestPitchClass(frets) === piano.bass.pitchClass, `${source} ${chordName} [${frets}]: bajo ${piano.bass.name}`);
  };

  it('toda posición suena el acorde que dice ser', () => {
    for (const [name, position] of Object.entries(CHORD_DATABASE)) checkShape(name, position.frets, 'diccionario');
    for (const [name, list] of Object.entries(CHORD_VARIATIONS)) {
      for (const variation of list) checkShape(name, variation.position.frets, 'variación');
    }
    for (const root of ['C', 'C#', 'Db', 'D', 'D#', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'G#', 'Ab', 'A', 'A#', 'Bb', 'B']) {
      for (const suffix of ['', 'm', '7', 'm7', 'maj7', 'sus2', 'sus4', 'dim', '9']) {
        for (const guitar of getGuitarPositions(root + suffix)) {
          if (!guitar.approximate) checkShape(root + suffix, guitar.position.frets, 'calculada');
        }
      }
    }
  });

  it('escribir un acorde con bemoles no le quita la digitación de su equivalente con sostenidos', () => {
    const sharpSpelling = (chord: string) => {
      const parsed = parseChordSymbol(chord)!;
      const root = SHARPS[getNoteIndex(parsed.root)!];
      const bass = parsed.bass ? `/${SHARPS[getNoteIndex(parsed.bass)!]}` : '';
      return `${root}${parsed.suffix}${bass}`;
    };
    const seen = new Set<string>();
    for (const song of MOCK_SONGS) {
      if (!song.originalKey) continue;
      for (let steps = 1; steps < 12; steps++) {
        for (const chord of extractUniqueChords(transposeSongContent(song.content, steps, song.originalKey))) {
          if (seen.has(chord)) continue;
          seen.add(chord);
          const spelled = getGuitarPositions(chord);
          const sharp = getGuitarPositions(sharpSpelling(chord));
          ok(
            JSON.stringify(spelled.map((p) => [p.position.frets, p.approximate])) ===
              JSON.stringify(sharp.map((p) => [p.position.frets, p.approximate])),
            `${chord} y ${sharpSpelling(chord)} tienen las mismas posiciones`
          );
        }
      }
    }
    ok(seen.size > 0, 'se revisaron acordes');
  });
});

describe('Slash chords de guitarra', () => {
  // Standard tuning as MIDI pitches, written here independently of the engine.
  const TUNING_MIDI = [40, 45, 50, 55, 59, 64];
  let positionsValidated = 0;
  after(() => console.log(`slash chords de guitarra: ${positionsValidated} posiciones validadas`));

  const fretsLabel = (frets: number[]) => frets.map((fret) => (fret < 0 ? 'x' : fret)).join(' ');

  /** Checks one position against theory and the hand, without using the guitar engine. */
  const validatePosition = (chordName: string, frets: number[], fingers: number[] | undefined, label: string) => {
    positionsValidated++;
    const chord = getPianoChord(chordName)!;
    const bass = chord.bass!;

    ok(frets.length === 6 && frets.every((fret) => Number.isInteger(fret) && fret >= -1 && fret <= 15), `${label}: trastes válidos`);
    const sounding = frets.flatMap((fret, string) => (fret < 0 ? [] : [{ string, pitch: TUNING_MIDI[string] + fret }]));
    ok(sounding.length >= 4, `${label}: suenan al menos 4 cuerdas`);

    const pitchClasses = sounding.map((note) => note.pitch % 12);
    const allowed = new Set([...chord.pitchClasses, bass.pitchClass]);
    ok(pitchClasses.every((pc) => allowed.has(pc)), `${label}: ninguna nota ajena al acorde`);
    const required = chord.tones.filter((tone) => tone.semitones !== 7).map((tone) => tone.pitchClass);
    ok(required.every((pc) => pitchClasses.includes(pc)), `${label}: están las notas del acorde`);

    ok(Math.min(...sounding.map((note) => note.pitch)) % 12 === bass.pitchClass, `${label}: la nota más grave es ${bass.name}`);
    ok(sounding[0].pitch % 12 === bass.pitchClass, `${label}: la cuerda más grave que suena da ${bass.name}`);

    const fretted = frets.filter((fret) => fret > 0);
    if (fretted.length > 0) ok(Math.max(...fretted) - Math.min(...fretted) <= 3, `${label}: cabe en cuatro trastes`);

    if (fingers && fingers.some((finger) => finger > 0)) {
      const used = new Set(frets.flatMap((fret, string) => (fret > 0 ? [fingers[string]] : [])));
      ok([...used].every((finger) => finger >= 1 && finger <= 4), `${label}: cada nota pisada tiene dedo 1-4`);
      for (const finger of used) {
        const strings = frets.flatMap((fret, string) => (fret > 0 && fingers[string] === finger ? [string] : []));
        if (strings.length < 2) continue;
        const barreFret = frets[strings[0]];
        ok(strings.every((string) => frets[string] === barreFret), `${label}: el dedo ${finger} pisa un solo traste`);
        ok(
          frets.slice(Math.min(...strings), Math.max(...strings) + 1).every((fret) => fret >= barreFret),
          `${label}: la cejilla no cruza cuerdas al aire ni apagadas`
        );
      }
    }
  };

  const validateChord = (chordName: string) => {
    const positions = getGuitarPositions(chordName);
    ok(positions.length > 0, `${chordName}: tiene al menos una posición`);
    positions.forEach((guitar, index) => {
      const label = `${chordName} #${index + 1} [${fretsLabel(guitar.position.frets)}]`;
      ok(!guitar.approximate, `${label}: nunca aproximado`);
      ok(guitar.description.includes('bajo en la'), `${label}: la descripción indica el bajo`);
      validatePosition(chordName, guitar.position.frets, guitar.position.fingers, label);
    });
    return positions;
  };

  it('Eb/G, Ab/C, Bb/D, Db/F, Gb/Bb, C#/E#, F#/A#, D/F#, G/B, C/E, Am/G, C/Bb', () => {
    for (const chord of ['Eb/G', 'Ab/C', 'Bb/D', 'Db/F', 'Gb/Bb', 'C#/E#', 'F#/A#', 'D/F#', 'G/B', 'C/E', 'Am/G', 'C/Bb']) {
      validateChord(chord);
    }
  });

  it('las digitaciones del diccionario siguen siendo la primera opción', () => {
    assert.deepEqual(getGuitarPositions('D/F#')[0].position.frets, [2, 0, 0, 2, 3, 2]);
    assert.deepEqual(getGuitarPositions('G/B')[0].position.frets, [-1, 2, 0, 0, 3, 3]);
    assert.deepEqual(getGuitarPositions('C/E')[0].position.frets, [0, 3, 2, 0, 1, 0]);
  });

  it('C#/E# se sigue llamando E# y suena en la nota F', () => {
    assert.equal(getPianoChord('C#/E#')!.bass!.name, 'E#');
    for (const guitar of getGuitarPositions('C#/E#')) {
      const pitches = guitar.position.frets.flatMap((fret, string) => (fret < 0 ? [] : [TUNING_MIDI[string] + fret]));
      assert.equal(Math.min(...pitches) % 12, 5);
    }
  });

  it('D/F# por los 12 semitonos', () => {
    const names = range(12).map((steps) =>
      steps === 0 ? 'D/F#' : transposeChordBetweenKeys('D/F#', 'D', transposeKey('D', steps))
    );
    assert.deepEqual(names, ['D/F#', 'Eb/G', 'E/G#', 'F/A', 'F#/A#', 'G/B', 'Ab/C', 'A/C#', 'Bb/D', 'B/D#', 'C/E', 'Db/F']);
    names.forEach(validateChord);
  });

  it('todos los slash chords de las 80 canciones en sus 12 tonos', () => {
    const chords = new Set<string>();
    for (const song of MOCK_SONGS) {
      for (let steps = 0; steps < 12; steps++) {
        for (const chord of extractUniqueChords(transposeSongContent(song.content, steps, song.originalKey))) {
          if (parseChordSymbol(chord)?.bass) chords.add(chord);
        }
      }
    }
    ok(chords.size > 0, 'hay slash chords en las canciones');
    chords.forEach(validateChord);
    console.log(`slash chords de las canciones en 12 tonos: ${chords.size} → ${[...chords].sort().join(' ')}`);
  });

  it('sin una posición correcta devuelve lista vacía, nunca una forma aproximada', () => {
    assert.deepEqual(getGuitarPositions('Cm11/G'), []);
  });

  it('una extensión desconocida no rompe y queda marcada como aproximación', () => {
    for (const chord of ['Cm11', 'G13']) {
      const positions = getGuitarPositions(chord);
      ok(positions.length > 0, `${chord}: muestra una forma base`);
      ok(positions.every((guitar) => guitar.approximate), `${chord}: marcada como aproximación`);
    }
  });
});

describe('Palabras con acordes dentro', () => {
  it('"en[G/B]séñame" es una sola palabra', () => {
    const words = groupIntoWords(parseBracketLine('Toma de mi mano y en[G/B]séñame a orar,'));
    assert.deepEqual(
      words.map((word) => word.map((piece) => piece.text).join('')),
      ['Toma ', 'de ', 'mi ', 'mano ', 'y ', 'enséñame ', 'a ', 'orar,']
    );
    assert.deepEqual(words[5], [{ text: 'en' }, { chord: 'G/B', text: 'séñame ' }]);
  });

  it('un acorde al final de una palabra se queda con ella', () => {
    const words = groupIntoWords(parseBracketLine('[D]Estoy [Em]aquí[C]'));
    assert.deepEqual(words.map((word) => word.map((piece) => piece.chord ?? '').join('|')), ['D', 'Em|C']);
  });

  it('en todas las canciones: el texto y los acordes no cambian y solo se corta junto a un espacio', () => {
    for (const song of MOCK_SONGS) {
      for (const line of song.content.split('\n')) {
        if (!line.includes('[')) continue;
        const segments = parseBracketLine(line);
        const words = groupIntoWords(segments);
        const pieces = words.flat();
        ok(
          pieces.map((piece) => piece.text).join('') === segments.map((segment) => segment.lyric).join(''),
          `${song.id}: texto intacto en "${line}"`
        );
        ok(
          pieces.flatMap((piece) => (piece.chord ? [piece.chord] : [])).join() ===
            segments.flatMap((segment) => (segment.chord ? [segment.chord] : [])).join(),
          `${song.id}: acordes intactos en "${line}"`
        );
        words.slice(1).forEach((word, index) => {
          const previous = words[index];
          const before = previous[previous.length - 1].text;
          ok(/\s$/.test(before) || /^\s/.test(word[0].text), `${song.id}: corte solo junto a un espacio en "${line}"`);
        });
      }
    }
  });
});
