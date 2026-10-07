import { parseEquation, type SamplePoint, normalize, clamp, quantizeToScale, type ScaleKey } from './equationParser';
import { pitchAt, panAt, type PlaybackPitch } from './sonificationMapping';
import type { InstrumentType, SonificationMode } from '../store/studioStore';

/** Everything the engine needs to describe the current sample in Learn mode. */
export interface PlaybackReadout {
  x: number;
  y: number;
  /** What the engine is doing with this sample — a real Hz, or honest amplitude. */
  pitch: PlaybackPitch;
  /** Stereo position for this sample, [-1, 1]. */
  pan: number;
}

/**
 * Called every frame the playhead moves.
 *
 * `readout` is optional and appended, so existing three-argument callers keep
 * working untouched. It is supplied from the same sample point the synth is
 * playing, not recomputed by the UI — see `sonificationMapping`.
 */
export interface PlayProgressCallback {
  (progress: number, currentX: number, currentY: number, readout?: PlaybackReadout): void;
}

/** The per-playback values the readout and panning are derived from. */
interface PlaybackParams {
  minY: number;
  maxY: number;
  minFreq: number;
  maxFreq: number;
  mode: SonificationMode;
  scale: ScaleKey;
}

export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  /**
   * Studio-only stereo panner, sitting between the studio voices and the
   * shared master bus.
   *
   * Deliberately NOT in the master path: `compositionEngine` and
   * `musicLabEngine` also connect to `getMasterGain()`, and their mixing is
   * unrelated to the studio curve's height. Putting the panner here scopes it
   * to studio playback and leaves pitch/volume mapping completely untouched.
   */
  private voiceBus: StereoPannerNode | null = null;
  private panningEnabled = true;
  private isInitialized = false;

  private activeNodes: AudioNode[] = [];
  private isPlaying = false;
  private animationFrameId: number | null = null;
  private loopTimeoutId: ReturnType<typeof setTimeout> | null = null;

  // Monotonically increasing play-generation counter. Each call to play()
  // bumps this so any lingering loop setTimeout from the previous generation
  // is harmlessly ignored — no orphaned synthesis cycles can fire.
  private playGeneration = 0;

  private playStartTime = 0;
  private playDuration = 0;
  private cachedPoints: SamplePoint[] = [];
  private progressCallback: PlayProgressCallback | null = null;
  private onFinishCallback: (() => void) | null = null;
  private loopActive = false;
  /** Set per playback so the readout and panning use the same numbers the synth does. */
  private playParams: PlaybackParams | null = null;

  /**
   * Initializes the Web Audio API context. Must be triggered via user interaction.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized && this.audioContext && this.audioContext.state !== 'closed') {
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      return;
    }

    try {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextClass();

      // Analyser for real-time visualization
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.85;

      // Master Gain
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.audioContext.currentTime);

      // Dynamics Compressor (anti-clipping protection)
      this.compressor = this.audioContext.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-12, this.audioContext.currentTime);
      this.compressor.knee.setValueAtTime(12, this.audioContext.currentTime);
      this.compressor.ratio.setValueAtTime(10, this.audioContext.currentTime);
      this.compressor.attack.setValueAtTime(0.003, this.audioContext.currentTime);
      this.compressor.release.setValueAtTime(0.15, this.audioContext.currentTime);

      // Stereo panner for studio voices only. `createStereoPanner` is missing in
      // older Safari; there we fall back to the plain master bus so panning is
      // simply unavailable rather than the whole engine failing to initialise.
      const withPanner = this.audioContext as AudioContext & {
        createStereoPanner?: () => StereoPannerNode;
      };
      if (typeof withPanner.createStereoPanner === 'function') {
        this.voiceBus = withPanner.createStereoPanner();
        this.voiceBus.pan.value = 0;
        this.voiceBus.connect(this.masterGain);
      } else {
        this.voiceBus = null;
      }

      // Routing: Studio voices -> [Panner] -> MasterGain -> Compressor ->
      // Analyser -> Destination. SoundLab/MusicLab connect to MasterGain
      // directly and are therefore unaffected by studio panning.
      this.masterGain.connect(this.compressor);
      this.compressor.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);

      this.isInitialized = true;
    } catch (error) {
      console.error('Failed to initialize Web Audio API:', error);
      throw new Error('Audio context could not be initialized');
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyser;
  }

  getAudioContext(): AudioContext | null {
    return this.audioContext;
  }

  getMasterGain(): GainNode | null {
    return this.masterGain;
  }

  /**
   * Where studio voices connect. Falls back to the master bus on browsers with
   * no StereoPannerNode support, so those simply lose panning.
   *
   * Non-null because every synth method guards `!this.masterGain` before
   * building a voice, so masterGain is guaranteed by the time this is read.
   */
  private get voiceOut(): AudioNode {
    return (this.voiceBus ?? this.masterGain) as AudioNode;
  }

  /** True when this browser can pan stereo at all. */
  supportsPanning(): boolean {
    return this.voiceBus !== null;
  }

  /**
   * Turns curve-height panning on or off. Defaults to on; users on mono
   * speakers or a single earbud will want it off. Off means the panner is
   * parked at centre, so nothing else in the chain changes.
   */
  setPanningEnabled(enabled: boolean): void {
    this.panningEnabled = enabled;
    if (!this.voiceBus || !this.audioContext) return;
    this.voiceBus.pan.setTargetAtTime(
      enabled ? this.voiceBus.pan.value : 0,
      this.audioContext.currentTime,
      0.02,
    );
  }

  isPanningEnabled(): boolean {
    return this.panningEnabled;
  }

  isPlayingStatus(): boolean {
    return this.isPlaying;
  }

  setVolume(val: number): void {
    if (this.masterGain && this.audioContext) {
      const target = clamp(val, 0, 1) * 0.8;
      this.masterGain.gain.setTargetAtTime(target, this.audioContext.currentTime, 0.02);
    }
  }

  stop(): void {
    this.isPlaying = false;
    this.loopActive = false;
    this.onFinishCallback = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    if (this.loopTimeoutId !== null) {
      clearTimeout(this.loopTimeoutId);
      this.loopTimeoutId = null;
    }

    // Stop and disconnect all active nodes
    this.activeNodes.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // Node might have already ended
      }
    });
    this.activeNodes = [];

    if (this.progressCallback) {
      this.progressCallback(0, 0, 0);
    }
  }

  /**
   * Play pre-computed sample points directly (used for custom spline curves).
   * Same sonification pipeline as play(), but source points come from
   * the spline rather than equation evaluation.
   */
  async playPoints(
    points: SamplePoint[],
    minX: number,
    maxX: number,
    minFreq: number,
    maxFreq: number,
    duration: number,
    volume: number,
    instrument: InstrumentType,
    mode: SonificationMode,
    loop: boolean,
    scale: ScaleKey = 'major',
    onProgress?: PlayProgressCallback,
    onFinish?: () => void
  ): Promise<void> {
    await this.initialize();
    if (!this.audioContext || !this.masterGain) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.stop();
    this.playGeneration++;

    const validPoints = points.filter((p) => p.isValid);
    if (validPoints.length === 0) {
      throw new Error('No valid sample points to sonify');
    }

    this.cachedPoints = points;
    this.progressCallback = onProgress || null;
    this.onFinishCallback = onFinish || null;
    this.setVolume(volume);

    this.isPlaying = true;
    this.loopActive = loop;
    this.playStartTime = this.audioContext.currentTime;
    this.playDuration = duration;

    const yVals = validPoints.map((p) => p.y);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    // Retained so the per-frame readout and panning are computed from exactly
    // the range the synth is using.
    this.playParams = { minY, maxY, minFreq, maxFreq, mode, scale };

    const executeSonification = () => {
      if (!this.isPlaying || !this.audioContext || !this.masterGain) return;

      this.playStartTime = this.audioContext.currentTime;

      switch (mode) {
        case 'frequency':
          this.synthesizeFrequencyMode(points, minY, maxY, minFreq, maxFreq, duration, instrument);
          break;
        case 'note':
          this.synthesizeNoteMode(points, minY, maxY, duration, instrument, scale);
          break;
        case 'rhythm':
          this.synthesizeRhythmMode(points, minY, maxY, duration, instrument);
          break;
        case 'chord':
          this.synthesizeChordMode(points, minY, maxY, duration, instrument, scale);
          break;
      }

      this.startProgressTracking();

      if (this.loopActive) {
        const myGen = this.playGeneration;
        if (this.loopTimeoutId !== null) clearTimeout(this.loopTimeoutId);
        this.loopTimeoutId = setTimeout(() => {
          if (myGen !== this.playGeneration) return;
          if (this.isPlaying && this.loopActive) {
            executeSonification();
          }
        }, duration * 1000);
      }
    };

    executeSonification();
  }

  /**
   * Main play entry point: parses equation, validates points, synthesizes audio & syncs visual playhead.
   */
  async play(
    equation: string,
    minX: number,
    maxX: number,
    minFreq: number,
    maxFreq: number,
    duration: number,
    volume: number,
    instrument: InstrumentType,
    mode: SonificationMode,
    loop: boolean,
    scale: ScaleKey = 'major',
    onProgress?: PlayProgressCallback,
    onFinish?: () => void
  ): Promise<void> {
    await this.initialize();
    if (!this.audioContext || !this.masterGain) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.stop();
    this.playGeneration++;

    const parseResult = parseEquation(equation);
    if (!parseResult.success || !parseResult.sample) {
      throw new Error(parseResult.error || 'Invalid equation');
    }

    const samplePoints: SamplePoint[] = parseResult.sample(minX, maxX, 800);
    const validPoints = samplePoints.filter((p) => p.isValid);
    if (validPoints.length === 0) {
      throw new Error('Equation does not produce valid numerical values in this range');
    }

    this.cachedPoints = samplePoints;
    this.progressCallback = onProgress || null;
    this.onFinishCallback = onFinish || null;
    this.setVolume(volume);

    this.isPlaying = true;
    this.loopActive = loop;
    this.playStartTime = this.audioContext.currentTime;
    this.playDuration = duration;

    const yVals = validPoints.map((p) => p.y);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    this.playParams = { minY, maxY, minFreq, maxFreq, mode, scale };

    const executeSonification = () => {
      if (!this.isPlaying || !this.audioContext || !this.masterGain) return;

      this.playStartTime = this.audioContext.currentTime;

      switch (mode) {
        case 'frequency':
          this.synthesizeFrequencyMode(samplePoints, minY, maxY, minFreq, maxFreq, duration, instrument);
          break;
        case 'note':
          this.synthesizeNoteMode(samplePoints, minY, maxY, duration, instrument, scale);
          break;
        case 'rhythm':
          this.synthesizeRhythmMode(samplePoints, minY, maxY, duration, instrument);
          break;
        case 'chord':
          this.synthesizeChordMode(samplePoints, minY, maxY, duration, instrument, scale);
          break;
      }

      this.startProgressTracking();

      // Schedule next loop or end
      if (this.loopActive) {
        const myGen = this.playGeneration;
        if (this.loopTimeoutId !== null) clearTimeout(this.loopTimeoutId);
        this.loopTimeoutId = setTimeout(() => {
          // Guard: ignore stale timeouts from a previous play generation
          if (myGen !== this.playGeneration) return;
          if (this.isPlaying && this.loopActive) {
            executeSonification();
          }
        }, duration * 1000);
      }
    };

    executeSonification();
  }

  private startProgressTracking(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
    }

    const track = () => {
      if (!this.isPlaying || !this.audioContext) {
        return;
      }

      const elapsed = this.audioContext.currentTime - this.playStartTime;
      const progress = clamp(elapsed / this.playDuration, 0, 1);

      if (this.cachedPoints.length > 0 && this.progressCallback) {
        const index = Math.min(
          this.cachedPoints.length - 1,
          Math.floor(progress * (this.cachedPoints.length - 1))
        );
        const pt = this.cachedPoints[index];

        // Everything below is derived from THIS sample point — the same one the
        // oscillators are playing right now — via the shared mappings. Nothing
        // is re-sampled or re-derived, so the readout cannot drift from the
        // sound. If the cached point is not valid (a singularity), skip the
        // frame rather than reporting a value the engine never played.
        if (pt.isValid && this.playParams) {
          const { minY, maxY, minFreq, maxFreq, mode, scale } = this.playParams;
          const pan = panAt(pt.y, minY, maxY);
          const pitch = pitchAt(mode, pt.y, minY, maxY, minFreq, maxFreq, scale);

          // Drive the panner here too, so stereo and the readout come from one
          // computation and cannot disagree.
          if (this.voiceBus && this.panningEnabled && this.audioContext) {
            // setTargetAtTime rather than assigning: assigning every frame makes
            // the value jump in audible steps, which is exactly the harshness
            // panning is supposed to avoid.
            this.voiceBus.pan.setTargetAtTime(pan, this.audioContext.currentTime, 0.03);
          }

          this.progressCallback(progress, pt.x, pt.y, { x: pt.x, y: pt.y, pitch, pan });
        }
      }

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(track);
      } else if (!this.loopActive) {
        // Natural completion: shut the audio down, then tell the UI playback ended
        const finish = this.onFinishCallback;
        this.stop();
        if (finish) finish();
      }
    };

    this.animationFrameId = requestAnimationFrame(track);
  }

  /**
   * Continuous Microtonal Frequency Glide Mode
   */
  private synthesizeFrequencyMode(
    points: SamplePoint[],
    minY: number,
    maxY: number,
    minFreq: number,
    maxFreq: number,
    duration: number,
    instrument: InstrumentType
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const dt = duration / points.length;

    // Main Synth Voice
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    this.configureOscillator(osc, instrument);

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.5, now);

    osc.connect(filter);
    filter.connect(env);
    env.connect(this.voiceOut);

    // ADSR Envelope
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.75, now + 0.04);
    env.gain.setValueAtTime(0.75, Math.max(now + 0.05, now + duration - 0.06));
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Schedule frequency and slope-brightness sweeps
    points.forEach((pt, i) => {
      const t = now + i * dt;
      if (pt.isValid) {
        const freq = normalize(pt.y, minY, maxY, minFreq, maxFreq);
        const clampedFreq = clamp(freq, 20, 8000);
        osc.frequency.setValueAtTime(clampedFreq, t);

        // Derivative modulation: steep slopes open the filter
        const slopeCutoff = clamp(Math.abs(pt.dy) * 90 + 350, 300, 12000);
        filter.frequency.setValueAtTime(slopeCutoff, t);
      }
    });

    // Sub-oscillator for warmth (sine/triangle)
    if (instrument === 'sawtooth' || instrument === 'square') {
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();
      subOsc.type = 'sine';
      subGain.gain.setValueAtTime(0.2, now);

      subOsc.connect(subGain);
      subGain.connect(this.voiceOut);

      points.forEach((pt, i) => {
        const t = now + i * dt;
        if (pt.isValid) {
          const freq = normalize(pt.y, minY, maxY, minFreq / 2, maxFreq / 2);
          subOsc.frequency.setValueAtTime(clamp(freq, 20, 4000), t);
        }
      });

      subOsc.start(now);
      subOsc.stop(now + duration);
      this.activeNodes.push(subOsc, subGain);
    }

    osc.start(now);
    osc.stop(now + duration);
    this.activeNodes.push(osc, filter, env);
  }

  /**
   * Musical Note Mode (quantized to scale)
   */
  private synthesizeNoteMode(
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    instrument: InstrumentType,
    scale: ScaleKey
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const stepCount = Math.min(points.length, Math.max(16, Math.floor(duration * 8)));
    const dt = duration / stepCount;
    const stride = Math.floor(points.length / stepCount);

    for (let step = 0; step < stepCount; step++) {
      const ptIdx = Math.min(points.length - 1, step * stride);
      const pt = points[ptIdx];
      if (!pt.isValid) continue;

      const norm = normalize(pt.y, minY, maxY, 0, 1);
      const pitch = quantizeToScale(norm, scale);
      const t = now + step * dt;
      const noteDur = dt * 0.92;

      this.triggerInstrumentNote(pitch, t, noteDur, instrument, 0.6);
    }
  }

  /**
   * Rhythm & Extrema Mode
   */
  private synthesizeRhythmMode(
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    instrument: InstrumentType
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const threshold = minY + (maxY - minY) * 0.65;
    const peaks: number[] = [];

    for (let i = 1; i < points.length - 1; i++) {
      if (
        points[i].isValid &&
        points[i].y > threshold &&
        points[i].y >= points[i - 1].y &&
        points[i].y >= points[i + 1].y
      ) {
        peaks.push(i);
      }
    }

    if (peaks.length === 0) {
      const stride = Math.floor(points.length / 8);
      for (let i = 0; i < points.length; i += stride) peaks.push(i);
    }

    peaks.forEach((peakIdx) => {
      const t = now + (peakIdx / points.length) * duration;
      const pt = points[peakIdx];
      const pitch = normalize(pt.y, minY, maxY, 220, 880);
      this.triggerInstrumentNote(pitch, t, 0.2, instrument, 0.8);
    });
  }

  /**
   * Chord & Harmony Mode
   */
  private synthesizeChordMode(
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    instrument: InstrumentType,
    scale: ScaleKey
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const stepCount = Math.min(points.length, Math.max(8, Math.floor(duration * 3)));
    const dt = duration / stepCount;
    const stride = Math.floor(points.length / stepCount);

    for (let step = 0; step < stepCount; step++) {
      const pt = points[Math.min(points.length - 1, step * stride)];
      if (!pt.isValid) continue;

      const norm = normalize(pt.y, minY, maxY, 0, 0.75);
      const root = quantizeToScale(norm, scale);
      const third = quantizeToScale(norm + 0.12, scale);
      const fifth = quantizeToScale(norm + 0.22, scale);

      const t = now + step * dt;
      const chordDur = dt * 0.95;

      this.triggerInstrumentNote(root, t, chordDur, instrument, 0.45);
      this.triggerInstrumentNote(third, t, chordDur, instrument, 0.35);
      this.triggerInstrumentNote(fifth, t, chordDur, instrument, 0.35);
    }
  }

  /**
   * Triggers a rich, synthesized instrument voice with custom envelopes & filters
   */
  private triggerInstrumentNote(
    frequency: number,
    startTime: number,
    duration: number,
    instrument: InstrumentType,
    gainLevel = 0.5
  ): void {
    if (!this.audioContext || !this.masterGain) return;

    const ctx = this.audioContext;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    this.configureOscillator(osc, instrument);

    if (instrument === 'pluck') {
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency * 6, startTime);
      filter.frequency.exponentialRampToValueAtTime(frequency * 1.2, startTime + Math.min(0.2, duration));

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.voiceOut);

      osc.frequency.setValueAtTime(frequency, startTime);

      // Fast sharp attack, exponential decay
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel * 1.1, startTime + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    } else if (instrument === 'piano') {
      // Dual oscillator body for piano warmth
      const osc2 = ctx.createOscillator();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(frequency * 2, startTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency * 4.5, startTime);

      osc.frequency.setValueAtTime(frequency, startTime);

      osc.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(this.voiceOut);

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(gainLevel * 0.5, startTime + 0.12);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc2.start(startTime);
      osc2.stop(startTime + duration + 0.05);
      this.activeNodes.push(osc2);
    } else {
      // Standard synth voices (Sine, Triangle, Sawtooth, Square)
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(frequency * 4, startTime);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.voiceOut);

      osc.frequency.setValueAtTime(frequency, startTime);

      // ADSR Envelope
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
      gain.gain.setValueAtTime(gainLevel * 0.8, Math.max(startTime + 0.03, startTime + duration - 0.05));
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    }

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
    this.activeNodes.push(osc, filter, gain);
  }

  private configureOscillator(osc: OscillatorNode, instrument: InstrumentType): void {
    switch (instrument) {
      case 'sine':
        osc.type = 'sine';
        break;
      case 'triangle':
        osc.type = 'triangle';
        break;
      case 'sawtooth':
        osc.type = 'sawtooth';
        break;
      case 'square':
        osc.type = 'square';
        break;
      case 'piano':
        osc.type = 'triangle';
        break;
      case 'pluck':
        osc.type = 'sawtooth';
        break;
    }
  }
}

export const audioEngine = new AudioEngine();
