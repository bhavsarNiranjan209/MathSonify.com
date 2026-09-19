/**
 * Music Lab — voice synthesis.
 *
 * Every voice is built from a `HarmonicRecipe` (see utils/musicLabEquation.ts),
 * so what the equation panel prints is literally what the oscillators play.
 *
 * All builders work on `BaseAudioContext`, which means the exact same code
 * renders live playback (AudioContext) and offline WAV export
 * (OfflineAudioContext). There is no second, "export-only" synthesis path that
 * could drift away from what the user heard.
 */

import type { MusicLabInstrument, MusicLabParameters } from '../data/musicLabInstruments';
import {
  harmonicRecipe,
  DRUM_PITCH_SWEEP,
  DRUM_SWEEP_TIME,
  DRUM_NOISE_DECAY_RATIO,
  type HarmonicRecipe,
} from './musicLabEquation';

/** Cap on simultaneously constructed partial oscillators per voice. */
const MAX_VOICE_PARTIALS = 8;

export interface VoiceOptions {
  /** Fundamental frequency in Hz (already pitch-shifted by the caller). */
  frequency: number;
  /** Absolute context time when the note starts. */
  start: number;
  /** Note length in seconds. */
  duration: number;
  /** 0..1 note velocity. */
  velocity: number;
  /** Stereo position -1..1. */
  pan: number;
}

/* ───────────────────────────── shared buffers ──────────────────────────── */

const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * One noise buffer per audio context, reused by every voice. Generating a
 * fresh buffer per note is the classic way to melt the main thread.
 */
export function sharedNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const cached = noiseCache.get(ctx);
  if (cached) return cached;
  const seconds = 3;
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let previous = 0;
  for (let index = 0; index < data.length; index += 1) {
    // Pink-ish noise: gentler than white, easier on the ear.
    const white = Math.random() * 2 - 1;
    previous = (previous + 0.02 * white) / 1.02;
    data[index] = previous * 3.2 + white * 0.35;
  }
  noiseCache.set(ctx, buffer);
  return buffer;
}

/** Impulse response for the convolution room send. */
export function createImpulseResponse(ctx: BaseAudioContext, seconds = 2.6, decay = 2.8): AudioBuffer {
  const length = Math.max(1, Math.ceil(ctx.sampleRate * seconds));
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const t = index / length;
      data[index] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return impulse;
}

/* ──────────────────────────────── envelopes ────────────────────────────── */

/** The ADSR envelope shared by every sustaining model. */
function applyEnvelope(
  gain: GainNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
  peak: number,
): void {
  const { attack, decay, sustain, release } = recipe.envelope;
  const start = options.start;
  const end = start + options.duration;
  const sustainLevel = Math.max(0.0001, peak * sustain);
  gain.gain.cancelScheduledValues(start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), start + attack);
  gain.gain.exponentialRampToValueAtTime(sustainLevel, start + attack + decay);
  gain.gain.setValueAtTime(sustainLevel, Math.max(start + attack + decay, end));
  gain.gain.exponentialRampToValueAtTime(0.0001, end + release);
}

/** Percussive envelope: near-instant attack, pure exponential fall. */
function applyPercussiveEnvelope(
  gain: GainNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
  peak: number,
  decaySeconds: number,
): void {
  const start = options.start;
  const end = start + Math.max(0.03, decaySeconds);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.linearRampToValueAtTime(
    Math.max(0.0001, peak),
    start + Math.max(0.0005, recipe.envelope.attack),
  );
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
}

function makeWaveshaper(ctx: BaseAudioContext, drive: number): WaveShaperNode {
  const shaper = ctx.createWaveShaper();
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let index = 0; index < samples; index += 1) {
    const x = (index / (samples - 1)) * 2 - 1;
    curve[index] = Math.tanh(drive * x);
  }
  shaper.curve = curve;
  shaper.oversample = '2x';
  return shaper;
}

/* ────────────────────────── model-specific cores ───────────────────────── */

/** FM: one carrier, one modulator — exactly as the equation prints it. */
function buildFmVoice(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  mix: AudioNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
): OscillatorNode {
  const carrier = ctx.createOscillator();
  carrier.type = 'sine';
  carrier.frequency.setValueAtTime(options.frequency, options.start);

  if (recipe.fm.index > 0.05) {
    const modulator = ctx.createOscillator();
    const modulatorGain = ctx.createGain();
    modulator.type = 'sine';
    modulator.frequency.setValueAtTime(options.frequency * recipe.fm.ratio, options.start);
    // The index is a frequency deviation in Hz: I · f0.
    modulatorGain.gain.setValueAtTime(recipe.fm.index * options.frequency, options.start);
    modulator.connect(modulatorGain);
    modulatorGain.connect(carrier.frequency);
    modulator.start(options.start);
    modulator.stop(options.start + options.duration + recipe.envelope.release + 0.05);
    nodes.push(modulator, modulatorGain);
  }

  carrier.connect(mix);
  nodes.push(carrier);
  return carrier;
}

