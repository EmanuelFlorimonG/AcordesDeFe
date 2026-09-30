/**
 * Un código QR, hecho aquí.
 *
 * Compartir un Setlist termina en un móvil apuntando a una pantalla, así que
 * hace falta dibujar el enlace. Se dibuja en el navegador y punto: mandar la
 * URL a un servicio de terceros para que devuelva la imagen sería contarle a
 * alguien más qué está compartiendo cada persona, y eso no lo pide nadie.
 *
 * Es el algoritmo estándar (ISO/IEC 18004) en lo que esta aplicación
 * necesita: modo byte, corrección de errores M, versiones 1 a 10. Con eso
 * cabe una URL de hasta 106 caracteres —la nuestra ronda los 70— y el dibujo
 * sale lo bastante pequeño para leerse desde el otro lado de un ensayo.
 *
 * No hay nada configurable que nadie vaya a tocar: entra un texto, sale una
 * rejilla de módulos. Quien la pinta decide el tamaño.
 */

export interface QrMatrix {
  /** Módulos por lado, sin contar el margen. */
  size: number;
  /** `modules[fila][columna]`: true es oscuro. */
  modules: boolean[][];
}

/** No cabe: el texto es más largo de lo que admite la versión más grande. */
export class QrTooLongError extends Error {
  constructor(length: number) {
    super(`El texto no cabe en un código QR (${length} bytes).`);
    this.name = 'QrTooLongError';
  }
}

// ---------------------------------------------------------------------------
// Las tablas del estándar
// ---------------------------------------------------------------------------

/**
 * Por versión (1 a 10), con corrección M: cuántos bytes de corrección lleva
 * cada bloque, y en cuántos bloques se parten los datos.
 *
 * `[correcciónPorBloque, bloquesCortos, bytesPorBloqueCorto, bloquesLargos]`.
 * Un bloque largo lleva exactamente un byte más que uno corto, que es como lo
 * define el estándar, así que no hace falta guardarlo.
 */
const BLOCKS: Array<[number, number, number, number]> = [
  [10, 1, 16, 0], // 1
  [16, 1, 28, 0], // 2
  [26, 1, 44, 0], // 3
  [18, 2, 32, 0], // 4
  [24, 2, 43, 0], // 5
  [16, 4, 27, 0], // 6
  [18, 4, 31, 0], // 7
  [22, 2, 38, 2], // 8
  [22, 3, 36, 2], // 9
  [26, 4, 43, 1], // 10
];

/** Dónde van los centros de los patrones de alineación, por versión. */
const ALIGNMENT: number[][] = [
  [], // 1
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50], // 10
];

/** Cuántos bytes de datos admite una versión (sin la cabecera). */
function capacityOf(version: number): number {
  const [, shortBlocks, shortData, longBlocks] = BLOCKS[version - 1];
  const dataCodewords = shortBlocks * shortData + longBlocks * (shortData + 1);
  // Modo (4 bits) más longitud (8 bits hasta la versión 9, 16 desde la 10).
  const header = version < 10 ? 12 : 20;
  return Math.floor((dataCodewords * 8 - header) / 8);
}

// ---------------------------------------------------------------------------
// Aritmética de Galois, para la corrección de errores
// ---------------------------------------------------------------------------

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    // El polinomio primitivo del estándar: x^8 + x^4 + x^3 + x^2 + 1.
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
}

const mul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

