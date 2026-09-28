/**
 * Music Lab — mathematical instrument library.
 *
 * Every instrument carries its mathematical DNA as a `harmonics` array plus a
 * `noise` blend and an envelope shape. That array is the SINGLE source of truth:
 *
 *   • `utils/musicLabEquation.ts` renders the visible equation text from it.
 *   • `utils/musicLabSynth.ts` builds the PeriodicWave / noise blend from it.
 *
 * There is no decorative maths anywhere — if the panel shows `0.18sin(2.38x)`,
 * then 0.18 at multiple 2.38 is exactly what the oscillator is playing.
 */

export type MusicLabCategory =
  | 'keys'
  | 'guitars'
  | 'strings'
  | 'brass'
  | 'woodwinds'
  | 'synth'
  | 'bass'
  | 'drums'
  | 'world'
  | 'fx';

/**
 * The synthesis model drives which voice builder runs. Each model has its own
 * genuine mathematical identity, rendered into the equation panel.
 */
export type MusicLabSynthesis =
  | 'additive' // sum of sin(kx) partials
  | 'subtractive' // oscillator -> resonant filter sweep
  | 'fm' // sin(x + I·sin(rx)) frequency modulation
  | 'pluck' // Karplus-Strong style filtered excitation
  | 'noise' // noise(x) shaped by an exponential envelope
  | 'drum'; // e^(-kx)·|sin(ωx)| body + noise transient

/** A single partial: amplitude at an integer or inharmonic multiple of f0. */
export interface HarmonicPartial {
  /** Frequency multiple of the fundamental. */
  multiple: number;
  /** Relative amplitude, 0..1. */
  gain: number;
}

export interface MusicLabParameters {
  /** Semitone offset. Audio multiplier is 2^(pitch/12). */
  pitch: number;
  /** Overall energy / output level, 0..100. */
  intensity: number;
  /** Emphasis on upper partials, 0..100. */
  brightness: number;
  /** Emphasis on lower partials, 0..100. */
  warmth: number;
  /** How many partials survive — partial richness, 0..100. */
  harmonics: number;
  attack: number;
  decay: number;
  sustain: number;
  release: number;
  /** Pitch modulation depth, 0..100. */
  vibrato: number;
  /** Amplitude modulation depth, 0..100 (slow, ~5 Hz). */
  tremolo: number;
  /** Frequency-modulation index, 0..100. */
  fm: number;
  /** Amplitude-modulation (ring) depth at audio rate, 0..100. */
  am: number;
  /** Filter openness, 0..100. */
  filter: number;
  /** tanh() waveshaping drive, 0..100. */
  distortion: number;
  /** Tempo-synced echo send, 0..100. */
  delay: number;
  /** Convolution space send, 0..100. */
  reverb: number;
  /** Stereo spread, 0..100. */
  width: number;
  /** Sub-octave reinforcement, 0..100. */
  sub: number;
  /** Stereo position, -100..100. */
  pan: number;
}

export interface MusicLabNote {
  id: string;
  /** MIDI note number. */
  pitch: number;
  /** Start position in beats. */
  start: number;
  /** Length in beats. */
  duration: number;
  /** 0..1 */
  velocity: number;
}

export type DrumRowId =
  | 'kick'
  | 'snare'
  | 'clap'
  | 'closed-hat'
  | 'open-hat'
  | 'tom'
  | 'crash'
  | 'perc';

export interface DrumStep {
  on: boolean;
  velocity: number;
  /** 0..1 chance the step fires on a given pass. 1 = always. */
  probability: number;
}

export type MusicLabTrackKind = 'notes' | 'drums';

export interface MusicLabTrack {
  id: string;
  instrumentId: string;
  name: string;
  kind: MusicLabTrackKind;
  notes: MusicLabNote[];
  /** 16 steps, indexed by `DRUM_ROWS` order. Only used when kind is 'drums'. */
  /** Drum pattern: `steps[row][step]`, a lane per `DRUM_ROWS` entry. */
  steps: DrumStep[][];
  volume: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  /** Per-track parameter state — never shared between tracks. */
  params: MusicLabParameters;
  collapsed: boolean;
}

export interface MusicLabInstrument {
  id: string;
  name: string;
  category: MusicLabCategory;
  /** Two-character glyph used on cards and track heads. */
  icon: string;
  /** Track / identity colour. */
  accent: string;
  synthesis: MusicLabSynthesis;
  /** Fallback oscillator for subtractive / pluck models. */
  oscillator: OscillatorType;
  /** The mathematical DNA. Drives both synthesis and the equation text. */
  harmonics: HarmonicPartial[];
  /** 0..1 broadband noise blend baked into the instrument's identity. */
  noise: number;
  /** Percussive body decay in seconds (drums / plucks). */
  bodyDecay: number;
  /** Drum lane this instrument feeds, when it is a percussion voice. */
  drumRow?: DrumRowId;
  /** One-line, plain-language description for beginners. */
  blurb: string;
  defaults: MusicLabParameters;
}

/* ------------------------------------------------------------------ */
/*  Parameter presets — instruments extend the closest family voice.   */
/* ------------------------------------------------------------------ */

