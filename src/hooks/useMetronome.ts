import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MetronomeEngine, clampBpm, isMetronomeSupported } from '../utils/metronomeEngine';
import { parseTimeSignature, type Meter } from '../utils/meter';

/** Used only when a song has no BPM of its own. */
export const FALLBACK_BPM = 80;

export interface MetronomeControls {
  isSupported: boolean;
  isRunning: boolean;
  bpm: number;
  /** The song's own BPM, or null when the song doesn't have one */
  songBpm: number | null;
  /** True when the BPM differs from the song's own */
  isBpmModified: boolean;
  meter: Meter;
  /** Index of the click being heard right now, or null */
  currentPulse: number | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  changeBpm: (delta: number) => void;
  resetBpm: () => void;
}

/**
 * React binding for the metronome engine.
 *
 * The engine is created in an effect and disposed in its cleanup, never during
 * render, so React StrictMode's mount/unmount/mount in development creates and
 * cleanly closes a throwaway engine instead of leaking an AudioContext. Leaving
 * the song page unmounts the viewer, which stops the clicks and releases audio.
 */
export function useMetronome(songTempo?: number, timeSignature?: string): MetronomeControls {
  const songBpm = songTempo && songTempo > 0 ? clampBpm(songTempo) : null;
  const meter = useMemo(() => parseTimeSignature(timeSignature), [timeSignature]);

  const [bpm, setBpm] = useState(songBpm ?? FALLBACK_BPM);
  const [isRunning, setIsRunning] = useState(false);
  const [currentPulse, setCurrentPulse] = useState<number | null>(null);
  const [isSupported] = useState(isMetronomeSupported);

  const engineRef = useRef<MetronomeEngine | null>(null);

  useEffect(() => {
    const engine = new MetronomeEngine(setCurrentPulse);
    engineRef.current = engine;
    return () => {
      engine.dispose();
      if (engineRef.current === engine) engineRef.current = null;
    };
  }, []);

  // Declared after the effect above, so on every (re)mount these run once the
  // engine exists and hand it the current settings.
  useEffect(() => {
    engineRef.current?.setBpm(bpm);
  }, [bpm]);

  useEffect(() => {
    engineRef.current?.setMeter(meter);
  }, [meter]);

  const start = useCallback(() => {
    const engine = engineRef.current;
    if (!engine) return;
    setIsRunning(true);
    // The engine confirms asynchronously; it reports false if audio couldn't
    // start or if stop() was pressed in the meantime.
    engine.start().then((started) => setIsRunning(started && engine.isRunning));
  }, []);

  const stop = useCallback(() => {
    engineRef.current?.stop();
    setIsRunning(false);
  }, []);

  const toggle = useCallback(() => {
    if (engineRef.current?.isRunning) stop();
    else start();
  }, [start, stop]);

  const changeBpm = useCallback((delta: number) => {
    setBpm((previous) => clampBpm(previous + delta));
  }, []);

  const resetBpm = useCallback(() => {
    setBpm(songBpm ?? FALLBACK_BPM);
  }, [songBpm]);

  return {
    isSupported,
    isRunning,
    bpm,
    songBpm,
    isBpmModified: songBpm !== null && bpm !== songBpm,
    meter,
    currentPulse,
    start,
    stop,
    toggle,
    changeBpm,
    resetBpm,
  };
}
