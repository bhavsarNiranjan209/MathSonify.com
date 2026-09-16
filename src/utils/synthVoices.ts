/**
 * Shared synthesis helpers for both AudioEngine and CompositionEngine.
 * Contains oscillator shape mapping, note triggering, and drum synthesis.
 */

import { clamp, normalize } from './equationParser';
import type { InstrumentType } from '../store/studioStore';

// ── Oscillator shape ─────────────────────────────────────────────────

export function applyOscillatorShape(osc: OscillatorNode, instrument: InstrumentType): void {
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

// ── Note triggering (online context) ─────────────────────────────────

/**
 * Triggers a single instrument note on an online AudioContext, routed to `dest`.
 * Returns the created nodes for cleanup tracking.
 */
export function triggerInstrumentNote(
  ctx: AudioContext,
  dest: AudioNode,
  frequency: number,
  startTime: number,
  duration: number,
  instrument: InstrumentType,
  gainLevel = 0.5
): AudioNode[] {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const nodes: AudioNode[] = [osc, filter, gain];

  applyOscillatorShape(osc, instrument);

  if (instrument === 'pluck') {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 6, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      frequency * 1.2,
      startTime + Math.min(0.2, duration)
    );

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainLevel * 1.1, startTime + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  } else if (instrument === 'piano') {
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(frequency * 2, startTime);
    nodes.push(osc2);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 4.5, startTime);
    osc.frequency.setValueAtTime(frequency, startTime);

    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(gainLevel * 0.5, startTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc2.start(startTime);
    osc2.stop(startTime + duration + 0.05);
  } else {
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(frequency * 4, startTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.frequency.setValueAtTime(frequency, startTime);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(gainLevel, startTime + 0.02);
    gain.gain.setValueAtTime(
      gainLevel * 0.8,
      Math.max(startTime + 0.03, startTime + duration - 0.05)
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
  }

  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);

  return nodes;
}

// ── Drum synthesis ───────────────────────────────────────────────────

/** Drum hit types derived from waveform amplitude quantization. */
export type DrumHitType = 'kick' | 'snare' | 'hihat';

/**
 * Derives a drum hit type from a normalised amplitude value.
 * Low → kick, mid → snare, high → hi-hat.
 */
export function classifyDrumHit(normalisedAmplitude: number): DrumHitType {
  if (normalisedAmplitude < 0.35) return 'kick';
  if (normalisedAmplitude < 0.7) return 'snare';
  return 'hihat';
}

/** Create a short white-noise buffer for snare/hat synthesis. */
function createNoiseBuffer(ctx: AudioContext | OfflineAudioContext, duration = 0.15): AudioBuffer {
  const sampleRate = ctx.sampleRate;
  const length = Math.ceil(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
}

/**
 * Triggers a synthesised drum hit on the given context.
 * Returns created nodes for cleanup.
 */
export function triggerDrum(
  ctx: AudioContext | OfflineAudioContext,
  dest: AudioNode,
  hitType: DrumHitType,
  startTime: number,
  gainLevel = 0.6
): AudioNode[] {
  const nodes: AudioNode[] = [];

  if (hitType === 'kick') {
    // Kick: sine oscillator with exponential pitch drop (120 Hz → 40 Hz)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, startTime);
    osc.frequency.exponentialRampToValueAtTime(40, startTime + 0.08);

    gain.gain.setValueAtTime(gainLevel, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.25);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(startTime);
    osc.stop(startTime + 0.3);
    nodes.push(osc, gain);
  } else if (hitType === 'snare') {
    // Snare: noise burst through bandpass + a short body sine
    const noiseBuffer = createNoiseBuffer(ctx, 0.15);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.frequency.setValueAtTime(3000, startTime);
    bandpass.Q.setValueAtTime(0.8, startTime);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(gainLevel * 0.7, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.12);

    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(dest);

    // Body tone
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.setValueAtTime(185, startTime);
    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(gainLevel * 0.5, startTime);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.08);
    body.connect(bodyGain);
    bodyGain.connect(dest);

    noise.start(startTime);
    noise.stop(startTime + 0.15);
    body.start(startTime);
    body.stop(startTime + 0.1);
    nodes.push(noise, bandpass, noiseGain, body, bodyGain);
  } else {
    // Hi-hat: high-pass filtered noise burst
    const noiseBuffer = createNoiseBuffer(ctx, 0.08);
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.setValueAtTime(7000, startTime);

    const hatGain = ctx.createGain();
    hatGain.gain.setValueAtTime(gainLevel * 0.5, startTime);
    hatGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.06);

    noise.connect(hp);
    hp.connect(hatGain);
    hatGain.connect(dest);

    noise.start(startTime);
    noise.stop(startTime + 0.08);
    nodes.push(noise, hp, hatGain);
  }

  return nodes;
}