/** Neutral baseline: everything every other preset inherits. */
const BASE: MusicLabParameters = {
  pitch: 0,
  intensity: 70,
  brightness: 50,
  warmth: 35,
  harmonics: 62,
  attack: 0.02,
  decay: 0.3,
  sustain: 0.6,
  release: 0.35,
  vibrato: 0,
  tremolo: 0,
  fm: 0,
  am: 0,
  filter: 70,
  distortion: 0,
  delay: 0,
  reverb: 14,
  width: 30,
  sub: 0,
  pan: 0,
};

const KEYS_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 72, brightness: 50, warmth: 40, harmonics: 66,
  attack: 0.006, decay: 0.4, sustain: 0.42, release: 0.5,
  reverb: 18, width: 34,
};

const PAD_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 56, brightness: 38, warmth: 52, harmonics: 70,
  attack: 0.38, decay: 0.6, sustain: 0.78, release: 1.1,
  tremolo: 8, vibrato: 4, filter: 55, reverb: 58, width: 68, delay: 12,
};

const BASS_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 76, brightness: 22, warmth: 62, harmonics: 44,
  attack: 0.008, decay: 0.34, sustain: 0.55, release: 0.24,
  filter: 46, reverb: 6, width: 10, sub: 40,
};

const PLUCK_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 70, brightness: 46, warmth: 34, harmonics: 58,
  attack: 0.004, decay: 0.5, sustain: 0.24, release: 0.5,
  reverb: 22, width: 32,
};

const BOW_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 62, brightness: 44, warmth: 48, harmonics: 74,
  attack: 0.16, decay: 0.5, sustain: 0.82, release: 0.7,
  vibrato: 26, filter: 62, reverb: 36, width: 58,
};

const AIR_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 60, brightness: 54, warmth: 30, harmonics: 60,
  attack: 0.08, decay: 0.42, sustain: 0.74, release: 0.5,
  vibrato: 12, filter: 68, reverb: 34, width: 46,
};

const DRUM_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 84, brightness: 52, warmth: 22, harmonics: 40,
  attack: 0.001, decay: 0.18, sustain: 0.06, release: 0.12,
  filter: 78, distortion: 0, reverb: 12, width: 22,
};

const LEAD_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 66, brightness: 62, warmth: 30, harmonics: 72,
  attack: 0.01, decay: 0.34, sustain: 0.68, release: 0.3,
  filter: 66, distortion: 12, reverb: 20, width: 62, delay: 18,
};

const NOISE_DEFAULTS: MusicLabParameters = {
  ...BASE,
  intensity: 40, brightness: 30, warmth: 24, harmonics: 30,
  attack: 0.5, decay: 0.9, sustain: 0.85, release: 1.3,
  filter: 44, reverb: 66, width: 72,
};

/** Terse partial constructor: `hp(2, 0.18)` → `{ multiple: 2, gain: 0.18 }`. */
const hp = (multiple: number, gain: number): HarmonicPartial => ({ multiple, gain });

/* ------------------------------------------------------------------ */
/*  The library — 46 instruments across 10 categories                  */
/* ------------------------------------------------------------------ */

