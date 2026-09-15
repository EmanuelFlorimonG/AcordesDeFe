import React from 'react';
import type { Instrument } from '../../types/song';
import { ChordDiagram } from './ChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface InstrumentChordDiagramProps {
  chord: string;
  instrument: Instrument;
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Draws a chord for whichever instrument is selected. Both diagrams take the
 * same already-transposed chord symbol, so they stay in step with the tone
 * controls without either knowing about the other.
 */
export const InstrumentChordDiagram: React.FC<InstrumentChordDiagramProps> = ({
  chord,
  instrument,
  size = 'md',
}) =>
  instrument === 'piano' ? (
    <PianoChordDiagram chord={chord} size={size} />
  ) : (
    <ChordDiagram chord={chord} size={size} />
  );
