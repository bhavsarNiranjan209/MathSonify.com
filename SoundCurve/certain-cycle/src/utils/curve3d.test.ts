/**
 * Tests for the 3D viewer's pure maths — curve layout and orbit controls.
 *
 * This is the only part of the WebGL viewer that can be verified without a
 * browser, so it carries the weight: if the tube centreline is wrong, or zoom
 * does not clamp, or the camera flips over the pole, it shows up here rather
 * than as an unusable viewer nobody can debug.
 *
 * Nothing here touches WebGL — three's Vector3 and CatmullRomCurve3 are plain
 * maths; the renderer and lights live in the component.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { CatmullRomCurve3, Vector3 } from 'three';
import {
  AXIS_COLORS,
  buildAxes,
  buildBoundingBox,
  buildCurveRibbon,
  buildCurveTube,
  layoutCurve,
  usablePoints,
  framingRadius,
  headIndexForProgress,
  headPosition,
  niceStep,
  niceTicks,
  tickLabel,
} from './curve3d';
import {
  applyOrbit,
  applyPan,
  applyPinch,
  applyZoom,
  clamp,
  dampOrbit,
  orbitBasis,
  orbitPosition,
  DEFAULT_LIMITS,
  type OrbitState,
} from './orbitCamera';
import { parseEquation } from './equationParser';

// ── the tube and the bounding box ─────────────────────────────────────────────

test('buildCurveTube carries positionAlong from 0 to 1 across its length', () => {
  const layout = layoutCurve(sample('sin(x)', -3, 3, 40));
  const geometry = buildCurveTube(layout.centerline, 8, 4, 0.05);
  const along = geometry.getAttribute('positionAlong');
  assert.equal(along.count, (8 + 1) * (4 + 1));
  assert.equal(along.getX(0), 0);
  assert.equal(along.getX(along.count - 1), 1);
});

test('buildCurveTube honours the radius and segment counts it is given', () => {
  const layout = layoutCurve(sample('sin(x)', -3, 3, 40));
  const geometry = buildCurveTube(layout.centerline, 16, 8, 0.25);
  assert.equal(geometry.parameters?.radius, 0.25);
  assert.equal(geometry.parameters?.tubularSegments, 16);
  assert.equal(geometry.parameters?.radialSegments, 8);
});

test('dataBounds carries equation units, so 3D ticks match the 2D graph', () => {
  // The layout centres and lifts the curve, so world Y for a curve running
  // -1..+1 lands around 1.4..3.4. Reading tick labels off the world bounds made
  // the 3D view print only positive numbers while the 2D graph beside it printed
  // -1, 0 and +1. `dataBounds` is the fix, and it must stay in the units the
  // user typed.
  const layout = layoutCurve(sample('sin(x)', -Math.PI, Math.PI));

  assert.ok(layout.dataBounds.minY < 0, 'a sine curve must report a negative minimum');
  assert.ok(layout.dataBounds.maxY > 0, 'a sine curve must report a positive maximum');
  assert.ok(Math.abs(layout.dataBounds.minY + 1) < 0.05, 'minY should be about -1');
  assert.ok(Math.abs(layout.dataBounds.maxY - 1) < 0.05, 'maxY should be about +1');

  // And it must NOT be the world bounds, which is the bug in a different guise.
  assert.notEqual(layout.dataBounds.minY, layout.bounds.minY);
  assert.notEqual(layout.dataBounds.maxY, layout.bounds.maxY);

  // The world bounds stay where the geometry actually is: lifted, not negative.
  assert.ok(layout.bounds.minY > 0, 'world bounds are lifted above the origin');
});

test('dataBounds covers the whole x domain regardless of the world transform', () => {
  const layout = layoutCurve(sample('5*x', -2, 2));
  assert.equal(layout.dataBounds.minX, -2);
  assert.equal(layout.dataBounds.maxX, 2);
  // World x is recentred on zero, so it must differ from the raw domain.
  assert.notEqual(layout.dataBounds.maxX, layout.bounds.maxX);
});

test('buildBoundingBox draws exactly the twelve edges of a box', () => {
  const layout = layoutCurve(sample('sin(x)', -3, 3, 40));
  const geometry = buildBoundingBox(layout, '#ffffff');
  // Twelve edges, two vertices each.
  assert.equal(geometry.getAttribute('position').count, 24);
});

test('buildBoundingBox encloses the curve on every side, with depth', () => {
  const layout = layoutCurve(sample('sin(x)', -3, 3, 40));
  const position = buildBoundingBox(layout, '#ffffff').getAttribute('position');
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < position.count; i++) {
    xs.push(position.getX(i));
    ys.push(position.getY(i));
    zs.push(position.getZ(i));
  }
  // Outside the curve's own bounds in x and y.
  assert.ok(Math.min(...xs) < layout.bounds.minX);
  assert.ok(Math.max(...xs) > layout.bounds.maxX);
  assert.ok(Math.max(...ys) > layout.bounds.maxY);
  // Sits ON the floor plane, so the shadow has a surface to land on.
  assert.ok(Math.abs(Math.min(...ys) - layout.floorY) < 1e-5);
  // Real depth on both sides of z = 0, where the curve lies.
  assert.ok(Math.min(...zs) < 0);
  assert.ok(Math.max(...zs) > 0);
});

// ── damped orbit ──────────────────────────────────────────────────────────────

test('dampOrbit eases toward the target without overshooting', () => {
  const from = state({ theta: 0, radius: 20 });
  const to = state({ theta: 1, radius: 40 });
  const eased = dampOrbit(from, to, 0.14);
  // Close to the target, but clearly not there: the whole point of damping.
  assert.ok(eased.theta > 0 && eased.theta < 1);
  assert.ok(eased.radius > 20 && eased.radius < 40);
});

test('dampOrbit converges on the target over many frames', () => {
  let current = state({ theta: 0, radius: 20 });
  const target = state({ theta: 0.8, radius: 35 });
  for (let i = 0; i < 400; i++) current = dampOrbit(current, target, 0.14);
  assert.ok(Math.abs(current.theta - 0.8) < 1e-6);
  assert.ok(Math.abs(current.radius - 35) < 1e-4);
});

test('dampOrbit always takes the short way round the circle', () => {
  // Current is just below +pi; the target is just above -pi, i.e. a hair away
  // going forwards. Interpolating the raw numbers would spin almost a full turn.
  const from = state({ theta: Math.PI - 0.01 });
  const to = state({ theta: -Math.PI + 0.01 });
  const eased = dampOrbit(from, to, 0.5);

  // Compared as an ANGLE, not as raw numbers: crossing the wrap point makes the
  // two raw values far apart while being, in fact, a hair apart on the circle.
  const angularGap = Math.abs(((eased.theta - to.theta + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  assert.ok(angularGap < 0.02, `expected a small angular step, got ${angularGap}`);

  // And it moved exactly half of the 0.02 gap, not half of the ~6.28 long way.
  assert.ok(Math.abs(angularGap - 0.01) < 1e-9);
});

test('dampOrbit clamps an out-of-range factor instead of overshooting or stalling', () => {
  const from = state({ theta: 0, radius: 20 });
  const to = state({ theta: 1, radius: 40 });
  const overshoot = dampOrbit(from, to, 5);
  assert.ok(Math.abs(overshoot.theta - 1) < 1e-9);
  const stalled = dampOrbit(from, to, -1);
  assert.ok(Math.abs(stalled.theta - from.theta) < 1e-9);
});

test('dampOrbit eases the pan target too, not just the angles', () => {
  const from = state({ target: { x: 0, y: 0, z: 0 } });
  const to = state({ target: { x: 10, y: -4, z: 2 } });
  const eased = dampOrbit(from, to, 0.25);
  assert.equal(eased.target.x, 2.5);
  assert.equal(eased.target.y, -1);
  assert.equal(eased.target.z, 0.5);
});

const sample = (equation: string, minX: number, maxX: number, n = 600) => {
  const res = parseEquation(equation);
  assert.ok(res.success, `"${equation}" should parse: ${res.error}`);
  return res.sample!(minX, maxX, n);
};

const state = (over: Partial<OrbitState> = {}): OrbitState => ({
  theta: 0,
  phi: Math.PI / 3,
  radius: 20,
  target: { x: 0, y: 0, z: 0 },
  ...over,
});

/* ── curve layout ────────────────────────────────────────────────── */

