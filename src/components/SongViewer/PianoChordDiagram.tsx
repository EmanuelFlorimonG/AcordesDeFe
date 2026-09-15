import React from 'react';
import { normalizeStep } from '../../utils/chordTransposer';
import {
  getInversionLabel,
  getPianoChord,
  getPianoVoicing,
  type VoicedNoteRole,
} from '../../utils/pianoChords';

interface PianoChordDiagramProps {
  chord: string;
  size?: 'sm' | 'md' | 'lg';
  /**
   * When set, draws that inversion with real octaves (so E-G-C looks different
   * from C-E-G). When omitted, draws the compact one-octave view used in
   * chord lists.
   */
  inversion?: number;
}

const WHITE_PITCH_CLASSES = new Set([0, 2, 4, 5, 7, 9, 11]);
const isWhiteKey = (position: number) => WHITE_PITCH_CLASSES.has(normalizeStep(position));

const COMPACT_SIZES = {
  sm: { width: 84, keyHeight: 48, noteSize: 'text-[9px]' },
  md: { width: 112, keyHeight: 64, noteSize: 'text-[10px]' },
  lg: { width: 140, keyHeight: 80, noteSize: 'text-xs' },
} as const;

const VOICED_SIZES = {
  sm: { width: 126, keyHeight: 50, noteSize: 'text-[9px]' },
  md: { width: 176, keyHeight: 64, noteSize: 'text-[10px]' },
  lg: { width: 248, keyHeight: 86, noteSize: 'text-xs' },
} as const;

/** A voiced keyboard is never narrower than this, so it still reads as a keyboard. */
const MIN_VOICED_WHITE_KEYS = 9;

const COLORS = {
  root: '#1d4ed8',
  tone: '#3b82f6',
  bass: '#bfdbfe',
  whiteKey: '#ffffff',
  blackKey: '#1e293b',
  outline: '#94a3b8',
  topRail: '#334155',
  darkMarker: '#0f172a',
};

/** Height of the dark rail the keys sit against, as on a real keyboard. */
const RAIL_HEIGHT = 3;

/**
 * A key shape: square across the top where it meets the rail, rounded at the
 * bottom where a finger touches it. Plain rounded rectangles read as stripes
 * rather than as a keyboard.
 */
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

interface KeyMark {
  role?: VoicedNoteRole;
  /** Draws a dot on the key: marks the bass note of a slash chord. */
  marker?: boolean;
}

interface KeyboardProps {
  /** First and last key to draw; both must be white keys. */
  from: number;
  to: number;
  width: number;
  height: number;
  marks: Map<number, KeyMark>;
  label: string;
}

/** Draws any stretch of keyboard with some keys highlighted. */
function Keyboard({ from, to, width, height, marks, label }: KeyboardProps) {
  const whitePositions: number[] = [];
  for (let position = from; position <= to; position++) {
    if (isWhiteKey(position)) whitePositions.push(position);
  }
  const whiteIndex = new Map(whitePositions.map((position, index) => [position, index]));

  // A black key is drawn when the white key to its left is on screen.
  const blackPositions: number[] = [];
  for (let position = from; position <= to; position++) {
    if (!isWhiteKey(position) && whiteIndex.has(position - 1)) blackPositions.push(position);
  }

  // Keys are inset by half a stroke so the outline isn't clipped at the edges.
  const inset = 0.5;
  const whiteWidth = (width - inset * 2) / whitePositions.length;
  const blackWidth = whiteWidth * 0.62;
  const whiteHeight = height - RAIL_HEIGHT;
  const blackHeight = whiteHeight * 0.62;
  const radius = Math.max(1.5, whiteWidth * 0.16);

  const fillFor = (position: number, isBlack: boolean) => {
    const role = marks.get(position)?.role;
    if (role === 'root') return COLORS.root;
    if (role === 'tone') return COLORS.tone;
    if (role === 'bass') return COLORS.bass;
    return isBlack ? COLORS.blackKey : COLORS.whiteKey;
  };

  const markerFor = (position: number, cx: number, keyHeight: number) => {
    const mark = marks.get(position);
    if (!mark?.marker) return null;
    const onDarkFill = mark.role === 'root' || mark.role === 'tone';
    return (
      <circle
        cx={cx}
        cy={RAIL_HEIGHT + keyHeight - radius - 2.5}
        r={Math.max(1.6, whiteWidth * 0.13)}
        fill={onDarkFill ? '#ffffff' : COLORS.darkMarker}
      />
    );
  };

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {/* The dark rail the keys sit against */}
      <rect x={0} y={0} width={width} height={RAIL_HEIGHT} fill={COLORS.topRail} />

      {/* White keys first, so the black keys draw on top of them */}
      {whitePositions.map((position, index) => {
        const x = inset + index * whiteWidth;
        return (
          <g key={`white-${position}`}>
            <path
              d={keyPath(x, RAIL_HEIGHT, whiteWidth, whiteHeight, radius)}
              fill={fillFor(position, false)}
              stroke={COLORS.outline}
              strokeWidth={0.8}
            />
            {markerFor(position, x + whiteWidth / 2, whiteHeight)}
          </g>
        );
      })}

      {blackPositions.map((position) => {
        const x = inset + (whiteIndex.get(position - 1)! + 1) * whiteWidth - blackWidth / 2;
        return (
          <g key={`black-${position}`}>
            <path
              d={keyPath(x, RAIL_HEIGHT, blackWidth, blackHeight, radius * 0.8)}
              fill={fillFor(position, true)}
              stroke={COLORS.blackKey}
              strokeWidth={0.8}
            />
            {markerFor(position, x + blackWidth / 2, blackHeight)}
          </g>
        );
      })}
    </svg>
  );
}

