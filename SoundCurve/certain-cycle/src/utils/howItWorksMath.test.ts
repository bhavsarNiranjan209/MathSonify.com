import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildDemoCurve,
  countOscillations,
  levelFor,
  noteName,
  pitchFor,
  SONIFICATION_MAP,
  HOW_IT_WORKS_PRESETS,
  DEMO_SAMPLES,
} from './howItWorksMath';

test('every preset equation the page offers actually parses', () => {
  // The page advertises these as interactive demos. One that fails to parse
  // would present the visitor a dead preset, so this is a page-correctness
  // check, not just a parser check.
  for (const eq of HOW_IT_WORKS_PRESETS) {
    const curve = buildDemoCurve(eq);
    assert.equal(curve.error, undefined, `"${eq}" failed to parse: ${curve.error}`);
    assert.ok(curve.points.length >= DEMO_SAMPLES, `"${eq}" did not produce enough samples`);
  }
});

test('an unparseable equation reports a message instead of throwing', () => {
  // The equation input is free text. A typo must become a visible message, not
  // a blank canvas or a crashed page.
  const curve = buildDemoCurve('sin(');
  assert.ok(curve.error, 'a broken equation must report an error');
  assert.ok(curve.points.length < 2, 'and must not invent drawable points');
});

test('an empty equation is handled gracefully', () => {
  const curve = buildDemoCurve('');
  assert.ok(curve.error);
});

test('curve bounds and peak amplitude are correct for sin(x)', () => {
  const curve = buildDemoCurve('sin(x)');
  assert.ok(Math.abs(curve.maxY - 1) < 0.01, `maxY was ${curve.maxY}, expected ~1`);
  assert.ok(Math.abs(curve.minY + 1) < 0.01, `minY was ${curve.minY}, expected ~-1`);
  assert.ok(Math.abs(curve.peakY - 1) < 0.01);
});

test('a scaled curve reports a larger peak amplitude', () => {
  // The page's amplitude lesson depends on this being true.
  const plain = buildDemoCurve('sin(x)');
  const taller = buildDemoCurve('4*sin(x)');
  assert.ok(taller.peakY > plain.peakY, 'a taller curve must report a bigger peak');
});

test('oscillation counting separates a fast curve from a slow one', () => {
  // sin(3x) must report roughly three times the cycles of sin(x) over the same
  // domain — this is the difference the comparison section demonstrates.
  const slow = buildDemoCurve('sin(x)');
  const fast = buildDemoCurve('sin(3*x)');
  assert.ok(
    fast.oscillations >= slow.oscillations * 2,
    `sin(3x) (${fast.oscillations}) should have far more cycles than sin(x) (${slow.oscillations})`,
  );
});

test('countOscillations is at least one even for a flat curve', () => {
  // A straight line has no oscillations, but reporting 0 would divide by zero
  // or render as a blank readout.
  const flat = [
    { x: 0, y: 1, dy: 0, curvature: 0, isValid: true },
    { x: 1, y: 1, dy: 0, curvature: 0, isValid: true },
  ];
  assert.equal(countOscillations(flat), 1);
});

test('pitch readouts come from the real sonification mapping', () => {
  // These must agree with what the engine plays, which is why they go through
  // `pitchAt`. The extremes of the curve map to the extremes of the frequency
  // range, and the midpoint lands between them.
  const curve = buildDemoCurve('sin(x)');
  const top = pitchFor(curve, curve.maxY, 'frequency', 220, 880);
  const bottom = pitchFor(curve, curve.minY, 'frequency', 220, 880);
  assert.ok(top !== null && bottom !== null);
  assert.ok(Math.abs(top! - 880) < 1, `the top of the curve should play near 880Hz, got ${top}`);
  assert.ok(Math.abs(bottom! - 220) < 1, `the bottom should play near 220Hz, got ${bottom}`);
});

test('modes without pitch report loudness instead of inventing a frequency', () => {
  // Showing "412 Hz" during a rhythm-mode playback would be a lie: no
  // oscillator is playing at that pitch.
  const curve = buildDemoCurve('sin(x)');
  assert.equal(pitchFor(curve, 0.5, 'rhythm', 220, 880), null);
  const level = levelFor(curve, 0.5, 'rhythm');
  assert.ok(level !== null && level >= 0 && level <= 1, `loudness ${level} out of range`);
});

test('noteName names real notes and survives bad input', () => {
  assert.equal(noteName(440), 'A4');
  assert.equal(noteName(0), '—', 'zero hz is not a note');
  assert.equal(noteName(NaN), '—');
  assert.equal(noteName(-5), '—');
});

test('perceptual claims in the sonification map are hedged, definitional ones are exact', () => {
  // A page that states "slope IS brightness" overstates a filter sweep that only
  // tends to read that way. But some mappings are simply how the engine works —
  // x is the clock, y is the pitch, and a taller curve sweeps a wider range —
  // and hedging those would make them vague rather than more honest.
  //
  // Each entry therefore declares which kind it is, so a speculative mapping
  // cannot slip through as fact, and an exact one cannot quietly become hedged
  // mush that says nothing.
  const definitional = new Set(['Height', 'Width', 'Amplitude', 'Oscillations']);
  for (const fact of SONIFICATION_MAP) {
    assert.ok(fact.property && fact.becomes && fact.detail, 'every entry must be complete');

    if (definitional.has(fact.property)) {
      assert.match(
        fact.detail,
        /exact mapping|wider span of frequencies|becomes the extremes|revisit the pitch range/i,
        `"${fact.property}" is definitional, so it should say so: ${fact.detail}`,
      );
    } else {
      assert.match(
        fact.detail,
        /tends to|reads as/i,
        `"${fact.property}" is perceptual and must not assert it as fact: ${fact.detail}`,
      );
    }
  }
});

test('singularities are preserved rather than bridged', () => {
  // 1/x has a pole at 0. The samples either side must be flagged invalid so the
  // drawn curve breaks instead of drawing a line through the asymptote.
  const curve = buildDemoCurve('1/x');
  assert.ok(curve.points.some((p) => !p.isValid), 'the pole must be marked invalid');
});