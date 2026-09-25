import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceRecordingScan, densifySegment, findStrokesAlongSegment, scanStrokes } from './freehandScanner';
import { DRAW_PALETTE, yToFrequency, type FreehandPoint, type FreehandStroke } from './freehandDraw';

function stroke(color: string, points: FreehandPoint[]): FreehandStroke {
  return { id: color, color, instrument: 'sine', brushSize: 5, points };
}

test('palette exposes 14 distinct gentle voices', () => {
  assert.equal(DRAW_PALETTE.length, 14);
  assert.equal(new Set(DRAW_PALETTE.map((entry) => entry.color)).size, 14);
  assert.ok(DRAW_PALETTE.every((entry) => entry.instrument === 'sine' || entry.instrument === 'triangle'));
});

test('pitch mapping stays in minor pentatonic', () => {
  for (let y = 0; y <= 1; y += 0.013) {
    const frequency = yToFrequency(y, 0);
    const midi = Math.round(69 + 12 * Math.log2(frequency / 440));
    assert.ok([0, 3, 5, 7, 10].includes(((midi % 12) + 12) % 12));
  }
});

test('capture densification guarantees <=3px spacing on a fast diagonal', () => {
  const from: FreehandPoint = { x: 0, y: 0, t: 0 };
  const to: FreehandPoint = { x: 1, y: 1, t: 200 };
  const points = densifySegment(from, to, 1000, 500);
  assert.ok(points.length > 300);
  let previous = from;
  for (const point of points) {
    assert.ok(Math.hypot((point.x - previous.x) * 1000, (point.y - previous.y) * 500) <= 3.001);
    previous = point;
  }
  assert.deepEqual(points.at(-1), to);
});

test('scanner reads exact intersections from the current live stroke list', () => {
  const strokes = [
    stroke('#e11d48', [{ x: 0, y: 0.8, t: 0 }, { x: 1, y: 0.2, t: 100 }]),
    stroke('#3b82f6', [{ x: 0, y: 0.2, t: 0 }, { x: 1, y: 0.8, t: 100 }]),
  ];
  const readings = scanStrokes(strokes, 0.5);
  assert.equal(readings.length, 2);
  for (const reading of readings) assert.ok(Math.abs(reading.averageY - 0.5) < 1e-6);

  strokes.push(stroke('#10b981', [{ x: 0.45, y: 0.3, t: 0 }, { x: 0.55, y: 0.3, t: 10 }]));
  assert.equal(scanStrokes(strokes, 0.5).length, 3);
});

test('same-color crossings produce one averaged voice but retain every dot y', () => {
  const readings = scanStrokes([
    stroke('#e11d48', [{ x: 0.4, y: 0.2, t: 0 }, { x: 0.6, y: 0.2, t: 10 }]),
    stroke('#e11d48', [{ x: 0.4, y: 0.8, t: 0 }, { x: 0.6, y: 0.8, t: 10 }]),
  ], 0.5);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].ys.length, 2);
  assert.ok(Math.abs(readings[0].averageY - 0.5) < 1e-6);
});


test('recording advances exactly one loop from any starting phase', () => {
  let x = 0.83;
  let elapsed = 0;
  for (let i = 0; i < 500 && elapsed < 6000; i++) {
    const step = advanceRecordingScan(x, elapsed, 1000 / 60, 6000);
    x = step.x;
    elapsed = step.elapsedMs;
    if (step.complete) break;
  }
  assert.equal(elapsed, 6000);
  assert.ok(Math.abs(x - 0.83) < 1e-9);
});

test('a corner-to-corner stroke reads at every scan position', () => {
  const fast = [stroke('#3b82f6', [{ x: 0, y: 1, t: 0 }, { x: 1, y: 0, t: 30 }])];
  for (let i = 0; i <= 100; i++) {
    const x = i / 100;
    const readings = scanStrokes(fast, x);
    assert.equal(readings.length, 1);
    assert.ok(Math.abs(readings[0].averageY - (1 - x)) < 1e-6);
  }
});

test('eraser returns every stroke crossed by a drag, topmost first', () => {
  const strokes = [
    stroke('#111111', [{ x: 0.1, y: 0.5, t: 0 }, { x: 0.9, y: 0.5, t: 100 }]),
    stroke('#222222', [{ x: 0.5, y: 0.1, t: 0 }, { x: 0.5, y: 0.9, t: 100 }]),
    stroke('#333333', [{ x: 0.1, y: 0.5, t: 0 }, { x: 0.9, y: 0.5, t: 100 }]),
  ];
  assert.deepEqual(findStrokesAlongSegment(strokes, { x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, 1000, 800, 8), [2, 0]);
  assert.deepEqual(findStrokesAlongSegment(strokes, { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, 1000, 800, 8), [2, 0]);
});
