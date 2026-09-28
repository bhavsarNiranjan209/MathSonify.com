import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseParameters,
  serializeParameters,
  isParameterizable,
  applyParameter,
  readParameter,
  clampParamValue,
  handlesFor,
  handlePositions,
} from './equationParams';
import { parseEquation } from './equationParser';

/** Round-trip: equation -> params -> equation must describe the same function. */
function roundTripsWithin(input: string, tolerance = 1e-3): boolean {
  const params = parseParameters(input);
  if (!params) return false;
  const output = serializeParameters(params);
  const a = parseEquation(input);
  const b = parseEquation(output);
  if (!a.success || !b.success || !a.evaluate || !b.evaluate) return false;
  for (let i = 0; i <= 40; i++) {
    const x = -8 + (i / 40) * 16;
    const y1 = a.evaluate(x);
    const y2 = b.evaluate(x);
    if (Number.isNaN(y1) || Number.isNaN(y2)) continue;
    if (Math.abs(y1 - y2) > tolerance) return false;
  }
  return true;
}

/**
 * Two equations must differ as FUNCTIONS, not merely as strings. This is the
 * guard against "fake" graph editing that rewrites the label while leaving
 * the mathematics untouched.
 */
function assertNotSameFunction(a: string, b: string, tolerance = 1e-3) {
  const pa = parseEquation(a);
  const pb = parseEquation(b);
  assert.ok(pa.success, `could not parse "${a}"`);
  assert.ok(pb.success, `could not parse "${b}"`);
  if (!pa.success || !pb.success || !pa.evaluate || !pb.evaluate) return;
  let maxDelta = 0;
  for (let i = 0; i <= 60; i++) {
    const x = -8 + (i / 60) * 16;
    const y1 = pa.evaluate(x);
    const y2 = pb.evaluate(x);
    if (Number.isNaN(y1) || Number.isNaN(y2)) continue;
    maxDelta = Math.max(maxDelta, Math.abs(y1 - y2));
  }
  assert.ok(
    maxDelta > tolerance,
    `"${a}" and "${b}" describe the SAME function (max delta ${maxDelta.toFixed(6)})`,
  );
}

test('sin(x) parses to unit amplitude, unit frequency, no phase', () => {
  const p = parseParameters('sin(x)');
  assert.ok(p);
  assert.equal(p.family, 'periodic');
  assert.ok(Math.abs(p.amplitude - 1) < 1e-9);
  assert.ok(Math.abs(p.frequency - 1) < 1e-9);
  assert.ok(Math.abs(p.phase) < 1e-9);
  assert.ok(Math.abs(p.offset) < 1e-9);
});

test('amplitude edit changes the equation (the Part 4 example)', () => {
  const p = parseParameters('sin(x)')!;
  assert.equal(serializeParameters({ ...p, amplitude: 1.5 }), '1.5sin(x)');
  assert.equal(serializeParameters({ ...p, amplitude: 0.5 }), '0.5sin(x)');
});

test('frequency edit produces sin(2x) and sin(0.5x)', () => {
  const p = parseParameters('sin(x)')!;
  assert.equal(serializeParameters({ ...p, frequency: 2 }), 'sin(2x)');
  assert.equal(serializeParameters({ ...p, frequency: 0.5 }), 'sin(0.5x)');
});

test('phase edit produces a π/4 term', () => {
  const p = parseParameters('sin(x)')!;
  assert.equal(serializeParameters({ ...p, phase: Math.PI / 4 }), 'sin(x + π/4)');
});

test('offset edit shifts the function vertically', () => {
  const p = parseParameters('sin(x)')!;
  assert.equal(serializeParameters({ ...p, offset: 1 }), 'sin(x) + 1');
  assert.equal(serializeParameters({ ...p, offset: -2 }), 'sin(x) - 2');
});

test('the full 2sin(3x + π/2) + 1 example round-trips', () => {
  assert.ok(roundTripsWithin('2sin(3x + pi/2) + 1'), 'failed to round-trip');
  const p = parseParameters('2sin(3x + pi/2) + 1')!;
  assert.equal(p.family, 'periodic');
  assert.ok(Math.abs(p.amplitude - 2) < 1e-9);
  assert.ok(Math.abs(p.frequency - 3) < 1e-9);
  assert.ok(Math.abs(p.offset - 1) < 1e-9);
  // cos(x) === sin(x + π/2)
  assert.ok(Math.abs(p.phase - Math.PI / 2) < 1e-6);
});

test('cos is recognised as sin shifted a quarter turn', () => {
  const p = parseParameters('cos(x)');
  assert.ok(p);
  assert.equal(p.family, 'periodic');
  assert.ok(Math.abs(p.phase - Math.PI / 2) < 1e-6);
  assert.ok(roundTripsWithin('cos(x)'));
  assert.equal(serializeParameters(p), 'cos(x)');
});

test('linear and quadratic families round-trip', () => {
  assert.ok(roundTripsWithin('2x + 3'));
  assert.ok(roundTripsWithin('x^2 - 4'));
  assert.ok(roundTripsWithin('2x^2 + 3x - 1'));
  assert.ok(roundTripsWithin('-x + 5'));
  assert.equal(parseParameters('2x + 3')!.family, 'linear');
  assert.equal(parseParameters('2x^2 + 3x - 1')!.family, 'quadratic');
});

