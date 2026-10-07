/**
 * Curve-to-curve transition for the How It Works demo.
 *
 * WHY THIS IS A MORPH AND NOT A CROSSFADE
 * ----------------------------------------
 * Every demo curve is sampled on the SAME x grid: a fixed domain
 * (DEMO_MIN_X..DEMO_MAX_X) at a fixed DEMO_SAMPLES count. That means the old
 * and new curves are *point-aligned* — index i is the same x in both — so the
 * shape can genuinely be interpolated rather than dissolved and redrawn.
 *
 * WHY IT LERPS IN NORMALISED SPACE
 * --------------------------------
 * `sin(x)` spans [-1, 1]; `x^2` over this domain spans [0, 36]. Lerping raw y
 * would drag the curve down to y=0 halfway through (a false "the curve
 * collapsed" reading) and overshoot badly on the way. Normalising each curve to
 * its own [-1, 1] first, interpolating that, then mapping back onto the target
 * curve's own range keeps the morph a pure change of *shape* and never lies
 * about amplitude.
 *
 * Pure maths, no DOM and no rAF: the component drives it from its existing
 * frame loop. That keeps the interpolation testable, which is the only part of
 * a WebGL/canvas feature that can be verified without a browser.
 */
import type { SamplePoint } from './equationParser';

/** A curve reduced to what the morph needs: normalised y plus its own range. */
export interface MorphCurve {
  /** y normalised to [-1, 1] against this curve's own min/max. */
  normalized: Float32Array;
  minY: number;
  maxY: number;
}

/**
 * Normalise a sampled curve for interpolation.
 *
 * A flat curve (zero range) maps to all zeros, which morphs into the incoming
 * shape as a straight line rather than dividing by zero.
 */
export function toMorphCurve(points: SamplePoint[]): MorphCurve {
  const n = points.length;
  const normalized = new Float32Array(n);
  if (n === 0) return { normalized, minY: 0, maxY: 1 };

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (!p.isValid) continue;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    minY = 0;
    maxY = 1;
  }
  const span = maxY - minY;
  for (let i = 0; i < n; i++) {
    normalized[i] = span > 0 ? ((points[i].y - minY) / span) * 2 - 1 : 0;
  }
  return { normalized, minY, maxY };
}

/**
 * Smooth in-out easing.
 *
 * Cubic, not a spring: the brief asks for a transition that settles rather than
 * bounces, and this is symmetric so the curve neither lurches at the start nor
 * creeps at the end.
 */
export function easeInOutCubic(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

export interface MorphOptions {
  /** Animation length in ms. */
  durationMs?: number;
  /**
   * When true the morph is skipped entirely and the target appears at once.
   * Driven by the visitor's prefers-reduced-motion setting.
   */
  reducedMotion?: boolean;
}

/**
 * Interpolated y values for a morph at `progress` (0 = from, 1 = to).
 *
 * Returns a new array so React never sees a mutated buffer, and denormalises
 * onto `to`'s own range so the result is directly drawable.
 */
export function morphY(
  from: MorphCurve,
  to: MorphCurve,
  progress: number,
  options: MorphOptions = {},
): number[] {
  const { durationMs = 520, reducedMotion = false } = options;
  const t = reducedMotion ? 1 : easeInOutCubic(progress);
  const n = Math.min(from.normalized.length, to.normalized.length);
  const out = new Array<number>(n);
  const toSpan = to.maxY - to.minY;
  for (let i = 0; i < n; i++) {
    const a = from.normalized[i] ?? 0;
    const b = to.normalized[i] ?? 0;
    const mixed = a + (b - a) * t;
    out[i] = to.minY + ((mixed + 1) / 2) * toSpan;
  }
  return out;
}

/** Progress 0..1 for a given elapsed time; 1 once the duration has passed. */
export function morphProgress(elapsedMs: number, durationMs = 520): number {
  if (!(durationMs > 0)) return 1;
  return Math.min(1, Math.max(0, elapsedMs / durationMs));
}
