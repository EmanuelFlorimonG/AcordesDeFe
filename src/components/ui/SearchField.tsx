import React, { useId } from 'react';
import { Search } from 'lucide-react';

interface SearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Read by screen readers; the placeholder is only a hint */
  label: string;
  placeholder?: string;
  /** Receives the focus when a dialog opens */
  autoFocusInDialog?: boolean;
}

/** The small search box used inside pages and dialogs: members, songs, people. */
export const SearchField: React.FC<SearchFieldProps> = ({ value, onChange, label, placeholder, autoFocusInDialog }) => {
  const id = useId();
  return (
    <div className="relative min-w-0 flex-1">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        {...(autoFocusInDialog ? { 'data-autofocus': '' } : {})}
        className="w-full h-10 [@media(pointer:coarse)]:h-11 pl-9 pr-3 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-[#2464ED] focus:ring-2 focus:ring-[#2464ED]/15"
      />
    </div>
  );
};
