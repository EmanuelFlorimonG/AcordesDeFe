import React from 'react';
import {
  DISPLAY_OCTAVE_OFFSET,
  getPianoChord,
  getPianoVoicing,
  type VoicedNote,
} from '../../utils/pianoChords';
import { BLACK_KEY_HEIGHT_RATIO, getKeyboardLayout } from '../../utils/pianoKeyboard';

interface PianoChordDiagramProps {
  chord: string;
  /** "sm" / "md" for chord lists, "lg" for the chord detail modal */
  size?: 'sm' | 'md' | 'lg';
  /** 0 = root position. Ignored for slash chords, whose bass is written. */
  inversion?: number;
}

const SIZES = {
  sm: { width: 98, height: 46, noteText: 'text-[9px]' },
  md: { width: 120, height: 54, noteText: 'text-[10px]' },
  lg: { width: 264, height: 100, noteText: 'text-xs' },
} as const;

/**
 * One blue for the notes to play, a deeper blue for the root, and a white
 * dot for a written slash bass. Nothing else carries meaning.
 */
const COLORS = {
  root: '#1d4ed8',
  tone: '#3b82f6',
  whiteKey: '#ffffff',
  blackKey: '#1e293b',
  whiteOutline: '#cbd5e1',
  rail: '#334155',
  bassDot: '#ffffff',
};

/** The dark strip the keys sit against. */
const RAIL_HEIGHT = 3;

/** Square top where the key meets the rail, rounded bottom. */
function keyPath(x: number, y: number, width: number, height: number, radius: number): string {
  const r = Math.min(radius, width / 2, height / 2);
  return [
    `M ${x} ${y}`,
    `H ${x + width}`,
    `V ${y + height - r}`,
    `A ${r} ${r} 0 0 1 ${x + width - r} ${y + height}`,
    `H ${x + r}`,
    `A ${r} ${r} 0 0 1 ${x} ${y + height - r}`,
    'Z',
  ].join(' ');
}

/**
 * A piano keyboard with a chord voicing on it. The single piano diagram of the
 * app: chord lists, the chord modal and rehearsal mode all draw this.
 *
 * Name → pitch class → key: labels use the chord's spelling (Db, E#, Cb), keys
 * light up from positions, so C# and Db light the same black key.
 */
export const PianoChordDiagram: React.FC<PianoChordDiagramProps> = ({ chord, size = 'md', inversion = 0 }) => {
  const pianoChord = getPianoChord(chord);

  if (!pianoChord) {
    return (
      <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-center min-w-[90px]">
        <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono text-sm">{chord}</span>
        <span className="text-[10px] text-slate-400 mt-1">Sin diagrama</span>
      </div>
    );
  }

  const voicing = getPianoVoicing(pianoChord, inversion);
  const dimensions = SIZES[size];
  const notesByPosition = new Map<number, VoicedNote>(voicing.notes.map((note) => [note.position, note]));
  const layout = getKeyboardLayout(Math.max(...voicing.notes.map((note) => note.position)));

  const inset = 0.5;
  const unit = (dimensions.width - inset * 2) / layout.whiteKeyCount;
  const whiteHeight = dimensions.height - RAIL_HEIGHT;
  const blackHeight = whiteHeight * BLACK_KEY_HEIGHT_RATIO;
  const radius = Math.max(1, unit * 0.18);

  const fillFor = (note: VoicedNote | undefined, isBlack: boolean) => {
    if (note) return note.isRoot ? COLORS.root : COLORS.tone;
    return isBlack ? COLORS.blackKey : COLORS.whiteKey;
  };

  const bassDot = (note: VoicedNote | undefined, centerX: number, keyBottom: number, keyWidth: number) =>
    note?.isBass ? (
      <circle
        cx={centerX}
        cy={keyBottom - Math.max(3, keyWidth * 0.45)}
        r={Math.max(1.5, keyWidth * 0.2)}
        fill={COLORS.bassDot}
      />
    ) : null;

  const isSlash = Boolean(pianoChord.bass);
  const isInversion = !isSlash && voicing.inversion > 0;
  // Root position and slash chords list the chord's own notes; an inversion
  // lists them bottom to top, because the order is what changed.
  const noteLine = (isInversion ? voicing.notes.map((note) => note.name) : pianoChord.noteNames).join(' · ');

  const ariaLabel = [
    `Acorde ${chord}`,
    isInversion ? voicing.label.toLowerCase() : null,
    voicing.notes.map((note) => `${note.name}${note.octave + DISPLAY_OCTAVE_OFFSET}`).join(' '),
    pianoChord.bass ? `bajo ${pianoChord.bass.name}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm transition-colors">
      <span className="font-mono font-semibold text-slate-800 tracking-wider text-sm">{chord}</span>
      <span className={`${dimensions.noteText} leading-tight text-slate-500 mb-1 min-h-[1em]`}>
        {isInversion ? voicing.label : ' '}
      </span>

      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        role="img"
        aria-label={ariaLabel}
      >
        <rect x={0} y={0} width={dimensions.width} height={RAIL_HEIGHT} fill={COLORS.rail} />

        {/* White keys first, so the black keys draw on top of them */}
        {layout.whiteKeys.map((key) => {
          const note = notesByPosition.get(key.position);
          const x = inset + key.x * unit;
          return (
            <g
              key={`white-${key.position}`}
              data-key-position={key.position}
              data-pitch-class={key.pitchClass}
              data-key-color="white"
              data-note={note ? (note.isRoot ? 'root' : 'tone') : undefined}
              data-bass={note?.isBass ? 'true' : undefined}
            >
              <path
                d={keyPath(x, RAIL_HEIGHT, unit, whiteHeight, radius)}
                fill={fillFor(note, false)}
                stroke={COLORS.whiteOutline}
                strokeWidth={0.75}
              />
              {bassDot(note, x + unit / 2, RAIL_HEIGHT + whiteHeight, unit)}
            </g>
          );
        })}

        {layout.blackKeys.map((key) => {
          const note = notesByPosition.get(key.position);
          const x = inset + key.x * unit;
          const width = key.width * unit;
          return (
            <g
              key={`black-${key.position}`}
              data-key-position={key.position}
              data-pitch-class={key.pitchClass}
              data-key-color="black"
              data-note={note ? (note.isRoot ? 'root' : 'tone') : undefined}
              data-bass={note?.isBass ? 'true' : undefined}
            >
              <path
                d={keyPath(x, RAIL_HEIGHT, width, blackHeight, radius * 0.7)}
                fill={fillFor(note, true)}
                stroke={COLORS.blackKey}
                strokeWidth={0.6}
              />
              {bassDot(note, x + width / 2, RAIL_HEIGHT + blackHeight, width)}
            </g>
          );
        })}
      </svg>

      <span className={`mt-1.5 font-mono font-medium text-slate-600 ${dimensions.noteText} tracking-tight`}>
        {noteLine}
      </span>

      {pianoChord.bass && (
        <span className={`text-slate-500 ${dimensions.noteText} mt-0.5`}>
          Bajo: <span className="font-mono font-semibold text-slate-700">{pianoChord.bass.name}</span>
        </span>
      )}

      {pianoChord.approximate && (
        <span
          className={`text-slate-400 ${dimensions.noteText} mt-0.5`}
          title="No conocemos esta extensión exacta: se muestra el acorde base."
        >
          aprox.
        </span>
      )}
    </div>
  );
};