test('the centreline is built from the same points the 2D view samples', () => {
  // Same equation, same domain, same sampler as the 2D visualizer.
  const points = sample('sin(x)', -Math.PI * 2, Math.PI * 2);
  const layout = layoutCurve(points, { maxPoints: 10_000 });
  assert.equal(layout.pointCount, points.filter((p) => p.isValid).length);
  assert.equal(layout.centerline.length, layout.pointCount);

  // Every laid-out point is on the z = 0 plane: this is a 3D view *of* a 2D
  // curve, not an invented surface with a fabricated third dimension.
  assert.ok(layout.centerline.every((v) => v.z === 0));
});

test('invalid sample points are dropped, and too few points throws', () => {
  const sparse = [
    { x: 0, y: 0, dy: 0, curvature: 0, isValid: true },
    { x: 1, y: 1, dy: 0, curvature: 0, isValid: false },
    { x: 2, y: 2, dy: 0, curvature: 0, isValid: true },
  ];
  assert.equal(usablePoints(sparse).length, 2);
  assert.throws(() => layoutCurve([sparse[0]]), /at least 2 valid points/);
});

test('decimation caps the point count but keeps both ends', () => {
  const points = sample('sin(x)', -10, 10, 800);
  const valid = points.filter((p) => p.isValid);
  const capped = usablePoints(points, 64);
  assert.ok(capped.length <= 64, `expected <= 64 points, got ${capped.length}`);
  assert.ok(capped.length > 2);
  assert.equal(capped[0].x, valid[0].x, 'keeps the first point');
  assert.equal(capped[capped.length - 1].x, valid[valid.length - 1].x, 'keeps the last');
});

