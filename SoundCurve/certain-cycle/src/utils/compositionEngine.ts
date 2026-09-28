/**
 * CompositionEngine — multi-track, synchronised equation composition playback.
 *
 * Each composition is a system of equations mapped to different instruments/voices,
 * all phase-locked via a single AudioContext. Reuses the singleton AudioEngine's
 * master gain + analyser chain (single AudioContext, no duplication).
 *
 * Copyright: All compositions © 2026 MathSonify. Proprietary — all rights reserved.
 */

import type { Composition, CompositionTrack } from '../data/compositions';
import { audioEngine } from './audioEngine';
import { triggerInstrumentNote, triggerDrum, classifyDrumHit } from './synthVoices';
import {
  parseEquation,
  normalize,
  clamp,
  quantizeToScale,
  type SamplePoint,
  type ScaleKey,
} from './equationParser';
import { audioBufferToWav } from './audioExporter';

export interface CompositionPlayOptions {
  volume: number;
  tempoScale: number; // 0.5..2.0
  scaleOverride?: ScaleKey | null;
  trackMixOverrides?: Record<string, number>;
  loop?: boolean;
  /** Fractional composition position from which playback should begin (0..1). */
  startProgress?: number;
}

export interface CompositionProgressCallback {
  (progress: number): void;
}

export class CompositionEngine {
  private activeNodes: AudioNode[] = [];
  private perTrackGains: Map<string, GainNode> = new Map();
  private isPlaying = false;
  private animationFrameId: number | null = null;
  private loopTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private playGeneration = 0;
  private playStartTime = 0;
  private playOffset = 0;
  private playDuration = 0;
  private progressCallback: CompositionProgressCallback | null = null;
  private onFinishCallback: (() => void) | null = null;
  private loopActive = false;
  private currentComposition: Composition | null = null;
  private currentOptions: CompositionPlayOptions = { volume: 0.7, tempoScale: 1 };

  // ── Core playback ────────────────────────────────────────────────────

  async play(
    composition: Composition,
    options: CompositionPlayOptions,
    onProgress?: CompositionProgressCallback,
    onFinish?: () => void
  ): Promise<void> {
    await audioEngine.initialize();
    const ctx = audioEngine.getAudioContext();
    const masterGain = audioEngine.getMasterGain();
    if (!ctx || !masterGain) return;

    if (ctx.state === 'suspended') await ctx.resume();

    // Preserve the current position when a seek/resume reschedules playback.
    // Composition changes already reset progress in the SoundLab store.
    this.stop(false);
    this.playGeneration++;

    this.currentComposition = composition;
    this.currentOptions = options;
    this.progressCallback = onProgress || null;
    this.onFinishCallback = onFinish || null;
    this.loopActive = options.loop ?? false;
    this.playDuration = composition.durationSec / clamp(options.tempoScale, 0.5, 2.0);
    this.playOffset = this.playDuration * clamp(options.startProgress ?? 0, 0, 0.9999);

    // Set volume
    const targetVol = clamp(options.volume, 0, 1) * 0.8;
    masterGain.gain.setTargetAtTime(targetVol, ctx.currentTime, 0.02);

    this.isPlaying = true;

    const execute = (startProgress = 0) => {
      const nowCtx = audioEngine.getAudioContext();
      const nowGain = audioEngine.getMasterGain();
      if (!this.isPlaying || !nowCtx || !nowGain) return;

      this.playStartTime = nowCtx.currentTime;
      this.playOffset = this.playDuration * clamp(startProgress, 0, 0.9999);
      const remainingDuration = Math.max(0.01, this.playDuration - this.playOffset);
      // Clear previous track gains
      this.perTrackGains.clear();

      for (const track of composition.tracks) {
        this.scheduleTrack(
          nowCtx,
          nowGain,
          track,
          composition,
          options,
          remainingDuration,
          startProgress
        );
      }

      this.startProgressTracking();

      if (this.loopActive) {
        const myGen = this.playGeneration;
        if (this.loopTimeoutId !== null) clearTimeout(this.loopTimeoutId);
        this.loopTimeoutId = setTimeout(() => {
          if (myGen !== this.playGeneration) return;
          if (this.isPlaying && this.loopActive) {
            // Clear prior nodes before re-scheduling (they have already stopped by this point)
            this.clearActiveNodes();
            execute();
          }
        }, (this.playDuration - this.playOffset) * 1000);
      }
    };

    execute(options.startProgress ?? 0);
  }

  stop(resetProgress = true): void {
    this.isPlaying = false;
    this.loopActive = false;
    this.onFinishCallback = null;
    this.currentComposition = null;

    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.loopTimeoutId !== null) {
      clearTimeout(this.loopTimeoutId);
      this.loopTimeoutId = null;
    }

