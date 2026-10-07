/**
 * Tests for the template-based curve describer.
 *
 * The point of these is that the output is *measured*, not generated. If a
 * template starts claiming something the samples do not support, that is a bug
 * — so each test pins a claim to the curve that produces it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { analyzeCurve, describeCurve } from './curveDescription';
import { parseEquation, type SamplePoint } from './equationParser';

/** Sample a real equation through the app's own parser — no hand-built fakes. */
function sample(equation: string, minX = -10, maxX = 10, count = 800): SamplePoint[] {
  const parsed = parseEquation(equation);
  assert.ok(parsed.success && parsed.sample, `expected "${equation}" to parse`);
  return parsed.sample(minX, maxX, count);
}

/** A complete SamplePoint. `dy`/`curvature` are unused by the describer but
 *  required by the type, so fixtures must be fully-formed rather than partial. */
const pt = (x: number, y: number, isValid = true): SamplePoint =>
  ({ x, y, isValid, dy: 0, curvature: 0 });

/** Straight-line samples, for cases the parser cannot express. */
const line = (from: number, to: number, n = 200): SamplePoint[] =>
  Array.from({ length: n }, (_, i) => pt(i, from + ((to - from) * i) / (n - 1)));

/** A horizontal line at height `y`. */
const flatLine = (y: number, n = 50): SamplePoint[] =>
  Array.from({ length: n }, (_, i) => pt(i, y));

/* ── measurement ─────────────────────────────────────────────────── */

test('a steadily rising line is measured as rising', () => {
  const facts = analyzeCurve(line(0, 10));
  assert.equal(facts.trend, 'rising');
  assert.equal(facts.minY, 0);
  assert.equal(facts.maxY, 10);
  assert.equal(facts.isFlat, false);
});

test('a steadily falling line is measured as falling', () => {
  assert.equal(analyzeCurve(line(10, 0)).trend, 'falling');
});

test('a constant line is measured as flat, not described as undulation', () => {
  // The honesty case: a flat curve must not be dressed up as interesting.
  const facts = analyzeCurve(flatLine(7));
  assert.equal(facts.isFlat, true);
  assert.equal(facts.trend, 'flat');
  assert.equal(facts.peaks, 0);
  assert.equal(facts.troughs, 0);
});

test('x^2 is measured as a single trough, not a peak', () => {
  // The vertex of a parabola is a MINIMUM. Getting this backwards would make
  // the description announce a maximum where the curve is at its lowest.
  const facts = analyzeCurve(sample('x^2'));
  assert.equal(facts.trend, 'varying');
  assert.equal(facts.troughs, 1, 'one turning point at the vertex');
  assert.equal(facts.peaks, 0, 'a U shape has no local maximum');
  assert.ok(Math.abs((facts.troughX ?? 99)) < 0.1, 'the trough is at x = 0');
});

test('a single turn is described as a turn, not as oscillation', () => {
  // Guards the wording: "oscillates, with 0 peaks and 1 trough" would be silly.
  const { text, facts } = describeCurve(sample('x^2'));
  assert.equal(facts.troughs, 1);
  assert.ok(!/oscillates/.test(text), 'one turning point is not an oscillation');
  assert.match(text, /single minimum near x = 0/);
});

test('sin(x) oscillation is counted as peaks and troughs', () => {
  const facts = analyzeCurve(sample('sin(x)', -10, 10));
  assert.ok(facts.peaks > 2, `expected several peaks, got ${facts.peaks}`);
  assert.ok(facts.troughs > 2, `expected several troughs, got ${facts.troughs}`);
  // Peaks and troughs alternate, so they cannot differ by more than one.
  assert.ok(Math.abs(facts.peaks - facts.troughs) <= 1);
});