test('layout scales x and y by the same factor, so aspect is never distorted', () => {
  // A curve twice as tall as wide must stay twice as tall after layout.
  const wide = sample('0.5*x', -10, 10);   // spans 10 wide, 5 tall
  const tall = sample('5*x', -2.5, 2.5);    // spans 5 wide, 25 tall
  const aspect = (pts: typeof wide) => {
    const l = layoutCurve(pts, { width: 10 });
    return (l.bounds.maxY - l.bounds.minY) / (l.bounds.maxX - l.bounds.minX);
  };
  assert.ok(Math.abs(aspect(wide) - 0.5) < 1e-6);
  assert.ok(Math.abs(aspect(tall) - 5) < 1e-6);
});

test('the curve is centred on x and always floats above the floor', () => {
  const layout = layoutCurve(sample('x^2 - 4*x', -3, 9));
  const midX = (layout.bounds.minX + layout.bounds.maxX) / 2;
  assert.ok(Math.abs(midX) < 1e-6, `curve should be centred on x, got ${midX}`);
  // The shadow needs room, so no part of the tube may touch the grid.
  assert.ok(layout.bounds.minY > layout.floorY, 'curve must sit above the floor');
  const gap = layout.bounds.minY - layout.floorY;
  assert.ok(gap > 0 && gap < 6, `floor gap should be small and positive, got ${gap}`);
});

test('target width is honoured, whatever the source domain', () => {
  const cases = [['sin(x)', -6.28, 6.28], ['x^3', -10, 10], ['1/x', 0.1, 4]] as const;
  for (const [eq, lo, hi] of cases) {
    const layout = layoutCurve(sample(eq, lo, hi));
    const w = layout.bounds.maxX - layout.bounds.minX;
    assert.ok(Math.abs(w - 12) < 1e-6, `${eq}: expected width 12, got ${w}`);
  }
});
test('the centreline is a well-formed spline with no NaNs', () => {
  // TubeGeometry takes a Curve; if the control points contain NaN the tube
  // silently disappears rather than erroring, so this guards a real failure.
  const layout = layoutCurve(sample('sqrt(9 - x^2)*sin(16*x)', -3, 3));
  assert.ok(layout.centerline.every((v) =>
    Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)));
  const curve = new CatmullRomCurve3(layout.centerline, false, 'centripetal');
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    const p = curve.getPoint(t);
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), `NaN at t=${t}`);
  }
  assert.ok(curve.getPoint(0).distanceTo(layout.centerline[0]) < 1e-6);
});

