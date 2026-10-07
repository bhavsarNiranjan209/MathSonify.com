/**
 * Template-based descriptions of a curve's shape, for screen readers and for
 * anyone who cannot or does not want to look at the plot.
 *
 * Two deliberate constraints:
 *
 * 1. **No AI, no guessing.** Every clause is chosen from measured properties of
 *    the actual sample points. That keeps it deterministic, unit-testable, and
 *    honest — the page never asserts something the data does not support.
 * 2. **Say what is true, including when there is nothing interesting.** A flat
 *    line is described as flat rather than dressed up as "gentle undulation".
 *
 * Pure maths: no DOM, no speech, no store. The component is the only part that
 * touches the browser.
 */
import type { SamplePoint } from './equationParser';

export interface CurveFacts {
  /** Number of local maxima and local minima, noise-filtered. */
  peaks: number;
  troughs: number;
  /** x of the highest point, or null when the curve is flat. */
  peakX: number | null;
  /** x of the lowest point, or null when the curve is flat. */
  troughX: number | null;
  /** Whether the curve rises, falls, is flat, or varies. */
  trend: 'rising' | 'falling' | 'flat' | 'varying';
  /** Mirror symmetry about the vertical axis, if any. */
  symmetry: 'even' | 'odd' | 'none';
  minY: number;
  maxY: number;
  /** True when the variation is too small to describe as a shape. */
  isFlat: boolean;
}

export interface CurveDescription {
  /** A few short sentences, ready for a screen reader. */
  text: string;
  /** The measured facts behind it — asserted in tests, useful for debugging. */
  facts: CurveFacts;
}

/** Variation below this fraction of the y magnitude counts as flat. */
const FLAT_EPSILON = 1e-3;
/** Net change needed before we call a segment "rising" or "falling". */
const TREND_EPSILON = 0.02;

/**
 * Measures the shape of a sampled curve.
 *
 * Extrema use a deadband proportional to the curve's own amplitude, so a
 * noisy-but-flat curve does not report thirty peaks and a genuinely oscillating
 * one is not smoothed away.
 */
export function analyzeCurve(points: SamplePoint[]): CurveFacts {
  const valid = points.filter((p) => p.isValid);
  if (valid.length < 2) {
    return {
      peaks: 0, troughs: 0, peakX: null, troughX: null, trend: 'flat', symmetry: 'none',
      minY: 0, maxY: 0, isFlat: true,
    };
  }

  const ys = valid.map((p) => p.y);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const amplitude = maxY - minY;
  const magnitude = Math.max(Math.abs(minY), Math.abs(maxY), 1);
  const isFlat = amplitude <= magnitude * FLAT_EPSILON;

  let peaks = 0;
  let troughs = 0;
  let peakX: number | null = null;
  let troughX: number | null = null;
  let dir: 1 | -1 | 0 = 0;
  let bestY = -Infinity;
  let lowestY = Infinity;
  // The deadband must NOT be a fixed fraction of the amplitude: with 800
  // samples the per-step change of x^2 is ~0.125, so a 5%-of-amplitude
  // threshold (5.0) would swallow every step and the vertex would never be seen.
  // Tie it to the typical step instead, so the threshold means the same thing
  // at any sample density.
  const step = valid.length > 1 ? amplitude / (valid.length - 1) : 0;
  const deadband = isFlat ? Infinity : Math.max(amplitude * 1e-3, step);

  for (let i = 1; i < valid.length; i++) {
    if (!valid[i - 1].isValid || !valid[i].isValid) continue;

    // Track the true extremes on EVERY sample, before the deadband is applied.
    // The deadband exists to stop noise being counted as a turning point; it
    // must not also blur *where* the high and low points are, or x^2 reports
    // its vertex at x = 2.5 instead of x = 0.
    if (valid[i - 1].y > bestY) {
      bestY = valid[i - 1].y;
      peakX = valid[i - 1].x;
    }
    if (valid[i - 1].y < lowestY) {
      lowestY = valid[i - 1].y;
      troughX = valid[i - 1].x;
    }

    const delta = valid[i].y - valid[i - 1].y;
    if (Math.abs(delta) < deadband) continue;
    const next: 1 | -1 = delta > 0 ? 1 : -1;
    if (dir !== 0 && next !== dir) {
      // The turning point sits on the previous sample.
      if (dir === 1) peaks++;
      else troughs++;
    }
    dir = next;
  }

  const first = valid[0];
  const last = valid[valid.length - 1];
  let trend: CurveFacts['trend'];
  if (isFlat) {
    trend = 'flat';
  } else if (peaks > 0 || troughs > 0) {
    trend = 'varying';
  } else {
    const net = last.y - first.y;
    const threshold = amplitude * TREND_EPSILON;
    trend = Math.abs(net) <= threshold ? 'flat' : net > 0 ? 'rising' : 'falling';
  }

  return {
    peaks, troughs, peakX, troughX, trend,
    symmetry: measureSymmetry(valid),
    minY, maxY, isFlat,
  };
}

