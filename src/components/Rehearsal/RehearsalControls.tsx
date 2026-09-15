import React from 'react';
import { Minus, Play, Plus } from 'lucide-react';

/** Small building blocks shared by the rehearsal header and dock. */

interface StepperProps {
  /** Accessible name of the whole control, e.g. "Tono" */
  label: string;
  value: React.ReactNode;
  onDecrease: () => void;
  onIncrease: () => void;
  canDecrease?: boolean;
  canIncrease?: boolean;
  decreaseTitle: string;
  increaseTitle: string;
  /** "lg" gives 44px touch targets, for panels used on phones. */
  size?: 'md' | 'lg';
  valueClassName?: string;
}

export const Stepper: React.FC<StepperProps> = ({
  label,
  value,
  onDecrease,
  onIncrease,
  canDecrease = true,
  canIncrease = true,
  decreaseTitle,
  increaseTitle,
  size = 'md',
  valueClassName = '',
}) => {
  // On touch screens (a tablet, a phone held sideways) even the compact size
  // keeps a 44px target; mouse users get the tighter layout.
  const button = `${
    size === 'lg' ? 'w-11 h-11' : 'w-8 h-8 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11'
  } flex items-center justify-center rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-dark-700 hover:text-slate-900 dark:hover:text-white transition-colors disabled:opacity-30 disabled:hover:bg-transparent touch-manipulation`;

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center rounded-xl border border-slate-200 dark:border-dark-700 bg-slate-50/80 dark:bg-dark-800/60 p-0.5"
    >
      <button
        type="button"
        onClick={onDecrease}
        disabled={!canDecrease}
        title={decreaseTitle}
        aria-label={decreaseTitle}
        className={button}
      >
        <Minus className="w-4 h-4" />
      </button>
      <span
        className={`px-1.5 text-center font-semibold tabular-nums text-slate-900 dark:text-white ${
          size === 'lg' ? 'min-w-[3.5rem] text-base' : 'min-w-[2.75rem] text-sm'
        } ${valueClassName}`}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={onIncrease}
        disabled={!canIncrease}
        title={increaseTitle}
        aria-label={increaseTitle}
        className={button}
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
};

export const PanelLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">{children}</p>
);

/** Shown when the reader's own scrolling paused auto-scroll. */
export const AutoScrollPausedNotice: React.FC<{ onResume: () => void }> = ({ onResume }) => (
  <div
    role="status"
    className="flex items-center gap-2 pl-3.5 pr-1 py-1 rounded-full bg-[#10203A]/95 text-white text-xs font-medium shadow-lg backdrop-blur-sm"
  >
    <span>Auto-scroll pausado</span>
    <button
      type="button"
      onClick={onResume}
      className="flex items-center gap-1.5 h-8 px-3 rounded-full bg-white/15 font-semibold hover:bg-white/25 transition-colors touch-manipulation"
    >
      <Play className="w-3 h-3 fill-current" />
      Reanudar
    </button>
  </div>
);