test('a flat equation still produces a usable, non-degenerate layout', () => {
  // y = 5 has zero y-span. The `|| 1` guard in layoutCurve deliberately
  // substitutes a 1-unit height rather than dividing by zero, so the camera
  // still gets a box to frame instead of a zero-height one.
  const layout = layoutCurve(sample('5', -3, 3));
  assert.ok(Number.isFinite(layout.scale));
  assert.ok(Number.isFinite(layout.floorY));

  const height = layout.bounds.maxY - layout.bounds.minY;
  assert.ok(height > 0, `flat curve must still get a non-zero height, got ${height}`);
  assert.ok(layout.bounds.minY > layout.floorY, 'and must still float above the floor');
  // x is unaffected: the domain is still honoured.
  assert.ok(Math.abs(layout.bounds.maxX - layout.bounds.minX - 12) < 1e-6);
});

test('framingRadius grows with the curve and is never degenerate', () => {
  // Fitted against the viewport, so the aspect ratio is part of the contract.
  const flat = framingRadius(layoutCurve(sample('sin(x)', -Math.PI, Math.PI)), 16 / 9, 40);
  const tall = framingRadius(layoutCurve(sample('5*x', -1, 1)), 16 / 9, 40);
  assert.ok(tall > flat, `a tall curve needs a further camera (${tall} vs ${flat})`);
  assert.ok(flat > 0, 'the fitted distance must be positive');
});

test('framingRadius fits the curve to the viewport instead of leaving it tiny', () => {
  // The "tiny graph in a huge empty panel" bug. Framing must be FITTED to the
  // camera's actual field of view, not derived from world size with a fixed
  // multiplier — and the margin on top of the fit must stay tight.
  const layout = layoutCurve(sample('sin(x)', -Math.PI, Math.PI));
  const halfW = (layout.bounds.maxX - layout.bounds.minX) / 2;
  const halfH = (layout.bounds.maxY - layout.bounds.minY) / 2;
  const vFov = (40 * Math.PI) / 180;

  const fitted = (aspect: number) => {
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const fit = Math.min(halfH / Math.tan(vFov / 2), halfW / Math.tan(hFov / 2));
    return { got: framingRadius(layout, aspect, 40), fit };
  };

  // The old implementation returned hypot(w, h) * 0.75 * 1.22. Compare against
  // the true geometric fit: the camera must sit close to it, not well beyond.
  // Anything over ~1.2x leaves the curve visibly adrift in the frame.
  for (const aspect of [21 / 9, 16 / 9, 4 / 3, 1]) {
    const { got, fit } = fitted(aspect);
    assert.ok(got > 0, `aspect ${aspect}: distance must be positive`);
    assert.ok(
      got / fit < 1.2,
      `aspect ${aspect}: framing leaves ${(got / fit).toFixed(2)}x too much air`,
    );
  }

  // And a genuinely wide curve in a wide viewport must come closer than the same
  // curve in a square one: the horizontal field of view widens with the aspect,
  // so there is more room and the camera can come in nearer.
  const wide = layoutCurve(sample('2*x', -10, 10));
  const forWide = (aspect: number) => {
    const w = (wide.bounds.maxX - wide.bounds.minX) / 2;
    const h = (wide.bounds.maxY - wide.bounds.minY) / 2;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    return Math.min(h / Math.tan(vFov / 2), w / Math.tan(hFov / 2)) * 1.06;
  };
  assert.ok(
    forWide(21 / 9) < forWide(1),
    'a wide curve in a wide viewport should be framed from closer',
  );
});

/* ── orbit / zoom / pan ──────────────────────────────────────────── */

test('orbitPosition places the camera on the sphere around the target', () => {
  const s = state({ theta: 0.7, phi: 1.1, radius: 15, target: { x: 1, y: 2, z: 3 } });
  const p = orbitPosition(s);
  const d = Math.hypot(p.x - 1, p.y - 2, p.z - 3);
  assert.ok(Math.abs(d - 15) < 1e-9, `camera must stay at radius 15, got ${d}`);
});