test('symmetry detection distinguishes even, odd and neither', () => {
  assert.equal(analyzeCurve(sample('x^2')).symmetry, 'even', 'x^2 is even');
  assert.equal(analyzeCurve(sample('x^3')).symmetry, 'odd', 'x^3 is odd');
  // x^2 + 1 is also even — adding a constant does not break mirror symmetry.
  assert.equal(analyzeCurve(sample('x^2 + 1')).symmetry, 'even', 'x^2 + 1 is even');
  // A linear term tilts the parabola and destroys it.
  assert.equal(analyzeCurve(sample('x^2 + 3x')).symmetry, 'none', 'x^2 + 3x is asymmetric');
});

test('invalid sample points are ignored rather than counted as extrema', () => {
  const withGap: SamplePoint[] = [pt(0, 0), pt(1, NaN, false), pt(2, 0)];
  const facts = analyzeCurve(withGap);
  assert.ok(Number.isFinite(facts.minY) && Number.isFinite(facts.maxY));
  assert.ok(!Number.isNaN(facts.peakX as number), 'a NaN must never surface as the peak');
});


/* ── descriptions ────────────────────────────────────────────────── */

test('descriptions are deterministic — same input, same words', () => {
  const pts = sample('sin(x)');
  assert.equal(describeCurve(pts).text, describeCurve(pts).text);
});

test('the description is derived from the samples, not hardcoded', () => {
  const rising = describeCurve(line(2, 8)).text;
  const falling = describeCurve(line(8, 2)).text;
  assert.notEqual(rising, falling, 'opposite trends must read differently');
  assert.match(rising, /rises steadily/);
  assert.match(falling, /falls steadily/);
});

test('a flat curve says so plainly', () => {
  const flat = flatLine(3);
  assert.match(describeCurve(flat).text, /is flat/);
  assert.ok(!/oscillat/i.test(describeCurve(flat).text), 'no oscillation claim for a flat line');
});

test('an oscillating curve reports its real peak and trough counts', () => {
  const { text, facts } = describeCurve(sample('sin(x)', -10, 10));
  assert.match(text, /oscillates/);
  assert.ok(text.includes(String(facts.peaks)), 'the stated peak count matches the measured one');
  assert.ok(text.includes(String(facts.troughs)), 'the stated trough count matches too');
});

test('pluralisation is correct for a single peak', () => {
  // -x^2 is an inverted parabola: one maximum, no minimum.
  const { text, facts } = describeCurve(sample('-x^2'));
  assert.equal(facts.peaks, 1);
  assert.match(text, /single maximum/);
  assert.ok(!/oscillates/.test(text), 'a single turn is not an oscillation');
});

test('the equation is included when supplied, and omitted when not', () => {
  const pts = sample('x^2');
  assert.match(describeCurve(pts, 'x^2').text, /The equation is x\^2\./);
  assert.ok(!/The equation is/.test(describeCurve(pts).text));
});

test('degenerate input never throws and always yields text', () => {
  for (const pts of [[], [pt(0, 0)]] as SamplePoint[][]) {
    const { text } = describeCurve(pts);
    assert.ok(typeof text === 'string' && text.length > 0);
  }
});

test('every claim in the text is backed by the measured facts', () => {
  // The core honesty test: no template may fire that the data contradicts.
  for (const eq of ['x^2', 'x^3', 'sin(x)', '-x', 'x^2 + 1', 'abs(x)']) {
    const { text, facts } = describeCurve(sample(eq));
    if (/rises steadily/.test(text)) assert.equal(facts.trend, 'rising', eq);
    if (/falls steadily/.test(text)) assert.equal(facts.trend, 'falling', eq);
    if (/oscillates/.test(text)) assert.ok(facts.peaks + facts.troughs > 0, eq);
    if (/is flat/.test(text)) assert.equal(facts.isFlat, true, eq);
    if (/mirror-symmetric/.test(text)) assert.equal(facts.symmetry, 'even', eq);
    if (/rotational symmetry/.test(text)) assert.equal(facts.symmetry, 'odd', eq);
  }
});