export const MUSIC_LAB_INSTRUMENTS: MusicLabInstrument[] = [

  /* ─────────────────────────── KEYS ─────────────────────────── */

  {
    id: 'grand-piano', name: 'Grand Piano', category: 'keys', icon: 'GP',
    accent: '#4C8DF6', synthesis: 'additive', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.42), hp(3, 0.19), hp(4, 0.11), hp(5, 0.06), hp(6, 0.03)],
    noise: 0.02, bodyDecay: 1.6,
    blurb: 'Fundamental with a bright stacked overtone ladder.',
    defaults: { ...KEYS_DEFAULTS },
  },
  {
    id: 'electric-piano', name: 'Electric Piano', category: 'keys', icon: 'EP',
    accent: '#5BA8F5', synthesis: 'fm', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.28), hp(3, 0.1)],
    noise: 0.01, bodyDecay: 1.4,
    blurb: 'Sine carrier bent by a 2× modulator — classic tine bell.',
    defaults: { ...KEYS_DEFAULTS, fm: 34, brightness: 56, harmonics: 52, decay: 0.5, sustain: 0.34, release: 0.6, tremolo: 6 },
  },
  {
    id: 'rhodes', name: 'Rhodes', category: 'keys', icon: 'RH',
    accent: '#3E7ED8', synthesis: 'fm', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.22), hp(3, 0.07), hp(4, 0.03)],
    noise: 0.01, bodyDecay: 2.0,
    blurb: 'Smoother FM index, long sustain, wide bell spacing.',
    defaults: { ...KEYS_DEFAULTS, fm: 22, brightness: 42, warmth: 52, decay: 0.6, sustain: 0.52, release: 0.85, tremolo: 9, reverb: 28, width: 46 },
  },
  {
    id: 'organ', name: 'Organ', category: 'keys', icon: 'OR',
    accent: '#6FA4E8', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.7), hp(3, 0.45), hp(4, 0.3), hp(6, 0.2), hp(8, 0.14)],
    noise: 0.005, bodyDecay: 4.0,
    blurb: 'Drawbar stack — odd and even partials held flat, no decay.',
    defaults: { ...KEYS_DEFAULTS, attack: 0.03, decay: 0.2, sustain: 0.95, release: 0.16, brightness: 58, harmonics: 84, tremolo: 4 },
  },
  {
    id: 'synth-keys', name: 'Synth Keys', category: 'keys', icon: 'SK',
    accent: '#4C8DF6', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.6), hp(3, 0.42), hp(4, 0.3), hp(5, 0.22), hp(6, 0.16), hp(7, 0.1)],
    noise: 0.01, bodyDecay: 1.8,
    blurb: 'Sawtooth partial series through a falling resonant filter.',
    defaults: { ...KEYS_DEFAULTS, filter: 60, brightness: 60, attack: 0.02, decay: 0.45, sustain: 0.5, release: 0.45, width: 52 },
  },

  /* ───────────────────────── GUITARS ───────────────────────── */

  {
    id: 'acoustic-guitar', name: 'Acoustic Guitar', category: 'guitars', icon: 'AG',
    accent: '#D9A05B', synthesis: 'pluck', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.5), hp(3, 0.32), hp(4, 0.2), hp(5, 0.14), hp(6, 0.09), hp(7, 0.05)],
    noise: 0.06, bodyDecay: 1.2,
    blurb: 'Noise-picked string with a fast-tracking lowpass sweep.',
    defaults: { ...PLUCK_DEFAULTS, brightness: 50, warmth: 40 },
  },
  {
    id: 'clean-electric', name: 'Clean Electric', category: 'guitars', icon: 'CE',
    accent: '#E0B573', synthesis: 'pluck', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.38), hp(3, 0.22), hp(4, 0.12), hp(6, 0.06)],
    noise: 0.04, bodyDecay: 1.5,
    blurb: 'Soft pick transient, narrow partials, gentle compression.',
    defaults: { ...PLUCK_DEFAULTS, brightness: 44, sustain: 0.34, release: 0.7, reverb: 30, width: 46, delay: 14 },
  },
  {
    id: 'distorted-guitar', name: 'Distorted Guitar', category: 'guitars', icon: 'DG',
    accent: '#C8803C', synthesis: 'pluck', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.55), hp(3, 0.4), hp(4, 0.28), hp(5, 0.2)],
    noise: 0.05, bodyDecay: 1.1,
    blurb: 'Heavy tanh() waveshaping turns the sine into a square-ish edge.',
    defaults: { ...PLUCK_DEFAULTS, distortion: 46, brightness: 58, harmonics: 66 },
  },
  {
    id: 'bass-guitar', name: 'Bass Guitar', category: 'guitars', icon: 'BG',
    accent: '#B87A46', synthesis: 'pluck', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.42), hp(3, 0.16), hp(4, 0.07)],
    noise: 0.04, bodyDecay: 1.4,
    blurb: 'Low fundamental, thin overtone tail, strong sub reinforcement.',
    defaults: { ...BASS_DEFAULTS, sub: 46 },
  },

  /* ───────────────────────── STRINGS ───────────────────────── */

  {
    id: 'violin', name: 'Violin', category: 'strings', icon: 'VI',
    accent: '#3FB49A', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.62), hp(3, 0.48), hp(4, 0.34), hp(5, 0.26), hp(6, 0.18), hp(7, 0.13)],
    noise: 0.05, bodyDecay: 2.5,
    blurb: 'Rich bowed saw spectrum with 5 Hz vibrato on the pitch.',
    defaults: { ...BOW_DEFAULTS, vibrato: 32, brightness: 52, filter: 68, width: 40 },
  },
  {
    id: 'viola', name: 'Viola', category: 'strings', icon: 'VA',
    accent: '#35A38C', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.56), hp(3, 0.42), hp(4, 0.28), hp(5, 0.2), hp(6, 0.13)],
    noise: 0.05, bodyDecay: 2.5,
    blurb: 'Same bow model, darker filter — tuned a fifth below the violin.',
    defaults: { ...BOW_DEFAULTS, vibrato: 26, brightness: 42, warmth: 56, filter: 56, pitch: -5, width: 44 },
  },
  {
    id: 'cello', name: 'Cello', category: 'strings', icon: 'CL',
    accent: '#2E8F7C', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.5), hp(3, 0.36), hp(4, 0.22), hp(5, 0.14), hp(6, 0.09)],
    noise: 0.05, bodyDecay: 3.0,
    blurb: 'Low bowed register — warmth outweighs brightness.',
    defaults: { ...BOW_DEFAULTS, vibrato: 22, brightness: 36, warmth: 62, filter: 50, pitch: -12, attack: 0.2, width: 48 },
  },
  {
    id: 'string-ensemble', name: 'String Ensemble', category: 'strings', icon: 'SE',
    accent: '#57C6AD', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.6), hp(3, 0.45), hp(4, 0.3), hp(5, 0.22), hp(6, 0.15), hp(7, 0.1), hp(8, 0.07)],
    noise: 0.07, bodyDecay: 3.5,
    blurb: 'Eight detuned partial sets widened across the stereo field.',
    defaults: { ...PAD_DEFAULTS, attack: 0.3, sustain: 0.85, release: 1.2, brightness: 46, warmth: 50, filter: 60, width: 88, reverb: 52 },
  },

  /* ────────────────────────── BRASS ───────────────────────── */

  {
    id: 'trumpet', name: 'Trumpet', category: 'brass', icon: 'TR',
    accent: '#E9B444', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.7), hp(3, 0.55), hp(4, 0.42), hp(5, 0.3), hp(6, 0.2)],
    noise: 0.03, bodyDecay: 1.6,
    blurb: 'Bright saw spectrum with a filter that opens as the note swells.',
    defaults: { ...LEAD_DEFAULTS, brightness: 68, warmth: 26, harmonics: 78, attack: 0.05, decay: 0.3, sustain: 0.85, release: 0.24, vibrato: 14, distortion: 10, filter: 74, width: 36 },
  },
  {
    id: 'french-horn', name: 'French Horn', category: 'brass', icon: 'FH',
    accent: '#C99A3F', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.55), hp(3, 0.34), hp(4, 0.2), hp(5, 0.12)],
    noise: 0.03, bodyDecay: 2.0,
    blurb: 'Rounded brass — few upper partials, long soft attack.',
    defaults: { ...LEAD_DEFAULTS, brightness: 40, warmth: 58, harmonics: 52, attack: 0.12, decay: 0.4, sustain: 0.9, release: 0.4, vibrato: 10, distortion: 0, filter: 54, width: 44, reverb: 30 },
  },
  {
    id: 'trombone', name: 'Trombone', category: 'brass', icon: 'TB',
    accent: '#DCA83A', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.66), hp(3, 0.5), hp(4, 0.36), hp(5, 0.24), hp(6, 0.15)],
    noise: 0.03, bodyDecay: 1.8,
    blurb: 'Mid brass with a wide slide range — pitch follows the parameter.',
    defaults: { ...LEAD_DEFAULTS, brightness: 54, warmth: 46, attack: 0.06, sustain: 0.88, release: 0.3, vibrato: 12, filter: 64, width: 40, pitch: -8 },
  },
  {
    id: 'brass-section', name: 'Brass Section', category: 'brass', icon: 'BS',
    accent: '#F0C450', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.72), hp(3, 0.58), hp(4, 0.44), hp(5, 0.33), hp(6, 0.24), hp(7, 0.16)],
    noise: 0.06, bodyDecay: 2.2,
    blurb: 'Four detuned brass voices stacked into one wide stereo bus.',
    defaults: { ...LEAD_DEFAULTS, brightness: 62, warmth: 40, attack: 0.04, sustain: 0.86, release: 0.3, distortion: 14, filter: 70, width: 82, reverb: 34 },
  },

  /* ─────────────────────── WOODWINDS ──────────────────────── */

  {
    id: 'flute', name: 'Flute', category: 'woodwinds', icon: 'FL',
    accent: '#6FD1CE', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.16), hp(3, 0.06), hp(4, 0.02)],
    noise: 0.10, bodyDecay: 2.2,
    blurb: 'Almost pure fundamental with a breathy noise layer.',
    defaults: { ...AIR_DEFAULTS, brightness: 58, warmth: 30, harmonics: 34, attack: 0.09, sustain: 0.86, release: 0.34, vibrato: 20, width: 38 },
  },
  {
    id: 'clarinet', name: 'Clarinet', category: 'woodwinds', icon: 'CN',
    accent: '#5FC3C0', synthesis: 'additive', oscillator: 'square',
    harmonics: [hp(1, 1), hp(3, 0.4), hp(5, 0.2), hp(7, 0.09)],
    noise: 0.04, bodyDecay: 2.0,
    blurb: 'Odd-only partial stack — the hollow cylindrical bore signature.',
    defaults: { ...AIR_DEFAULTS, brightness: 42, warmth: 48, harmonics: 66, attack: 0.06, sustain: 0.88, release: 0.3, vibrato: 12, width: 32 },
  },
  {
    id: 'saxophone', name: 'Saxophone', category: 'woodwinds', icon: 'SX',
    accent: '#4FB5B2', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.6), hp(3, 0.44), hp(4, 0.3), hp(5, 0.2), hp(6, 0.12)],
    noise: 0.08, bodyDecay: 1.8,
    blurb: 'Reedy saw with strong even harmonics and a growling filter.',
    defaults: { ...AIR_DEFAULTS, brightness: 50, warmth: 44, attack: 0.05, sustain: 0.84, release: 0.32, vibrato: 28, distortion: 16, filter: 58, width: 42 },
  },

  /* ─────────────────────────── SYNTH ──────────────────────── */

  {
    id: 'analog-lead', name: 'Analog Lead', category: 'synth', icon: 'AL',
    accent: '#C86BFF', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.6), hp(3, 0.44), hp(4, 0.32), hp(5, 0.23), hp(6, 0.16), hp(7, 0.1), hp(8, 0.06)],
    noise: 0.02, bodyDecay: 1.6,
    blurb: 'Resonant sawtooth lead — the filter peak is the character.',
    defaults: { ...LEAD_DEFAULTS, filter: 62, brightness: 66, distortion: 18, width: 54, delay: 22, reverb: 24 },
  },
  {
    id: 'soft-pad', name: 'Soft Pad', category: 'synth', icon: 'SP',
    accent: '#A66BFF', synthesis: 'additive', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.34), hp(3, 0.2), hp(4, 0.12), hp(5, 0.07), hp(6, 0.04)],
    noise: 0.06, bodyDecay: 3.4,
    blurb: 'Slow-swelling low-partial wash, very wide and reverberant.',
    defaults: { ...PAD_DEFAULTS, brightness: 32, warmth: 62, attack: 0.55, release: 1.6, width: 86, reverb: 72, delay: 18 },
  },
  {
    id: 'supersaw', name: 'Supersaw', category: 'synth', icon: 'SS',
    accent: '#B85CFF', synthesis: 'subtractive', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.64), hp(3, 0.48), hp(4, 0.34), hp(5, 0.24), hp(6, 0.17), hp(7, 0.12), hp(8, 0.08), hp(9, 0.05)],
    noise: 0.02, bodyDecay: 1.8,
    blurb: 'Seven detuned saw stacks — the classic wide trance wall.',
    defaults: { ...LEAD_DEFAULTS, brightness: 70, harmonics: 88, filter: 72, distortion: 10, width: 94, reverb: 28, delay: 26 },
  },
  {
    id: 'pluck-synth', name: 'Pluck', category: 'synth', icon: 'PL',
    accent: '#D07BFF', synthesis: 'pluck', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2, 0.4), hp(3, 0.2), hp(4, 0.1), hp(5, 0.05)],
    noise: 0.05, bodyDecay: 0.5,
    blurb: 'Short filtered excitation — the filter closes faster than the note.',
    defaults: { ...PLUCK_DEFAULTS, decay: 0.22, sustain: 0.08, release: 0.3, brightness: 62, delay: 24, width: 50 },
  },
  {
    id: 'arpeggio', name: 'Arpeggio', category: 'synth', icon: 'AR',
    accent: '#9F5CFF', synthesis: 'additive', oscillator: 'square',
    harmonics: [hp(1, 1), hp(2, 0.3), hp(3, 0.24), hp(4, 0.14), hp(5, 0.1)],
    noise: 0.02, bodyDecay: 0.6,
    blurb: 'Tight staccato partial set tuned for fast repeated motion.',
    defaults: { ...PLUCK_DEFAULTS, attack: 0.004, decay: 0.16, sustain: 0.05, release: 0.22, brightness: 58, delay: 30, width: 62 },
  },
  {
    id: 'drone', name: 'Drone', category: 'synth', icon: 'DR',
    accent: '#8A63FF', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.5), hp(3, 0.25), hp(4, 0.12), hp(5, 0.06), hp(6, 0.03), hp(8, 0.02)],
    noise: 0.05, bodyDecay: 6.0,
    blurb: 'Sustained partial bed — infinite attack, infinite release.',
    defaults: { ...PAD_DEFAULTS, attack: 1.2, decay: 1.0, sustain: 1.0, release: 2.4, brightness: 28, warmth: 70, harmonics: 56, width: 76, reverb: 80 },
  },

  /* ──────────────────────────── BASS ──────────────────────── */

  {
    id: 'sub-bass', name: 'Sub Bass', category: 'bass', icon: 'SB',
    accent: '#8B5CF6', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.08), hp(3, 0.02)],
    noise: 0.005, bodyDecay: 1.6,
    blurb: 'Near-pure sine an octave down — felt more than heard.',
    defaults: { ...BASS_DEFAULTS, brightness: 14, harmonics: 24, sub: 72, attack: 0.02, sustain: 0.8, release: 0.4, filter: 34, width: 0 },
  },
  {
    id: 'synth-bass', name: 'Synth Bass', category: 'bass', icon: 'SY',
    accent: '#7C5CF0', synthesis: 'subtractive', oscillator: 'square',
    harmonics: [hp(1, 1), hp(2, 0.34), hp(3, 0.18), hp(4, 0.08), hp(5, 0.04)],
    noise: 0.02, bodyDecay: 1.2,
    blurb: 'Square-wave bass through a snappy resonant filter envelope.',
    defaults: { ...BASS_DEFAULTS, brightness: 32, harmonics: 52, filter: 52, distortion: 12, decay: 0.24, sustain: 0.3, release: 0.16, sub: 34, width: 14 },
  },
  {
    id: 'finger-bass', name: 'Finger Bass', category: 'bass', icon: 'FB',
    accent: '#6E4FE0', synthesis: 'pluck', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.44), hp(3, 0.18), hp(4, 0.08), hp(5, 0.03)],
    noise: 0.05, bodyDecay: 1.7,
    blurb: 'Fingered attack noise over a warm low fundamental.',
    defaults: { ...BASS_DEFAULTS, brightness: 26, warmth: 60, attack: 0.01, decay: 0.5, sustain: 0.34, release: 0.3, filter: 44, sub: 44, width: 12 },
  },

  /* ────────────────────────── DRUMS ──────────────────────── */

  {
    id: 'kick', name: 'Kick', category: 'drums', icon: 'KK',
    accent: '#F59E0B', synthesis: 'drum', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.3), hp(3, 0.08)],
    noise: 0.06, bodyDecay: 0.32, drumRow: 'kick',
    blurb: 'A pitch-swept sine body plus a click transient.',
    defaults: { ...DRUM_DEFAULTS, pitch: -12, brightness: 40, sub: 66 },
  },
  {
    id: 'snare', name: 'Snare', category: 'drums', icon: 'SN',
    accent: '#E8892B', synthesis: 'drum', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(2, 0.5), hp(3, 0.24)],
    noise: 0.62, bodyDecay: 0.22, drumRow: 'snare',
    blurb: 'Two detuned body modes plus a dense noise field.',
    defaults: { ...DRUM_DEFAULTS, pitch: -5, brightness: 66 },
  },
  {
    id: 'clap', name: 'Clap', category: 'drums', icon: 'CP',
    accent: '#F0743F', synthesis: 'noise', oscillator: 'square',
    harmonics: [hp(1, 0.18), hp(2, 0.06)],
    noise: 0.94, bodyDecay: 0.18, drumRow: 'clap',
    blurb: 'Almost pure noise, gated into a short slapping envelope.',
    defaults: { ...DRUM_DEFAULTS, brightness: 74 },
  },
  {
    id: 'closed-hat', name: 'Closed Hat', category: 'drums', icon: 'CH',
    accent: '#F7C24B', synthesis: 'drum', oscillator: 'square',
    harmonics: [hp(6, 0.3), hp(11, 0.18), hp(17, 0.1)],
    noise: 0.88, bodyDecay: 0.07, drumRow: 'closed-hat',
    blurb: 'Inharmonic metallic partials collapsed by a 12× decay rate.',
    defaults: { ...DRUM_DEFAULTS, attack: 0.0005, decay: 0.07, brightness: 88, harmonics: 34, filter: 92 },
  },
  {
    id: 'open-hat', name: 'Open Hat', category: 'drums', icon: 'OH',
    accent: '#EEB63C', synthesis: 'drum', oscillator: 'square',
    harmonics: [hp(6, 0.3), hp(11, 0.18), hp(17, 0.1)],
    noise: 0.86, bodyDecay: 0.42, drumRow: 'open-hat',
    blurb: 'The same metallic field as the closed hat, decaying 6× slower.',
    defaults: { ...DRUM_DEFAULTS, decay: 0.42, brightness: 84, harmonics: 34, filter: 88 },
  },
  {
    id: 'tom', name: 'Tom', category: 'drums', icon: 'TM',
    accent: '#D97706', synthesis: 'drum', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.34), hp(3, 0.14)],
    noise: 0.14, bodyDecay: 0.5, drumRow: 'tom',
    blurb: 'Tuned membrane — fundamental with a gentle pitch drop.',
    defaults: { ...DRUM_DEFAULTS, pitch: -7, decay: 0.5, brightness: 48 },
  },
  {
    id: 'crash', name: 'Crash', category: 'drums', icon: 'CR',
    accent: '#FBBF24', synthesis: 'noise', oscillator: 'square',
    harmonics: [hp(5, 0.22), hp(9, 0.16), hp(14, 0.11), hp(21, 0.07)],
    noise: 0.92, bodyDecay: 1.4, drumRow: 'crash',
    blurb: 'Inharmonic metallic stack with a long broadband fall-off.',
    defaults: { ...DRUM_DEFAULTS, decay: 1.4, brightness: 90, filter: 94, reverb: 34 },
  },
  {
    id: 'percussion', name: 'Percussion', category: 'drums', icon: 'PC',
    accent: '#C2831A', synthesis: 'drum', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(3, 0.4), hp(5, 0.2), hp(7, 0.1)],
    noise: 0.3, bodyDecay: 0.24, drumRow: 'perc',
    blurb: 'Odd-partial woodblock-ish click for accents.',
    defaults: { ...DRUM_DEFAULTS, pitch: 4, decay: 0.24, brightness: 70, harmonics: 60 },
  },

  /* ─────────────────────────── WORLD ─────────────────────── */

  {
    id: 'sitar', name: 'Sitar', category: 'world', icon: 'SI',
    accent: '#10B981', synthesis: 'pluck', oscillator: 'sawtooth',
    harmonics: [hp(1, 1), hp(2.3, 0.3), hp(4.5, 0.2), hp(7, 0.15), hp(9.6, 0.08)],
    noise: 0.04, bodyDecay: 2.4,
    blurb: 'Inharmonic buzzy partials — the sympathetic-string shimmer.',
    defaults: { ...PLUCK_DEFAULTS, attack: 0.02, decay: 0.7, sustain: 0.42, release: 0.9, brightness: 54, warmth: 38, harmonics: 76, vibrato: 12, reverb: 34, width: 52 },
  },
  {
    id: 'tabla', name: 'Tabla', category: 'world', icon: 'TA',
    accent: '#0EA5A0', synthesis: 'drum', oscillator: 'triangle',
    harmonics: [hp(1, 1), hp(1.6, 0.44), hp(2.4, 0.2), hp(3.7, 0.1)],
    noise: 0.34, bodyDecay: 0.34, drumRow: 'perc',
    blurb: 'Tuned drum head with an inharmonic overtone ring.',
    defaults: { ...DRUM_DEFAULTS, pitch: -2, decay: 0.34, brightness: 62, harmonics: 58, reverb: 24 },
  },
  {
    id: 'kalimba', name: 'Kalimba', category: 'world', icon: 'KA',
    accent: '#34D399', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(2, 0.2), hp(3, 0.08), hp(4.2, 0.04)],
    noise: 0.05, bodyDecay: 1.1,
    blurb: 'Soft tine with a single faint inharmonic sparkle.',
    defaults: { ...PLUCK_DEFAULTS, attack: 0.004, decay: 0.6, sustain: 0.2, release: 0.7, brightness: 48, warmth: 44, harmonics: 42, reverb: 30, width: 44 },
  },
  {
    id: 'marimba', name: 'Marimba', category: 'world', icon: 'MA',
    accent: '#22C55E', synthesis: 'additive', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(4, 0.3), hp(10, 0.08)],
    noise: 0.03, bodyDecay: 0.65,
    blurb: 'Wooden bar: fundamental plus a strong tuned 4th-octave overtone.',
    defaults: { ...PLUCK_DEFAULTS, attack: 0.003, decay: 0.35, sustain: 0.1, release: 0.5, brightness: 56, warmth: 40, harmonics: 46, reverb: 28, width: 48 },
  },

  /* ──────────────────────── TEXTURE / FX ─────────────────── */

  {
    id: 'noise-fx', name: 'Noise', category: 'fx', icon: 'NZ',
    accent: '#22D3EE', synthesis: 'noise', oscillator: 'sine',
    harmonics: [hp(1, 0.25), hp(2, 0.08)],
    noise: 1.0, bodyDecay: 0.6,
    blurb: 'Raw broadband source — the purest noise(x) in the library.',
    defaults: { ...NOISE_DEFAULTS, attack: 0.02, decay: 0.3, sustain: 0.5, release: 0.4, brightness: 50, filter: 60, reverb: 30 },
  },
  {
    id: 'vinyl', name: 'Vinyl', category: 'fx', icon: 'VY',
    accent: '#38BDF8', synthesis: 'noise', oscillator: 'triangle',
    harmonics: [hp(1, 0.12), hp(3, 0.05)],
    noise: 0.9, bodyDecay: 0.8,
    blurb: 'Band-limited surface noise with crackle-ish high-frequency hiss.',
    defaults: { ...NOISE_DEFAULTS, intensity: 28, attack: 0.3, decay: 0.6, sustain: 0.7, release: 0.8, brightness: 36, warmth: 40, filter: 40, reverb: 26, width: 90 },
  },
  {
    id: 'atmosphere', name: 'Atmosphere', category: 'fx', icon: 'AT',
    accent: '#06B6D4', synthesis: 'noise', oscillator: 'sine',
    harmonics: [hp(1, 0.3), hp(2, 0.14), hp(3, 0.06)],
    noise: 0.8, bodyDecay: 4.0,
    blurb: 'Slow noise bed filtered into a distant, evolving field.',
    defaults: { ...NOISE_DEFAULTS, intensity: 34, brightness: 24, warmth: 48, attack: 1.0, decay: 1.2, sustain: 0.9, release: 2.0, filter: 32, reverb: 78, width: 94, delay: 22 },
  },
  {
    id: 'impact', name: 'Impact', category: 'fx', icon: 'IM',
    accent: '#2DD4BF', synthesis: 'drum', oscillator: 'sine',
    harmonics: [hp(1, 1), hp(1.4, 0.4), hp(2.1, 0.2)],
    noise: 0.5, bodyDecay: 1.1, drumRow: 'perc',
    blurb: 'Low pitched boom + noise burst for cinematic hits.',
    defaults: { ...DRUM_DEFAULTS, pitch: -18, attack: 0.002, decay: 1.0, sustain: 0.05, release: 0.9, brightness: 34, warmth: 60, sub: 74, reverb: 46, width: 40 },
  },
  {
    id: 'sweep', name: 'Sweep', category: 'fx', icon: 'SW',
    accent: '#0E7490', synthesis: 'noise', oscillator: 'sawtooth',
    harmonics: [hp(1, 0.3), hp(2, 0.12)],
    noise: 0.85, bodyDecay: 1.6,
    blurb: 'Noise pushed through a long filter rise — the riser.',
    defaults: { ...NOISE_DEFAULTS, intensity: 42, attack: 0.8, decay: 1.0, sustain: 0.6, release: 0.6, brightness: 70, filter: 50, reverb: 44, width: 86 },
  },
];

