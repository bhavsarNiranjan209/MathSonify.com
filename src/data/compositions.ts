/**
 * SoundLab — Proprietary multi-track equation compositions.
 *
 * Each composition is an original, copyrighted work by MathSonify.
 * Equations are not licensed for reuse. All rights reserved.
 *
 * © 2026 MathSonify — https://mathsonify.com
 */

import type { InstrumentType } from '../store/studioStore';
import type { ScaleKey } from '../utils/equationParser';

// ── Genre & track types ──────────────────────────────────────────────

export type Genre =
  | 'ambient'
  | 'synthwave'
  | 'classical'
  | 'lofi'
  | 'cinematic'
  | 'world'
  | 'minimal'
  | 'idm'
  | 'rock'
  | 'jazz'
  | 'edm'
  | 'rnb'
  | 'reggae'
  | 'latin'
  | 'orchestral';

export type TrackVoice = 'frequency' | 'note' | 'chord' | 'rhythm' | 'drums';

export interface CompositionTrack {
  id: string;
  label: string;
  equation: string;
  instrument: InstrumentType;
  voice: TrackVoice;
  /** Default mix gain 0..1 */
  mix: number;
  minFreq?: number;
  maxFreq?: number;
  pan?: number; // -1..1
}

export interface Composition {
  id: string;
  title: string;
  genre: Genre;
  bpm: number;
  key: ScaleKey;
  durationSec: number;
  description: string;
  copyright: string;
  tracks: CompositionTrack[];
  /** Desaturated accent CSS colour for card top-border tint */
  accent: string;
  version: 1;
}

// ── Genre catalogue ──────────────────────────────────────────────────

export const GENRES: { id: Genre; label: string; emoji: string }[] = [
  { id: 'ambient', label: 'Ambient', emoji: '🌌' },
  { id: 'synthwave', label: 'Synthwave', emoji: '🌆' },
  { id: 'classical', label: 'Classical', emoji: '🎻' },
  { id: 'lofi', label: 'Lo-Fi', emoji: '☕' },
  { id: 'cinematic', label: 'Cinematic', emoji: '🎬' },
  { id: 'world', label: 'World', emoji: '🌍' },
  { id: 'minimal', label: 'Minimal', emoji: '▪️' },
  { id: 'idm', label: 'IDM', emoji: '⚙️' },
  { id: 'rock', label: 'Rock', emoji: '🎸' },
  { id: 'jazz', label: 'Jazz', emoji: '🎷' },
  { id: 'edm', label: 'EDM', emoji: '🎛️' },
  { id: 'rnb', label: 'R&B', emoji: '🎤' },
  { id: 'reggae', label: 'Reggae', emoji: '🌴' },
  { id: 'latin', label: 'Latin', emoji: '💃' },
  { id: 'orchestral', label: 'Orchestral', emoji: '🏛️' },
];

/** Approved desaturated accent palette — limited, vibe-forward. */
const ACCENT = {
  ambient:   '#6b7a8d', // slate-blue
  synthwave: '#8b6b5e', // muted copper
  classical: '#7d7a6a', // warm stone
  lofi:      '#6d7a6e', // mossy grey
  cinematic: '#7a6b7d', // dusty violet
  world:     '#7a7258', // sandstone
  minimal:   '#7a7a7a', // pure grey
  idm:       '#5e7a7a', // dark teal
  rock:      '#8b5e5e', // muted ember
  jazz:      '#8b7a5e', // brass
  edm:       '#5e7a7a', // teal
  rnb:       '#7a5e6b', // mauve
  reggae:    '#6b8b5e', // olive
  latin:     '#8b6b5e', // warm copper
  orchestral:'#7a6b5e', // warm taupe
};

export const COPYRIGHT = '© 2026 MathSonify — proprietary composition. All rights reserved.';

// ── Compositions ─────────────────────────────────────────────────────

