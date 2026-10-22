import { describe, it, expect } from 'vitest';
import { niceTicks, formatTick, robustRange, computeView, splitSegments } from './plotMath';

const sample = (f: (x: number) => number, a: number, b: number, n = 800) =>
  Array.from({ length: n }, (_, i) => { const x = a + ((b - a) * i) / (n - 1); return { x, y: f(x) }; });

describe('niceTicks', () => {
  it('is exact on a symmetric range with negatives and contains 0', () => {
    expect(niceTicks(-6.28, 6.28, 8).ticks).toEqual([-6, -4, -2, 0, 2, 4, 6]);
  });
  it('handles a fully negative range', () => {
    const t = niceTicks(-1000, -200, 6).ticks;
    expect(t.every(v => v < 0)).toBe(true);
    expect(t).toContain(-1000);
  });
  it('handles wide ranges and tiny ranges', () => {
    expect(niceTicks(-1000, 3000, 5).ticks).toEqual([-1000, 0, 1000, 2000, 3000]);
    expect(niceTicks(-0.003, 0.002, 5).ticks).toContain(0);
  });
  it('never returns -0 and never explodes', () => {
    for (const t of niceTicks(-3, 3, 6).ticks) expect(Object.is(t, -0)).toBe(false);
    expect(niceTicks(5, 5).ticks.length).toBeGreaterThan(0);
    expect(niceTicks(NaN, 1).ticks).toEqual([]);
  });
});
describe('formatTick', () => {
  it('prints clean numbers', () => {
    expect(formatTick(0, 1)).toBe('0');
    expect(formatTick(-2, 2)).toBe('-2');
    expect(formatTick(0.5, 0.5)).toBe('0.5');
    expect(formatTick(-0.25, 0.05)).toBe('-0.25');
    expect(formatTick(2500000, 500000)).toBe('2.5e6');
  });
});
describe('computeView', () => {
  it('puts negative values BELOW the zero axis, by the same map as positives', () => {
    const v = computeView(sample(Math.sin, -6.28, 6.28), 8, 4);
    expect(v.toY(-1)).toBeLessThan(v.toY(0));
    expect(v.toY(0)).toBeLessThan(v.toY(1));
    expect(v.toY(0) - v.toY(-1)).toBeCloseTo(v.toY(1) - v.toY(0), 6);
    expect(v.xAxisY).toBe(0);
    expect(v.yTicks.ticks).toContain(0);
  });
  it('draws the axis at the bottom edge when 0 is out of range', () => {
    const v = computeView(sample(x => 5 + Math.sin(x), -3, 3), 8, 4);
    expect(v.xAxisY).toBe(v.yLo);
  });
  it('trims asymptotes (tan) instead of flattening everything, and splits segments', () => {
    const v = computeView(sample(Math.tan, -6.28, 6.28), 8, 4);
    expect(v.clipped).toBe(true);
    expect(v.yHi - v.yLo).toBeLessThan(200);
    expect(v.segments.length).toBeGreaterThan(2);
  });
  it('does NOT trim ordinary tall curves (x^3, exp, x^10)', () => {
    for (const f of [(x: number) => x ** 3, Math.exp, (x: number) => x ** 10]) {
      expect(computeView(sample(f, -3, 3), 8, 4).clipped).toBe(false);
    }
  });
  it('survives tall / wide / hostile input without NaN geometry', () => {
    for (const f of [(x: number) => x ** 3, (x: number) => Math.exp(x), (x: number) => 1 / x, (x: number) => Math.sin(x * x) * 1e6, () => 7, () => NaN]) {
      const v = computeView(sample(f, -10, 10), 8, 4);
      for (const p of [v.toX(v.xMin), v.toX(v.xMax), v.toY(v.yLo), v.toY(v.yHi)]) expect(Number.isFinite(p)).toBe(true);
    }
    expect(computeView([], 8, 4).segments).toEqual([]);
  });
  it('breaks segments at NaN / Infinity', () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: NaN }, { x: 3, y: 2 }, { x: 4, y: 3 }, { x: 5, y: Infinity }];
    expect(splitSegments(pts, { lo: -1, hi: 10, clipped: false })).toEqual([{ start: 0, end: 1 }, { start: 3, end: 4 }]);
  });
});
describe('robustRange', () => {
  it('keeps the true range for well-behaved data', () => {
    const r = robustRange(sample(Math.sin, 0, 6.28).map(p => p.y));
    expect(r.clipped).toBe(false);
    expect(r.lo).toBeLessThan(-1); expect(r.hi).toBeGreaterThan(1);
  });
});
