import { after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QrTooLongError, encodeQr } from '../src/utils/qrCode';

/**
 * El código QR de un enlace.
 *
 * Un QR mal hecho no avisa: se dibuja igual de bonito y ningún móvil lo lee.
 * Así que aquí no se comprueba "que salga algo", sino que salga exactamente
 * lo que dice el estándar — y, sobre todo, que lo que lleva dentro se pueda
 * volver a leer. La prueba de verdad es esa: se recorre la rejilla al revés,
 * se quita la máscara, se desentrelaza y tiene que aparecer el texto original.
 * Si algo se tuerce en el camino, aquí se cae.
 */

let checks = 0;
const eq = <T>(actual: T, expected: T, message?: string) => {
  checks++;
  assert.deepEqual(actual, expected, message);
};
after(() => console.log(`qrCode.test: ${checks} comprobaciones`));

const LINK = 'https://acordes-de-fe.vercel.app/#/shared/setlist/0123456789abcdef0123456789abcdef';

const versionOf = (size: number) => (size - 17) / 4;

// --- Leer un código QR, para poder comprobar que el nuestro se lee ----------

/**
 * El texto que lleva dentro una rejilla, deshaciendo lo que hizo el
 * codificador. No corrige errores: no hace falta, porque lo que se lee es lo
 * que se acaba de dibujar.
 */
function readQr(size: number, modules: boolean[][]): string {
  const version = versionOf(size);
  const fixed = functionModules(size, version);

  // La máscara se lee de la cabecera, no se supone.
  const mask = maskFrom(modules, size);
  const clean = modules.map((row, r) => row.map((dark, c) => (!fixed[r][c] && MASKS[mask](r, c) ? !dark : dark)));

  // El mismo zigzag, recogiendo en vez de escribiendo.
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let side = 0; side < 2; side += 1) {
        const column = right - side;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - step : step;
        if (!fixed[row][column]) bits.push(clean[row][column] ? 1 : 0);
      }
    }
  }
  const stream = new Uint8Array(Math.floor(bits.length / 8));
  for (let at = 0; at < stream.length * 8; at += 1) stream[at >>> 3] |= bits[at] << (7 - (at & 7));

  // Desentrelazar: primero los datos de cada bloque, por turnos.
  const [ecPerBlock, shortBlocks, shortData, longBlocks] = BLOCKS[version - 1];
  const lengths = [
    ...Array.from({ length: shortBlocks }, () => shortData),
    ...Array.from({ length: longBlocks }, () => shortData + 1),
  ];
  const blocks: number[][] = lengths.map(() => []);
  let at = 0;
  const longest = shortData + (longBlocks > 0 ? 1 : 0);
  for (let position = 0; position < longest; position += 1) {
    for (let block = 0; block < blocks.length; block += 1) {
      if (position < lengths[block]) blocks[block].push(stream[at++]);
    }
  }
  void ecPerBlock;
  const data = blocks.flat();

  // Modo byte, longitud, y el texto.
  const all: number[] = [];
  for (const byte of data) for (let bit = 7; bit >= 0; bit -= 1) all.push((byte >>> bit) & 1);
  const take = (count: number) => all.splice(0, count).reduce((total, bit) => total * 2 + bit, 0);
  eq(take(4), 0b0100, 'modo byte');
  const length = take(version < 10 ? 8 : 16);
  const bytes = new Uint8Array(length);
  for (let byte = 0; byte < length; byte += 1) bytes[byte] = take(8);
  return new TextDecoder().decode(bytes);
}

const BLOCKS: Array<[number, number, number, number]> = [
  [10, 1, 16, 0],
  [16, 1, 28, 0],
  [26, 1, 44, 0],
  [18, 2, 32, 0],
  [24, 2, 43, 0],
  [16, 4, 27, 0],
  [18, 4, 31, 0],
  [22, 2, 38, 2],
  [22, 3, 36, 2],
  [26, 4, 43, 1],
];

