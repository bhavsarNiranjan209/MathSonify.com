import { clamp, yToFrequency, type DrawInstrument } from './freehandDraw';
import type { ScanReading } from './freehandScanner';

const FREQUENCY_GLIDE = 0.028;
const GAIN_ATTACK = 0.022;
const GAIN_RELEASE = 0.055;
const SILENCE = 0.0001;
const VOICE_LEVEL = 0.15;

interface PersistentVoice {
  color: string;
  oscillator: OscillatorNode;
  gain: GainNode;
}

type AudioContextConstructor = new () => AudioContext;

/** Persistent color=voice Web Audio engine used by the always-on scan loop. */
export class FreehandAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private voices = new Map<string, PersistentVoice>();
  private volume = 0.7;

  get available(): boolean {
    return this.context?.state === 'running';
  }

  /** Called only from pointerdown or the pause/resume control. */
  async unlock(): Promise<boolean> {
    try {
      if (!this.context) {
        const AudioCtor = window.AudioContext ??
          (window as typeof window & { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
        if (!AudioCtor) return false;
        this.context = new AudioCtor();
        this.master = this.context.createGain();
        this.compressor = this.context.createDynamicsCompressor();
        this.master.gain.value = clamp(this.volume, 0, 1);
        this.compressor.threshold.value = -20;
        this.compressor.knee.value = 20;
        this.compressor.ratio.value = 14;
        this.compressor.attack.value = 0.004;
        this.compressor.release.value = 0.14;
        this.master.connect(this.compressor);
        this.compressor.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      return this.context.state === 'running';
    } catch {
      this.dispose();
      return false;
    }
  }

  setVolume(value: number): void {
    this.volume = clamp(value, 0, 1);
    try {
      if (this.context && this.master) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.015);
    } catch {
      this.dispose();
    }
  }

  /** Per-frame live read: creates a voice on demand, then only ramps gain/frequency. */
  update(
    readings: ScanReading[],
    transpose: number,
    presentColors: ReadonlyArray<{ color: string; instrument: DrawInstrument }>,
    snapToScale = true,
  ): void {
    if (!this.context || this.context.state !== 'running') return;
    try {
      this.updateUnsafe(readings, transpose, presentColors, snapToScale);
    } catch {
      this.dispose();
    }
  }

  private updateUnsafe(
    readings: ScanReading[],
    transpose: number,
    presentColors: ReadonlyArray<{ color: string; instrument: DrawInstrument }>,
    snapToScale: boolean,
  ): void {
    const now = this.context!.currentTime;
    for (const entry of presentColors) this.ensureVoice(entry.color, entry.instrument, now);
    const active = new Set<string>();

    for (const reading of readings) {
      active.add(reading.color);
      const voice = this.ensureVoice(reading.color, reading.instrument, now);
      voice.oscillator.frequency.setTargetAtTime(
        yToFrequency(reading.averageY, transpose, snapToScale),
        now,
        FREQUENCY_GLIDE,
      );
      voice.gain.gain.setTargetAtTime(VOICE_LEVEL, now, GAIN_ATTACK);
    }

    for (const [color, voice] of this.voices) {
      if (!active.has(color)) voice.gain.gain.setTargetAtTime(SILENCE, now, GAIN_RELEASE);
    }
  }

  /** Remove voices whose colors no longer exist; keep voices shared by remaining strokes. */
  reconcileVoices(presentColors: ReadonlyArray<{ color: string; instrument: DrawInstrument }>): void {
    if (!this.context) return;
    try {
      const now = this.context.currentTime;
      const present = new Set(presentColors.map((entry) => entry.color));
      for (const entry of presentColors) this.ensureVoice(entry.color, entry.instrument, now);
      for (const [color, voice] of this.voices) {
        if (present.has(color)) continue;
        try { voice.gain.gain.cancelScheduledValues(now); voice.gain.gain.setValueAtTime(SILENCE, now); voice.oscillator.stop(now); } catch { /* already stopped */ }
        try { voice.oscillator.disconnect(); } catch { /* noop */ }
        try { voice.gain.disconnect(); } catch { /* noop */ }
        this.voices.delete(color);
      }
    } catch {
      this.dispose();
    }
  }

  pauseAll(): void {
    if (!this.context) return;
    try {
      const now = this.context.currentTime;
      for (const voice of this.voices.values()) voice.gain.gain.setTargetAtTime(SILENCE, now, GAIN_RELEASE);
    } catch {
      this.dispose();
    }
  }

  /** Dedicated post-compressor tap of the actual graph for one recording. */
  createRecordingTap(): { stream: MediaStream; cleanup: () => void } | null {
    if (!this.context || !this.compressor) return null;
    let destination: MediaStreamAudioDestinationNode | null = null;
    try {
      destination = this.context.createMediaStreamDestination();
      this.compressor.connect(destination);
      const output = destination;
      return {
        stream: output.stream,
        cleanup: () => {
          try { this.compressor?.disconnect(output); } catch { /* noop */ }
          for (const track of output.stream.getAudioTracks()) track.stop();
        },
      };
    } catch {
      if (destination) for (const track of destination.stream.getAudioTracks()) track.stop();
      return null;
    }
  }

  /** Reset/unmount: hard teardown; oscillators are stopped, not left running silently. */
  resetVoices(): void {
    if (!this.context) {
      this.voices.clear();
      return;
    }
    const now = this.context.currentTime;
    for (const voice of this.voices.values()) {
      try {
        voice.gain.gain.cancelScheduledValues(now);
        voice.gain.gain.setValueAtTime(SILENCE, now);
        voice.oscillator.stop(now);
      } catch { /* already stopped */ }
      try { voice.oscillator.disconnect(); } catch { /* noop */ }
      try { voice.gain.disconnect(); } catch { /* noop */ }
    }
    this.voices.clear();
  }

  dispose(): void {
    this.resetVoices();
    const context = this.context;
    this.context = null;
    this.master = null;
    this.compressor = null;
    if (context && context.state !== 'closed') void context.close().catch(() => {});
  }

  private ensureVoice(color: string, instrument: DrawInstrument, now: number): PersistentVoice {
    const existing = this.voices.get(color);
    if (existing) return existing;
    if (!this.context || !this.master) throw new Error('Audio context unavailable');
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = instrument;
    oscillator.frequency.value = 440;
    gain.gain.value = SILENCE;
    oscillator.connect(gain);
    gain.connect(this.master);
    oscillator.start(now);
    const voice = { color, oscillator, gain };
    this.voices.set(color, voice);
    return voice;
  }
}

export const freehandAudio = new FreehandAudioEngine();