test('a full 360 degree drag orbits all the way round', () => {
  let s = state();
  const startTheta = s.theta;
  // 600px of horizontal drag is documented as a full turn.
  s = applyOrbit(s, -600, 0);
  assert.ok(Math.abs(s.theta - startTheta - Math.PI * 2) < 1e-9);
  // And the camera is back where it started — a genuine 360, not a clamp.
  const a = orbitPosition(state());
  const b = orbitPosition(s);
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 1e-6);
});

test('phi is clamped short of both poles so the camera never flips', () => {
  const { epsilon } = DEFAULT_LIMITS;
  let s = state({ phi: Math.PI / 2 });
  s = applyOrbit(s, 0, 100_000);   // drag straight up, far past the pole
  // The clamp is inclusive: resting exactly on the limit is the contract.
  assert.ok(s.phi >= epsilon, `must not pass the top pole, got ${s.phi}`);
  assert.ok(s.phi <= Math.PI - epsilon);
  s = applyOrbit(s, 0, -200_000);
  assert.ok(s.phi >= epsilon, `must not pass the bottom pole, got ${s.phi}`);
  assert.ok(s.phi <= Math.PI - epsilon);
});

test('zoom is clamped at both ends and is multiplicative', () => {
  let s = state({ radius: 20 });
  for (let i = 0; i < 50; i++) s = applyZoom(s, 500);    // wheel down forever
  assert.equal(s.radius, DEFAULT_LIMITS.maxRadius);
  for (let i = 0; i < 100; i++) s = applyZoom(s, -500);  // wheel up forever
  assert.equal(s.radius, DEFAULT_LIMITS.minRadius);
  // Doubling the distance doubles the ratio, so the step feels the same far away.
  const a = applyZoom(state({ radius: 10 }), 100).radius;
  const b = applyZoom(state({ radius: 20 }), 100).radius;
  assert.ok(Math.abs(b / a - 2) < 1e-9, 'zoom must scale with distance');
});

test('pinch out moves the camera in, and ignores nonsense', () => {
  const s = state({ radius: 20 });
  assert.ok(applyPinch(s, 2).radius < s.radius, 'fingers apart -> camera in');
  assert.ok(applyPinch(s, 0.5).radius > s.radius, 'fingers together -> camera out');
  assert.equal(applyPinch(s, 0).radius, s.radius, 'zero scale ignored, not a divide-by-zero');
  assert.equal(applyPinch(s, NaN).radius, s.radius);
  assert.equal(applyPinch(s, -1).radius, s.radius);
  let z = s;
  for (let i = 0; i < 40; i++) z = applyPinch(z, 4);
  assert.equal(z.radius, DEFAULT_LIMITS.minRadius);
});

test('pan moves the target along the camera basis, not world axes', () => {
  const s = state();
  const { right, up } = orbitBasis(s);
  const panned = applyPan(s, 50, 0, right, up);
  // Dragging right pushes the scene right, i.e. the target moves left.
  assert.ok(panned.target.x < s.target.x, 'target should move opposite the drag');
  assert.notDeepEqual(orbitPosition(s), orbitPosition(panned));
  const twice = applyPan(panned, 50, 0, right, up);
  const step = Math.hypot(panned.target.x - twice.target.x, panned.target.y - twice.target.y, panned.target.z - twice.target.z);
  const single = Math.hypot(panned.target.x - s.target.x, panned.target.y - s.target.y, panned.target.z - s.target.z);
  assert.ok(Math.abs(step - single) < 1e-9);
});

test('the orbit basis stays orthonormal, including looking straight down', () => {
  for (const phi of [0.2, Math.PI / 2, 2.9]) {
    const { right, up } = orbitBasis(state({ phi }));
    assert.ok(Math.abs(Math.hypot(right.x, right.y, right.z) - 1) < 1e-6, 'right must be unit length');
    assert.ok(Math.abs(Math.hypot(up.x, up.y, up.z) - 1) < 1e-6, 'up must be unit length');
    const dot = right.x * up.x + right.y * up.y + right.z * up.z;
    assert.ok(Math.abs(dot) < 1e-6, `right and up must be perpendicular (dot=${dot})`);
  }
  // Straight down is the degenerate case that historically produces NaN.
  const down = orbitBasis(state({ phi: 0.001 }));
  assert.ok(Number.isFinite(down.right.x) && Number.isFinite(down.up.y));
});