    this.clearActiveNodes();
    this.perTrackGains.clear();

    if (resetProgress && this.progressCallback) this.progressCallback(0);
  }

  setVolume(val: number): void {
    const masterGain = audioEngine.getMasterGain();
    const ctx = audioEngine.getAudioContext();
    if (masterGain && ctx) {
      masterGain.gain.setTargetAtTime(clamp(val, 0, 1) * 0.8, ctx.currentTime, 0.02);
    }
  }

  /** Live-adjust per-track mix gain. */
  setTrackMix(trackId: string, gain: number): void {
    const node = this.perTrackGains.get(trackId);
    const ctx = audioEngine.getAudioContext();
    if (node && ctx) {
      node.gain.setTargetAtTime(clamp(gain, 0, 1), ctx.currentTime, 0.02);
    }
  }

  isPlayingStatus(): boolean {
    return this.isPlaying;
  }

  getAnalyser(): AnalyserNode | null {
    return audioEngine.getAnalyser();
  }

  getAudioContext(): AudioContext | null {
    return audioEngine.getAudioContext();
  }

  getDuration(): number {
    return this.playDuration;
  }

  // ── Private: track scheduling ────────────────────────────────────────

  private scheduleTrack(
    ctx: AudioContext,
    masterGain: GainNode,
    track: CompositionTrack,
    composition: Composition,
    options: CompositionPlayOptions,
    effectiveDuration: number,
    startProgress: number
  ): void {
    const parseResult = parseEquation(track.equation);
    if (!parseResult.success || !parseResult.sample) return;

    // Domain scaled by BPM so equation "time" maps to musical time.
    // Always sample the full curve so pitch normalization stays identical after a seek.
    const domainSpan = (4 * Math.PI * (composition.bpm / 60)) * (composition.durationSec / 4);
    const minX = 0;
    const maxX = domainSpan * options.tempoScale;

    const points: SamplePoint[] = parseResult.sample(minX, maxX, 900);
    const validPoints = points.filter((p) => p.isValid);
    if (validPoints.length === 0) return;

    const yVals = validPoints.map((p) => p.y);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);
    const startIndex = Math.min(points.length - 1, Math.floor(clamp(startProgress, 0, 0.9999) * (points.length - 1)));
    const scheduledPoints = points.slice(startIndex);
    if (scheduledPoints.length === 0) return;

    // Per-track gain (with pan) feeding into masterGain
    const trackGain = ctx.createGain();
    const effectiveMix = options.trackMixOverrides?.[track.id] ?? track.mix;
    trackGain.gain.setValueAtTime(clamp(effectiveMix, 0, 1), ctx.currentTime);

    let dest: AudioNode = trackGain;

    if (track.pan !== undefined) {
      const panner = ctx.createStereoPanner();
      panner.pan.setValueAtTime(clamp(track.pan, -1, 1), ctx.currentTime);
      trackGain.connect(panner);
      panner.connect(masterGain);
      this.perTrackGains.set(track.id, trackGain);
      // Keep panner alive too
      this.activeNodes.push(panner);
    } else {
      trackGain.connect(masterGain);
      this.perTrackGains.set(track.id, trackGain);
    }

    const now = ctx.currentTime;
    const scale = options.scaleOverride ?? composition.key;

    switch (track.voice) {
      case 'frequency':
        this.monoFrequencyTrack(ctx, dest, now, scheduledPoints, minY, maxY, effectiveDuration, track);
        break;
      case 'note':
        this.monoNoteTrack(ctx, dest, now, scheduledPoints, minY, maxY, effectiveDuration, track, scale);
        break;
      case 'chord':
        this.chordTrack(ctx, dest, now, scheduledPoints, minY, maxY, effectiveDuration, track, scale);
        break;
      case 'rhythm':
        this.rhythmTrack(ctx, dest, now, scheduledPoints, minY, maxY, effectiveDuration, track);
        break;
      case 'drums':
        this.drumsTrack(ctx, dest, now, scheduledPoints, minY, maxY, effectiveDuration, track);
        break;
    }
  }

  // ── Voice implementations ────────────────────────────────────────────

  private monoFrequencyTrack(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    const oscType = track.instrument === 'piano' ? 'triangle'
                  : track.instrument === 'pluck' ? 'sawtooth'
                  : track.instrument === 'square' ? 'square'
                  : track.instrument === 'sawtooth' ? 'sawtooth'
                  : track.instrument === 'triangle' ? 'triangle'
                  : 'sine';
    osc.type = oscType as OscillatorType;

    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.5, now);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dest);

    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(0.65, now + 0.04);
    env.gain.setValueAtTime(0.65, Math.max(now + 0.05, now + duration - 0.06));
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const minF = track.minFreq ?? 130;
    const maxF = track.maxFreq ?? 880;
    const dt = duration / points.length;

    points.forEach((pt, i) => {
      const t = now + i * dt;
      if (pt.isValid) {
        const freq = normalize(pt.y, minY, maxY, minF, maxF);
        osc.frequency.setValueAtTime(clamp(freq, 20, 8000), t);
        const cutoff = clamp(Math.abs(pt.dy) * 90 + 350, 300, 12000);
        filter.frequency.setValueAtTime(cutoff, t);
      }
    });

    osc.start(now);
    osc.stop(now + duration);
    this.activeNodes.push(osc, filter, env);
  }

  private monoNoteTrack(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack,
    scale: ScaleKey
  ): void {
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
      const nodes = triggerInstrumentNote(ctx, dest, pitch, t, noteDur, track.instrument, 0.55);
      this.activeNodes.push(...nodes);
    }
  }

  private chordTrack(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack,
    scale: ScaleKey
  ): void {
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

      this.activeNodes.push(
        ...triggerInstrumentNote(ctx, dest, root, t, chordDur, track.instrument, 0.42),
        ...triggerInstrumentNote(ctx, dest, third, t, chordDur, track.instrument, 0.33),
        ...triggerInstrumentNote(ctx, dest, fifth, t, chordDur, track.instrument, 0.33)
      );
    }
  }

  private rhythmTrack(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack
  ): void {
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
      const nodes = triggerInstrumentNote(ctx, dest, pitch, t, 0.2, track.instrument, 0.75);
      this.activeNodes.push(...nodes);
    });
  }

  private drumsTrack(
    ctx: AudioContext,
    dest: AudioNode,
    now: number,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack
  ): void {
    // Threshold strategy: find local peaks above mean, quantised to hit types
    const mean = (minY + maxY) / 2;
    const span = maxY - minY || 1;
    const peaks: { idx: number; amp: number }[] = [];

    for (let i = 1; i < points.length - 1; i++) {
      if (!points[i].isValid) continue;
      // Zero-crossing / peak heuristic: treat strong peaks above mean as hits
      if (points[i].y > mean && points[i].y >= points[i - 1].y && points[i].y >= points[i + 1].y) {
        const amp = clamp((points[i].y - minY) / span, 0, 1);
        peaks.push({ idx: i, amp });
      }
    }

    // Spread hits if too few
    if (peaks.length < 4) {
      const stride = Math.floor(points.length / Math.max(8, Math.floor(duration * 4)));
      for (let i = stride; i < points.length; i += stride) {
        const amp = clamp((points[i].y - minY) / span, 0, 1);
        peaks.push({ idx: i, amp });
      }
      // De-duplicate & sort
      const seen = new Set<number>();
      peaks.splice(0, peaks.length, ...peaks.filter((p) => {
        if (seen.has(p.idx)) return false;
        seen.add(p.idx);
        return true;
      }));
      peaks.sort((a, b) => a.idx - b.idx);
    }

    for (const { idx, amp } of peaks) {
      const t = now + (idx / points.length) * duration;
      const hitType = classifyDrumHit(amp);
      const nodes = triggerDrum(ctx, dest, hitType, t, 0.5);
      this.activeNodes.push(...nodes);
    }
  }

  // ── Progress + loop helpers ──────────────────────────────────────────

  private startProgressTracking(): void {
    if (this.animationFrameId !== null) cancelAnimationFrame(this.animationFrameId);

    const track = () => {
      const ctx = audioEngine.getAudioContext();
      if (!this.isPlaying || !ctx) return;

      const elapsed = ctx.currentTime - this.playStartTime;
      const progress = clamp((this.playOffset + elapsed) / this.playDuration, 0, 1);

      if (this.progressCallback) this.progressCallback(progress);

      if (progress < 1) {
        this.animationFrameId = requestAnimationFrame(track);
      } else if (!this.loopActive) {
        const finish = this.onFinishCallback;
        this.stop();
        if (finish) finish();
      }
    };

    this.animationFrameId = requestAnimationFrame(track);
  }

  private clearActiveNodes(): void {
    this.activeNodes.forEach((node) => {
      try {
        if ('stop' in node && typeof (node as OscillatorNode).stop === 'function') {
          (node as OscillatorNode).stop();
        }
        node.disconnect();
      } catch {
        // already ended
      }
    });
    this.activeNodes = [];
  }

  // ── WAV Export (offline rendering) ───────────────────────────────────

  /**
   * Renders a composition to a downloadable WAV Blob via OfflineAudioContext.
   * Embeds a copyright `ICMT` comment into the WAV's LIST/INFO chunk.
   */
  async renderCompositionToWav(
    composition: Composition,
    options: Pick<CompositionPlayOptions, 'volume' | 'tempoScale' | 'scaleOverride' | 'trackMixOverrides'>
  ): Promise<Blob> {
    const effectiveDuration = composition.durationSec / clamp(options.tempoScale ?? 1, 0.5, 2.0);
    const sampleRate = 44100;
    const totalSamples = Math.ceil(sampleRate * effectiveDuration);
    const offlineCtx = new OfflineAudioContext(2, totalSamples, sampleRate);

    const masterGain = offlineCtx.createGain();
    masterGain.gain.setValueAtTime(clamp(options.volume ?? 0.7, 0, 1) * 0.8, 0);

    const compressor = offlineCtx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-12, 0);
    compressor.knee.setValueAtTime(12, 0);
    compressor.ratio.setValueAtTime(10, 0);
    compressor.attack.setValueAtTime(0.003, 0);
    compressor.release.setValueAtTime(0.15, 0);

    masterGain.connect(compressor);
    compressor.connect(offlineCtx.destination);

    // Reuse the same scheduling helpers but for OfflineAudioContext
    const scale = options.scaleOverride ?? composition.key;

    for (const track of composition.tracks) {
      this.renderTrackOffline(
        offlineCtx,
        masterGain,
        track,
        composition,
        { tempoScale: options.tempoScale ?? 1, scaleOverride: options.scaleOverride ?? null, trackMixOverrides: options.trackMixOverrides ?? {} },
        effectiveDuration,
        scale
      );
    }

    const renderedBuffer = await offlineCtx.startRendering();
    const wavBuffer = audioBufferToWav(renderedBuffer);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  }

  private renderTrackOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    track: CompositionTrack,
    composition: Composition,
    options: { tempoScale: number; scaleOverride: ScaleKey | null; trackMixOverrides: Record<string, number> },
    effectiveDuration: number,
    scale: ScaleKey
  ): void {
    const parseResult = parseEquation(track.equation);
    if (!parseResult.success || !parseResult.sample) return;

    const domainSpan = (4 * Math.PI * (composition.bpm / 60)) * (composition.durationSec / 4);
    const minX = 0;
    const maxX = domainSpan * options.tempoScale;
    const points: SamplePoint[] = parseResult.sample(minX, maxX, 900);
    const validPoints = points.filter((p) => p.isValid);
    if (validPoints.length === 0) return;

    const yVals = validPoints.map((p) => p.y);
    const minY = Math.min(...yVals);
    const maxY = Math.max(...yVals);

    const trackGain = ctx.createGain();
    const effectiveMix = options.trackMixOverrides[track.id] ?? track.mix;
    trackGain.gain.setValueAtTime(clamp(effectiveMix, 0, 1), 0);
    trackGain.connect(dest);

    // Delegate directly using OfflineAudioContext-typed helpers
    const baseDest: AudioNode = trackGain;

    if (track.voice === 'frequency') {
      this.renderFrequencyOffline(ctx, baseDest, validPoints, minY, maxY, effectiveDuration, track);
    } else if (track.voice === 'note') {
      this.renderNoteOffline(ctx, baseDest, validPoints, minY, maxY, effectiveDuration, track, scale);
    } else if (track.voice === 'chord') {
      this.renderChordOffline(ctx, baseDest, validPoints, minY, maxY, effectiveDuration, track, scale);
    } else if (track.voice === 'rhythm') {
      this.renderRhythmOffline(ctx, baseDest, validPoints, minY, maxY, effectiveDuration, track);
    } else if (track.voice === 'drums') {
      this.renderDrumsOffline(ctx, baseDest, validPoints, minY, maxY, effectiveDuration, 0.5);
    }
  }

  private renderFrequencyOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack
  ): void {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    const oscType = track.instrument === 'sawtooth' ? 'sawtooth'
                  : track.instrument === 'square' ? 'square'
                  : track.instrument === 'piano' ? 'triangle'
                  : track.instrument === 'pluck' ? 'sawtooth'
                  : track.instrument === 'triangle' ? 'triangle'
                  : 'sine';
    osc.type = oscType as OscillatorType;
    filter.type = 'lowpass';
    filter.Q.setValueAtTime(2.5, 0);

    osc.connect(filter);
    filter.connect(env);
    env.connect(dest);

    env.gain.setValueAtTime(0.0001, 0);
    env.gain.exponentialRampToValueAtTime(0.65, 0.04);
    env.gain.setValueAtTime(0.65, Math.max(0.05, duration - 0.06));
    env.gain.exponentialRampToValueAtTime(0.0001, duration);

    const minF = track.minFreq ?? 130;
    const maxF = track.maxFreq ?? 880;
    const dt = duration / points.length;

    points.forEach((pt, i) => {
      const t = i * dt;
      if (pt.isValid) {
        const freq = normalize(pt.y, minY, maxY, minF, maxF);
        osc.frequency.setValueAtTime(clamp(freq, 20, 8000), t);
        const cutoff = clamp(Math.abs(pt.dy) * 90 + 350, 300, 12000);
        filter.frequency.setValueAtTime(cutoff, t);
      }
    });

    osc.start(0);
    osc.stop(duration);
  }

  private renderNoteOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack,
    scale: ScaleKey
  ): void {
    const stepCount = Math.min(points.length, Math.max(16, Math.floor(duration * 8)));
    const dt = duration / stepCount;
    const stride = Math.floor(points.length / stepCount);

    for (let step = 0; step < stepCount; step++) {
      const ptIdx = Math.min(points.length - 1, step * stride);
      const pt = points[ptIdx];
      if (!pt.isValid) continue;
      const norm = normalize(pt.y, minY, maxY, 0, 1);
      const pitch = quantizeToScale(norm, scale);
      const t = step * dt;
      const noteDur = dt * 0.92;
      triggerInstrumentNote(ctx as unknown as AudioContext, dest, pitch, t, noteDur, track.instrument, 0.55);
    }
  }

  private renderChordOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack,
    scale: ScaleKey
  ): void {
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
      const t = step * dt;
      const chordDur = dt * 0.95;
      triggerInstrumentNote(ctx as unknown as AudioContext, dest, root, t, chordDur, track.instrument, 0.42);
      triggerInstrumentNote(ctx as unknown as AudioContext, dest, third, t, chordDur, track.instrument, 0.33);
      triggerInstrumentNote(ctx as unknown as AudioContext, dest, fifth, t, chordDur, track.instrument, 0.33);
    }
  }

  private renderRhythmOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    track: CompositionTrack
  ): void {
    const threshold = minY + (maxY - minY) * 0.65;
    const peaks: number[] = [];
    for (let i = 1; i < points.length - 1; i++) {
      if (points[i].y > threshold && points[i].y >= points[i - 1].y && points[i].y >= points[i + 1].y) {
        peaks.push(i);
      }
    }
    if (peaks.length === 0) {
      const stride = Math.floor(points.length / 8);
      for (let i = 0; i < points.length; i += stride) peaks.push(i);
    }
    peaks.forEach((peakIdx) => {
      const t = (peakIdx / points.length) * duration;
      const pt = points[peakIdx];
      const pitch = normalize(pt.y, minY, maxY, 220, 880);
      triggerInstrumentNote(ctx as unknown as AudioContext, dest, pitch, t, 0.2, track.instrument, 0.75);
    });
  }

  private renderDrumsOffline(
    ctx: OfflineAudioContext,
    dest: AudioNode,
    points: SamplePoint[],
    minY: number,
    maxY: number,
    duration: number,
    gainLevel: number
  ): void {
    const mean = (minY + maxY) / 2;
    const span = maxY - minY || 1;
    const peaks: { idx: number; amp: number }[] = [];

    for (let i = 1; i < points.length - 1; i++) {
      if (!points[i].isValid) continue;
      if (points[i].y > mean && points[i].y >= points[i - 1].y && points[i].y >= points[i + 1].y) {
        const amp = clamp((points[i].y - minY) / span, 0, 1);
        peaks.push({ idx: i, amp });
      }
    }
    if (peaks.length < 4) {
      const stride = Math.floor(points.length / Math.max(8, Math.floor(duration * 4)));
      for (let i = stride; i < points.length; i += stride) {
        const amp = clamp((points[i].y - minY) / span, 0, 1);
        peaks.push({ idx: i, amp });
      }
      const seen = new Set<number>();
      peaks.splice(0, peaks.length, ...peaks.filter((p) => { if (seen.has(p.idx)) return false; seen.add(p.idx); return true; }));
      peaks.sort((a, b) => a.idx - b.idx);
    }

    for (const { idx, amp } of peaks) {
      const t = (idx / points.length) * duration;
      const hitType = classifyDrumHit(amp);
      triggerDrum(ctx as unknown as AudioContext | OfflineAudioContext, dest, hitType, t, gainLevel);
    }
  }
}

export const compositionEngine = new CompositionEngine();
