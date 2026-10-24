/**
 * plotMath.ts — pure graph maths shared by the 2D plot and the 3D viewer.
 * No DOM, no three.js. One source of truth, so both views show identical
 * tick numbers, and negative values are placed by the same affine map as positives.
 */
export interface XY { x: number; y: number }
export interface Ticks { ticks: number[]; step: number }
export interface Range { lo: number; hi: number; clipped: boolean }
export interface Segment { start: number; end: number } // inclusive sample indices

export interface View {
  xMin: number; xMax: number; yLo: number; yHi: number; width: number; height: number;
  /** data x -> 0..width (left to right) */
  toX: (x: number) => number;
  /** data y -> 0..height (bottom to top). Negative data sits below the zero line. */
  toY: (y: number) => number;
  /** data y where the horizontal axis is drawn: 0 if 0 is in range, else the edge NEAREST to zero (top edge for an all-negative curve, bottom for all-positive) */
  xAxisY: number;
  /** data x where the vertical axis is drawn: 0 if 0 is in range, else the edge nearest to zero */
  yAxisX: number;
  xTicks: Ticks; yTicks: Ticks;
  /** continuous drawable runs (breaks at NaN / Infinity / trimmed asymptotes) */
  segments: Segment[];
  /** true when extreme values (asymptotes) were trimmed so the real shape stays readable */
  clipped: boolean;
}

/** "Nice" tick values (1, 2 or 5 x 10^n) covering [min, max]. Exact for negatives; contains 0 when 0 is in range. */
export function niceTicks(min: number, max: number, target = 6): Ticks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { ticks: [], step: 1 };
  if (min > max) [min, max] = [max, min];
  if (min === max) { const d = Math.abs(min) || 1; min -= d / 2; max += d / 2; }
  const raw = (max - min) / Math.max(1, target);
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / pow;
  const step = (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * pow;
  const first = Math.ceil(min / step - 1e-9);
  const last = Math.floor(max / step + 1e-9);
  const ticks: number[] = [];
  for (let i = first; i <= last && ticks.length < 200; i++) {
    const v = Number((i * step).toPrecision(12));
    ticks.push(v === 0 ? 0 : v); // never "-0"
  }
  return { ticks, step };
}

export function formatTick(v: number, step: number): string {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-4) return v.toExponential(1).replace('+', '');
  const decimals = step >= 1 ? 0 : Math.min(6, Math.ceil(-Math.log10(step) - 1e-9));
  let s = v.toFixed(decimals);
  if (s.indexOf('.') >= 0) s = s.replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
}

/**
 * y-range to display. Normally the true min..max (+4% padding). If a few extreme samples
 * (tan, 1/x, sec...) would flatten everything else, trim to the 5th..95th percentile band.
 */
export function robustRange(ys: number[]): Range {
  const f = ys.filter(Number.isFinite);
  if (f.length === 0) return { lo: -1, hi: 1, clipped: false };
  const s = f.slice().sort((a, b) => a - b);
  let lo = s[0], hi = s[s.length - 1];
  let clipped = false;
  if (s.length >= 40) {
    const q = (p: number) => s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
    const p5 = q(0.05), p95 = q(0.95), band = p95 - p5;
    // Measured on real curves: asymptotic ones (tan, 1/x, sec) have range/band of 30-80,
    // ordinary ones (x^3, exp, x^10, ln|x|, damped sines) stay under 3. 10 separates them with margin.
    if (band > 0 && hi - lo > 10 * band) { lo = p5 - band * 0.5; hi = p95 + band * 0.5; clipped = true; }
  }
  if (!(hi > lo)) { const d = Math.abs(lo) || 1; lo -= d; hi += d; }
  if (!clipped) { const pad = (hi - lo) * 0.04; lo -= pad; hi += pad; }
  return { lo, hi, clipped };
}

export function splitSegments(points: XY[], range: Range): Segment[] {
  const segs: Segment[] = [];
  let start = -1;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const ok = Number.isFinite(p.x) && Number.isFinite(p.y) && p.y >= range.lo && p.y <= range.hi;
    if (ok) { if (start < 0) start = i; }
    else if (start >= 0) { if (i - 1 > start) segs.push({ start, end: i - 1 }); start = -1; }
  }
  if (start >= 0 && points.length - 1 > start) segs.push({ start, end: points.length - 1 });
  return segs;
}

export function computeView(points: XY[], width: number, height: number): View {
  let xMin = Infinity, xMax = -Infinity;
  for (const p of points) if (Number.isFinite(p.x)) { if (p.x < xMin) xMin = p.x; if (p.x > xMax) xMax = p.x; }
  if (!Number.isFinite(xMin)) { xMin = -1; xMax = 1; }
  if (xMin === xMax) { xMin -= 1; xMax += 1; }
  const range = robustRange(points.map(p => p.y));
  const { lo, hi } = range;
  return {
    xMin, xMax, yLo: lo, yHi: hi, width, height,
    toX: (x) => ((x - xMin) / (xMax - xMin)) * width,
    toY: (y) => ((y - lo) / (hi - lo)) * height,
    xAxisY: Math.min(hi, Math.max(lo, 0)),
    yAxisX: Math.min(xMax, Math.max(xMin, 0)),
    xTicks: niceTicks(xMin, xMax, 8),
    yTicks: niceTicks(lo, hi, 6),
    segments: splitSegments(points, range),
    clipped: range.clipped,
  };
}
