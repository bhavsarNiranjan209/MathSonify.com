/**
 * The mathematics behind the "How it works" experience.
 *
 * Everything here is PURE. No React, no canvas, no Web Audio. That is
 * deliberate: the page demonstrates MathSonify's real engine, so the numbers it
 * shows must come from the same functions the engine uses rather than a
 * re-derivation that could quietly disagree with what you hear.
 *
 * Specifically the pitch readouts go through `pitchAt` — the SAME function
 * `audioEngine` uses to set the oscillator frequency — so "pitch" on this page
 * is literally the pitch being played, not an illustration of it.
 */

import { parseEquation, sampleEquationDetailed, type SamplePoint } from './equationParser';
import { pitchAt, type SonificationMode } from './sonificationMapping';

/** The equations the page offers. Kept short and legible on purpose. */
export const HOW_IT_WORKS_PRESETS = [
  'sin(x)',
  'cos(x)',
  'sin(x) + 0.5*sin(2*x)',
  'x^2',
  'sin(x^2)',
  'sin(x)*cos(2*x)',
] as const;

/** Domain every demo uses, so amplitudes and frequencies stay comparable. */
export const DEMO_MIN_X = -6;
export const DEMO_MAX_X = 6;

/**
 * 360 samples.
 *
 * Fewer visibly facets a curve like sin(2x); more buys nothing at these canvas
 * widths and costs time on every parameter change. Each SamplePoint already
 * carries its derivative and curvature — which the property readouts use — so a
 * single pass yields everything the page draws.
 */
export const DEMO_SAMPLES = 360;

export interface DemoCurve {
  points: SamplePoint[];
  /** Smallest / largest finite y, used to normalise pitch and amplitude. */
  minY: number;
  maxY: number;
  /** Largest |y|, for describing amplitude without a signed value. */
  peakY: number;
  /** Mean |dy/dx| — a plain-language stand-in for "how steep is this". */
  meanSlope: number;
  /** Mean |curvature|. */
  meanCurvature: number;
  /** Number of completed oscillations, from zero crossings. */
  oscillations: number;
  error?: string;
}

/**
 * Samples an equation and derives the properties the page teaches with.
 *
 * Invalid samples (poles, singularities) stay in place so the drawn curve breaks
 * at the asymptote instead of drawing a line straight through it — bridging a
 * discontinuity would be a lie about the mathematics.
 */
export function buildDemoCurve(equation: string): DemoCurve {
  let points: SamplePoint[] = [];
  let error: string | undefined;

  try {
    const parsed = parseEquation(equation);
    // `evaluate` is the parser's own compiled single-argument function — the
    // exact one it feeds to `sampleEquationDetailed`. Using it directly means
    // this page and the engine sample identically, with no adaptation layer
    // between them.
    if (parsed.success && parsed.evaluate) {
      points = sampleEquationDetailed(parsed.evaluate, DEMO_MIN_X, DEMO_MAX_X, DEMO_SAMPLES);
    } else {
      error = parsed.error ?? 'That equation could not be read.';
    }
  } catch {
    error = 'That equation could not be read.';
  }

  const valid = points.filter((p) => p.isValid);
  if (valid.length < 2) {
    return {
      points,
      minY: -1,
      maxY: 1,
      peakY: 1,
      meanSlope: 0,
      meanCurvature: 0,
      oscillations: 0,
      error: error ?? 'That equation has no drawable points.',
    };
  }

  let minY = Infinity;
  let maxY = -Infinity;
  let slopeSum = 0;
  let curveSum = 0;
  for (const p of valid) {
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
    slopeSum += Math.abs(p.dy);
    curveSum += Math.abs(p.curvature);
  }

  return {
    points,
    minY,
    maxY,
    peakY: Math.max(Math.abs(minY), Math.abs(maxY)),
    meanSlope: slopeSum / valid.length,
    meanCurvature: curveSum / valid.length,
    oscillations: countOscillations(valid),
  };
}

/**
 * Counts completed oscillations from upward crossings of the mean.
 *
 * Centring on the mean rather than zero keeps a curve with a vertical offset
 * from reporting nonsense, and the hysteresis check stops a curve that merely
 * grazes its midline from registering a new "cycle" on every sample.
 */
export function countOscillations(points: SamplePoint[]): number {
  let mean = 0;
  for (const p of points) mean += p.y;
  mean /= points.length;

  let crossings = 0;
  let wasBelow = points[0].y < mean;
  for (let i = 1; i < points.length; i++) {
    const below = points[i].y < mean;
    if (below !== wasBelow) {
      if (Math.abs(points[i].y - mean) > 1e-6) crossings++;
      wasBelow = below;
    }
  }
  return Math.max(1, Math.round(crossings / 2));
}

/**
 * The pitch the engine WOULD play at a given height.
 *
 * Returns null for the modes that have no pitch (rhythm, chord), so the UI can
 * say "loudness 62%" — which is true — instead of inventing a frequency that is
 * not being played. This mirrors how `PlaybackPitch` is modelled in
 * `sonificationMapping` for exactly the same reason.
 */
export function pitchFor(
  curve: DemoCurve,
  y: number,
  mode: SonificationMode,
  minFreq: number,
  maxFreq: number,
): number | null {
  const pitch = pitchAt(mode, y, curve.minY, curve.maxY, minFreq, maxFreq);
  return pitch.kind === 'amplitude' ? null : pitch.hz;
}

/** Loudness 0..1, for the modes where height drives level instead of pitch. */
export function levelFor(curve: DemoCurve, y: number, mode: SonificationMode): number | null {
  const pitch = pitchAt(mode, y, curve.minY, curve.maxY, 220, 880);
  return pitch.kind === 'amplitude' ? pitch.value : null;
}

/** Note name for a frequency, for the live readout. */
export function noteName(hz: number): string {
  if (!Number.isFinite(hz) || hz <= 0) return '—';
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const midi = Math.round(69 + 12 * Math.log2(hz / 440));
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

/**
 * The property → sound map the page presents.
 *
 * Every entry is grounded in what the engine ACTUALLY does, not in what
 * mathematics "generally" implies — a sonification page that overstates its own
 * mechanism is the same documentation problem this page is meant to escape.
 * Wording stays at "tends to" / "reads as" where the mapping is a perceptual
 * effect rather than an identity.
 */
export interface SonificationFact {
  property: string;
  becomes: string;
  detail: string;
}

export const SONIFICATION_MAP: SonificationFact[] = [
  {
    property: 'Height',
    becomes: 'Pitch',
    detail:
      'The y value at the playhead sets the oscillator frequency, or snaps to a scale degree in note mode. This is the exact mapping the engine plays.',
  },
  {
    property: 'Width',
    becomes: 'Time',
    detail:
      'Movement from left to right is the playback clock, and the same position in x always sounds at the same moment. This is the exact mapping the engine plays.',
  },
  {
    property: 'Amplitude',
    becomes: 'Dynamic range',
    detail:
      'A taller curve sweeps a wider span of frequencies. The extremes of the shape become the extremes of the pitch range.',
  },
  {
    property: 'Oscillations',
    becomes: 'Repetition',
    detail:
      'More cycles across the same width revisit the pitch range more often — the audible difference between sin(x) and sin(3x).',
  },
  {
    property: 'Steepness',
    becomes: 'Tone brightness',
    detail:
      'Where the curve climbs quickly the engine opens its lowpass filter, so fast mathematical motion tends to sound brighter than slow.',
  },
  {
    property: 'Curvature',
    becomes: 'Rate of change',
    detail:
      'A sharply bending curve changes pitch quickly, which tends to read as urgency rather than as a longer, steadier sweep.',
  },
];