const ALIGNMENT: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
];

const MASKS: Array<(row: number, column: number) => boolean> = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

/** Qué módulos son patrón y no llevan datos, deducido aparte del codificador. */
function functionModules(size: number, version: number): boolean[][] {
  const fixed = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const mark = (row: number, column: number) => {
    if (row >= 0 && column >= 0 && row < size && column < size) fixed[row][column] = true;
  };

  for (const [top, left] of [
    [0, 0],
    [0, size - 7],
    [size - 7, 0],
  ]) {
    for (let r = -1; r <= 7; r += 1) for (let c = -1; c <= 7; c += 1) mark(top + r, left + c);
  }
  for (let a = 0; a < size; a += 1) {
    mark(6, a);
    mark(a, 6);
  }
  const centres = ALIGNMENT[version - 1];
  for (const row of centres) {
    for (const column of centres) {
      const onFinder =
        (row === 6 && column === 6) || (row === 6 && column === size - 7) || (row === size - 7 && column === 6);
      if (onFinder) continue;
      for (let r = -2; r <= 2; r += 1) for (let c = -2; c <= 2; c += 1) mark(row + r, column + c);
    }
  }
  for (let a = 0; a <= 8; a += 1) {
    mark(8, a);
    mark(a, 8);
  }
  for (let a = 0; a < 8; a += 1) {
    mark(8, size - 1 - a);
    mark(size - 1 - a, 8);
  }
  if (version >= 7) {
    for (let a = 0; a < 6; a += 1) {
      for (let b = 0; b < 3; b += 1) {
        mark(size - 11 + b, a);
        mark(a, size - 11 + b);
      }
    }
  }
  return fixed;
}

/** Las quince cadenas de cabecera del nivel M, tal como las publica el estándar. */
const FORMAT_M = [
  '101010000010010',
  '101000100100101',
  '101111001111100',
  '101101101001011',
  '100010111111001',
  '100000011001110',
  '100111110010111',
  '100101010100000',
];

/** La máscara que dice la cabecera, leída de la copia de arriba a la izquierda. */
function maskFrom(modules: boolean[][], size: number): number {
  const bits: number[] = [];
  for (let at = 0; at <= 5; at += 1) bits[at] = modules[at][8] ? 1 : 0;
  bits[6] = modules[7][8] ? 1 : 0;
  bits[7] = modules[8][8] ? 1 : 0;
  bits[8] = modules[8][7] ? 1 : 0;
  for (let at = 9; at < 15; at += 1) bits[at] = modules[8][14 - at] ? 1 : 0;
  void size;
  const written = bits.slice().reverse().join('');
  const mask = FORMAT_M.indexOf(written);
  assert.notEqual(mask, -1, `cabecera desconocida: ${written}`);
  return mask;
}

// --- Las pruebas -----------------------------------------------------------