/* ------------------------------------------------------------------ */
/*  Category metadata — order and colour identity                      */
/* ------------------------------------------------------------------ */

export interface MusicLabCategoryMeta {
  id: MusicLabCategory;
  label: string;
  /** Canonical accent for the category (instruments may carry their own). */
  accent: string;
}

export const MUSIC_LAB_CATEGORIES: MusicLabCategoryMeta[] = [
  { id: 'keys', label: 'Keys', accent: '#4C8DF6' },
  { id: 'guitars', label: 'Guitars', accent: '#D9A05B' },
  { id: 'strings', label: 'Strings', accent: '#3FB49A' },
  { id: 'brass', label: 'Brass', accent: '#E9B444' },
  { id: 'woodwinds', label: 'Woodwinds', accent: '#6FD1CE' },
  { id: 'synth', label: 'Synth', accent: '#C86BFF' },
  { id: 'bass', label: 'Bass', accent: '#8B5CF6' },
  { id: 'drums', label: 'Drums', accent: '#F59E0B' },
  { id: 'world', label: 'World', accent: '#10B981' },
  { id: 'fx', label: 'Texture / FX', accent: '#22D3EE' },
];

export const CATEGORY_BY_ID: Record<string, MusicLabCategoryMeta> = Object.fromEntries(
  MUSIC_LAB_CATEGORIES.map((category) => [category.id, category]),
);