test('root functions round-trip and keep their real domain', () => {
  assert.ok(roundTripsWithin('sqrt(x)'));
  assert.ok(roundTripsWithin('sqrt(x + 2)'));
  assert.ok(roundTripsWithin('2sqrt(3x)'));
  assert.equal(parseParameters('sqrt(x)')!.family, 'root');
  assert.equal(parseParameters('sqrt(x + 2)')!.rootConstant, 2);
});

test('exponential round-trips', () => {
  assert.ok(roundTripsWithin('exp(x)'));
  assert.ok(roundTripsWithin('2exp(0.5x) + 1'));
  assert.equal(parseParameters('exp(x)')!.family, 'exponential');
});

test('implicit multiplication is understood', () => {
  assert.ok(roundTripsWithin('2sin(x)'));
  assert.ok(roundTripsWithin('3cos(2x)'));
  assert.ok(roundTripsWithin('2sqrt(x)'));
});

test('unsupported equations are rejected instead of mis-parameterised', () => {
  // These must return null so the UI does not show misleading handles.
  for (const equation of ['sin(x)*cos(x)', 'x^3 + 2x', 'tan(x)', '1/x', 'log(x)', 'abs(sin(x))']) {
    assert.equal(parseParameters(equation), null, `"${equation}" should not be parameterizable`);
  }
  assert.equal(isParameterizable('sin(x)'), true);
  assert.equal(isParameterizable('sin(x)*cos(x)'), false);
});

test('serialised equations always re-parse into the same family', () => {
  const samples = ['sin(x)', '1.5sin(2x)', 'sin(x + pi/4)', 'cos(x)', '2x + 3', 'x^2 - 4', 'sqrt(x + 2)', '2exp(0.5x)'];
  for (const sample of samples) {
    const params = parseParameters(sample);
    assert.ok(params, `${sample} should parse`);
    const again = parseParameters(serializeParameters(params));
    assert.ok(again, `${sample} serialised to something unparseable`);
    assert.equal(again.family, params.family);
  }
});

test('phase formatting prefers π notation', () => {
  const p = parseParameters('sin(x)')!;
  assert.equal(serializeParameters({ ...p, phase: Math.PI / 2 }), 'cos(x)');
  assert.equal(serializeParameters({ ...p, phase: Math.PI / 4 }), 'sin(x + π/4)');
  assert.equal(serializeParameters({ ...p, phase: -Math.PI / 4 }), 'sin(x - π/4)');
});

// ── The two-way editing contract ──────────────────────────────────────
//
// A handle drag must produce a genuinely different function. These tests
// assert the resulting equation is a DIFFERENT curve, not merely different
// text — that is the difference between real graph editing and a fake one.

test('a dragged handle changes the function, not just the text', () => {
  const before = parseParameters('sin(x)')!;
  const after = applyParameter(before, 'amplitude', 1.5);
  assert.equal(serializeParameters(after), '1.5sin(x)');
  assertNotSameFunction('sin(x)', '1.5sin(x)');
});

test('dragging frequency visibly changes the curve', () => {
  const base = parseParameters('sin(x)')!;
  const faster = serializeParameters(applyParameter(base, 'frequency', 2));
  const slower = serializeParameters(applyParameter(base, 'frequency', 0.5));
  assert.equal(faster, 'sin(2x)');
  assert.equal(slower, 'sin(0.5x)');
  assertNotSameFunction('sin(x)', faster);
  assertNotSameFunction('sin(x)', slower);
});

test('dragging phase shifts the wave horizontally', () => {
  const base = parseParameters('sin(x)')!;
  const shifted = serializeParameters(applyParameter(base, 'phase', Math.PI / 4));
  assert.equal(shifted, 'sin(x + π/4)');
  assertNotSameFunction('sin(x)', shifted);
});

test('dragging offset translates the whole function', () => {
  const base = parseParameters('sin(x)')!;
  const lifted = serializeParameters(applyParameter(base, 'offset', 1));
  assert.equal(lifted, 'sin(x) + 1');
  assertNotSameFunction('sin(x)', lifted);
});

test('the `rate` handle writes the exponential growth rate', () => {
  const base = parseParameters('exp(x)')!;
  assert.equal(readParameter(base, 'rate'), base.frequency);
  const faster = applyParameter(base, 'rate', 0.5);
  assert.equal(faster.frequency, 0.5);
  assert.equal(serializeParameters(faster), 'exp(0.5x)');
});

test('clamping keeps dragged values in a sane range', () => {
  assert.equal(clampParamValue('amplitude', 9999), 20);
  assert.equal(clampParamValue('amplitude', -9999), -20);
  assert.equal(clampParamValue('phase', 99), 4 * Math.PI);
  assert.equal(clampParamValue('amplitude', NaN), 0);
});

test('handles are exposed per family and anchored inside the view', () => {
  const periodic = parseParameters('sin(x)')!;
  assert.deepEqual(handlesFor(periodic), ['amplitude', 'frequency', 'phase', 'offset']);
  const positions = handlePositions(periodic, -10, 10);
  assert.equal(positions.length, 4);
  for (const handle of positions) {
    assert.ok(Number.isFinite(handle.at.x), `${handle.key} x is not finite`);
    assert.ok(Number.isFinite(handle.at.y), `${handle.key} y is not finite`);
    assert.ok(handle.at.x >= -10 && handle.at.x <= 10, `${handle.key} escaped the x window`);
  }
  // A root function must not offer a phase handle it cannot represent.
  const root = parseParameters('sqrt(x)')!;
  assert.deepEqual(handlesFor(root), ['amplitude', 'rootConstant', 'offset']);
});

