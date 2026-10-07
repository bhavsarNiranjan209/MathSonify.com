/**
 * Tests for QR generation.
 *
 * The library's matrix output is pure maths with no DOM, so the part that
 * actually matters — "is this a real, correctly-sized, scannable symbol" — is
 * verifiable here rather than by squinting at a canvas. What is NOT tested is
 * whether a given phone camera reads the rendered canvas; that still needs a
 * real device.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildQrMatrix, drawQrMatrix } from './qr';

const SHARE_URL =
  'https://mathsonify.com/studio?eq=sin%28x%29&inst=sine&mode=frequency&dur=4&minX=-6.28&maxX=6.28&src=sc';

test('generates a square matrix of an odd size', () => {
  const m = buildQrMatrix(SHARE_URL);
  assert.ok(m.size > 0);
  assert.equal(m.size % 2, 1, 'QR side lengths are always odd');
  assert.ok(m.size >= 21, 'version 1 is 21x21');
});

test('every module is addressable and stable', () => {
  const m = buildQrMatrix(SHARE_URL);
  // No throws, and reading a cell twice gives the same answer.
  for (const [r, c] of [[0, 0], [1, 1], [m.size - 1, m.size - 1], [0, m.size - 1]]) {
    assert.equal(typeof m.isDark(r, c), 'boolean');
    assert.equal(m.isDark(r, c), m.isDark(r, c));
  }
});

test('all three finder patterns are present in the corners', () => {
  // The three 7x7 position-detection patterns are what a scanner locks onto.
  // Checking their centre modules is a cheap proxy for "this is a QR and not a
  // blank square".
  const m = buildQrMatrix(SHARE_URL);
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, m.size - 7],
    [m.size - 7, 0],
  ];
  for (const [top, left] of corners) {
    // A finder pattern is 7x7: dark outer ring, light 5x5 ring, dark 3x3 core.
    assert.equal(m.isDark(top + 3, left + 3), true, `finder at (${top},${left}) must have a dark core`);
    assert.equal(m.isDark(top, left), true, 'outer ring corner must be dark');
    assert.equal(m.isDark(top + 1, left + 1), false, 'the 5x5 inner ring must be light');
    assert.equal(m.isDark(top + 2, left + 2), true, 'the 3x3 core must be dark');
  }
});

test('different input produces a different symbol', () => {
  const a = buildQrMatrix('https://mathsonify.com/studio?eq=sin(x)');
  const b = buildQrMatrix('https://mathsonify.com/studio?eq=cos(x)');
  let differences = 0;
  for (let r = 0; r < a.size; r++) {
    for (let c = 0; c < a.size; c++) if (a.isDark(r, c) !== b.isDark(r, c)) differences++;
  }
  assert.ok(differences > 10, 'distinct URLs must not encode to the same symbol');
});

test('it is deterministic', () => {
  const a = buildQrMatrix(SHARE_URL);
  const b = buildQrMatrix(SHARE_URL);
  for (let r = 0; r < a.size; r++) {
    for (let c = 0; c < a.size; c++) {
      assert.equal(a.isDark(r, c), b.isDark(r, c));
    }
  }
});

test('a longer URL needs a larger symbol', () => {
  const short = buildQrMatrix('https://mathsonify.com/');
  const long = buildQrMatrix(SHARE_URL + '&pad=' + 'x'.repeat(200));
  assert.ok(long.size > short.size, 'more data must mean a larger version');
});

test('empty input is refused rather than producing an unscannable code', () => {
  assert.throws(() => buildQrMatrix(''), /empty/i);
});

test('higher error correction does not shrink the symbol', () => {
  const m = buildQrMatrix(SHARE_URL, 'L');
  const q = buildQrMatrix(SHARE_URL, 'H');
  assert.ok(q.size >= m.size, 'more redundancy must not need fewer modules');
});

test('drawQrMatrix paints dark modules with a quiet zone', () => {
  const m = buildQrMatrix(SHARE_URL);
  const rects: Array<[number, number, number, number]> = [];
  const ctx = {
    fillStyle: '',
    fillRect: (x: number, y: number, w: number, h: number) => { rects.push([x, y, w, h]); },
  } as unknown as CanvasRenderingContext2D;

  drawQrMatrix(ctx, m, { size: 200, quietZoneModules: 4 });

  // One background fill plus exactly one rect per dark module.
  const darkCount = rects.slice(1).length;
  let expected = 0;
  for (let r = 0; r < m.size; r++) {
    for (let c = 0; c < m.size; c++) if (m.isDark(r, c)) expected++;
  }
  assert.equal(darkCount, expected, 'must draw one rect per dark module');

  // Nothing may touch the outer edge — that is the quiet zone.
  const min = Math.min(...rects.slice(1).map((r) => Math.min(r[0], r[1])));
  assert.ok(min > 0, 'the symbol must not bleed to the canvas edge');
});