function attachVibrato(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  target: AudioParam,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
): void {
  if (recipe.vibrato.depthCents <= 0.5) return;
  const vibrato = ctx.createOscillator();
  const vibratoGain = ctx.createGain();
  vibrato.frequency.setValueAtTime(recipe.vibrato.rate, options.start);
  vibratoGain.gain.setValueAtTime(recipe.vibrato.depthCents, options.start);
  vibrato.connect(vibratoGain);
  vibratoGain.connect(target);
  vibrato.start(options.start);
  vibrato.stop(options.start + options.duration + recipe.envelope.release + 0.05);
  nodes.push(vibrato, vibratoGain);
}

/** Additive / inharmonic: one sine per partial, at the exact printed multiple. */
function buildAdditiveVoice(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  mix: AudioNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
): void {
  const partials = recipe.partials.slice(0, MAX_VOICE_PARTIALS);
  for (const partial of partials) {
    const frequency = options.frequency * partial.multiple;
    if (frequency > ctx.sampleRate / 2.2) continue;
    const oscillator = ctx.createOscillator();
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, options.start);
    const partialGain = ctx.createGain();
    // Verbatim: `harmonicRecipe` already normalised the ladder, so this is the
    // exact coefficient the equation panel prints.
    partialGain.gain.setValueAtTime(partial.gain, options.start);
    oscillator.connect(partialGain);
    partialGain.connect(mix);
    oscillator.start(options.start);
    oscillator.stop(options.start + options.duration + recipe.envelope.release + 0.05);
    nodes.push(oscillator, partialGain);
  }
}

/** Subtractive: a PeriodicWave table built from the same partial gains. */
function buildSubtractiveVoice(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  mix: AudioNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
): OscillatorNode {
  const oscillator = ctx.createOscillator();
  const harmonics = Math.max(1, Math.min(MAX_VOICE_PARTIALS, recipe.partials.length));
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (const partial of recipe.partials) {
    // PeriodicWave is limited to integer harmonics; subtractive instruments are
    // integer-partial by construction, so this is lossless for them.
    const harmonic = Math.max(1, Math.round(partial.multiple / recipe.pitchRatio));
    if (harmonic > harmonics) continue;
    // Verbatim coefficient — same number the equation panel prints.
    imag[harmonic] = partial.gain;
  }
  oscillator.setPeriodicWave(ctx.createPeriodicWave(real, imag, { disableNormalization: true }));
  oscillator.frequency.setValueAtTime(options.frequency, options.start);
  oscillator.connect(mix);
  nodes.push(oscillator);
  return oscillator;
}

/** Percussive body: pitched sine with the exact sweep the equation prints. */
function buildDrumBody(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  mix: AudioNode,
  recipe: HarmonicRecipe,
  options: VoiceOptions,
): void {
  const oscillator = ctx.createOscillator();
  oscillator.type = 'sine';
  const base = options.frequency * (recipe.partials[0]?.multiple ?? recipe.pitchRatio);
  oscillator.frequency.setValueAtTime(base * (1 + DRUM_PITCH_SWEEP), options.start);
  oscillator.frequency.exponentialRampToValueAtTime(base, options.start + DRUM_SWEEP_TIME);
  oscillator.connect(mix);
  oscillator.start(options.start);
  oscillator.stop(options.start + Math.max(0.2, recipe.decay) + 0.1);
  nodes.push(oscillator);
}

function buildNoiseSource(
  ctx: BaseAudioContext,
  nodes: AudioNode[],
  destination: AudioNode,
  amount: number,
  options: VoiceOptions,
  decaySeconds: number,
): void {
  if (amount <= 0.01) return;
  const source = ctx.createBufferSource();
  source.buffer = sharedNoiseBuffer(ctx);
  source.loop = true;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, options.start);
  gain.gain.linearRampToValueAtTime(Math.min(1, amount), options.start + 0.002);
  gain.gain.exponentialRampToValueAtTime(0.0001, options.start + Math.max(0.03, decaySeconds));
  source.connect(gain);
  gain.connect(destination);
  source.start(options.start);
  source.stop(options.start + Math.max(0.05, decaySeconds) + 0.05);
  nodes.push(source, gain);
}

/* ──────────────────────────── the full voice ───────────────────────────── */

/**
 * Builds one complete voice and connects it to `destination`.
 * Returns every node created so the caller can release them afterwards.
 */