test('orbit and zoom never mutate the state they are given', () => {
  const s = state();
  const snapshot = JSON.stringify(s);
  applyOrbit(s, 30, 30);
  applyZoom(s, -200);
  applyPan(s, 10, 10, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
  assert.equal(JSON.stringify(s), snapshot);
});

test('clamp is the plain helper the camera maths relies on', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
});
/* ── labelled axes + playback-synced playhead ─────────────────────── */

/** Samples an equation the way every caller does. */
function samples(equation: string, minX = -6, maxX = 6) {
  const parsed = parseEquation(equation);
  assert.ok(parsed.success && parsed.sample, `"${equation}" should parse`);
  return parsed.sample!(minX, maxX, 400);
}

test('the curve is laid out on the z = 0 plane', () => {
  // The honesty property the axes exist to make visible: no fabricated depth.
  const layout = layoutCurve(samples('sin(x)'));
  assert.ok(layout.centerline.length > 0);
  for (const p of layout.centerline) {
    assert.equal(p.z, 0, 'every curve point must lie exactly on z = 0');
  }
});

test('all three axes exist and are visibly long', () => {
  // A zero-length axis is invisible, which would defeat the purpose of labelling.
  const layout = layoutCurve(samples('sin(x)'));
  const axes = buildAxes(layout);

  const span = (a: { start: Vector3; end: Vector3 }, axis: 'x' | 'y' | 'z') =>
    Math.abs(a.end[axis] - a.start[axis]);

  assert.ok(span(axes.x, 'x') > 1, 'the X axis must have length');
  assert.ok(span(axes.y, 'y') > 1, 'the Y axis must have length');
  assert.ok(span(axes.z, 'z') > 1, 'the Z axis must be visible despite there being no depth data');

  // The Z axis must straddle the plane the curve lies on.
  assert.equal((axes.z.start.z + axes.z.end.z) / 2, 0, 'the Z axis must straddle z = 0');
});

test('the z axis is present on a curve that uses the whole domain', () => {
  // Guards the specific failure the brief calls out: a viewer that looks 2D
  // because the third axis was never drawn.
  const layout = layoutCurve(samples('sin(x)', -12, 12));
  const axes = buildAxes(layout);
  assert.notEqual(axes.z.start.z, axes.z.end.z);
  assert.ok(Math.abs(axes.z.end.z) >= 1);
});

test('each axis is a different colour', () => {
  const colors = Object.values(AXIS_COLORS);
  assert.equal(new Set(colors).size, 3, 'axis colours must be mutually distinct');
});

test('axis labels sit at the end of their own axis', () => {
  const layout = layoutCurve(samples('sin(x)'));
  const axes = buildAxes(layout);
  assert.equal(axes.labelX.x, axes.x.end.x);
  assert.equal(axes.labelY.y, axes.y.end.y);
  assert.equal(axes.labelZ.z, axes.z.end.z);
});

test('axes stay finite for an extreme curve', () => {
  const axes = buildAxes(layoutCurve(samples('x^8', -3, 3)));
  for (const label of [axes.labelX, axes.labelY, axes.labelZ]) {
    assert.ok(Number.isFinite(label.x) && Number.isFinite(label.y) && Number.isFinite(label.z));
  }
});

test('the playhead maps progress onto the curve, clamped at both ends', () => {
  const layout = layoutCurve(samples('sin(x)'));
  const n = layout.centerline.length;

  assert.equal(headPosition(layout.centerline, 0), layout.centerline[0], 'progress 0 is the start');
  assert.equal(headPosition(layout.centerline, 1), layout.centerline[n - 1], 'progress 1 is the end');
  assert.equal(headPosition(layout.centerline, -3), layout.centerline[0], 'below 0 clamps');
  assert.equal(headPosition(layout.centerline, 7), layout.centerline[n - 1], 'above 1 clamps');
  assert.equal(headPosition([], 0.5), null, 'an empty curve has no head');
});

