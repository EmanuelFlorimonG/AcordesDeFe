import React from 'react';
import { Guitar, Piano } from 'lucide-react';
import type { Instrument } from '../../types/song';

interface InstrumentToggleProps {
  value: Instrument;
  onChange: (instrument: Instrument) => void;
}

const OPTIONS: Array<{ id: Instrument; label: string; icon: typeof Guitar }> = [
  { id: 'guitarra', label: 'Guitarra', icon: Guitar },
  { id: 'piano', label: 'Piano', icon: Piano },
];

/** Chooses which instrument the chord diagrams are drawn for. */
export const InstrumentToggle: React.FC<InstrumentToggleProps> = ({ value, onChange }) => (
  <div
    role="group"
    aria-label="Instrumento"
    className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-dark-900 rounded-lg border border-slate-200 dark:border-dark-700"
  >
    {OPTIONS.map(({ id, label, icon: Icon }) => (
      <button
        key={id}
        onClick={() => onChange(id)}
        aria-pressed={value === id}
        title={`Ver los acordes para ${label.toLowerCase()}`}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs sm:text-sm font-semibold transition-colors ${
          value === id
            ? 'bg-white dark:bg-dark-800 text-[#2464ED] shadow-sm'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <Icon className="w-4 h-4" />
        <span>{label}</span>
      </button>
    ))}
  </div>
);