/** Widens [low, high] to white keys with one spare white key on each side. */
function keyboardRange(low: number, high: number): { from: number; to: number } {
  let from = low;
  while (!isWhiteKey(from)) from--;
  from--;
  while (!isWhiteKey(from)) from--;

  let to = high;
  while (!isWhiteKey(to)) to++;
  to++;
  while (!isWhiteKey(to)) to++;

  const countWhites = () => {
    let count = 0;
    for (let position = from; position <= to; position++) if (isWhiteKey(position)) count++;
    return count;
  };
  while (countWhites() < MIN_VOICED_WHITE_KEYS) {
    to++;
    while (!isWhiteKey(to)) to++;
  }
  return { from, to };
}

/**
 * A piano keyboard with the notes of a chord highlighted.
 *
 * The notes come from the chord symbol itself (already transposed upstream),
 * so the diagram follows transposition without anything being stored per song.
 */
export const PianoChordDiagram: React.FC<PianoChordDiagramProps> = ({
  chord,
  size = 'md',
  inversion,
}) => {
  const pianoChord = getPianoChord(chord);

  if (!pianoChord) {
    return (
      <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-center min-w-[90px]">
        <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono text-sm">{chord}</span>
        <span className="text-[10px] text-slate-400 mt-1">Sin diagrama</span>
      </div>
    );
  }

  const { pitchClasses, noteNames, bassPitchClass, bassName, approximate } = pianoChord;
  const isVoiced = inversion !== undefined;
  const dimensions = isVoiced ? VOICED_SIZES[size] : COMPACT_SIZES[size];

  let keyboard: React.ReactNode;
  let noteLine: string;

  if (isVoiced) {
    const voicing = getPianoVoicing(pianoChord, inversion);
    const marks = new Map<number, KeyMark>(
      voicing.notes.map((note) => [note.position, { role: note.role, marker: note.role === 'bass' }])
    );
    const positions = voicing.notes.map((note) => note.position);
    const { from, to } = keyboardRange(Math.min(...positions), Math.max(...positions));
    const rightHand = voicing.notes.filter((note) => note.role !== 'bass').map((note) => note.name);
    noteLine = rightHand.join(' · ');

    keyboard = (
      <Keyboard
        from={from}
        to={to}
        width={dimensions.width}
        height={dimensions.keyHeight}
        marks={marks}
        label={`Acorde ${chord}, ${getInversionLabel(voicing.inversion).toLowerCase()}: ${noteLine}${
          bassName ? `, bajo ${bassName}` : ''
        }`}
      />
    );
  } else {
    // Compact view: one octave, chord tones by pitch class.
    const rootPitchClass = pitchClasses[0];
    const marks = new Map<number, KeyMark>(
      pitchClasses.map((pitchClass) => [
        pitchClass,
        { role: pitchClass === rootPitchClass ? 'root' : 'tone' },
      ])
    );
    if (bassPitchClass !== null) {
      marks.set(bassPitchClass, { ...marks.get(bassPitchClass), marker: true });
    }
    noteLine = noteNames.join(' · ');

    keyboard = (
      <Keyboard
        from={0}
        to={11}
        width={dimensions.width}
        height={dimensions.keyHeight}
        marks={marks}
        label={`Acorde ${chord} en piano: ${noteNames.join(', ')}`}
      />
    );
  }

  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm transition-colors">
      <span className="font-mono font-semibold text-slate-800 tracking-wider text-sm mb-1">
        {chord}
      </span>

      {keyboard}

      <span className={`mt-1.5 font-mono font-medium text-slate-600 ${dimensions.noteSize} tracking-tight`}>
        {noteLine}
      </span>

      {bassName && (
        <span className={`text-slate-500 ${dimensions.noteSize} mt-0.5`}>
          Bajo: <span className="font-mono font-medium">{bassName}</span>
        </span>
      )}

      {approximate && (
        <span
          className={`text-slate-400 ${dimensions.noteSize} mt-0.5`}
          title="No conocemos esta extensión exacta: se muestra el acorde base."
        >
          aprox.
        </span>
      )}
    </div>
  );
};