export function buildVoice(
  ctx: BaseAudioContext,
  destination: AudioNode,
  instrument: MusicLabInstrument,
  params: MusicLabParameters,
  options: VoiceOptions,
  recipeOverride?: HarmonicRecipe,
): AudioNode[] {
  const recipe = recipeOverride ?? harmonicRecipe(instrument, params);
  const nodes: AudioNode[] = [];

  const peak = Math.min(0.6, recipe.gain * options.velocity * 0.5);
  if (peak <= 0.0002) return nodes;

  const amplitude = ctx.createGain();
  const panner = ctx.createStereoPanner();
  const filter = ctx.createBiquadFilter();
  const tremoloGain = ctx.createGain();
  const mix = ctx.createGain();

  // Base pan plus a random offset scaled by the recipe's stereo width.
  const spread = (Math.random() - 0.5) * 0.55 * recipe.width;
  panner.pan.setValueAtTime(Math.max(-1, Math.min(1, options.pan + spread)), options.start);

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.max(60, recipe.filterCutoff), options.start);
  filter.Q.setValueAtTime(recipe.filterQ, options.start);

  tremoloGain.gain.setValueAtTime(1, options.start);
  if (recipe.tremolo.depth > 0.01) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(recipe.tremolo.rate, options.start);
    lfoGain.gain.setValueAtTime(recipe.tremolo.depth, options.start);
    lfo.connect(lfoGain);
    lfoGain.connect(tremoloGain.gain);
    lfo.start(options.start);
    lfo.stop(options.start + options.duration + recipe.envelope.release + 0.05);
    nodes.push(lfo, lfoGain);
  }

  mix.gain.setValueAtTime(1, options.start);

  // ── model-specific core ──
  if (recipe.model === 'fm') {
    const carrier = buildFmVoice(ctx, nodes, mix, recipe, options);
    attachVibrato(ctx, nodes, carrier.detune, recipe, options);
  } else if (recipe.model === 'drum') {
    buildDrumBody(ctx, nodes, mix, recipe, options);
  } else if (recipe.model === 'subtractive') {
    const oscillator = buildSubtractiveVoice(ctx, nodes, mix, recipe, options);
    // Classic subtractive gesture: the filter closes as the note settles.
    filter.frequency.setValueAtTime(Math.max(120, recipe.filterCutoff * 1.6), options.start);
    filter.frequency.exponentialRampToValueAtTime(
      Math.max(80, recipe.filterCutoff * 0.45),
      options.start + options.duration + recipe.envelope.release,
    );
    attachVibrato(ctx, nodes, oscillator.detune, recipe, options);
  } else {
    // additive / pluck / noise share the partial-sum core.
    buildAdditiveVoice(ctx, nodes, mix, recipe, options);
  }

  // ── noise blend, shared by every model ──
  const noiseDecay = recipe.model === 'drum'
    // Matches the `e^(-t/…)` on the drum's noise term in the equation panel.
    ? Math.max(0.03, recipe.decay * DRUM_NOISE_DECAY_RATIO)
    : recipe.model === 'noise'
      ? Math.max(0.03, recipe.decay)
      : Math.max(0.05, Math.min(options.duration, recipe.decay));
  buildNoiseSource(ctx, nodes, mix, recipe.noise, options, noiseDecay);

  // ── audio-rate ring modulation wrapped around the whole core ──
  if (recipe.am.depth > 0.01) {
    const ringGain = ctx.createGain();
    ringGain.gain.setValueAtTime(1 - recipe.am.depth * 0.5, options.start);
    const ringLfo = ctx.createOscillator();
    const ringDepth = ctx.createGain();
    ringLfo.type = 'sine';
    ringLfo.frequency.setValueAtTime(
      Math.min(ctx.sampleRate / 4, Math.max(1, options.frequency * recipe.am.rate)),
      options.start,
    );
    ringDepth.gain.setValueAtTime(recipe.am.depth * 0.5, options.start);
    ringLfo.connect(ringDepth);
    ringDepth.connect(ringGain.gain);
    ringLfo.start(options.start);
    ringLfo.stop(options.start + options.duration + recipe.envelope.release + 0.05);
    mix.connect(ringGain);
    ringGain.connect(filter);
    nodes.push(ringGain, ringLfo, ringDepth);
  } else {
    mix.connect(filter);
  }

  // ── drive, then tremolo, then the amplitude envelope ──
  if (recipe.drive > 1.001) {
    const shaper = makeWaveshaper(ctx, recipe.drive);
    filter.connect(shaper);
    shaper.connect(tremoloGain);
    nodes.push(shaper);
  } else {
    filter.connect(tremoloGain);
  }

  if (recipe.model === 'drum' || recipe.model === 'noise') {
    applyPercussiveEnvelope(amplitude, recipe, options, peak, Math.max(0.05, recipe.decay));
  } else {
    applyEnvelope(amplitude, recipe, options, peak);
  }

  tremoloGain.connect(amplitude);
  amplitude.connect(panner);
  panner.connect(destination);
  nodes.push(mix, filter, tremoloGain, amplitude, panner);
  return nodes;
}