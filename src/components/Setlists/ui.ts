/** Shared class names for the setlist screens, so buttons and fields look alike everywhere. */

const buttonBase =
  'inline-flex items-center justify-center gap-2 h-10 [@media(pointer:coarse)]:h-11 px-4 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-dark-950 touch-manipulation';

export const primaryButton = `${buttonBase} bg-[#2464ED] text-white hover:bg-[#1D56D6] active:bg-[#1A4CBE]`;

export const secondaryButton = `${buttonBase} border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-dark-800`;

export const dangerButton = `${buttonBase} bg-red-600 text-white hover:bg-red-700 active:bg-red-800`;

export const ghostButton = `${buttonBase} px-3 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-dark-800 hover:text-slate-900 dark:hover:text-white`;

export const iconButton =
  'w-10 h-10 [@media(pointer:coarse)]:w-11 [@media(pointer:coarse)]:h-11 shrink-0 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-dark-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40 touch-manipulation';

export const fieldLabel = 'block mb-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200';

export const textField =
  'w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-950 text-[15px] sm:text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-[#2464ED] focus:ring-2 focus:ring-[#2464ED]/15 transition-shadow dark:[color-scheme:dark]';

export const sectionHeading = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500';

export const setlistSongHash = (setlistId: string, itemId: string) =>
  `#/setlist/${encodeURIComponent(setlistId)}/song/${encodeURIComponent(itemId)}`;

export const setlistHash = (setlistId: string) => `#/setlist/${encodeURIComponent(setlistId)}`;

/** The setlist being played live, in mass mode. */
export const setlistMassHash = (setlistId: string) =>
  `#/setlist/${encodeURIComponent(setlistId)}/misa`;

/**
 * Chips for choosing: voices of a section, kind of transition. They are
 * buttons, not a native select, and they say what they are with more than
 * colour (a check when chosen).
 */
export const chipButton =
  'inline-flex items-center gap-1.5 h-9 [@media(pointer:coarse)]:h-11 px-3 rounded-lg border text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2464ED]/40';

export const chipOff =
  'border-slate-200 dark:border-dark-700 bg-white dark:bg-dark-900 text-slate-600 dark:text-slate-300 hover:border-[#2464ED] hover:text-[#2464ED] dark:hover:text-sky-400';

export const chipOn = 'border-[#2464ED] bg-[#2464ED] text-white hover:bg-[#1D56D6]';
