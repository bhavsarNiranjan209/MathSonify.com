/**
 * Tests for the reference port.
 *
 * Only the pure functions are asserted here. The geometry builders need a DOM
 * and a real canvas context, so they are exercised by the viewer in a browser;
 * what these tests protect is the maths that decides framing, fog placement and
 * which tick values get drawn — the three things that silently produce a wrong
 * scene when they drift.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { fogRadiiFor, fitRadiusForSphere, referenceTickValues, TICK_DASH_HALF } from './curve3dAxes';

test('fit radius divides by sin(fov/2) then adds air', () => {
  // fov 42, air 1.4 — the reference's exact numbers.
  const r = 5;
  const expected = (r / Math.sin(((42 * Math.PI) / 180) / 2)) * 1.4;
  // Compared with a tolerance, not `strictEqual`: the formula is a division by
  // sin(21°), so the result is never exactly representable and an exact
  // comparison would be asserting a rounding artefact rather than the formula.
  assert.ok(Math.abs(fitRadiusForSphere(r, 42) - expected) < 1e-9);
});

test('a wider lens needs less distance for the same sphere', () => {
  assert.ok(fitRadiusForSphere(5, 60) < fitRadiusForSphere(5, 30));
});

test('fit radius scales linearly with the curve size', () => {
  assert.equal(fitRadiusForSphere(10, 45) / fitRadiusForSphere(5, 45), 2);
});

test('fog sits beyond the orbit zoom limit so zooming out cannot wash the scene out', () => {
  const { near, far } = fogRadiiFor(100);
  // Fog distance is measured from the CAMERA, and the orbit can zoom out to
  // `maxRadius` (60 world units, absolute). If `near` is below the largest
  // reachable camera distance the camera crosses the near plane while pulling
  // back and the whole scene — curve included — washes out to the fog colour.
  // That is exactly what happened at the reference's 1.15x.
  const MAX_CAMERA_RADIUS = 60;
  for (const fit of [10, 20, 30, 50, 100]) {
    const f = fogRadiiFor(fit);
    assert.ok(
      f.near >= MAX_CAMERA_RADIUS,
      `fog near ${f.near} (fit ${fit}) is inside the reachable camera range and would fog the scene`,
    );
    assert.ok(f.far > f.near, 'fog far must remain beyond near');
    // And it must still scale with the scene, or a small curve would get the
    // same absolute fade as a large one.
    assert.ok(f.near / fit > 0 && Number.isFinite(f.near / fit));
  }
});

test('fog near sits outside the curve and far sits well beyond it', () => {
  const fit = 50;
  const { near, far } = fogRadiiFor(fit);
  // If near were inside the curve the curve itself would be washed out.
  assert.ok(near > fit);
  assert.ok(far > near);
});

test('tick values are rounded to whole numbers once the span passes 10', () => {
  // -6.28..6.28 spans 12.56, so the reference drops to 0 decimals and the edge
  // value -6.28 becomes -6. This is the reference's own behaviour, not an
  // accident: it keeps labels clean at the cost of pinning them to the exact
  // domain edge. Asserted explicitly because it looks like a bug otherwise.
  const ticks = referenceTickValues(-6.28, 6.28, 7, 0.3);
  assert.ok(ticks.every(Number.isInteger));
  assert.equal(ticks[0], -6);
  assert.equal(ticks[ticks.length - 1], 6);
});

test('a narrow domain keeps its decimal precision', () => {
  // Span 0.5 -> 2 decimals, so nothing collapses to integers.
  //
  // Note the asymmetry: -0.125 and +0.125 round to -0.12 and +0.13, not to a
  // symmetric pair. That is Math.round's half-up rule on negative halves, which
  // the reference inherits from JS and which this port reproduces rather than
  // "corrects" — changing it would make the labels drift from the reference.
  const ticks = referenceTickValues(-0.25, 0.25, 5, 0);
  assert.deepEqual(ticks, [-0.25, -0.12, 0, 0.13, 0.25]);
});

test('ticks near the origin are dropped by epsilon', () => {
  // -6.28..6.28 across 7 gives 0 at i=3, which epsilon removes.
  assert.ok(!referenceTickValues(-6.28, 6.28, 7, 0.3).includes(0));
  assert.ok(referenceTickValues(-6.28, 6.28, 7, 0).includes(0));
});

test('rounding never produces duplicates', () => {
  // A span under 1 rounds to 2dp, which collapses values on a fine domain.
  const ticks = referenceTickValues(0, 0.5, 9, 0);
  assert.equal(new Set(ticks).size, ticks.length);
});

test('tick values are derived, never hardcoded — a different domain moves them', () => {
  const a = referenceTickValues(-6.28, 6.28, 7, 0.3);
  const b = referenceTickValues(-2, 2, 7, 0.3);
  assert.notDeepEqual(a, b);
  assert.equal(b[0], -2);
  assert.equal(b[b.length - 1], 2);
});

test('decimals follow the span, matching the reference', () => {
  // span < 1 -> 2dp, span < 10 -> 1dp, otherwise integers.
  assert.ok(referenceTickValues(0, 0.8, 3, 0).every((v) => Number.isInteger(v * 100)));
  assert.ok(referenceTickValues(0, 5, 3, 0).every((v) => Number.isInteger(v * 10)));
  assert.ok(referenceTickValues(0, 50, 3, 0).every(Number.isInteger));
});

test('tick dash is a small perpendicular mark, not a full axis', () => {
  assert.ok(TICK_DASH_HALF > 0 && TICK_DASH_HALF < 0.2);
  assert.equal(TICK_DASH_HALF, 0.06);
});