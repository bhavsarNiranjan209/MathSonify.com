/**
 * The Guess library — 30 equations that exist ONLY for the Guess game.
 *
 * This dataset is deliberately self-contained. It does not import, extend,
 * merge with, or reference the main Equations catalog (`src/data/presets.ts`)
 * in any way, and nothing in that catalog knows this file exists. Two reasons:
 *
 *   1. The game is a fixed, curated set of 30, not a browsable catalog, so it
 *      needs a different shape (no name/description, a `family` rather than a
 *      browsable `category`).
 *   2. `family` is load-bearing, not decorative — see `guessRounds.ts`. The
 *      wrong answers for a round are drawn from the SAME family, which is the
 *      only reason the game is a real listening test rather than a guess from
 *      the shape of the text. Coupling the two datasets would make it far too
 *      easy for an edit to the public catalog to quietly change the game's
 *      difficulty.
 *
 * Every entry carries its own `plot` function rather than a parsed equation
 * string. The functions are the exact thing that is drawn and sonified, and
 * `guessLibrary.test.ts` samples all 30 across their domains to prove none of
 * them returns a non-finite value.
 */
import type { InstrumentType } from '../store/studioStore';

/** The six families. Distractor selection is scoped to one of these. */
export type GuessFamily = 'trig' | 'beat' | 'chirp' | 'perc' | 'decay' | 'shape';

export type GuessDifficulty = 'Easy' | 'Medium' | 'Hard';

export interface GuessEquation {
  /** Unique, stable, and used as the React key. */
  id: string;
  /** The family this equation belongs to — the distractor pool is its siblings. */
  family: GuessFamily;
  difficulty: GuessDifficulty;
  /**
   * Human-readable formula, revealed after the round is answered.
   *
   * Written with real typography (·, ², √, −) rather than the ASCII that
   * `parseEquation` accepts, because this is a label, not an input: it is
   * rendered as-is and never parsed.
   */
  display: string;
  /** The plot function: the one definition of what this equation looks and sounds like. */
  plot: (x: number) => number;
  /** Domain drawn on the reveal graph. Chosen so each family reads at its natural scale. */
  minX: number;
  maxX: number;
  /** Pitch range the sampled curve is mapped into. */
  minFreq: number;
  maxFreq: number;
  /** Synth voice used for the reveal audio. */
  instrument: InstrumentType;
}

/** Family metadata — shown after a round is answered, to explain why it sounded like that. */
export const GUESS_FAMILIES: Record<GuessFamily, { label: string; blurb: string }> = {
  trig: { label: 'Trigonometric', blurb: 'Plain sine and cosine waves — the building blocks of sound.' },
  beat: { label: 'Beat patterns', blurb: 'Waves layered or multiplied, producing pulses and interference.' },
  chirp: { label: 'Chirps', blurb: 'Frequency sweeps that climb or fall as the curve accelerates.' },
  perc: { label: 'Percussive', blurb: 'Steps, jumps and absolute value — a curve made of clicks.' },
  decay: { label: 'Decaying', blurb: 'Oscillations fading away under an envelope.' },
  shape: { label: 'Shaped', blurb: 'A carrier wave bent into a form — windowed, rectified, or mirrored.' },
};

/**
 * Per-family accent colour.
 *
 * The colour is a deliberate teaching signal, not decoration: every surface
 * that identifies "this round is a chirp" — the difficulty badge, the card's
 * ambient glow, the active segment of the progress indicator, and the stroke
 * of the revealed curve — uses this one value. After a few games a player
 * starts recognising `perc` by its coral glow before the label is read.
 *
 * Chosen for hue separation first (six clearly distinguishable hues) and
 * legibility second: every one of these reads against both the dark and the
 * light canvas surface, and none is confusable with the green/red used for
 * correct/wrong in the progress indicator.
 */
export const GUESS_FAMILY_ACCENT: Record<GuessFamily, string> = {
  trig: '#E8B33C',   // amber gold  — the plain waves
  beat: '#4FC3F7',   // cyan        — interference
  chirp: '#B388FF',  // violet      — the sweep
  perc: '#FF8A65',   // coral       — the clicks
  decay: '#5DD6A0',  // mint        — the fade
  shape: '#FF7BA9',  // pink        — the window
};

export const GUESS_FAMILY_ORDER: GuessFamily[] = ['trig', 'beat', 'chirp', 'perc', 'decay', 'shape'];
/**
 * The 30 equations: six families of five.
 *
 * Read the families top to bottom — Easy fundamentals, Medium interference
 * and percussion, Hard sweeps, decays and windowed shapes. Within a family the
 * five members are chosen to be genuinely confusable, because they are about to
 * be shuffled together into the same four-option question.
 */
