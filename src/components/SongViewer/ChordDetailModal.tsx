import React, { useEffect, useMemo, useState } from 'react';
import { Guitar, Piano, X } from 'lucide-react';
import type { Instrument } from '../../types/song';
import { getGuitarPositions } from '../../utils/guitarChords';
import { getInversionCount, getInversionLabel, getPianoChord } from '../../utils/pianoChords';
import { ChordDiagram } from './ChordDiagram';
import { PianoChordDiagram } from './PianoChordDiagram';

interface ChordDetailModalProps {
  /** Already transposed chord symbol */
  chord: string;
  instrument: Instrument;
  onClose: () => void;
}

interface Option {
  id: number;
  label: string;
  title: string;
}

const OptionTabs: React.FC<{
  label: string;
  options: Option[];
  value: number;
  onChange: (id: number) => void;
}> = ({ label, options, value, onChange }) => (
  <div className="mb-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 mb-1.5">{label}</p>
    <div
      role="group"
      aria-label={label}
      className="flex gap-1 p-1 bg-slate-100 dark:bg-dark-800 rounded-lg border border-slate-200 dark:border-dark-700"
    >
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          title={option.title}
          className={`flex-1 min-w-0 px-2 py-1.5 rounded-md text-xs font-semibold whitespace-nowrap transition-colors ${
            value === option.id
              ? 'bg-white dark:bg-dark-900 text-[#2464ED] shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Opened by tapping a chord. Shows it for the selected instrument, with the
 * alternatives that would clutter the main view: guitar positions, or piano
 * inversions. The parent keys this by chord and instrument, so the selection
 * starts fresh for each chord.
 */
export const ChordDetailModal: React.FC<ChordDetailModalProps> = ({ chord, instrument, onClose }) => {
  const [selected, setSelected] = useState(0);
  const isPiano = instrument === 'piano';
  const Icon = isPiano ? Piano : Guitar;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const guitarPositions = useMemo(() => (isPiano ? [] : getGuitarPositions(chord)), [chord, isPiano]);
  const pianoChord = useMemo(() => (isPiano ? getPianoChord(chord) : null), [chord, isPiano]);

  let options: Option[];
  let diagram: React.ReactNode;
  let caption: string | null = null;

  if (isPiano) {
    const count = pianoChord ? getInversionCount(pianoChord) : 0;
    options = Array.from({ length: count }, (_, index) => ({
      id: index,
      label: index === 0 ? 'Fundamental' : `${index}ª inv.`,
      title: getInversionLabel(index),
    }));
    diagram = (
      <PianoChordDiagram chord={chord} size="lg" inversion={pianoChord ? selected : undefined} />
    );
  } else {
    options = guitarPositions.map((_, index) => ({
      id: index,
      label: String(index + 1),
      title: `Posición ${index + 1}`,
    }));
    const current = guitarPositions[selected];
    caption = current?.description ?? null;
    diagram = (
      <ChordDiagram
        chord={chord}
        size="lg"
        position={current?.position}
        approximate={current?.approximate}
      />
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 print:hidden"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chord-detail-title"
        className="bg-white dark:bg-dark-900 border border-slate-200 dark:border-dark-700 rounded-xl p-5 sm:p-6 max-w-sm w-full relative shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <Icon className="w-3.5 h-3.5 text-blue-600 dark:text-sky-400" />
              {isPiano ? 'Piano' : 'Guitarra'}
            </p>
            <h4
              id="chord-detail-title"
              className="font-mono text-2xl font-bold text-slate-900 dark:text-white mt-0.5 tracking-tight"
            >
              {chord}
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {options.length > 1 && (
          <OptionTabs
            label={isPiano ? 'Inversión' : 'Posición'}
            options={options}
            value={selected}
            onChange={setSelected}
          />
        )}

        <div className="flex justify-center">{diagram}</div>

        {caption && (
          <p className="text-center text-xs text-slate-500 dark:text-slate-400 mt-3">{caption}</p>
        )}
      </div>
    </div>
  );
};
