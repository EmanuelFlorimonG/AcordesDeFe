import React from 'react';
import type { MetronomeControls } from '../../hooks/useMetronome';
import { MetronomeControl } from './MetronomeControl';
import { BANNER_CHIP_CLASS, BANNER_CHIP_LABEL_CLASS, BANNER_CHIP_VALUE_CLASS } from './infoChip';

export interface SongKeyInfo {
  /** The key the song sounds in right now */
  sounding: string;
  /** Chord shapes being played, when a capo makes them differ from the sound */
  shape: string | null;
  /** The song's original key, shown only once the pitch has been changed */
  original: string | null;
}

interface SongInfoChipsProps {
  keyInfo: SongKeyInfo | null;
  /** Null hides the capo (piano mode) */
  capoFret: number | null;
  timeSignature?: string;
  rhythmPattern?: string;
  metronome: MetronomeControls;
}

const chip = `${BANNER_CHIP_CLASS} gap-1.5 px-2.5`;

/** Key, tempo, time signature, capo and rhythm, as small chips on the song header. */
export const SongInfoChips: React.FC<SongInfoChipsProps> = ({
  keyInfo,
  capoFret,
  timeSignature,
  rhythmPattern,
  metronome,
}) => (
  <div className="flex flex-wrap items-center gap-2">
    {keyInfo && (
      <span className={chip} title="Tonalidad">
        <span className={BANNER_CHIP_LABEL_CLASS}>Tono</span>
        <span className={BANNER_CHIP_VALUE_CLASS}>{keyInfo.sounding}</span>
        {keyInfo.shape && <span className={BANNER_CHIP_LABEL_CLASS}>forma {keyInfo.shape}</span>}
        {keyInfo.original && (
          <span className="text-white/60">
            · original <span className="font-mono font-semibold">{keyInfo.original}</span>
          </span>
        )}
      </span>
    )}

    <MetronomeControl metronome={metronome} variant="banner" />

    {timeSignature && (
      <span className={chip} title="Compás">
        <span className={BANNER_CHIP_VALUE_CLASS}>{timeSignature}</span>
      </span>
    )}

    {capoFret !== null && capoFret > 0 && (
      <span className={chip} title="Cejilla (capo)">
        <span className={BANNER_CHIP_LABEL_CLASS}>Capo</span>
        <span className={BANNER_CHIP_VALUE_CLASS}>{capoFret}</span>
      </span>
    )}

    {rhythmPattern && (
      <span className={chip} title="Patrón rítmico">
        <span className={BANNER_CHIP_LABEL_CLASS}>Ritmo</span>
        <span className={`${BANNER_CHIP_VALUE_CLASS} tracking-wider`}>{rhythmPattern}</span>
      </span>
    )}
  </div>
);
