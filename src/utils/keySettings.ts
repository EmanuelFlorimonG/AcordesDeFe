import { normalizeStep, transposeKey } from './chordTransposer';

/**
 * Tone and capo settings, as pure functions. The song viewer and the setlist
 * editor both use these, so "raise a semitone" or "move the capo" behave
 * identically wherever they happen.
 */

export const MIN_TRANSPOSE = -11;
export const MAX_TRANSPOSE = 11;
export const MIN_CAPO = 0;
export const MAX_CAPO = 11;

export interface KeySettings {
  /** Semitones the written chords move from the song as written */
  transposeSteps: number;
  capoFret: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function toInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

/** Valid settings from anything, e.g. data read back from storage. */
export function normalizeKeySettings(
  value: { transposeSteps?: unknown; capoFret?: unknown },
  recommendedCapo = 0
): KeySettings {
  return {
    transposeSteps: clamp(toInteger(value.transposeSteps, 0), MIN_TRANSPOSE, MAX_TRANSPOSE),
    capoFret: clamp(toInteger(value.capoFret, recommendedCapo), MIN_CAPO, MAX_CAPO),
  };
}

export function transposeBy(settings: KeySettings, delta: number): KeySettings {
  const transposeSteps = clamp(settings.transposeSteps + delta, MIN_TRANSPOSE, MAX_TRANSPOSE);
  return transposeSteps === settings.transposeSteps ? settings : { ...settings, transposeSteps };
}

/**
 * Reactive capo: moving the capo moves the written chord shapes the other way,
 * so what the choir hears stays in the same key.
 */
export function moveCapoBy(settings: KeySettings, delta: number): KeySettings {
  const capoFret = clamp(settings.capoFret + delta, MIN_CAPO, MAX_CAPO);
  if (capoFret === settings.capoFret) return settings;
  return {
    capoFret,
    transposeSteps: clamp(
      settings.transposeSteps - (capoFret - settings.capoFret),
      MIN_TRANSPOSE,
      MAX_TRANSPOSE
    ),
  };
}

export interface KeyDescription {
  /** The key that sounds */
  sounding: string;
  /** The chord shapes played, when a capo makes them differ from the sound */
  shape: string | null;
  /** The key the song sounds in as written, when the sound has been moved */
  original: string | null;
  /** Key the song sounds in as written (always set) */
  originalSounding: string;
  isModified: boolean;
}

/**
 * Names the keys for a set of settings. Sounding and shape keys are computed
 * from the original key in one step, so their spelling always matches the
 * transposed chords.
 */
export function describeKey(
  originalKey: string | undefined,
  settings: KeySettings,
  recommendedCapo = 0
): KeyDescription | null {
  if (!originalKey) return null;
  const pitchShift = normalizeStep(settings.transposeSteps + settings.capoFret - recommendedCapo);
  const originalSounding = transposeKey(originalKey, recommendedCapo);
  return {
    sounding: transposeKey(originalKey, settings.transposeSteps + settings.capoFret),
    shape: settings.capoFret > 0 ? transposeKey(originalKey, settings.transposeSteps) : null,
    original: pitchShift !== 0 ? originalSounding : null,
    originalSounding,
    isModified: settings.transposeSteps !== 0 || settings.capoFret !== recommendedCapo,
  };
}