export const COMPOSITIONS: Composition[] = [
  // ── 1. Celestial Drift (ambient) ──
  {
    id: 'celestial-drift',
    title: 'Celestial Drift',
    genre: 'ambient',
    bpm: 62,
    key: 'pentatonic',
    durationSec: 9,
    description: 'Ethereal pads dissolve into a slow bass drone, punctuated by sparse percussive breaths.',
    copyright: COPYRIGHT,
    accent: ACCENT.ambient,
    version: 1,
    tracks: [
      {
        id: 'melody',
        label: 'Ethereal Melody',
        equation: 'sin(0.6x)*exp(-0.03x^2)+0.4*sin(2.1x+cos(x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.65,
        minFreq: 330,
        maxFreq: 660,
      },
      {
        id: 'pad',
        label: 'Ambient Pad',
        equation: '0.5*sin(0.35x)+0.3*cos(0.9x)',
        instrument: 'triangle',
        voice: 'frequency',
        mix: 0.45,
        minFreq: 165,
        maxFreq: 330,
      },
      {
        id: 'bass',
        label: 'Deep Bass',
        equation: '0.6*sin(0.22x+0.3*sin(1.1x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 55,
        maxFreq: 110,
      },
      {
        id: 'rhythm',
        label: 'Sparse Hat',
        equation: 'abs(sin(1.25x))^0.7',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.3,
      },
    ],
  },

  // ── 2. Neon Pulse (synthwave) ──
  {
    id: 'neon-pulse',
    title: 'Neon Pulse',
    genre: 'synthwave',
    bpm: 102,
    key: 'minor',
    durationSec: 8,
    description: 'Retro synth lead over a pulsating bass arpeggio, driven by gated drums.',
    copyright: COPYRIGHT,
    accent: ACCENT.synthwave,
    version: 1,
    tracks: [
      {
        id: 'lead',
        label: 'Synth Lead',
        equation: 'sin(1.5x)+0.3*sin(3x)',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.7,
        minFreq: 220,
        maxFreq: 880,
      },
      {
        id: 'arp',
        label: 'Arpeggio',
        equation: 'abs(sin(1.1x))*sin(4.2x)',
        instrument: 'square',
        voice: 'note',
        mix: 0.4,
        minFreq: 330,
        maxFreq: 660,
      },
      {
        id: 'bass',
        label: 'Pulse Bass',
        equation: '2*atan(sin(0.9x))/pi',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.6,
        minFreq: 55,
        maxFreq: 110,
      },
      {
        id: 'drums',
        label: 'Drums',
        equation: 'floor(sin(1.9x)^2*4)',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.55,
      },
    ],
  },

  // ── 3. Clockwork Garden (classical) ──
  {
    id: 'clockwork-garden',
    title: 'Clockwork Garden',
    genre: 'classical',
    bpm: 84,
    key: 'major',
    durationSec: 9,
    description: 'A contrapuntal melody unfolds over gentle counter-lines and soft harmonic bass.',
    copyright: COPYRIGHT,
    accent: ACCENT.classical,
    version: 1,
    tracks: [
      {
        id: 'melody',
        label: 'Main Theme',
        equation: 'sin(x)+0.25*sin(3*x+0.7)',
        instrument: 'piano',
        voice: 'note',
        mix: 0.7,
        minFreq: 330,
        maxFreq: 700,
      },
      {
        id: 'counter',
        label: 'Counter-line',
        equation: 'cos(0.8*x)+0.2*sin(2.4*x)',
        instrument: 'piano',
        voice: 'note',
        mix: 0.45,
        minFreq: 260,
        maxFreq: 520,
      },
      {
        id: 'bass',
        label: 'Cello Bass',
        equation: '0.5*sin(0.5*x+0.2*cos(x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.5,
        minFreq: 82,
        maxFreq: 165,
      },
      {
        id: 'hits',
        label: 'Soft Percussion',
        equation: 'max(0,sin(2.5*x))',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.25,
      },
    ],
  },

  // ── 4. Tidal Resonance (lo-fi) ──
  {
    id: 'tidal-resonance',
    title: 'Tidal Resonance',
    genre: 'lofi',
    bpm: 76,
    key: 'pentatonic',
    durationSec: 8,
    description: 'Warm Rhodes keys drift through vinyl hiss, anchored by a round sub-bass.',
    copyright: COPYRIGHT,
    accent: ACCENT.lofi,
    version: 1,
    tracks: [
      {
        id: 'keys',
        label: 'Warm Keys',
        equation: '0.7*sin(0.9*x)*exp(-0.02*(x-4)^2)+0.2*cos(2*x)',
        instrument: 'triangle',
        voice: 'chord',
        mix: 0.65,
        minFreq: 220,
        maxFreq: 440,
      },
      {
        id: 'bass',
        label: 'Sub Bass',
        equation: 'sin(0.45*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 55,
        maxFreq: 98,
      },
      {
        id: 'vinyl',
        label: 'Vinyl Texture',
        equation: '0.15*sin(11*x+sin(3*x))',
        instrument: 'triangle',
        voice: 'frequency',
        mix: 0.15,
        minFreq: 2000,
        maxFreq: 6000,
      },
      {
        id: 'kick',
        label: 'Kick',
        equation: 'sin(1.2*x)>0.6 ? 1 : 0',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.5,
      },
    ],
  },

  // ── 5. Supernova (cinematic) ──
  {
    id: 'supernova',
    title: 'Supernova',
    genre: 'cinematic',
    bpm: 68,
    key: 'minor',
    durationSec: 10,
    description: 'Expansive brass swells and soaring strings build toward a thunderous climax.',
    copyright: COPYRIGHT,
    accent: ACCENT.cinematic,
    version: 1,
    tracks: [
      {
        id: 'brass',
        label: 'Brass Swell',
        equation: 'tanh(1.5*sin(0.55*x))+0.2*sin(2*x)',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.7,
        minFreq: 165,
        maxFreq: 440,
      },
      {
        id: 'strings',
        label: 'String Section',
        equation: 'sin(0.6*x)+0.35*sin(0.6*x+pi/3)',
        instrument: 'triangle',
        voice: 'chord',
        mix: 0.55,
        minFreq: 220,
        maxFreq: 520,
      },
      {
        id: 'bass',
        label: 'Basso Profundo',
        equation: '0.6*sin(0.33*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.6,
        minFreq: 41,
        maxFreq: 82,
      },
      {
        id: 'perc',
        label: 'Timpani Rolls',
        equation: 'abs(sin(2.2*x))^2',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.45,
      },
    ],
  },

  // ── 6. Fractal Bazaar (world) ──
  {
    id: 'fractal-bazaar',
    title: 'Fractal Bazaar',
    genre: 'world',
    bpm: 96,
    key: 'dorian',
    durationSec: 8,
    description: 'A wandering lead weaves through a hypnotic drone, propelled by layered hand percussion.',
    copyright: COPYRIGHT,
    accent: ACCENT.world,
    version: 1,
    tracks: [
      {
        id: 'lead',
        label: 'Sitar Lead',
        equation: 'sin(1.3*x)*cos(0.7*x)+0.2*sin(5*x)',
        instrument: 'pluck',
        voice: 'note',
        mix: 0.7,
        minFreq: 293,
        maxFreq: 587,
      },
      {
        id: 'drone',
        label: 'Tambura Drone',
        equation: 'sin(0.35*x)+0.4*cos(0.5*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.35,
        minFreq: 130,
        maxFreq: 262,
      },
      {
        id: 'perc',
        label: 'Tabla Percussion',
        equation: 'floor(3*abs(sin(1.8*x)))',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.5,
      },
    ],
  },

  // ── 7. Echo Chamber (minimal) ──
  {
    id: 'echo-chamber',
    title: 'Echo Chamber',
    genre: 'minimal',
    bpm: 118,
    key: 'dorian',
    durationSec: 7,
    description: 'Sparse pulse patterns and deep sub-bass create a hypnotic rhythmic space.',
    copyright: COPYRIGHT,
    accent: ACCENT.minimal,
    version: 1,
    tracks: [
      {
        id: 'pulse',
        label: 'Pulse',
        equation: 'sign(sin(0.95*x))*abs(sin(0.95*x))^0.5',
        instrument: 'sine',
        voice: 'note',
        mix: 0.6,
        minFreq: 220,
        maxFreq: 440,
      },
      {
        id: 'sub',
        label: 'Sub',
        equation: 'sin(0.47*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.6,
        minFreq: 40,
        maxFreq: 80,
      },
      {
        id: 'hat',
        label: 'Closed Hat',
        equation: 'abs(sin(3.7*x))>0.85 ? 1 : 0',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.35,
      },
    ],
  },

  // ── 8. Glitch Protocol (IDM) ──
  {
    id: 'glitch-protocol',
    title: 'Glitch Protocol',
    genre: 'idm',
    bpm: 132,
    key: 'chromatic',
    durationSec: 7,
    description: 'Fractured synth stabs and stuttering rhythms push into experimental territory.',
    copyright: COPYRIGHT,
    accent: ACCENT.idm,
    version: 1,
    tracks: [
      {
        id: 'glitch',
        label: 'Glitch Lead',
        equation: 'sin(2.3*x+2*sin(0.7*x))',
        instrument: 'square',
        voice: 'note',
        mix: 0.6,
        minFreq: 293,
        maxFreq: 880,
      },
      {
        id: 'stutter',
        label: 'Stutter',
        equation: 'abs(sin(1.9*x))*(mod(x,2)<1?1:0.2)',
        instrument: 'sawtooth',
        voice: 'note',
        mix: 0.4,
        minFreq: 220,
        maxFreq: 440,
      },
      {
        id: 'bass',
        label: 'Warp Bass',
        equation: 'sin(0.6*x+0.5*sin(1.7*x))',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 55,
        maxFreq: 130,
      },
      {
        id: 'drums',
        label: 'Drum Machine',
        equation: 'floor(4*(sin(2.6*x)^2))',
        instrument: 'square',
        voice: 'drums',
        mix: 0.5,
      },
    ],
  },

  // ── 9. Iron Equation ★ (rock) ──
  {
    id: 'iron-equation',
    title: 'Iron Equation ★',
    genre: 'rock',
    bpm: 128,
    key: 'minor',
    durationSec: 8,
    description: 'Distorted guitar riffs and punchy drums power a heavy rock anthem equation.',
    copyright: COPYRIGHT,
    accent: ACCENT.rock,
    version: 1,
    tracks: [
      {
        id: 'guitar-lead',
        label: 'Lead Guitar',
        equation: '0.8*tanh(2*sin(1.2*x))+0.2*sin(3.6*x)',
        instrument: 'sawtooth',
        voice: 'note',
        mix: 0.75,
        minFreq: 220,
        maxFreq: 660,
      },
      {
        id: 'guitar-rhythm',
        label: 'Rhythm Guitar',
        equation: 'sign(sin(0.95*x))*0.7+0.15*sin(4*x)',
        instrument: 'sawtooth',
        voice: 'note',
        mix: 0.5,
        minFreq: 165,
        maxFreq: 330,
      },
      {
        id: 'bass',
        label: 'Bass Guitar',
        equation: 'sin(0.6*x+0.4*sin(1.1*x))',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.6,
        minFreq: 55,
        maxFreq: 130,
      },
      {
        id: 'drums',
        label: 'Drum Kit',
        equation: 'floor(4*abs(sin(2.0*x))^1.2)',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.65,
      },
    ],
  },

  // ── 10. Midnight Cipher (jazz) ──
  {
    id: 'midnight-cipher',
    title: 'Midnight Cipher',
    genre: 'jazz',
    bpm: 96,
    key: 'dorian',
    durationSec: 9,
    description: 'Languid piano chords float over a walking bass line, brushed with soft cymbals.',
    copyright: COPYRIGHT,
    accent: ACCENT.jazz,
    version: 1,
    tracks: [
      {
        id: 'piano',
        label: 'Piano',
        equation: 'sin(0.9*x)+0.22*sin(2.7*x+0.6*sin(0.5*x))',
        instrument: 'piano',
        voice: 'chord',
        mix: 0.65,
        minFreq: 220,
        maxFreq: 520,
      },
      {
        id: 'bass',
        label: 'Walking Bass',
        equation: '0.5*sin(0.55*x+0.2*sin(1.3*x))+0.15*cos(0.9*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 82,
        maxFreq: 165,
      },
      {
        id: 'brush',
        label: 'Brush Cymbals',
        equation: 'abs(cos(1.6*x))^2',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.3,
      },
    ],
  },

  // ── 11. Neon Grid (EDM) ──
  {
    id: 'neon-grid',
    title: 'Neon Grid',
    genre: 'edm',
    bpm: 126,
    key: 'minor',
    durationSec: 8,
    description: 'A driving supersaw lead and four-on-the-floor kick push the energy forward.',
    copyright: COPYRIGHT,
    accent: ACCENT.edm,
    version: 1,
    tracks: [
      {
        id: 'supersaw',
        label: 'Supersaw',
        equation: '0.6*(2*atan(6*sin(1.25*x))/pi)+0.2*sin(2.5*x)',
        instrument: 'sawtooth',
        voice: 'note',
        mix: 0.7,
        minFreq: 220,
        maxFreq: 880,
      },
      {
        id: 'pluck',
        label: 'Pluck',
        equation: 'abs(sin(1.1*x))*sin(5*x)',
        instrument: 'pluck',
        voice: 'note',
        mix: 0.45,
        minFreq: 440,
        maxFreq: 880,
      },
      {
        id: 'sub',
        label: 'Sub Bass',
        equation: 'sin(0.5*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.65,
        minFreq: 40,
        maxFreq: 80,
      },
      {
        id: 'drums',
        label: 'Four-on-Floor',
        equation: 'abs(sin(pi*x))>0.3 ? 1 : 0',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.6,
      },
    ],
  },

  // ── 12. Soul Formula (R&B) ──
  {
    id: 'soul-formula',
    title: 'Soul Formula',
    genre: 'rnb',
    bpm: 82,
    key: 'pentatonic',
    durationSec: 9,
    description: 'Velvety Rhodes chords and a warm sub-bass create a laid-back R&B groove.',
    copyright: COPYRIGHT,
    accent: ACCENT.rnb,
    version: 1,
    tracks: [
      {
        id: 'rhodes',
        label: 'Rhodes',
        equation: '0.6*sin(0.85*x)+0.25*sin(1.7*x)',
        instrument: 'triangle',
        voice: 'chord',
        mix: 0.65,
        minFreq: 220,
        maxFreq: 440,
      },
      {
        id: 'pad',
        label: 'Soft Pad',
        equation: '0.45*cos(0.5*x+0.3*sin(x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.4,
        minFreq: 165,
        maxFreq: 330,
      },
      {
        id: 'bass',
        label: 'Finger Bass',
        equation: 'sin(0.4*x+0.2*cos(0.9*x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 55,
        maxFreq: 110,
      },
    ],
  },

  // ── 13. Reggae Root (reggae) ──
  {
    id: 'reggae-root',
    title: 'Reggae Root',
    genre: 'reggae',
    bpm: 78,
    key: 'major',
    durationSec: 8,
    description: 'Off-beat skank guitar and a deep bubbling bass channel island rhythms.',
    copyright: COPYRIGHT,
    accent: ACCENT.reggae,
    version: 1,
    tracks: [
      {
        id: 'skank',
        label: 'Skank Guitar',
        equation: 'abs(sin(0.85*x))*(sin(4*x)>0?1:0.2)',
        instrument: 'pluck',
        voice: 'note',
        mix: 0.6,
        minFreq: 262,
        maxFreq: 524,
      },
      {
        id: 'bass',
        label: 'Bubbling Bass',
        equation: 'sin(0.42*x)+0.2*sin(0.84*x)',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.65,
        minFreq: 55,
        maxFreq: 110,
      },
      {
        id: 'perc',
        label: 'Percussion',
        equation: 'abs(sin(2.1*x))>0.7 ? 1 : 0',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.4,
      },
    ],
  },

  // ── 14. Calypso Curve (latin) ──
  {
    id: 'calypso-curve',
    title: 'Calypso Curve',
    genre: 'latin',
    bpm: 104,
    key: 'major',
    durationSec: 8,
    description: 'Vibrant montuno piano and syncopated bass bring the heat of the Caribbean.',
    copyright: COPYRIGHT,
    accent: ACCENT.latin,
    version: 1,
    tracks: [
      {
        id: 'montuno',
        label: 'Montuno Piano',
        equation: 'sin(1.15*x)+0.3*cos(2.3*x)',
        instrument: 'piano',
        voice: 'note',
        mix: 0.7,
        minFreq: 262,
        maxFreq: 524,
      },
      {
        id: 'bass',
        label: 'Tumbao Bass',
        equation: 'sin(0.58*x+0.25*sin(1.2*x))',
        instrument: 'sine',
        voice: 'frequency',
        mix: 0.6,
        minFreq: 82,
        maxFreq: 165,
      },
      {
        id: 'clave',
        label: 'Clave',
        equation: 'floor(2*abs(sin(1.6*x)))',
        instrument: 'triangle',
        voice: 'drums',
        mix: 0.45,
      },
    ],
  },

  // ── 15. Frozen Theorem (orchestral) ──
  {
    id: 'frozen-theorem',
    title: 'Frozen Theorem',
    genre: 'orchestral',
    bpm: 66,
    key: 'minor',
    durationSec: 10,
    description: 'Lush orchestral strings and a solemn horn melody culminate in powerful timpani.',
    copyright: COPYRIGHT,
    accent: ACCENT.orchestral,
    version: 1,
    tracks: [
      {
        id: 'strings',
        label: 'String Ensemble',
        equation: 'sin(0.48*x)+0.35*sin(0.48*x+pi/5)+0.15*sin(1.44*x)',
        instrument: 'triangle',
        voice: 'chord',
        mix: 0.65,
        minFreq: 196,
        maxFreq: 520,
      },
      {
        id: 'horn',
        label: 'French Horn',
        equation: 'tanh(sin(0.52*x))',
        instrument: 'sawtooth',
        voice: 'frequency',
        mix: 0.55,
        minFreq: 147,
        maxFreq: 330,
      },
      {
        id: 'timp',
        label: 'Timpani',
        equation: 'abs(sin(1.1*x))^3',
        instrument: 'sine',
        voice: 'drums',
        mix: 0.5,
      },
    ],
  },
];