/** El polinomio generador para `degree` bytes de corrección. */
function generator(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i += 1) {
    const next = new Uint8Array(poly.length + 1);
    for (let at = 0; at < poly.length; at += 1) {
      next[at] ^= poly[at];
      next[at + 1] ^= mul(poly[at], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** Los bytes de corrección de un bloque: el resto de dividir por el generador. */
function errorCorrection(data: Uint8Array, degree: number): Uint8Array {
  const gen = generator(degree);
  const remainder = new Uint8Array(degree);
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.copyWithin(0, 1);
    remainder[degree - 1] = 0;
    for (let at = 0; at < degree; at += 1) remainder[at] ^= mul(gen[at + 1], factor);
  }
  return remainder;
}

// ---------------------------------------------------------------------------
// Códigos de corrección de las cabeceras (BCH)
// ---------------------------------------------------------------------------

const degreeOf = (value: number): number => (value === 0 ? -1 : 31 - Math.clz32(value));

/** El resto de dividir `value` desplazado por el polinomio generador. */
function bch(value: number, generatorPoly: number, bits: number): number {
  let rest = value << bits;
  const genDegree = degreeOf(generatorPoly);
  for (let at = degreeOf(rest); at >= genDegree; at -= 1) {
    if ((rest >>> at) & 1) rest ^= generatorPoly << (at - genDegree);
  }
  return rest;
}

/** Los 15 bits que dicen nivel de corrección y máscara. */
function formatBits(mask: number): number {
  // 0b00 es el nivel M en la codificación del estándar.
  const data = (0b00 << 3) | mask;
  return ((data << 10) | bch(data, 0b10100110111, 10)) ^ 0b101010000010010;
}

/** Los 18 bits que dicen qué versión es. Sólo desde la 7. */
const versionBits = (version: number): number => (version << 12) | bch(version, 0b1111100100101, 12);

// ---------------------------------------------------------------------------
// El dibujo
// ---------------------------------------------------------------------------

interface Canvas {
  size: number;
  modules: boolean[][];
  /** Lo que ya es parte de un patrón y no puede llevar datos. */
  fixed: boolean[][];
}

function blank(size: number): Canvas {
  const grid = () => Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  return { size, modules: grid(), fixed: grid() };
}

function place(canvas: Canvas, row: number, column: number, dark: boolean): void {
  if (row < 0 || column < 0 || row >= canvas.size || column >= canvas.size) return;
  canvas.modules[row][column] = dark;
  canvas.fixed[row][column] = true;
}

/** Un ojo de los tres, con su separador blanco alrededor. */
function finder(canvas: Canvas, row: number, column: number): void {
  for (let dr = -4; dr <= 4; dr += 1) {
    for (let dc = -4; dc <= 4; dc += 1) {
      const distance = Math.max(Math.abs(dr), Math.abs(dc));
      place(canvas, row + dr, column + dc, distance !== 2 && distance <= 3);
    }
  }
}

function alignment(canvas: Canvas, row: number, column: number): void {
  for (let dr = -2; dr <= 2; dr += 1) {
    for (let dc = -2; dc <= 2; dc += 1) {
      place(canvas, row + dr, column + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
}

function patterns(canvas: Canvas, version: number): void {
  const { size } = canvas;

  finder(canvas, 3, 3);
  finder(canvas, 3, size - 4);
  finder(canvas, size - 4, 3);

  // Las dos líneas de puntos que dan la escala.
  for (let at = 8; at < size - 8; at += 1) {
    place(canvas, 6, at, at % 2 === 0);
    place(canvas, at, 6, at % 2 === 0);
  }

  // Los cuadraditos de alineación, en todos los cruces menos los tres que
  // caerían encima de un ojo.
  const centres = ALIGNMENT[version - 1];
  for (const row of centres) {
    for (const column of centres) {
      const onFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (!onFinder) alignment(canvas, row, column);
    }
  }

  // El sitio de la cabecera de formato se reserva ahora y se rellena al final,
  // cuando ya se sabe qué máscara gana.
  for (let at = 0; at <= 8; at += 1) {
    // La fila y la columna 6 son la línea de puntos, que ya está puesta y no
    // es cabecera de nada: pisarla dejaría el código ilegible.
    if (at === 6) continue;
    place(canvas, 8, at, false);
    place(canvas, at, 8, false);
  }
  for (let at = 0; at < 8; at += 1) {
    place(canvas, 8, size - 1 - at, false);
    place(canvas, size - 1 - at, 8, false);
  }
  // El módulo que siempre está oscuro.
  place(canvas, size - 8, 8, true);

  if (version >= 7) {
    const bits = versionBits(version);
    for (let at = 0; at < 18; at += 1) {
      const dark = ((bits >>> at) & 1) !== 0;
      const far = size - 11 + (at % 3);
      const near = Math.floor(at / 3);
      place(canvas, far, near, dark);
      place(canvas, near, far, dark);
    }
  }
}

function writeFormat(canvas: Canvas, mask: number): void {
  const { size } = canvas;
  const bits = formatBits(mask);
  const bit = (at: number) => ((bits >>> at) & 1) !== 0;

  // Una copia rodeando el ojo de arriba a la izquierda: los primeros bits
  // bajan por la columna 8 y los últimos vuelven por la fila 8.
  for (let at = 0; at <= 5; at += 1) place(canvas, at, 8, bit(at));
  place(canvas, 7, 8, bit(6));
  place(canvas, 8, 8, bit(7));
  place(canvas, 8, 7, bit(8));
  for (let at = 9; at < 15; at += 1) place(canvas, 8, 14 - at, bit(at));

  // Y otra repartida entre los otros dos ojos, para que se lea aunque una
  // esquina esté doblada o sucia.
  for (let at = 0; at < 8; at += 1) place(canvas, 8, size - 1 - at, bit(at));
  for (let at = 8; at < 15; at += 1) place(canvas, size - 15 + at, 8, bit(at));
  place(canvas, size - 8, 8, true);
}

/** Recorre los huecos en zigzag, de abajo a la derecha hacia arriba. */
function writeData(canvas: Canvas, data: Uint8Array): void {
  const { size } = canvas;
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    // La columna 6 es la línea de puntos: se salta entera.
    if (right === 6) right = 5;
    for (let step = 0; step < size; step += 1) {
      for (let side = 0; side < 2; side += 1) {
        const column = right - side;
        const upward = ((right + 1) & 2) === 0;
        const row = upward ? size - 1 - step : step;
        if (!canvas.fixed[row][column] && at < data.length * 8) {
          canvas.modules[row][column] = ((data[at >>> 3] >>> (7 - (at & 7))) & 1) !== 0;
          at += 1;
        }
      }
    }
  }
}

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

function applyMask(canvas: Canvas, mask: number): void {
  for (let row = 0; row < canvas.size; row += 1) {
    for (let column = 0; column < canvas.size; column += 1) {
      if (!canvas.fixed[row][column] && MASKS[mask](row, column)) {
        canvas.modules[row][column] = !canvas.modules[row][column];
      }
    }
  }
}

/**
 * Lo mala que es una máscara. El estándar penaliza lo que confunde a un
 * lector: rachas largas, cuadrados de un solo color, algo que se parezca a un
 * ojo, y un reparto de claro y oscuro muy desigual.
 */
function penalty(canvas: Canvas): number {
  const { size, modules } = canvas;
  let score = 0;

  const line = (get: (a: number, b: number) => boolean) => {
    for (let a = 0; a < size; a += 1) {
      let run = 1;
      let previous = get(a, 0);
      // Cinco módulos seguidos iguales cuestan 3, y cada uno de más cuesta 1.
      for (let b = 1; b < size; b += 1) {
        const current = get(a, b);
        if (current === previous) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          previous = current;
          run = 1;
        }
      }
    }
  };
  line((row, column) => modules[row][column]);
  line((column, row) => modules[row][column]);

  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const corner = modules[row][column];
      if (
        corner === modules[row][column + 1] &&
        corner === modules[row + 1][column] &&
        corner === modules[row + 1][column + 1]
      ) {
        score += 3;
      }
    }
  }

  // 1:1:3:1:1 con cuatro claros a un lado: lo que un lector confunde con un ojo.
  const EYE = [true, false, true, true, true, false, true];
  const quiet = [false, false, false, false];
  const matches = (get: (at: number) => boolean, from: number, pattern: boolean[]) =>
    pattern.every((want, at) => {
      const position = from + at;
      return position < 0 || position >= size ? !want : get(position) === want;
    });

  for (let a = 0; a < size; a += 1) {
    for (const get of [(b: number) => modules[a][b], (b: number) => modules[b][a]]) {
      for (let b = 0; b <= size - 7; b += 1) {
        if (!matches(get, b, EYE)) continue;
        if (matches(get, b - 4, quiet) || matches(get, b + 7, quiet)) score += 40;
      }
    }
  }

  let dark = 0;
  for (const row of modules) for (const module of row) if (module) dark += 1;
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

// ---------------------------------------------------------------------------
// De un texto a una rejilla
// ---------------------------------------------------------------------------

/** Los bytes de datos con su cabecera, su relleno, su corrección y entrelazados. */
function codewords(bytes: Uint8Array, version: number): Uint8Array {
  const [ecPerBlock, shortBlocks, shortData, longBlocks] = BLOCKS[version - 1];
  const dataCodewords = shortBlocks * shortData + longBlocks * (shortData + 1);

  const bits: number[] = [];
  const push = (value: number, count: number) => {
    for (let at = count - 1; at >= 0; at -= 1) bits.push((value >>> at) & 1);
  };
  push(0b0100, 4); // modo byte
  push(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) push(byte, 8);

  // Terminador, hasta cuatro ceros, y lo que falte para cerrar el último byte.
  const room = dataCodewords * 8;
  push(0, Math.min(4, room - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);

  const data = new Uint8Array(dataCodewords);
  for (let at = 0; at < bits.length; at += 1) data[at >>> 3] |= bits[at] << (7 - (at & 7));
  // El relleno del estándar, alternando, hasta llenar.
  for (let at = bits.length / 8, flip = 0; at < dataCodewords; at += 1, flip += 1) {
    data[at] = flip % 2 === 0 ? 0xec : 0x11;
  }

  const blocks: Uint8Array[] = [];
  const checks: Uint8Array[] = [];
  let read = 0;
  for (let block = 0; block < shortBlocks + longBlocks; block += 1) {
    const length = shortData + (block < shortBlocks ? 0 : 1);
    const piece = data.subarray(read, read + length);
    read += length;
    blocks.push(piece);
    checks.push(errorCorrection(piece, ecPerBlock));
  }

  // Entrelazado: un byte de cada bloque por turno, primero los datos y
  // después la corrección. Así un borrón sobre el papel se reparte entre
  // todos los bloques en vez de destrozar uno.
  const out: number[] = [];
  const longest = shortData + (longBlocks > 0 ? 1 : 0);
  for (let at = 0; at < longest; at += 1) {
    for (const block of blocks) if (at < block.length) out.push(block[at]);
  }
  for (let at = 0; at < ecPerBlock; at += 1) {
    for (const check of checks) out.push(check[at]);
  }
  return new Uint8Array(out);
}

/**
 * El código QR de un texto: la versión más pequeña en la que quepa, con la
 * máscara que menos confunde a un lector.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text);

  const version = BLOCKS.findIndex((_entry, at) => bytes.length <= capacityOf(at + 1)) + 1;
  if (version === 0) throw new QrTooLongError(bytes.length);

  const data = codewords(bytes, version);
  const size = version * 4 + 17;

  let best: Canvas | null = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const canvas = blank(size);
    patterns(canvas, version);
    writeData(canvas, data);
    applyMask(canvas, mask);
    writeFormat(canvas, mask);
    const score = penalty(canvas);
    if (score < bestScore) {
      bestScore = score;
      best = canvas;
    }
  }

  // El bucle corre ocho veces, así que siempre hay una ganadora.
  const winner = best as Canvas;
  return { size, modules: winner.modules };
}