export const GUESS_LIBRARY: readonly GuessEquation[] = [
  /* ── trig (Easy) ────────────────────────────────────────────────── */
  {
    id: 'trig-sin',
    family: 'trig',
    difficulty: 'Easy',
    display: 'sin(x)',
    plot: (x) => Math.sin(x),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 700, instrument: 'sine',
  },
  {
    id: 'trig-cos',
    family: 'trig',
    difficulty: 'Easy',
    display: 'cos(x)',
    plot: (x) => Math.cos(x),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 700, instrument: 'sine',
  },
  {
    id: 'trig-sin-plus-cos',
    family: 'trig',
    difficulty: 'Easy',
    display: 'sin(x) + cos(x)',
    plot: (x) => Math.sin(x) + Math.cos(x),
    minX: -6, maxX: 6, minFreq: 190, maxFreq: 760, instrument: 'triangle',
  },
  {
    id: 'trig-sin-2x',
    family: 'trig',
    difficulty: 'Easy',
    display: 'sin(2x)',
    plot: (x) => Math.sin(2 * x),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 700, instrument: 'sine',
  },
  {
    id: 'trig-cos-3x',
    family: 'trig',
    difficulty: 'Easy',
    display: 'cos(3x)',
    plot: (x) => Math.cos(3 * x),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 700, instrument: 'sine',
  },

  /* ── beat (Medium) ──────────────────────────────────────────────── */
  {
    id: 'beat-detune',
    family: 'beat',
    difficulty: 'Medium',
    display: 'sin(x) + sin(1.1x)',
    plot: (x) => Math.sin(x) + Math.sin(1.1 * x),
    minX: -6, maxX: 6, minFreq: 190, maxFreq: 760, instrument: 'triangle',
  },
  {
    id: 'beat-product',
    family: 'beat',
    difficulty: 'Medium',
    display: 'sin(2x) · sin(3x)',
    plot: (x) => Math.sin(2 * x) * Math.sin(3 * x),
    minX: -6, maxX: 6, minFreq: 190, maxFreq: 760, instrument: 'triangle',
  },
  {
    id: 'beat-am',
    family: 'beat',
    difficulty: 'Medium',
    display: 'sin(x) · cos(5x)',
    plot: (x) => Math.sin(x) * Math.cos(5 * x),
    minX: -6, maxX: 6, minFreq: 190, maxFreq: 760, instrument: 'triangle',
  },
  {
    id: 'beat-harmonics',
    family: 'beat',
    difficulty: 'Medium',
    display: 'sin(x) + 0.5sin(3x) + 0.25sin(5x)',
    plot: (x) => Math.sin(x) + 0.5 * Math.sin(3 * x) + 0.25 * Math.sin(5 * x),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  {
    id: 'beat-fourier-ramp',
    family: 'beat',
    difficulty: 'Medium',
    display: 'sin(x) + sin(2x)/2 + sin(3x)/3',
    plot: (x) => Math.sin(x) + Math.sin(2 * x) / 2 + Math.sin(3 * x) / 3,
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  /* ── chirp (Hard) ───────────────────────────────────────────────── */
  {
    id: 'chirp-quadratic',
    family: 'chirp',
    difficulty: 'Hard',
    display: 'sin(x²)',
    plot: (x) => Math.sin(x * x),
    minX: -4, maxX: 4, minFreq: 180, maxFreq: 900, instrument: 'sine',
  },
  {
    id: 'chirp-quadratic-quiet',
    family: 'chirp',
    difficulty: 'Hard',
    display: 'sin(x²) · 0.6',
    plot: (x) => Math.sin(x * x) * 0.6,
    minX: -4, maxX: 4, minFreq: 180, maxFreq: 900, instrument: 'sine',
  },
  {
    id: 'chirp-cos-quadratic',
    family: 'chirp',
    difficulty: 'Hard',
    display: 'cos(x²)',
    plot: (x) => Math.cos(x * x),
    minX: -4, maxX: 4, minFreq: 180, maxFreq: 900, instrument: 'sine',
  },
  {
    id: 'chirp-abs-linear',
    family: 'chirp',
    difficulty: 'Hard',
    display: 'sin(x · |x|)',
    plot: (x) => Math.sin(x * Math.abs(x)),
    minX: -3, maxX: 3, minFreq: 180, maxFreq: 900, instrument: 'sine',
  },
  {
    id: 'chirp-double-quadratic',
    family: 'chirp',
    difficulty: 'Hard',
    display: 'sin(2x²)',
    plot: (x) => Math.sin(2 * x * x),
    minX: -4, maxX: 4, minFreq: 180, maxFreq: 900, instrument: 'sine',
  },

  /* ── perc (Medium) ──────────────────────────────────────────────── */
  {
    id: 'perc-floor3',
    family: 'perc',
    difficulty: 'Medium',
    display: 'floor(sin(x) · 3)',
    plot: (x) => Math.floor(Math.sin(x) * 3),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 720, instrument: 'square',
  },
  {
    id: 'perc-abs-sin',
    family: 'perc',
    difficulty: 'Medium',
    display: 'abs(sin(x))',
    plot: (x) => Math.abs(Math.sin(x)),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 720, instrument: 'square',
  },
  {
    id: 'perc-sign-sin',
    family: 'perc',
    difficulty: 'Medium',
    display: 'sign(sin(x))',
    plot: (x) => Math.sign(Math.sin(x)),
    minX: -6, maxX: 6, minFreq: 200, maxFreq: 720, instrument: 'square',
  },
  {
    id: 'perc-ceil-saw',
    family: 'perc',
    difficulty: 'Medium',
    display: 'ceil(x) − x',
    plot: (x) => Math.ceil(x) - x,
    minX: 0, maxX: 6, minFreq: 200, maxFreq: 720, instrument: 'square',
  },
  {
    id: 'perc-floor-saw',
    family: 'perc',
    difficulty: 'Medium',
    display: 'floor(x) − x',
    plot: (x) => Math.floor(x) - x,
    minX: 0, maxX: 6, minFreq: 200, maxFreq: 720, instrument: 'square',
  },

  /* ── decay (Hard) ───────────────────────────────────────────────── */
  {
    id: 'decay-gaussian',
    family: 'decay',
    difficulty: 'Hard',
    display: 'sin(5x) · e^(−0.1x²)',
    plot: (x) => Math.sin(5 * x) * Math.exp(-0.1 * x * x),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  {
    id: 'decay-exponential',
    family: 'decay',
    difficulty: 'Hard',
    display: 'sin(5x) · e^(−0.05|x|)',
    plot: (x) => Math.sin(5 * x) * Math.exp(-0.05 * Math.abs(x)),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  {
    id: 'decay-tight-gaussian',
    family: 'decay',
    difficulty: 'Hard',
    display: 'sin(8x) · e^(−0.2x²)',
    plot: (x) => Math.sin(8 * x) * Math.exp(-0.2 * x * x),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  {
    id: 'decay-cos-gaussian',
    family: 'decay',
    difficulty: 'Hard',
    display: 'cos(5x) · e^(−0.1x²)',
    plot: (x) => Math.cos(5 * x) * Math.exp(-0.1 * x * x),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },
  {
    id: 'decay-rational',
    family: 'decay',
    difficulty: 'Hard',
    display: 'sin(5x) / (1 + x²)',
    plot: (x) => Math.sin(5 * x) / (1 + x * x),
    minX: -6, maxX: 6, minFreq: 185, maxFreq: 780, instrument: 'triangle',
  },

  /* ── shape (Hard) ───────────────────────────────────────────────── */
  {
    id: 'shape-window-sin',
    family: 'shape',
    difficulty: 'Hard',
    display: '√(9 − x²) · sin(16x)',
    plot: (x) => Math.sqrt(9 - x * x) * Math.sin(16 * x),
    minX: -3, maxX: 3, minFreq: 185, maxFreq: 800, instrument: 'sine',
  },
  {
    id: 'shape-window-cos',
    family: 'shape',
    difficulty: 'Hard',
    display: '√(9 − x²) · cos(16x)',
    plot: (x) => Math.sqrt(9 - x * x) * Math.cos(16 * x),
    minX: -3, maxX: 3, minFreq: 185, maxFreq: 800, instrument: 'sine',
  },
  {
    id: 'shape-mirrored-root',
    family: 'shape',
    difficulty: 'Hard',
    display: 'sign(x) · √|x| · cos(14x)',
    plot: (x) => Math.sign(x) * Math.sqrt(Math.abs(x)) * Math.cos(14 * x),
    minX: -3, maxX: 3, minFreq: 185, maxFreq: 800, instrument: 'sine',
  },
  {
    id: 'shape-arc-ring',
    family: 'shape',
    difficulty: 'Hard',
    display: '√(16 − x²) − 2 + 0.6sin(14x)e^(−0.05|x|)',
    plot: (x) => Math.sqrt(16 - x * x) - 2 + 0.6 * Math.sin(14 * x) * Math.exp(-0.05 * Math.abs(x)),
    minX: -4, maxX: 4, minFreq: 185, maxFreq: 800, instrument: 'triangle',
  },
  {
    id: 'shape-window-chirp',
    family: 'shape',
    difficulty: 'Hard',
    display: '√(9 − x²) · cos(5x²)',
    plot: (x) => Math.sqrt(9 - x * x) * Math.cos(5 * x * x),
    minX: -3, maxX: 3, minFreq: 185, maxFreq: 800, instrument: 'sine',
  },
];

/** Every equation in one family. The distractor pool a round is drawn from. */
export function guessFamilyMembers(
  family: GuessFamily,
  library: readonly GuessEquation[] = GUESS_LIBRARY,
): GuessEquation[] {
  // Copy-by-index rather than a spread: a sparse hole in the literal would
  // survive `[...arr]` and become `undefined` further downstream.
  const out: GuessEquation[] = [];
  for (let i = 0; i < library.length; i++) {
    if (i in library && library[i] && library[i].family === family) out.push(library[i]);
  }
  return out;
}