/* ------------------------------------------------------------------ */
/*  Drum sequencer lanes                                               */
/* ------------------------------------------------------------------ */

export interface DrumRow {
  id: DrumRowId;
  label: string;
  /** Instrument used when the lane is auditioned from the sequencer. */
  instrumentId: string;
  accent: string;
}

export const DRUM_ROWS: DrumRow[] = [
  { id: 'kick', label: 'Kick', instrumentId: 'kick', accent: '#F59E0B' },
  { id: 'snare', label: 'Snare', instrumentId: 'snare', accent: '#E8892B' },
  { id: 'clap', label: 'Clap', instrumentId: 'clap', accent: '#F0743F' },
  { id: 'closed-hat', label: 'Closed Hat', instrumentId: 'closed-hat', accent: '#F7C24B' },
  { id: 'open-hat', label: 'Open Hat', instrumentId: 'open-hat', accent: '#EEB63C' },
  { id: 'tom', label: 'Tom', instrumentId: 'tom', accent: '#D97706' },
  { id: 'crash', label: 'Crash', instrumentId: 'crash', accent: '#FBBF24' },
  { id: 'perc', label: 'Percussion', instrumentId: 'percussion', accent: '#C2831A' },
];

export const DRUM_STEP_COUNT = 16;

/* ------------------------------------------------------------------ */
/*  Lookups                                                            */
/* ------------------------------------------------------------------ */

