/**
 * The ruler of the chord lane: where a character is, and which character a
 * pointer is over.
 *
 * The lane and the text field below it share one fixed-width font, so a
 * character is the same step on both and a chord sits exactly over its
 * letter. Only the geometry lives here; where a chord is anchored is the
 * editor's model (songEditorModel.ts), and it is measured in characters,
 * never in pixels.
 */

export interface LaneRuler {
  /** The width of one character, in pixels (measured from the field's own font) */
  charWidth: number;
  /** The field's left padding, in pixels */
  padding: number;
  /** How far the field is scrolled sideways, in pixels */
  scrollLeft: number;
}

/**
 * The character a pointer at `offset` (pixels from the lane's left edge) is
 * over. It rounds to the nearest boundary, because a chord starts at a
 * character: dropping it on the left half of a letter means that letter, on
 * the right half means the next one. Never outside the line.
 */
export function characterAtOffset(offset: number, length: number, ruler: LaneRuler): number {
  if (!(ruler.charWidth > 0)) return 0;
  const at = Math.round((offset - ruler.padding + ruler.scrollLeft) / ruler.charWidth);
  return Math.max(0, Math.min(length, at));
}
