/**
 * Tests for the shared sonification mappings.
 *
 * These are the functions both the audio engine and the Learn-mode readout use.
 * The value of the tests is therefore in pinning the *contract*: if someone
 * changes `pitchAt`, the synth and the on-screen number change together, and
 * these tests are what makes that visible in review.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { pitchAt, panAt, NOTE_MIN_HZ, NOTE_MAX_HZ } from './sonificationMapping';
import { normalize, quantizeToScale, MUSICAL_SCALES } from './equationParser';

const MIN_Y = -2;
const MAX_Y = 4;

/* ── pitch mapping ───────────────────────────────────────────────── */

test('frequency mode maps y linearly across the requested band', () => {
  const lo = pitchAt('frequency', MIN_Y, MIN_Y, MAX_Y, 200, 800);
  const mid = pitchAt('frequency', 1, MIN_Y, MAX_Y, 200, 800);
  const hi = pitchAt('frequency', MAX_Y, MIN_Y, MAX_Y, 200, 800);
  assert.equal(lo.kind, 'hz');
  assert.equal((lo as { hz: number }).hz, 200);
  assert.equal((hi as { hz: number }).hz, 800);
  assert.ok(Math.abs((mid as { hz: number }).hz - 500) < 1e-9, 'midpoint is the band midpoint');
});

test('frequency mode matches normalize() exactly, so it cannot drift', () => {
  for (const y of [MIN_Y, -1, 0, 0.5, 2.25, MAX_Y]) {
    const expected = normalize(y, MIN_Y, MAX_Y, 220, 900);
    const actual = pitchAt('frequency', y, MIN_Y, MAX_Y, 220, 900);
    assert.equal((actual as { hz: number }).hz, expected);
  }
});

test('note mode reports a frequency that is actually in the scale', () => {
  const p = pitchAt('note', 1, MIN_Y, MAX_Y, 200, 800, 'minor');
  assert.equal(p.kind, 'scaled');
  const hz = (p as { hz: number }).hz;
  const notes = MUSICAL_SCALES.minor.notes as readonly number[];
  assert.ok(notes.includes(hz), `${hz} must be one of the scale's notes`);
});

test('note mode matches the raw-then-quantise formula the engine uses', () => {
  const raw = normalize(2, MIN_Y, MAX_Y, NOTE_MIN_HZ, NOTE_MAX_HZ);
  const expected = quantizeToScale(raw, 'pentatonic');
  assert.equal((pitchAt('note', 2, MIN_Y, MAX_Y, 1, 2, 'pentatonic') as { hz: number }).hz, expected);
});

test('rhythm and chord report amplitude, never a fabricated frequency', () => {
  // The honest thing: these modes have no pitch, so Learn mode must not invent
  // one. Reporting amplitude is true; reporting Hz here would be a lie.
  const r = pitchAt('rhythm', 0, MIN_Y, MAX_Y, 200, 800);
  const c = pitchAt('chord', 0, MIN_Y, MAX_Y, 200, 800);
  assert.equal(r.kind, 'amplitude');
  assert.equal(c.kind, 'amplitude');
  assert.ok((r as { value: number }).value >= 0 && (r as { value: number }).value <= 1);
  assert.ok((c as { value: number }).value <= 0.75, 'chord voicing stays under 0.75');
});

test('every mode returns finite values across the whole range', () => {
  for (const mode of ['frequency', 'note', 'rhythm', 'chord'] as const) {
    for (const y of [MIN_Y, 0, MAX_Y]) {
      const p = pitchAt(mode, y, MIN_Y, MAX_Y, 200, 800);
      const value = 'hz' in p ? p.hz : p.value;
      assert.ok(Number.isFinite(value), `${mode} produced a non-finite value at y=${y}`);
    }
  }
});

/* ── pan mapping ─────────────────────────────────────────────────── */

test('pan spans full left-to-right across the curve own range', () => {
  assert.equal(panAt(MIN_Y, MIN_Y, MAX_Y), -1, 'lowest sample is hard left');
  assert.equal(panAt(MAX_Y, MIN_Y, MAX_Y), 1, 'highest sample is hard right');
});

test('pan is zero at mid-height and monotonic either side', () => {
  const midY = (MIN_Y + MAX_Y) / 2;
  assert.equal(panAt(midY, MIN_Y, MAX_Y), 0);
  let prev = 0;
  for (let y = midY; y <= MAX_Y; y += 0.25) {
    const p = panAt(y, MIN_Y, MAX_Y);
    assert.ok(p >= prev, 'pan must not reverse as the curve rises');
    prev = p;
  }
});

test('a curve entirely above zero still pans the full width', () => {
  // This is why pan normalises against min/max rather than against y = 0:
  // a curve in [10, 14] must sweep the whole image, not sit hard right.
  assert.equal(panAt(10, 10, 14), -1);
  assert.equal(panAt(14, 10, 14), 1);
  assert.equal(panAt(12, 10, 14), 0);
});

test('a flat curve has no direction, so it stays centred', () => {
  assert.equal(panAt(5, 5, 5), 0);
  assert.equal(panAt(5, 5, 5.0001), 0);
});

test('pan never exceeds the valid stereo range', () => {
  for (let y = MIN_Y - 50; y <= MAX_Y + 50; y += 0.37) {
    const p = panAt(y, MIN_Y, MAX_Y);
    assert.ok(p >= -1 && p <= 1, `pan ${p} out of range at y=${y}`);
  }
});

test('values inside the deadzone do not jitter', () => {
  // Without a deadzone, samples either side of mid-height flip channels every
  // frame, which on headphones buzzes instead of sweeping.
  const midY = (MIN_Y + MAX_Y) / 2;
  const near = (MAX_Y - MIN_Y) * 0.01;
  assert.equal(panAt(midY - near, MIN_Y, MAX_Y), 0);
  assert.equal(panAt(midY + near, MIN_Y, MAX_Y), 0);
  // Just outside it, there is a little deflection.
  const outside = (MAX_Y - MIN_Y) * 0.05;
  assert.ok(Math.abs(panAt(midY + outside, MIN_Y, MAX_Y)) > 0);
});

test('pan is independent of pitch — an extra dimension, not a replacement', () => {
  // Same y must give the same pan no matter which mode is playing, and the
  // pitch mapping must be unaffected by the pan mapping.
  for (const mode of ['frequency', 'note', 'rhythm', 'chord'] as const) {
    const p = pitchAt(mode, 1, MIN_Y, MAX_Y, 200, 800);
    assert.ok(p, `${mode} still resolves a pitch with panning in the chain`);
    assert.equal(panAt(1, MIN_Y, MAX_Y), panAt(1, MIN_Y, MAX_Y));
  }
});