const INSTRUMENT_INDEX: Record<string, MusicLabInstrument> = Object.fromEntries(
  MUSIC_LAB_INSTRUMENTS.map((instrument) => [instrument.id, instrument]),
);

export const FALLBACK_INSTRUMENT: MusicLabInstrument = MUSIC_LAB_INSTRUMENTS[0];

export function findMusicLabInstrument(id: string): MusicLabInstrument | undefined {
  return INSTRUMENT_INDEX[id];
}

/** Always returns an instrument — unknown ids fall back to the grand piano. */
export function getMusicLabInstrument(id: string): MusicLabInstrument {
  return INSTRUMENT_INDEX[id] ?? FALLBACK_INSTRUMENT;
}
export function instrumentsInCategory(category: MusicLabCategory): MusicLabInstrument[] {
  return MUSIC_LAB_INSTRUMENTS.filter((instrument) => instrument.category === category);
}

/** Case-insensitive search over name, category, model and description. */
export function searchInstruments(term: string): MusicLabInstrument[] {
  const query = term.trim().toLowerCase();
  if (!query) return MUSIC_LAB_INSTRUMENTS;
  return MUSIC_LAB_INSTRUMENTS.filter((instrument) =>
    instrument.name.toLowerCase().includes(query)
    || instrument.category.includes(query)
    || instrument.synthesis.includes(query)
    || instrument.blurb.toLowerCase().includes(query),
  );
}

