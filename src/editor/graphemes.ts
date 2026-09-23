/**
 * Where one sign ends and the next begins.
 *
 * A chord is anchored to a position in its line's text, counted the way
 * JavaScript counts a string (UTF-16 code units), because that is what the
 * songbook's notation has always written and what every saved song means.
 * That does not change here. What this adds is that a chord is never dropped
 * *inside* a sign: an emoji is two code units, a letter with a combining mark
 * is two, a flag is four, and half of any of them is not a place.
 *
 * Intl.Segmenter knows where the boundaries are; where it isn't there, code
 * points are walked and what is written as one sign is kept together (a
 * combining mark, a skin tone, a variation selector, a ZWJ sequence, the two
 * letters of a flag). Spanish text in NFC ("á", "ñ", "ü") is one code unit
 * per letter either way, so its positions are exactly what they always were.
 */

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('es', { granularity: 'grapheme' }) : null;

const MARK = /\p{M}/u;
const value = (codePoint: string) => codePoint.codePointAt(0) ?? 0;
/** A code point that belongs to the sign before it: a mark, a joiner, a variation selector, a skin tone. */
const continues = (codePoint: string) =>
  MARK.test(codePoint) ||
  [0x200d, 0xfe0e, 0xfe0f].includes(value(codePoint)) ||
  (value(codePoint) >= 0x1f3fb && value(codePoint) <= 0x1f3ff);
/** Half a flag: two of these in a row are one sign. */
const regionalHalf = (codePoint: string) => value(codePoint) >= 0x1f1e6 && value(codePoint) <= 0x1f1ff;

/**
 * Every place a sign starts, plus the end of the text, as UTF-16 offsets.
 * `segmenter` is the one to use, or null to walk code points instead.
 */
export function graphemeBoundaries(text: string, segmenter: Intl.Segmenter | null = graphemeSegmenter): number[] {
  const stops: number[] = [];
  if (segmenter) {
    for (const { index } of segmenter.segment(text)) stops.push(index);
  } else {
    let index = 0;
    let joined = false;
    let flagHalf = false;
    for (const codePoint of text) {
      const regional = regionalHalf(codePoint);
      if (!joined && !continues(codePoint) && !(regional && flagHalf)) stops.push(index);
      index += codePoint.length;
      joined = codePoint === '‍';
      flagHalf = regional && !flagHalf;
    }
  }
  if (stops[0] !== 0) stops.unshift(0);
  if (stops[stops.length - 1] !== text.length) stops.push(text.length);
  return stops;
}

/**
 * The nearest place a chord can go: the position itself when it already is
 * one, and otherwise the closest boundary, preferring the start of the sign
 * the position fell inside.
 */
export function snapToGrapheme(text: string, position: number): number {
  const at = Math.max(0, Math.min(text.length, Math.round(position)));
  const stops = graphemeBoundaries(text);
  const after = stops.find((stop) => stop >= at);
  if (after === at || after === undefined) return at;
  const before = stops[stops.indexOf(after) - 1] ?? 0;
  return at - before <= after - at ? before : after;
}
