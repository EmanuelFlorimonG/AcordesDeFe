import React from 'react';
import { Check } from 'lucide-react';
import { chipButton, chipOff, chipOn } from '../Setlists/ui';

interface ChoiceChipsProps<T extends string> {
  /** Accessible name of the group, e.g. "Roles" */
  label: string;
  options: T[];
  labels: Record<T, string>;
  selected: T[];
  onChange: (selected: T[]) => void;
}

/**
 * Several choices at once, as buttons: each says whether it is chosen with a
 * check and aria-pressed, never with colour alone.
 */
export function ChoiceChips<T extends string>({ label, options, labels, selected, onChange }: ChoiceChipsProps<T>) {
  const toggle = (option: T) =>
    onChange(
      selected.includes(option)
        ? selected.filter((entry) => entry !== option)
        : options.filter((entry) => entry === option || selected.includes(entry))
    );

  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const isSelected = selected.includes(option);
        return (
          <button
            key={option}
            type="button"
            onClick={() => toggle(option)}
            aria-pressed={isSelected}
            className={`${chipButton} normal-case tracking-normal ${isSelected ? chipOn : chipOff}`}
          >
            {isSelected && <Check aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />}
            {labels[option]}
          </button>
        );
      })}
    </div>
  );
}