export function drumRowFor(instrumentId: string): DrumRowId | undefined {
  return INSTRUMENT_INDEX[instrumentId]?.drumRow;
}

/** The instrument that should feed a given drum lane. */
export function instrumentForDrumRow(row: DrumRowId): MusicLabInstrument {
  const rowMeta = DRUM_ROWS.find((candidate) => candidate.id === row);
  return getMusicLabInstrument(rowMeta?.instrumentId ?? 'percussion');
}

/* ------------------------------------------------------------------ */
/*  Factory helpers                                                    */
/* ------------------------------------------------------------------ */

let idCounter = 0;

/** Collision-safe id that still reads well in saved JSON. */
export function musicLabId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createEmptyDrumSteps(stepCount = DRUM_STEP_COUNT): DrumStep[][] {
  return DRUM_ROWS.map(() => Array.from(
    { length: stepCount },
    () => ({ on: false, velocity: 0.85, probability: 1 }),
  ));
}

/** A basic four-on-the-floor so a new drum track is audible immediately. */
export function createStarterDrumSteps(stepCount = DRUM_STEP_COUNT): DrumStep[][] {
  const pattern = createEmptyDrumSteps(stepCount);
  const kickRow = DRUM_ROWS.findIndex((row) => row.id === 'kick');
  const snareRow = DRUM_ROWS.findIndex((row) => row.id === 'snare');
  const hatRow = DRUM_ROWS.findIndex((row) => row.id === 'closed-hat');
  for (let step = 0; step < stepCount; step += 1) {
    if (kickRow >= 0 && step % 4 === 0) {
      pattern[kickRow][step] = { on: true, velocity: 0.95, probability: 1 };
    }
    if (snareRow >= 0 && step % 8 === 4) {
      pattern[snareRow][step] = { on: true, velocity: 0.85, probability: 1 };
    }
    if (hatRow >= 0 && step % 2 === 0) {
      pattern[hatRow][step] = { on: true, velocity: 0.62, probability: 1 };
    }
  }
  return pattern;
}

