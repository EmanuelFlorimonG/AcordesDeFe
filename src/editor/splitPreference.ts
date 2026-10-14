export const EDITOR_SPLIT_STORAGE_KEY = 'acordes-de-fe:editor-split';
export const DEFAULT_EDITOR_SPLIT = 50;
export const MIN_EDITOR_SPLIT = 30;
export const MAX_EDITOR_SPLIT = 70;

type SplitStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function clampEditorSplit(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(MIN_EDITOR_SPLIT, Math.min(MAX_EDITOR_SPLIT, Math.round(value)))
    : DEFAULT_EDITOR_SPLIT;
}

export function readEditorSplit(storage?: SplitStorage): number {
  try {
    const raw = (storage ?? window.localStorage).getItem(EDITOR_SPLIT_STORAGE_KEY);
    return clampEditorSplit(JSON.parse(raw ?? 'null'));
  } catch {
    return DEFAULT_EDITOR_SPLIT;
  }
}

export function saveEditorSplit(value: number, storage?: SplitStorage): void {
  try {
    (storage ?? window.localStorage).setItem(EDITOR_SPLIT_STORAGE_KEY, String(clampEditorSplit(value)));
  } catch {
    // A blocked preference store must not interrupt editing or resizing.
  }
}