test('playhead progress increases monotonically', () => {
  // The 3D head and the 2D playhead both read this same progress; if it went
  // backwards the head would visibly rewind against the audio.
  const layout = layoutCurve(samples('sin(x)'));
  let previous = -1;
  for (let p = 0; p <= 1.0001; p += 0.05) {
    const idx = headIndexForProgress(layout.centerline.length, p);
    assert.ok(idx >= previous, `playhead went backwards at progress ${p}`);
    previous = idx;
  }
});

test('the playhead agrees with the 2D playhead on which sample is sounding', () => {
  // Both views index the same decimated centreline by the same rule, so the
  // glowing 3D head cannot drift from the 2D playhead.
  const points = usablePoints(samples('sin(3*x)', -8, 8), 512);
  const layout = layoutCurve(points);
  for (const p of [0, 0.25, 0.5, 0.75, 1]) {
    const idx = headIndexForProgress(layout.centerline.length, p);
    assert.ok(idx >= 0 && idx < layout.centerline.length);
  }
});

test('the ribbon is built from the exact centreline', () => {
  const layout = layoutCurve(samples('sin(x)', -6, 6));
  const geometry = buildCurveRibbon(layout.centerline);
  const segments = layout.centerline.length - 1;

  // Two vertices per sample: one either side of the centreline.
  assert.equal(geometry.getAttribute('position').count, (segments + 1) * 2);
  assert.equal(geometry.getIndex()?.count, segments * 6);

  // The ribbon must sit ON the curve: every vertex pair shares the sample's
  // centre. A ribbon that drifts off the maths misrepresents the equation.
  // Read straight from the array: `getXYZ` is not present on every three
  // version's BufferAttribute, and the test must not depend on it.
  const pos = geometry.getAttribute('position');
  const at = (k: number, axis: number) => pos.array[k * 3 + axis];
  for (let i = 0; i <= segments; i++) {
    const c = layout.centerline[i];
    for (const k of [i * 2, i * 2 + 1]) {
      assert.ok(Math.abs(at(k, 0) - c.x) < 1e-6, `x drifted at sample ${i}`);
      assert.ok(Math.abs(at(k, 1) - c.y) < 1e-6, `y drifted at sample ${i}`);
      assert.ok(Math.abs(at(k, 2) - c.z) < 1e-6, `z drifted at sample ${i}`);
    }
  }
});

test('the ribbon tags every vertex with its position along the curve', () => {
  // The shader compares aAlong against the shared playback progress, so this
  // attribute is what keeps the 3D playhead locked to the audio.
  const layout = layoutCurve(samples('sin(x)', -6, 6));
  const geometry = buildCurveRibbon(layout.centerline);
  const along = geometry.getAttribute('aAlong');
  const sides = geometry.getAttribute('aSide');
  assert.equal(along.getX(0), 0, 'the curve must start at 0');
  assert.equal(along.getX(along.count - 1), 1, 'the curve must end at 1');

  let previous = -1;
  for (let i = 0; i < along.count; i++) {
    assert.ok(along.getX(i) >= previous, `positionAlong went backwards at ${i}`);
    previous = along.getX(i);
  }
  // Two sides: the shader's cross(tangent, viewDir) expansion needs a signed
  // magnitude to push each vertex to the correct side.
  assert.deepEqual(
    [sides.getX(0), sides.getX(1)],
    [-1, 1],
    'a ribbon needs one vertex on each side of the centreline',
  );
});

/* ── numeric axis ticks ──────────────────────────────────────────── */

test('tick steps are round numbers', () => {
  assert.equal(niceStep(10, 5), 2);
  assert.equal(niceStep(100, 5), 20);
  assert.equal(niceStep(0.37, 4), 0.1);
  assert.equal(niceStep(1, 5), 0.2);
});

test('ticks stay dense enough to read an axis', () => {
  // Regression: the conventional 1/2/5 cut-offs pick a step of 5 here and yield
  // only -5, 0, 5 across [-6.28, 6.28], leaving most of the axis bare.
  const ticks = niceTicks(-6.28, 6.28, 5);
  assert.ok(ticks.length >= 5, `expected at least 5 labels, got ${ticks.length}`);
  assert.ok(ticks.includes(0), 'zero should be labelled');
  assert.ok(ticks.every((t) => t >= -6.28 - 1e-9 && t <= 6.28 + 1e-9));
});