export function createDefaultTrack(index = 0, instrumentId?: string): MusicLabTrack {
  const instrument = instrumentId
    ? getMusicLabInstrument(instrumentId)
    : MUSIC_LAB_INSTRUMENTS[index % MUSIC_LAB_INSTRUMENTS.length];
  const isDrum = instrument.category === 'drums';
  return {
    id: musicLabId('track'),
    instrumentId: instrument.id,
    name: instrument.name,
    kind: isDrum ? 'drums' : 'notes',
    notes: index === 0 && !isDrum
      ? [
        { id: musicLabId('note'), pitch: 60, start: 0, duration: 2, velocity: 0.85 },
        { id: musicLabId('note'), pitch: 64, start: 2, duration: 2, velocity: 0.72 },
      ]
      : [],
    steps: isDrum ? createStarterDrumSteps() : createEmptyDrumSteps(),
    volume: 0.78,
    pan: instrument.defaults.pan,
    muted: false,
    solo: false,
    params: { ...instrument.defaults },
    collapsed: false,
  };
}

/** Instrument + fresh parameter state for a newly added track. */
export function createTrackForInstrument(instrumentId: string, index = 0): MusicLabTrack {
  const track = createDefaultTrack(index, instrumentId);
  const instrument = getMusicLabInstrument(instrumentId);
  return {
    ...track,
    kind: instrument.category === 'drums' ? 'drums' : 'notes',
    notes: [],
    params: { ...instrument.defaults },
  };
}
