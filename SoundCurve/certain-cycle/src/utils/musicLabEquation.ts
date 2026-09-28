/**
 * Music Lab — equation engine.
 *
 * THE RULE: one recipe, two consumers.
 *
 *   harmonicRecipe(instrument, params) ─┬─▶ musicLabSynth  builds oscillators from it
 *                                       └─▶ renderEquation prints it as text
 *
 * The synth never receives a number the panel has not printed, and the panel
 * never prints a number the synth does not use. `harmonicRecipe` is the only
 * place parameters are interpreted; everything downstream is a pure transform
 * of its output.
 */

import type {
  HarmonicPartial,
  MusicLabInstrument,
  MusicLabParameters,
  MusicLabSynthesis,
} from '../data/musicLabInstruments';

/* ────────────────────────────── pitch maths ────────────────────────────── */

/** A4 = 440 Hz, equal temperament. */
export function frequencyForMidi(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function midiForFrequency(frequency: number): number {
  return 69 + 12 * Math.log2(Math.max(1e-6, frequency) / 440);
}

/**
 * Semitone offset → frequency multiplier.
 * `pitchMultiplier(3)` = 1.189207115 — the 1.1892 the equation panel shows.
 */
export function pitchMultiplier(semitones: number): number {
  return Math.pow(2, semitones / 12);
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

/* ────────────────────────────── the recipe ─────────────────────────────── */

export interface RecipePartial {
  /** Multiple of the fundamental, already pitch-shifted. */
  multiple: number;
  /** Final amplitude 0..1 used verbatim by the oscillator gain. */
  gain: number;
}

export interface HarmonicRecipe {
  model: MusicLabSynthesis;
  /** `2^(pitch/12)` — the number that multiplies every `x` in the equation. */
  pitchRatio: number;
  partials: RecipePartial[];
  /** Broadband noise blend 0..1. */
  noise: number;
  /** tanh() drive. 1 = identity (no waveshaping). */
  drive: number;
  fm: { index: number; ratio: number };
  am: { depth: number; rate: number };
  tremolo: { depth: number; rate: number };
  vibrato: { depthCents: number; rate: number };
  envelope: { attack: number; decay: number; sustain: number; release: number };
  /** Percussive body decay in seconds. */
  decay: number;
  /** Lowpass cutoff in Hz for the voice's own filter. */
  filterCutoff: number;
  filterQ: number;
  /** Stereo width 0..1. */
  width: number;
  /** Absolute amplitude scale 0..1. */
  gain: number;
}

/** Partials above this count are dropped before the recipe is built. */
const MAX_PARTIALS = 10;

/**
 * Percussive pitch sweep: the body starts `1 + DRUM_PITCH_SWEEP` times above
 * its fundamental and falls back over DRUM_SWEEP_TIME seconds. Both constants
 * are printed by `renderEquation` and consumed by the drum voice builder.
 */
export const DRUM_PITCH_SWEEP = 1.4;
export const DRUM_SWEEP_TIME = 0.05;
/** The drum's noise transient decays this much faster than the body. */
export const DRUM_NOISE_DECAY_RATIO = 0.35;

/** Builds the recipe. Identical numbers feed the synth and the equation text. */
export function harmonicRecipe(
  instrument: MusicLabInstrument,
  params: MusicLabParameters,
): HarmonicRecipe {
  const pitchRatio = pitchMultiplier(params.pitch);
  const richness = clamp(params.harmonics / 100, 0, 1);
  const brightness = clamp(params.brightness / 100, 0, 1);
  const warmth = clamp(params.warmth / 100, 0, 1);
  const filter = clamp(params.filter / 100, 0, 1);

  const source = instrument.harmonics.slice(0, MAX_PARTIALS);
  const span = Math.max(1, source.length - 1);

  const partials: RecipePartial[] = source.map((partial, index) => {
    // Richness acts as a soft ceiling: partial 0 always survives, later
    // partials fade in as the slider travels up.
    const keep = index === 0 ? 1 : clamp(richness * source.length - index, 0, 1);
    // Brightness lifts the top of the ladder, warmth lifts the bottom.
    const position = index / span;
    const brightFactor = clamp(1 + (brightness - 0.5) * 2 * position, 0, 2);
    const warmFactor = clamp(1 + (warmth - 0.5) * 2 * (1 - position), 0, 2);
    const gain = clamp(partial.gain * keep * brightFactor * warmFactor, 0, 1);
    return { multiple: partial.multiple * pitchRatio, gain };
  }).filter((partial) => partial.gain > 0.001);

  // The fundamental is never allowed to vanish entirely.
  if (source.length > 0 && !partials.some((partial) => partial.multiple <= pitchRatio * 1.001)) {
    partials.unshift({ multiple: pitchRatio, gain: clamp(source[0].gain, 0.15, 1) });
  }

  // Sub-octave reinforcement.
  const subGain = clamp(params.sub / 100, 0, 1) * 0.75;
  if (subGain > 0.004) {
    partials.unshift({ multiple: pitchRatio * 0.5, gain: subGain });
  }

  /*
   * Normalise the ladder so the printed coefficients ARE the coefficients the
   * oscillator gains use — the panel never prints a pre-scaled number. Only
   * ever divides (never boosts), so relative harmonic balance is preserved.
   */
  const totalGain = partials.reduce((sum, partial) => sum + partial.gain, 0);
  const normalised = totalGain > 1
    ? partials.map((partial) => ({ ...partial, gain: partial.gain / totalGain }))
    : partials;

  const second = source[1]?.multiple ?? 2;

  return {
    model: instrument.synthesis,
    pitchRatio,
    partials: normalised,
    // Noise opens up with the filter and brightness — it is the same
    // `noise(x)` term the panel prints.
    noise: clamp(instrument.noise * (0.4 + filter * 0.9) * (0.6 + brightness * 0.8), 0, 1),
    drive: params.distortion <= 0 ? 1 : 1 + (params.distortion / 100) * 12,
    fm: {
      index: (params.fm / 100) * 8,
      ratio: second,
    },
    am: {
      depth: (params.am / 100) * 0.85,
      rate: second,
    },
    tremolo: {
      depth: (params.tremolo / 100) * 0.65,
      rate: 5,
    },
    vibrato: {
      depthCents: (params.vibrato / 100) * 45,
      rate: 5.4,
    },
    envelope: {
      attack: clamp(params.attack, 0.002, 4),
      decay: clamp(params.decay, 0.01, 4),
      sustain: clamp(params.sustain, 0, 1),
      release: clamp(params.release, 0.01, 6),
    },
    decay: clamp(instrument.bodyDecay, 0.03, 8),
    // 60 Hz .. ~5.6 kHz, tilted by brightness.
    filterCutoff: clamp(60 * Math.pow(2, filter * 6.4) * Math.pow(2, (brightness - 0.5) * 1.6), 40, 18000),
    filterQ: 0.6 + (params.distortion / 100) * 3,
    width: clamp(params.width / 100, 0, 1),
    gain: clamp(params.intensity / 100, 0, 1),
  };
}

/* ────────────────────────── equation text ─────────────────────────────── */

/** How many partials the panel prints before it elides the tail. */
const DISPLAY_LIMIT = 5;

const fmt = (value: number, digits: number): string =>
  Number(value.toFixed(digits)).toString();

function partialTerm(partial: RecipePartial): string {
  const amplitude = fmt(partial.gain, 2);
  const multiple = fmt(partial.multiple, 4);
  return `${amplitude}·sin(${multiple}x)`;
}

function bodyExpression(recipe: HarmonicRecipe): string {
  const shown = recipe.partials.slice(0, DISPLAY_LIMIT);
  const hidden = recipe.partials.length - shown.length;
  const sum = shown.map(partialTerm).join(' + ')
    + (hidden > 0 ? ` + ${hidden} more` : '');
  return sum || '0';
}

function noiseTerm(recipe: HarmonicRecipe): string {
  return recipe.noise > 0.01 ? `${fmt(recipe.noise, 2)}·noise(x)` : '';
}

function additiveCore(recipe: HarmonicRecipe): string {
  const partials = bodyExpression(recipe);
  const noise = noiseTerm(recipe);
  if (!noise) return partials;
  return partials === '0' ? noise : `${partials} + ${noise}`;
}

function fmCore(recipe: HarmonicRecipe): string {
  const k = fmt(recipe.pitchRatio, 4);
  if (recipe.fm.index <= 0.05) return `sin(${k}x)`;
  const { index, ratio } = recipe.fm;
  return `sin(${k}x + ${fmt(index, 2)}·sin(${fmt(ratio, 2)}·${k}x))`;
}

function applyEquationModulation(body: string, recipe: HarmonicRecipe): string {
  let modulated = body;
  const amDepth = recipe.am.depth;
  if (amDepth > 0.01) {
    const k = fmt(recipe.pitchRatio, 4);
    const carrier = `${fmt(recipe.am.rate, 2)}·${k}x`;
    const base = fmt(1 - amDepth * 0.5, 2);
    const sideband = fmt(amDepth * 0.5, 2);
    modulated = `[${base} + ${sideband}·sin(${carrier})]·(${modulated})`;
  }

  if (recipe.drive > 1.001) {
    modulated = `tanh(${fmt(recipe.drive, 1)}·(${modulated}))`;
  }

  const { depth: tremoloDepth, rate: tremoloRate } = recipe.tremolo;
  if (tremoloDepth > 0.01) {
    modulated = `[1 + ${fmt(tremoloDepth, 2)}·sin(${fmt(tremoloRate, 2)}x)]·(${modulated})`;
  }
  return modulated;
}

/**
 * Renders the current mathematical state as a readable equation.
 *
 * Every number here comes from `harmonicRecipe` — the same object the
 * synthesiser reads — so the panel and the sound cannot drift apart.
 */
export function renderEquation(
  instrument: MusicLabInstrument,
  params: MusicLabParameters,
  recipe: HarmonicRecipe = harmonicRecipe(instrument, params),
): string {
  let core: string;

  if (recipe.model === 'fm') {
    const noise = noiseTerm(recipe);
    core = noise ? `${fmCore(recipe)} + ${noise}` : fmCore(recipe);
  } else if (recipe.model === 'drum') {
    const k = fmt(recipe.partials[0]?.multiple ?? recipe.pitchRatio, 4);
    const body = `sin(${k}x·(1 + ${fmt(DRUM_PITCH_SWEEP, 1)}·e^(-t/${fmt(DRUM_SWEEP_TIME, 2)})))`;
    const noise = noiseTerm(recipe);
    const noiseDecay = Math.max(0.03, recipe.decay * DRUM_NOISE_DECAY_RATIO);
    core = noise
      ? `${body} + ${noise}·e^(-t/${fmt(noiseDecay, 2)})`
      : body;
  } else {
    core = additiveCore(recipe);
  }

  let body = applyEquationModulation(core, recipe);

  if (recipe.model === 'pluck' || recipe.model === 'noise') {
    body = `(${body})·e^(-t/${fmt(recipe.decay, 2)})`;
  } else if (recipe.model === 'drum') {
    body = `e^(-t/${fmt(recipe.decay, 2)})·(${body})`;
  }

  return body;
}

/** The instrument's default parameter state, matching Reset. */
export function renderBaseEquation(instrument: MusicLabInstrument): string {
  return renderEquation(instrument, instrument.defaults);
}

function partialSum(recipe: HarmonicRecipe, x: number): number {
  let sum = 0;
  for (const partial of recipe.partials) {
    sum += partial.gain * Math.sin(partial.multiple * x);
  }
  return sum;
}

const NOISE_STEP = Math.PI / 32;

function noiseSample(x: number): number {
  const position = x / NOISE_STEP;
  const cell = Math.floor(position);
  const fraction = position - cell;
  const smooth = fraction * fraction * (3 - 2 * fraction);
  const hash = (index: number): number => {
    const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  return (hash(cell) * (1 - smooth) + hash(cell + 1) * smooth) * 2 - 1;
}

function noiseValue(recipe: HarmonicRecipe, x: number): number {
  return recipe.noise > 0.01 ? recipe.noise * noiseSample(x) : 0;
}

function decayFactor(recipe: HarmonicRecipe, time: number): number {
  return Math.exp(-Math.max(0, time) / recipe.decay);
}

function drumNoiseDecay(recipe: HarmonicRecipe): number {
  return Math.max(0.03, recipe.decay * DRUM_NOISE_DECAY_RATIO);
}

/**
 * The recipe's shape as a function of phase `x`. `time` is optional so the
 * existing equation graph callers can keep using the phase-only signature;
 * percussive models use it to apply the same decay shown in their equation.
 */
export function evaluateRecipe(recipe: HarmonicRecipe, x: number, time = 0): number {
  let core: number;

  if (recipe.model === 'fm') {
    const carrier = recipe.pitchRatio * x;
    core = Math.sin(carrier + recipe.fm.index * Math.sin(recipe.fm.ratio * carrier))
      + noiseValue(recipe, x);
  } else if (recipe.model === 'drum') {
    const multiple = recipe.partials[0]?.multiple ?? recipe.pitchRatio;
    const sweep = 1 + DRUM_PITCH_SWEEP * Math.exp(-Math.max(0, time) / DRUM_SWEEP_TIME);
    const body = Math.sin(multiple * x * sweep);
    const noiseDecay = drumNoiseDecay(recipe);
    const noise = recipe.noise > 0.01
      ? recipe.noise * noiseSample(x) * Math.exp(-Math.max(0, time) / noiseDecay)
      : 0;
    core = body + noise;
  } else {
    core = partialSum(recipe, x) + noiseValue(recipe, x);
  }

  let value = core;
  if (recipe.am.depth > 0.01) {
    value *= 1 - recipe.am.depth * 0.5
      + recipe.am.depth * 0.5 * Math.sin(recipe.am.rate * recipe.pitchRatio * x);
  }
  if (recipe.drive > 1.001) {
    value = Math.tanh(recipe.drive * value);
  }
  if (recipe.tremolo.depth > 0.01) {
    value *= 1 + recipe.tremolo.depth * Math.sin(recipe.tremolo.rate * x);
  }

  if (recipe.model === 'pluck' || recipe.model === 'noise' || recipe.model === 'drum') {
    value *= decayFactor(recipe, time);
  }
  return value;
}

/** Peak |y| of the recipe over one period — used to normalise the graph. */
export function recipePeak(recipe: HarmonicRecipe): number {
  const samples = 512;
  let peak = 0.0001;
  for (let index = 0; index < samples; index += 1) {
    const x = (index / samples) * Math.PI * 2;
    peak = Math.max(peak, Math.abs(evaluateRecipe(recipe, x)));
  }
  return peak;
}

/** Linear blend between two recipes — drives the smooth equation morph. */
export function lerpRecipe(a: HarmonicRecipe, b: HarmonicRecipe, t: number): HarmonicRecipe {
  const count = Math.max(a.partials.length, b.partials.length);
  const partials: RecipePartial[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = a.partials[index] ?? { multiple: a.pitchRatio, gain: 0 };
    const right = b.partials[index] ?? { multiple: b.pitchRatio, gain: 0 };
    partials.push({
      multiple: left.multiple + (right.multiple - left.multiple) * t,
      gain: left.gain + (right.gain - left.gain) * t,
    });
  }
  const mix = (l: number, r: number) => l + (r - l) * t;
  return {
    model: t < 0.5 ? a.model : b.model,
    pitchRatio: mix(a.pitchRatio, b.pitchRatio),
    partials: partials.filter((partial) => partial.gain > 0.0005),
    noise: mix(a.noise, b.noise),
    drive: mix(a.drive, b.drive),
    fm: { index: mix(a.fm.index, b.fm.index), ratio: mix(a.fm.ratio, b.fm.ratio) },
    am: { depth: mix(a.am.depth, b.am.depth), rate: mix(a.am.rate, b.am.rate) },
    tremolo: { depth: mix(a.tremolo.depth, b.tremolo.depth), rate: a.tremolo.rate },
    vibrato: { depthCents: mix(a.vibrato.depthCents, b.vibrato.depthCents), rate: a.vibrato.rate },
    envelope: {
      attack: mix(a.envelope.attack, b.envelope.attack),
      decay: mix(a.envelope.decay, b.envelope.decay),
      sustain: mix(a.envelope.sustain, b.envelope.sustain),
      release: mix(a.envelope.release, b.envelope.release),
    },
    decay: mix(a.decay, b.decay),
    filterCutoff: mix(a.filterCutoff, b.filterCutoff),
    filterQ: mix(a.filterQ, b.filterQ),
    width: mix(a.width, b.width),
    gain: mix(a.gain, b.gain),
  };
}

/* ───────────────────────── human-readable metadata ─────────────────────── */

/** A single-line record of what a control just did, for the history lane. */
export function parameterDescription(key: keyof MusicLabParameters, value: number): string {
  const round = Math.round(value);
  const signed = (v: number) => `${v >= 0 ? '+' : ''}${Math.round(v)}`;
  switch (key) {
    case 'pitch': return `Pitch ${signed(value)} semitone${Math.abs(value) === 1 ? '' : 's'}`;
    case 'brightness': return `Brightness ${signed(value)}`;
    case 'warmth': return `Warmth ${signed(value)}`;
    case 'distortion': return `Distortion +${round}`;
    case 'fm': return `FM index ${round}%`;
    case 'am': return `Ring mod ${round}%`;
    case 'filter': return `Filter ${round}%`;
    case 'sub': return `Sub ${round}%`;
    case 'width': return `Width ${round}%`;
    case 'delay': return `Echo ${round}%`;
    case 'reverb': return `Space ${round}%`;
    case 'intensity': return `Intensity ${round}%`;
    case 'harmonics': return `Harmonics ${round} partials`;
    case 'vibrato': return `Vibrato ${round}%`;
    case 'tremolo': return `Tremolo ${round}%`;
    case 'attack': return `Attack ${value.toFixed(3)}s`;
    case 'decay': return `Decay ${value.toFixed(2)}s`;
    case 'sustain': return `Sustain ${round}%`;
    case 'release': return `Release ${value.toFixed(2)}s`;
    case 'pan': return `Pan ${value > 0 ? 'R' : value < 0 ? 'L' : 'C'}${Math.abs(round)}`;
    default: return `${String(key)} ${value}`;
  }
}

/** Plain-language explanation for the inspector, so beginners are not lost. */
export const PARAMETER_HINTS: Record<keyof MusicLabParameters, string> = {
  pitch: 'Shifts every note. Multiplies x by 2^(semitones/12).',
  intensity: 'Overall energy of the voice in the mix.',
  brightness: 'Lifts the upper partials — more harmonics, more edge.',
  warmth: 'Lifts the lower partials — rounder, fuller body.',
  harmonics: 'How many partials survive. Fewer = purer tone.',
  attack: 'How long the note takes to reach full level.',
  decay: 'How quickly it settles from the peak to the sustain level.',
  sustain: 'The level the note holds while the key is down.',
  release: 'How long the sound rings after the note ends.',
  vibrato: 'Gentle pitch wobble, about five times a second.',
  tremolo: 'Gentle volume wobble, about five times a second.',
  fm: 'A second sine bends the first — adds metallic bell partials.',
  am: 'Ring modulation: the amplitude is multiplied by a faster sine.',
  filter: 'Opens the voice up. Low values are soft and dark.',
  distortion: 'Pushes the waveform through tanh(), squaring off the peaks.',
  delay: 'Adds a tempo-synced echo.',
  reverb: 'Adds room and depth.',
  width: 'Spreads the voice across the stereo field.',
  sub: 'Reinforces one octave below the fundamental.',
  pan: 'Places the track left or right.',
};

/**
 * A musically plausible random harmonic source for SURPRISE ME.
 * Amplitude falls off with a random exponent, and roughly one partial in four
 * is allowed to be inharmonic so the result can shimmer.
 */
export function randomHarmonics(): { harmonics: HarmonicPartial[]; noise: number } {
  const count = 3 + Math.floor(Math.random() * 4);
  const rolloff = 1.2 + Math.random() * 2.6;
  const partials: HarmonicPartial[] = [{ multiple: 1, gain: 1 }];
  for (let index = 1; index < count; index += 1) {
    const base = index + 1;
    const multiple = Math.random() < 0.25
      ? Number((base + (Math.random() * 0.7 - 0.35)).toFixed(2))
      : base;
    partials.push({ multiple, gain: Number(Math.pow(base, -rolloff).toFixed(3)) });
  }
  return {
    harmonics: partials,
    noise: Math.random() < 0.3 ? Number((Math.random() * 0.18).toFixed(3)) : 0.02,
  };
}

/* ───────────────────────────── musical scales ──────────────────────────── */

export interface MusicLabScale {
  id: string;
  label: string;
  /** Semitone offsets from the root. */
  intervals: number[];
}

export const MUSIC_LAB_SCALES: MusicLabScale[] = [
  { id: 'major', label: 'Major', intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'minor', label: 'Natural Minor', intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'dorian', label: 'Dorian', intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'mixolydian', label: 'Mixolydian', intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'minor-pentatonic', label: 'Minor Pentatonic', intervals: [0, 3, 5, 7, 10] },
  { id: 'major-pentatonic', label: 'Major Pentatonic', intervals: [0, 2, 4, 7, 9] },
  { id: 'hirajoshi', label: 'Hirajoshi', intervals: [0, 2, 3, 7, 8] },
  { id: 'chromatic', label: 'Chromatic', intervals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

export const MUSIC_LAB_KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Root pitch class for a key name, e.g. `C#` → 1. */
export function keyPitchClass(key: string): number {
  const index = MUSIC_LAB_KEYS.indexOf(key);
  return index < 0 ? 0 : index;
}

export function scaleById(scaleId: string): MusicLabScale {
  return MUSIC_LAB_SCALES.find((candidate) => candidate.id === scaleId) ?? MUSIC_LAB_SCALES[0];
}

/**
 * Snaps a MIDI note to the project's key + scale. Used by the piano roll's
 * "snap to scale" affordance and by note-transpose shortcuts.
 */
export function snapMidiToScale(midi: number, key: string, scaleId: string): number {
  const scale = scaleById(scaleId);
  const root = keyPitchClass(key);
  const relative = ((midi - root) % 12 + 12) % 12;
  let best = scale.intervals[0];
  let bestDistance = 12;
  for (const interval of scale.intervals) {
    const distance = Math.min(Math.abs(interval - relative), 12 - Math.abs(interval - relative));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = interval;
    }
  }
  return midi - relative + best;
}

/** The MIDI note for a scale degree, so presets can be written musically. */
export function midiForScaleDegree(key: string, scaleId: string, degree: number, octave = 4): number {
  const scale = scaleById(scaleId);
  const total = scale.intervals.length;
  const octaveShift = Math.floor(degree / total);
  const step = ((degree % total) + total) % total;
  const root = 12 * (octave + 1) + keyPitchClass(key);
  return root + scale.intervals[step] + octaveShift * 12;
}