test('ticks adapt to very different domains', () => {
  assert.ok(niceTicks(-100, 100, 6).length >= 5);
  assert.ok(niceTicks(-0.5, 0.5, 5).length >= 3, 'a small domain still gets labels');
  assert.ok(niceTicks(-0.01, 0.01, 4).length >= 2, 'a tiny domain still gets labels');
});

test('tick values are round, with no floating-point dust', () => {
  for (const t of niceTicks(-1.0000001, 1.0000001, 6)) {
    assert.equal(tickLabel(t).includes('0000001'), false, `dusty tick: ${t}`);
  }
  assert.equal(tickLabel(2.5), '2.5');
  assert.equal(tickLabel(12), '12');
  assert.equal(tickLabel(-6), '-6');
});

test('degenerate ranges yield no ticks rather than looping forever', () => {
  assert.deepEqual(niceTicks(5, 5), []);
  assert.deepEqual(niceTicks(10, 1), [], 'inverted range');
  assert.deepEqual(niceTicks(NaN, 1), []);
});

test('the ribbon carries tangents for the camera-facing expansion', () => {
  // Without a tangent the vertex shader cannot compute cross(tangent, viewDir),
  // which is the mechanism that keeps the stroke facing the camera.
  const layout = layoutCurve(samples('cos(3*x)', -6, 6));
  const tangent = buildCurveRibbon(layout.centerline).getAttribute('aTangent');
  assert.ok(tangent, 'the ribbon must carry a tangent attribute');
  let anyNonZero = false;
  for (let i = 0; i < tangent.array.length; i++) {
    if (Math.abs(tangent.array[i]) > 1e-9) anyNonZero = true;
  }
  assert.ok(anyNonZero, 'tangents must not be all zero');
});

test('the ribbon survives a degenerate centreline', () => {
  // One point is not a curve, but it must not throw and leave broken geometry
  // attached to the scene.
  const geometry = buildCurveRibbon([new Vector3(1, 2, 3)]);
  assert.ok(geometry.getAttribute('position').count >= 2);
});

test('layoutCurve rejects a curve with too few points', () => {
  // Better to throw than to build a scene with NaN geometry.
  assert.throws(() => layoutCurve([{ x: 0, y: 0, dy: 0, curvature: 0, isValid: true }]));
});

test('decimation preserves both endpoints', () => {
  // Losing the last point would visibly truncate the tube at the domain edge.
  const points = samples('sin(x)', -20, 20);
  const decimated = usablePoints(points, 64);
  assert.ok(decimated.length <= 65);
  const valid = points.filter((p) => p.isValid);
  assert.equal(decimated[0].x, valid[0].x);
  assert.equal(decimated[decimated.length - 1].x, valid[valid.length - 1].x);
});

test('the curve never dips into the floor', () => {
  for (const eq of ['sin(x)', 'x^3', 'sin(5*x) * exp(-0.1*x^2)']) {
    const layout = layoutCurve(samples(eq, -6, 6));
    assert.ok(
      layout.bounds.minY > layout.floorY,
      `${eq} dips into the floor (min ${layout.bounds.minY}, floor ${layout.floorY})`,
    );
  }
});

test('asymptotic curves (tan) have their y-range percentile-trimmed', () => {
  const layout = layoutCurve(sample('tan(x)', -6, 6));
  assert.equal(layout.yTrimmed, true, 'tan must trigger y-range trimming');
  // The trimmed range is a tight bulk, not the raw asymptotic extremes.
  assert.ok(layout.dataBounds.maxY < 20, 'trimmed maxY bounds the shape');
  assert.ok(layout.dataBounds.minY > -20, 'trimmed minY bounds the shape');
  // And the curve stays above the floor despite the asymptotes.
  assert.ok(layout.bounds.minY > layout.floorY, 'trimmed curve stays above the floor');
});

test('ordinary curves are not y-range trimmed', () => {
  for (const eq of ['sin(x)', 'x^3', '5*x', 'sin(5*x) * exp(-0.1*x^2)']) {
    const layout = layoutCurve(sample(eq, -6, 6));
    assert.equal(layout.yTrimmed, false, `${eq} must not be trimmed`);
  }
});
