import test from 'node:test';
import assert from 'node:assert/strict';

import { niceTicks, formatTick, robustRange, computeView, splitSegments } from './plotMath';

const sample = (f: (x: number) => number, a: number, b: number, n = 800) =>
  Array.from({ length: n }, (_, i) => { const x = a + ((b - a) * i) / (n - 1); return { x, y: f(x) }; });

test('niceTicks is exact on a symmetric range with negatives and contains 0', () => {
  assert.deepEqual(niceTicks(-6.28, 6.28, 8).ticks, [-6, -4, -2, 0, 2, 4, 6]);
});

test('niceTicks handles a fully negative range', () => {
  const t = niceTicks(-1000, -200, 6).ticks;
  assert.ok(t.every((v) => v < 0));
  assert.ok(t.includes(-1000));
});

test('niceTicks handles wide ranges and tiny ranges', () => {
  assert.deepEqual(niceTicks(-1000, 3000, 5).ticks, [-1000, 0, 1000, 2000, 3000]);
  assert.ok(niceTicks(-0.003, 0.002, 5).ticks.includes(0));
});

test('niceTicks never returns -0 and never explodes', () => {
  for (const t of niceTicks(-3, 3, 6).ticks) assert.equal(Object.is(t, -0), false);
  assert.ok(niceTicks(5, 5).ticks.length > 0);
  assert.deepEqual(niceTicks(NaN, 1).ticks, []);
});

test('formatTick prints clean numbers', () => {
  assert.equal(formatTick(0, 1), '0');
  assert.equal(formatTick(-2, 2), '-2');
  assert.equal(formatTick(0.5, 0.5), '0.5');
  assert.equal(formatTick(-0.25, 0.05), '-0.25');
  assert.equal(formatTick(2500000, 500000), '2.5e6');
});

test('computeView puts negative values BELOW the zero axis, by the same map as positives', () => {
  const v = computeView(sample(Math.sin, -6.28, 6.28), 8, 4);
  assert.ok(v.toY(-1) < v.toY(0));
  assert.ok(v.toY(0) < v.toY(1));
  assert.ok(Math.abs((v.toY(0) - v.toY(-1)) - (v.toY(1) - v.toY(0))) < 1e-6);
  assert.equal(v.xAxisY, 0);
  assert.ok(v.yTicks.ticks.includes(0));
});

test('computeView draws the axis at the bottom edge when 0 is out of range', () => {
  const v = computeView(sample((x) => 5 + Math.sin(x), -3, 3), 8, 4);
  assert.equal(v.xAxisY, v.yLo);
});

test('computeView trims asymptotes (tan) instead of flattening everything, and splits segments', () => {
  const v = computeView(sample(Math.tan, -6.28, 6.28), 8, 4);
  assert.equal(v.clipped, true);
  assert.ok(v.yHi - v.yLo < 200);
  assert.ok(v.segments.length > 2);
});

test('computeView does NOT trim ordinary tall curves (x^3, exp, x^10)', () => {
  for (const f of [(x: number) => x ** 3, Math.exp, (x: number) => x ** 10]) {
    assert.equal(computeView(sample(f, -3, 3), 8, 4).clipped, false);
  }
});

test('computeView survives tall / wide / hostile input without NaN geometry', () => {
  for (const f of [(x: number) => x ** 3, (x: number) => Math.exp(x), (x: number) => 1 / x, (x: number) => Math.sin(x * x) * 1e6, () => 7, () => NaN]) {
    const v = computeView(sample(f, -10, 10), 8, 4);
    for (const p of [v.toX(v.xMin), v.toX(v.xMax), v.toY(v.yLo), v.toY(v.yHi)]) assert.equal(Number.isFinite(p), true);
  }
  assert.deepEqual(computeView([], 8, 4).segments, []);
});

test('splitSegments breaks segments at NaN / Infinity', () => {
  const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: NaN }, { x: 3, y: 2 }, { x: 4, y: 3 }, { x: 5, y: Infinity }];
  assert.deepEqual(splitSegments(pts, { lo: -1, hi: 10, clipped: false }), [{ start: 0, end: 1 }, { start: 3, end: 4 }]);
});

test('robustRange keeps the true range for well-behaved data', () => {
  const r = robustRange(sample(Math.sin, 0, 6.28).map((p) => p.y));
  assert.equal(r.clipped, false);
  assert.ok(r.lo < -1);
  assert.ok(r.hi > 1);
});
