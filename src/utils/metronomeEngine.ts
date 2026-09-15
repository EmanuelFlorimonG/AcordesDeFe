import type { Meter, PulseLevel } from './meter';

/**
 * Metronome built on the Web Audio API.
 *
 * Timing uses the "two clocks" approach: a coarse JavaScript timer wakes up
 * every 25 ms, and each time schedules any clicks due in the next 120 ms on the
 * audio clock, which is sample-accurate. JavaScript timers drift and stall
 * under load; the audio clock doesn't, so the clicks stay exactly on tempo
 * even while React is re-rendering. Clicks are synthesised, so no audio files
 * are needed.
 *
 * Completely independent of the YouTube player: it owns its own AudioContext
 * and never touches playback elsewhere.
 */

export const MIN_BPM = 30;
export const MAX_BPM = 250;

const TIMER_INTERVAL_MS = 25;
const SCHEDULE_AHEAD_SECONDS = 0.12;
const START_DELAY_SECONDS = 0.06;
const CLICK_LENGTH_SECONDS = 0.05;

/** The first beat of the bar is higher and louder; subdivisions are softer. */
const CLICK_SOUND: Record<PulseLevel, { frequency: number; gain: number }> = {
  accent: { frequency: 1760, gain: 0.9 },
  beat: { frequency: 1175, gain: 0.6 },
  sub: { frequency: 880, gain: 0.35 },
};

export function clampBpm(bpm: number): number {
  return Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, bpm)));
}

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === 'undefined') return null;
  const legacy = (window as Window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return window.AudioContext ?? legacy ?? null;
}

export function isMetronomeSupported(): boolean {
  return getAudioContextConstructor() !== null;
}

export class MetronomeEngine {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private timerId: number | null = null;
  private frameId: number | null = null;

  private bpm = 90;
  private meter: Meter | null = null;
  private nextPulseTime = 0;
  private pulseIndex = 0;
  private running = false;
  private disposed = false;

  /** Clicks already handed to the audio clock but not yet heard. */
  private visualQueue: Array<{ time: number; index: number }> = [];
  private liveOscillators = new Set<OscillatorNode>();

  /** Called with the index of the click being heard, or null when stopped. */
  private readonly onPulse: (index: number | null) => void;

  constructor(onPulse: (index: number | null) => void) {
    this.onPulse = onPulse;
  }

  get isRunning(): boolean {
    return this.running;
  }

  /** Takes effect from the next click, so changing tempo never stutters. */
  setBpm(bpm: number): void {
    this.bpm = clampBpm(bpm);
  }

  setMeter(meter: Meter): void {
    this.meter = meter;
    if (this.pulseIndex >= meter.pulses) this.pulseIndex = 0;
  }

  /**
   * Must be called from a user gesture (a click): browsers only let audio
   * start in response to one. Resolves false if audio can't start.
   */
  async start(): Promise<boolean> {
    if (this.running) return true;
    if (this.disposed || !this.meter) return false;

    const context = this.ensureContext();
    if (!context) return false;

    this.running = true;
    if (context.state !== 'running') {
      try {
        await context.resume();
      } catch {
        this.running = false;
        return false;
      }
    }
    // stop() may have been called while the context was resuming.
    if (!this.running) return false;

    this.pulseIndex = 0;
    this.visualQueue = [];
    this.nextPulseTime = context.currentTime + START_DELAY_SECONDS;

    this.schedule();
    this.timerId = window.setInterval(() => this.schedule(), TIMER_INTERVAL_MS);
    this.frameId = window.requestAnimationFrame(this.updateVisual);
    return true;
  }

  stop(): void {
    this.running = false;

    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.frameId !== null) {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = null;
    }

    // Silence clicks that were scheduled ahead but haven't sounded yet.
    for (const oscillator of this.liveOscillators) {
      try {
        oscillator.stop();
      } catch {
        // already stopped
      }
    }
    this.liveOscillators.clear();
    this.visualQueue = [];
    this.onPulse(null);

    // Let the audio device sleep while paused.
    if (this.context?.state === 'running') {
      this.context.suspend().catch(() => undefined);
    }
  }

  /** Stops and releases the audio device. The engine can't be reused after. */
  dispose(): void {
    this.stop();
    this.disposed = true;
    const context = this.context;
    this.context = null;
    this.output = null;
    if (context && context.state !== 'closed') {
      context.close().catch(() => undefined);
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context) return this.context;
    const Constructor = getAudioContextConstructor();
    if (!Constructor) return null;

    const context = new Constructor();
    const output = context.createGain();
    output.gain.value = 0.8;
    output.connect(context.destination);

    this.context = context;
    this.output = output;
    return context;
  }

  private secondsPerPulse(): number {
    const pulsesPerBeat = this.meter?.pulsesPerBeat ?? 1;
    return 60 / this.bpm / pulsesPerBeat;
  }

  private schedule(): void {
    const context = this.context;
    const meter = this.meter;
    if (!context || !meter || !this.running) return;

    // If the timer was held up for a long time (a frozen tab), don't fire the
    // missed clicks in a burst: pick the beat back up from now.
    if (this.nextPulseTime < context.currentTime - CLICK_LENGTH_SECONDS) {
      this.nextPulseTime = context.currentTime + START_DELAY_SECONDS;
    }

    while (this.nextPulseTime < context.currentTime + SCHEDULE_AHEAD_SECONDS) {
      this.playClick(meter.pulseLevels[this.pulseIndex] ?? 'beat', this.nextPulseTime);
      this.visualQueue.push({ time: this.nextPulseTime, index: this.pulseIndex });

      this.nextPulseTime += this.secondsPerPulse();
      this.pulseIndex = (this.pulseIndex + 1) % meter.pulses;
    }
  }

  private playClick(level: PulseLevel, time: number): void {
    const context = this.context;
    const output = this.output;
    if (!context || !output) return;

    const { frequency, gain } = CLICK_SOUND[level];
    const oscillator = context.createOscillator();
    const envelope = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, time);

    // A near-instant attack and fast decay: a click, not a beep.
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(gain, time + 0.002);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + CLICK_LENGTH_SECONDS);

    oscillator.connect(envelope);
    envelope.connect(output);
    oscillator.start(time);
    oscillator.stop(time + CLICK_LENGTH_SECONDS + 0.01);

    this.liveOscillators.add(oscillator);
    oscillator.onended = () => {
      oscillator.disconnect();
      envelope.disconnect();
      this.liveOscillators.delete(oscillator);
    };
  }

  /** Lights the beat indicator when a click is actually heard, not when scheduled. */
  private updateVisual = (): void => {
    const context = this.context;
    if (!context || !this.running) return;

    const heardUpTo = context.currentTime - (context.outputLatency || 0);
    let latest: number | null = null;
    while (this.visualQueue.length > 0 && this.visualQueue[0].time <= heardUpTo) {
      latest = this.visualQueue.shift()!.index;
    }
    if (latest !== null) this.onPulse(latest);

    this.frameId = window.requestAnimationFrame(this.updateVisual);
  };
}