/** Even (mirror about x=0) or odd (rotational) symmetry, or none. */
function measureSymmetry(valid: SamplePoint[]): CurveFacts['symmetry'] {
  const ys = valid.map((p) => p.y);
  const half = Math.floor(ys.length / 2);
  if (half < 4) return 'none';

  const amp = Math.max(...ys) - Math.min(...ys);
  if (amp <= 0) return 'none';
  // 12% tolerance: describing the *shape*, not pixel-exact mirroring.
  const tolerance = amp * 0.12;

  let evenErr = 0;
  let oddErr = 0;
  for (let i = 1; i <= half; i++) {
    evenErr += Math.abs(ys[ys.length - 1 - i] - ys[i]);
    oddErr += Math.abs(ys[ys.length - 1 - i] + ys[i]);
  }
  evenErr /= half;
  oddErr /= half;

  if (evenErr <= tolerance && evenErr <= oddErr) return 'even';
  if (oddErr <= tolerance) return 'odd';
  return 'none';
}

/**
 * Builds the spoken description from the measured facts.
 *
 * Sentence order is fixed so the output is stable and testable: shape, then
 * oscillation, then symmetry. Kept short on purpose — a screen reader user wants
 * the shape, not a treatise.
 */
export function describeCurve(points: SamplePoint[], equation?: string): CurveDescription {
  const facts = analyzeCurve(points);
  const parts: string[] = [];

  if (equation) parts.push(`The equation is ${equation}.`);

  if (facts.isFlat) {
    parts.push(
      `This curve is flat: it holds a constant value of ${fmt(facts.maxY)} across the whole domain.`,
    );
    return { text: parts.join(' '), facts };
  }

  switch (facts.trend) {
    case 'rising':
      parts.push(`This curve rises steadily from ${fmt(facts.minY)} to ${fmt(facts.maxY)}.`);
      break;
    case 'falling':
      parts.push(`This curve falls steadily from ${fmt(facts.maxY)} down to ${fmt(facts.minY)}.`);
      break;
    case 'flat':
      parts.push(`This curve stays close to ${fmt((facts.maxY + facts.minY) / 2)} across the domain.`);
      break;
    default:
      parts.push(
        facts.peakX !== null
          ? `This curve varies between ${fmt(facts.minY)} and ${fmt(facts.maxY)}, reaching its highest point near x = ${fmt(facts.peakX, 3)}.`
          : `This curve varies between ${fmt(facts.minY)} and ${fmt(facts.maxY)}.`,
      );
  }

  // A single turning point is a *turn*, not an oscillation. Without this
  // split, x^2 would be announced as "oscillates, with 0 peaks and 1 trough",
  // which is both ugly and misleading.
  const turns = facts.peaks + facts.troughs;
  if (turns === 1) {
    if (facts.peaks === 1 && facts.peakX !== null) {
      parts.push(`It climbs to a single maximum near x = ${fmt(facts.peakX, 3)} and falls again.`);
    } else if (facts.troughs === 1 && facts.troughX !== null) {
      parts.push(`It drops to a single minimum near x = ${fmt(facts.troughX, 3)} and rises again.`);
    }
  } else if (turns > 1) {
    parts.push(
      `It oscillates, with ${facts.peaks} ${facts.peaks === 1 ? 'peak' : 'peaks'} and ${facts.troughs} ${facts.troughs === 1 ? 'trough' : 'troughs'}.`,
    );
  }

  if (facts.symmetry === 'even') {
    parts.push('The curve is mirror-symmetric about the vertical axis.');
  } else if (facts.symmetry === 'odd') {
    parts.push('The curve has rotational symmetry about the origin.');
  }

  return { text: parts.join(' '), facts };
}


const fmt = (v: number, places = 2) => {
  const rounded = Number(v.toFixed(places));
  return Object.is(rounded, -0) ? '0' : String(rounded);
};
