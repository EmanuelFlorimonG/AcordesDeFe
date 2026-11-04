import type { ChordAnchor } from './songEditorModel';

/** Separate close chord labels visually, without moving their character anchors. */
export function mobileChordLanes(chords: ChordAnchor[]) {
  const ends: number[] = [];
  return new Map(chords.map(chord => {
    let lane = ends.findIndex(end => end <= chord.position);
    if (lane < 0) lane = ends.length;
    ends[lane] = chord.position + Math.ceil(chord.chord.length * 0.75) + 1;
    return [chord.id, lane];
  }));
}
