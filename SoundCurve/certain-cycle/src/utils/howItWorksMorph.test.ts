/**
 * Tests for the How It Works curve morph.
 *
 * The behaviour that matters: the morph must change the curve's SHAPE without
 * ever lying about its amplitude. A naive raw-y lerp between `sin(x)` and `x^2`
 * drags the curve through the floor, which reads as "the curve collapsed" — the
 * whole failure this module exists to prevent.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEquation, type SamplePoint } from './equationParser';
import { DEMO_MIN_X, DEMO_MAX_X, DEMO_SAMPLES } from './howItWorksMath';
import { easeInOutCubic, morphProgress, morphY, toMorphCurve } from './howItWorksMorph';

/** Sample through the real parser, on the same grid the demo uses. */
function curve(equation: string): SamplePoint[] {
  const res = parseEquation(equation);
  assert.ok(res.success && res.sample, `${equation} should parse`);
  return res.sample(DEMO_MIN_X, DEMO_MAX_X, DEMO_SAMPLES);
}

/* ── normalisation ───────────────────────────────────────────────── */

test('a curve normalises to [-1, 1] across its own range', () => {
  const c = toMorphCurve(curve('x^2'));
  const values = Array.from(c.normalized);
  assert.ok(Math.min(...values) >= -1 - 1e-6 && Math.max(...values) <= 1 + 1e-6);
  // x^2 over [-6,6] bottoms at 0 (the vertex) and tops at 36.
  assert.ok(Math.abs(Math.min(...values) - -1) < 1e-5, 'the vertex maps to -1');
  assert.ok(Math.abs(Math.max(...values) - 1) < 1e-5, 'the highest point maps to +1');
});

test('a flat curve normalises to zeros instead of dividing by zero', () => {
  const c = toMorphCurve(curve('5'));
  assert.ok(Array.from(c.normalized).every((v) => v === 0));
  assert.ok(Number.isFinite(c.minY) && Number.isFinite(c.maxY));
});

test('an empty curve does not throw', () => {
  const c = toMorphCurve([]);
  assert.equal(c.normalized.length, 0);
  assert.ok(Number.isFinite(c.minY));
});

/* ── easing ──────────────────────────────────────────────────────── */

test('easing is symmetric, clamped, and settles without bouncing', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(Math.abs(easeInOutCubic(-5) - 0) < 1e-9, 'clamped below');
  assert.ok(Math.abs(easeInOutCubic(5) - 1) < 1e-9, 'clamped above');
  assert.ok(easeInOutCubic(0.5) > 0.49 && easeInOutCubic(0.5) < 0.51, 'symmetric at the midpoint');
  // Monotonic: a morph must never overshoot and spring back.
  let prev = -Infinity;
  for (let i = 0; i <= 20; i++) {
    const v = easeInOutCubic(i / 20);
    assert.ok(v >= prev, 'easing must be monotonic — no bounce');
    prev = v;
  }
});

test('morphProgress is 0 at the start and 1 once elapsed', () => {
  assert.equal(morphProgress(0, 500), 0);
  assert.equal(morphProgress(250, 500), 0.5);
  assert.equal(morphProgress(900, 500), 1, 'completes and holds');
  assert.equal(morphProgress(-10, 500), 0);
});

/* ── the morph itself ────────────────────────────────────────────── */

test('a morph between two point-aligned curves starts and ends exactly', () => {
  const from = toMorphCurve(curve('sin(x)'));
  const to = toMorphCurve(curve('cos(x)'));
  assert.equal(from.normalized.length, to.normalized.length, 'both share the demo grid');

  const start = morphY(from, to, 0);
  const end = morphY(from, to, 1);
  const cosPoints = curve('cos(x)').map((p) => p.y);
  for (let i = 0; i < end.length; i++) {
    assert.ok(Math.abs(end[i] - cosPoints[i]) < 1e-4, `at progress 1 the curve must BE the target`);
    assert.ok(Number.isFinite(start[i]));
  }
  assert.notDeepEqual(start, end, 'the two curves really are different');
});

test('the morph never dives through zero — amplitude is not faked', () => {
  // sin(x) spans [-1,1]; x^2 spans [0,36]. A raw-y lerp would pass through ~0
  // halfway and read as the curve collapsing. In normalised space the shape
  // changes while the drawn range always belongs to the target.
  const from = toMorphCurve(curve('sin(x)'));
  const to = toMorphCurve(curve('x^2'));
  const target = curve('x^2');
  const lo = Math.min(...target.map((p) => p.y));
  const hi = Math.max(...target.map((p) => p.y));

  for (const t of [0.25, 0.5, 0.75]) {
    const ys = morphY(from, to, t);
    for (const y of ys) {
      assert.ok(y >= lo - 1e-4 && y <= hi + 1e-4, `y=${y} escaped the target range at t=${t}`);
    }
  }
});

test('every frame of the morph is finite and correctly sized', () => {
  const from = toMorphCurve(curve('sin(x)'));
  const to = toMorphCurve(curve('sin(x)*cos(2*x)'));
  const n = from.normalized.length;
  for (let i = 0; i <= 10; i++) {
    const ys = morphY(from, to, i / 10);
    assert.equal(ys.length, n);
    assert.ok(ys.every(Number.isFinite), `non-finite value at t=${i / 10}`);
  }
});

test('reduced motion skips the morph entirely', () => {
  const from = toMorphCurve(curve('sin(x)'));
  const to = toMorphCurve(curve('cos(x)'));
  const jumped = morphY(from, to, 0, { reducedMotion: true });
  const target = curve('cos(x)').map((p) => p.y);
  assert.ok(jumped.every((y, i) => Math.abs(y - target[i]) < 1e-4),
    'with reduced motion the new curve is shown at once, not tweened');
});

test('mismatched lengths are handled rather than crashing', () => {
  const full = toMorphCurve(curve('sin(x)'));
  const short = toMorphCurve(curve('sin(x)').slice(0, 10));
  const ys = morphY(full, short, 0.5);
  assert.equal(ys.length, Math.min(full.normalized.length, short.normalized.length));
  assert.ok(ys.every(Number.isFinite));
});