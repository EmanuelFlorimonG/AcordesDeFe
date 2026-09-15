import React from 'react';
import type { ChordPosition } from '../../types/song';
import { getDefaultGuitarPosition } from '../../utils/guitarChords';

interface ChordDiagramProps {
  chord: string;
  size?: 'sm' | 'md' | 'lg';
  /** A specific position to draw. Defaults to the chord's standard position. */
  position?: ChordPosition;
  /** Marks an explicitly passed position as a simplified stand-in. */
  approximate?: boolean;
}

/** Fret rows drawn in the diagram. */
const NUM_FRETS = 4;

export const ChordDiagram: React.FC<ChordDiagramProps> = ({
  chord,
  size = 'md',
  position,
  approximate: approximateProp,
}) => {
  const standard = position ? null : getDefaultGuitarPosition(chord);
  const fingering = position ?? standard?.position ?? null;
  const approximate = position ? Boolean(approximateProp) : Boolean(standard?.approximate);

  // Dimension scaling
  const dimensions = {
    sm: { width: 80, height: 100, dotRadius: 4, fontSize: 10 },
    md: { width: 105, height: 130, dotRadius: 5.5, fontSize: 12 },
    lg: { width: 130, height: 160, dotRadius: 7, fontSize: 14 },
  }[size];

  if (!fingering) {
    return (
      <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-50 dark:bg-dark-800 border border-slate-200 dark:border-dark-700 text-center min-w-[90px]">
        <span className="font-semibold text-slate-700 dark:text-slate-200 font-mono text-sm">{chord}</span>
        <span className="text-[10px] text-slate-400 mt-1">Sin diagrama</span>
      </div>
    );
  }

  const { frets, fingers = [], barres = [] } = fingering;

  // Draw from the nut when the shape fits in the first frets. Higher shapes
  // start at their lowest fretted note, labelled "5fr", so no dot falls off
  // the bottom of the diagram.
  const fretted = frets.filter((fret) => fret > 0);
  const baseFret =
    fretted.length > 0 && Math.max(...fretted) > NUM_FRETS ? Math.min(...fretted) : 1;
  const toRelativeFret = (fret: number) => fret - (baseFret - 1);

  // SVG grid settings
  const paddingX = 18;
  const paddingTop = 28;
  const gridWidth = dimensions.width - paddingX * 2;
  const gridHeight = dimensions.height - paddingTop - 18;
  const stringSpacing = gridWidth / 5;
  const fretSpacing = gridHeight / NUM_FRETS;

  return (
    <div className="flex flex-col items-center bg-white border border-slate-200 rounded-lg p-2.5 shadow-sm transition-colors">
      {/* Chord Name Header */}
      <span className="font-mono font-semibold text-slate-800 tracking-wider text-sm mb-1">
        {chord}
      </span>

      <svg
        width={dimensions.width}
        height={dimensions.height}
        viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
        className="overflow-visible"
        role="img"
        aria-label={`Acorde ${chord} en guitarra: ${frets.map((fret) => (fret < 0 ? 'x' : fret)).join(' ')}`}
      >
        {/* Base fret indicator if not starting at fret 1 */}
        {baseFret > 1 && (
          <text
            x={paddingX - 10}
            y={paddingTop + fretSpacing * 0.75}
            fill="#64748b"
            fontSize="10"
            fontWeight="600"
            textAnchor="middle"
            className="font-mono"
          >
            {baseFret}fr
          </text>
        )}

        {/* Nut (thick bar at top if baseFret == 1) */}
        {baseFret === 1 ? (
          <line
            x1={paddingX}
            y1={paddingTop}
            x2={paddingX + gridWidth}
            y2={paddingTop}
            stroke="#0f172a"
            strokeWidth="3.5"
            strokeLinecap="round"
          />
        ) : (
          <line
            x1={paddingX}
            y1={paddingTop}
            x2={paddingX + gridWidth}
            y2={paddingTop}
            stroke="#94a3b8"
            strokeWidth="1.5"
          />
        )}

        {/* Fret horizontal lines */}
        {Array.from({ length: NUM_FRETS }).map((_, i) => (
          <line
            key={`fret-${i}`}
            x1={paddingX}
            y1={paddingTop + (i + 1) * fretSpacing}
            x2={paddingX + gridWidth}
            y2={paddingTop + (i + 1) * fretSpacing}
            stroke="#cbd5e1"
            strokeWidth="1.2"
          />
        ))}

        {/* Vertical string lines (6 strings) */}
        {Array.from({ length: 6 }).map((_, i) => {
          const x = paddingX + i * stringSpacing;
          const fretVal = frets[i];
          const isMuted = fretVal === -1;
          const isOpen = fretVal === 0;

          return (
            <g key={`string-${i}`}>
              <line
                x1={x}
                y1={paddingTop}
                x2={x}
                y2={paddingTop + gridHeight}
                stroke={i < 2 ? '#475569' : '#64748b'} // low strings slightly thicker
                strokeWidth={1 + (5 - i) * 0.25}
              />

              {/* Muted 'X' or Open 'O' markers */}
              {isMuted && (
                <text
                  x={x}
                  y={paddingTop - 7}
                  fill="#ef4444"
                  fontSize="11"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-mono select-none"
                >
                  ×
                </text>
              )}
              {isOpen && (
                <circle
                  cx={x}
                  cy={paddingTop - 7}
                  r="3.5"
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="1.5"
                />
              )}
            </g>
          );
        })}

        {/* Barre indicators */}
        {barres.map((fret, idx) => {
          const relativeFret = toRelativeFret(fret);
          if (relativeFret < 1 || relativeFret > NUM_FRETS) return null;
          const y = paddingTop + (relativeFret - 0.5) * fretSpacing;
          return (
            <rect
              key={`barre-${idx}`}
              x={paddingX - 2}
              y={y - dimensions.dotRadius}
              width={gridWidth + 4}
              height={dimensions.dotRadius * 2}
              rx={dimensions.dotRadius}
              fill="#2563eb"
              fillOpacity="0.15"
            />
          );
        })}

        {/* Fretted Notes (Dots) */}
        {frets.map((fret, strIdx) => {
          if (fret <= 0) return null;
          const x = paddingX + strIdx * stringSpacing;
          const relativeFret = toRelativeFret(fret);
          if (relativeFret < 1 || relativeFret > NUM_FRETS) return null;

          const y = paddingTop + (relativeFret - 0.5) * fretSpacing;
          const finger = fingers[strIdx];

          return (
            <g key={`dot-${strIdx}`}>
              <circle
                cx={x}
                cy={y}
                r={dimensions.dotRadius}
                fill="#2563eb"
              />
              {finger > 0 && (
                <text
                  x={x}
                  y={y}
                  fill="#ffffff"
                  fontSize={dimensions.fontSize - 3}
                  fontWeight="600"
                  textAnchor="middle"
                  dominantBaseline="central"
                  className="font-mono select-none"
                >
                  {finger}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {approximate && (
        <span
          className="text-[10px] text-slate-400 mt-0.5"
          title="No hay digitación exacta para este acorde: se muestra el acorde base."
        >
          aprox.
        </span>
      )}
    </div>
  );
};