describe('El código QR de un enlace', () => {
  it('lo que lleva dentro se vuelve a leer, tal cual', () => {
    for (const text of [
      LINK,
      'http://localhost:5174/#/shared/setlist/ffffffffffffffffffffffffffffffff',
      'A',
      'HELLO WORLD',
      'Canción de prueba — ñáéíóú',
    ]) {
      const { size, modules } = encodeQr(text);
      eq(readQr(size, modules), text, text.slice(0, 30));
    }
  });

  it('y también en cada una de las diez versiones, justo en su límite', () => {
    // Los límites del estándar para el nivel M, uno por versión.
    const limits = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
    limits.forEach((length, at) => {
      const text = 'x'.repeat(length);
      const { size, modules } = encodeQr(text);
      eq(versionOf(size), at + 1, `${length} bytes caben justo en la versión ${at + 1}`);
      eq(readQr(size, modules), text, `versión ${at + 1}`);
    });
    // Un byte más que el límite obliga a la siguiente versión.
    limits.slice(0, -1).forEach((length, at) => {
      eq(versionOf(encodeQr('x'.repeat(length + 1)).size), at + 2);
    });
  });

  it('un texto que no cabe se dice, no se dibuja a medias', () => {
    assert.throws(() => encodeQr('x'.repeat(214)), QrTooLongError);
    checks += 1;
  });

  it('el lado es el que corresponde a la versión', () => {
    eq(encodeQr('A').size, 21);
    eq(encodeQr(LINK).size, 37);
    const { size, modules } = encodeQr(LINK);
    eq(modules.length, size);
    eq(new Set(modules.map((row) => row.length)).size, 1, 'cuadrado');
    eq(modules[0].length, size);
  });

  it('los tres ojos están donde tienen que estar, con su borde blanco', () => {
    const { size, modules } = encodeQr(LINK);
    for (const [top, left] of [
      [0, 0],
      [0, size - 7],
      [size - 7, 0],
    ]) {
      for (let r = 0; r < 7; r += 1) {
        for (let c = 0; c < 7; c += 1) {
          const distance = Math.max(Math.abs(r - 3), Math.abs(c - 3));
          eq(modules[top + r][left + c], distance !== 2, `ojo en ${top},${left} (${r},${c})`);
        }
      }
    }
    // El separador: la fila y la columna 7 de cada ojo, en blanco.
    for (let a = 0; a < 8; a += 1) {
      eq(modules[7][a], false, 'separador de arriba a la izquierda');
      eq(modules[a][7], false);
    }
  });

  it('las líneas de puntos alternan, y el módulo oscuro está puesto', () => {
    const { size, modules } = encodeQr(LINK);
    for (let at = 8; at < size - 8; at += 1) {
      eq(modules[6][at], at % 2 === 0, `fila de puntos en ${at}`);
      eq(modules[at][6], at % 2 === 0, `columna de puntos en ${at}`);
    }
    eq(modules[size - 8][8], true, 'el módulo que siempre está oscuro');
  });

  it('la cabecera es una de las quince del estándar, y las dos copias coinciden', () => {
    const { size, modules } = encodeQr(LINK);
    const mask = maskFrom(modules, size);
    const written = FORMAT_M[mask];
    // La segunda copia, leída por su cuenta, tiene que decir lo mismo.
    const bits: number[] = [];
    for (let at = 0; at < 8; at += 1) bits[at] = modules[8][size - 1 - at] ? 1 : 0;
    for (let at = 8; at < 15; at += 1) bits[at] = modules[size - 15 + at][8] ? 1 : 0;
    eq(bits.slice().reverse().join(''), written, 'las dos copias dicen lo mismo');
  });

  it('el mismo texto da siempre el mismo dibujo', () => {
    const first = encodeQr(LINK);
    const second = encodeQr(LINK);
    eq(first.modules, second.modules);
  });

  it('dos enlaces distintos dan dibujos distintos', () => {
    const one = encodeQr('https://acordes-de-fe.vercel.app/#/shared/setlist/' + 'a'.repeat(32));
    const other = encodeQr('https://acordes-de-fe.vercel.app/#/shared/setlist/' + 'b'.repeat(32));
    eq(one.modules.flat().join('') === other.modules.flat().join(''), false);
  });

  it('se dibuja aquí: no le pide la imagen a nadie', () => {
    const code = readFileSync('src/utils/qrCode.ts', 'utf8').replace(/\r\n/g, '\n');
    for (const forbidden of ['fetch', 'http', 'XMLHttpRequest', 'import(', 'document', 'window']) {
      eq(code.includes(forbidden), false, forbidden);
    }
    const component = readFileSync('src/components/Setlists/QrCode.tsx', 'utf8').replace(/\r\n/g, '\n');
    for (const forbidden of ['fetch', 'http', '<img', 'chart.googleapis', 'qrserver']) {
      eq(component.includes(forbidden), false, forbidden);
    }
  });
});
