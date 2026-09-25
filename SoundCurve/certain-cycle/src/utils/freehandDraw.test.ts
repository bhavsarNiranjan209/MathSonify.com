import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DRAW_STORAGE_KEY,
  EMPTY_DRAW_HISTORY,
  loadSession,
  pushDrawAction,
  redoDrawAction,
  saveSession,
  undoDrawAction,
  yToFrequency,
  type FreehandStroke,
} from './freehandDraw';

const stroke: FreehandStroke = {
  id: 'stroke-1',
  color: '#0f766e',
  instrument: 'sine',
  brushSize: 5,
  points: [
    { x: 0.2, y: 0.8, t: 0 },
    { x: 0.1, y: 0.4, t: 75 },
    { x: 0.9, y: 0.2, t: 240 },
  ],
};

test('draw and erase actions share one correctly ordered undo/redo stack', () => {
  const second = { ...stroke, id: 'stroke-2', color: '#e11d48' };
  let history = pushDrawAction(EMPTY_DRAW_HISTORY, { type: 'draw', index: 0, stroke });
  let strokes = [stroke];
  history = pushDrawAction(history, { type: 'draw', index: 1, stroke: second });
  strokes = [...strokes, second];

  history = pushDrawAction(history, { type: 'erase', index: 1, stroke: second });
  strokes = strokes.filter((entry) => entry.id !== second.id);

  const undoErase = undoDrawAction(strokes, history)!;
  assert.deepEqual(undoErase.strokes.map((entry) => entry.id), ['stroke-1', 'stroke-2']);
  assert.equal(undoErase.history.undo.length, 2);
  assert.equal(undoErase.history.redo.length, 1);

  const undoSecondDraw = undoDrawAction(undoErase.strokes, undoErase.history)!;
  assert.deepEqual(undoSecondDraw.strokes.map((entry) => entry.id), ['stroke-1']);
  assert.equal(undoSecondDraw.history.undo.length, 1);
  assert.equal(undoSecondDraw.history.redo.length, 2);

  const redoSecondDraw = redoDrawAction(undoSecondDraw.strokes, undoSecondDraw.history)!;
  assert.deepEqual(redoSecondDraw.strokes.map((entry) => entry.id), ['stroke-1', 'stroke-2']);
  const redoErase = redoDrawAction(redoSecondDraw.strokes, redoSecondDraw.history)!;
  assert.deepEqual(redoErase.strokes.map((entry) => entry.id), ['stroke-1']);
  assert.equal(redoErase.history.redo.length, 0);
});

test('multiple eraser actions restore every stroke at its exact position', () => {
  const second = { ...stroke, id: 'stroke-2' };
  const third = { ...stroke, id: 'stroke-3' };
  let history = pushDrawAction(EMPTY_DRAW_HISTORY, { type: 'erase', index: 2, stroke: third });
  history = pushDrawAction(history, { type: 'erase', index: 0, stroke });
  const remaining = [second];
  const undoFirst = undoDrawAction(remaining, history)!;
  assert.deepEqual(undoFirst.strokes.map((entry) => entry.id), ['stroke-1', 'stroke-2']);
  const undoSecond = undoDrawAction(undoFirst.strokes, undoFirst.history)!;
  assert.deepEqual(undoSecond.strokes.map((entry) => entry.id), ['stroke-1', 'stroke-2', 'stroke-3']);
  const redoFirst = redoDrawAction(undoSecond.strokes, undoSecond.history)!;
  assert.deepEqual(redoFirst.strokes.map((entry) => entry.id), ['stroke-1', 'stroke-2']);
  const redoSecond = redoDrawAction(redoFirst.strokes, redoFirst.history)!;
  assert.deepEqual(redoSecond.strokes.map((entry) => entry.id), ['stroke-2']);
});

test('a new action after undo clears the redo stack', () => {
  const action = { type: 'draw' as const, index: 0, stroke };
  let history = pushDrawAction(EMPTY_DRAW_HISTORY, action);
  const undone = undoDrawAction([stroke], history)!;
  history = undone.history;
  const next = pushDrawAction(history, { type: 'draw', index: 0, stroke: { ...stroke, id: 'stroke-new' } });
  assert.equal(next.undo.length, 1);
  assert.equal(next.redo.length, 0);
});

test('Y maps monotonically upward and transpose stays bounded', () => {
  const low = yToFrequency(1);
  const middle = yToFrequency(0.5);
  const high = yToFrequency(0);
  assert.ok(low < middle && middle < high);
  assert.ok(yToFrequency(0.5, 12) / middle > 1.9);
  assert.ok(yToFrequency(0.5, -99) > 20);
  assert.ok(yToFrequency(0.5, 99) < 12_000);
});

test('free pitch mode preserves continuous frequency instead of quantizing', () => {
  const free = yToFrequency(0.37, 0, false);
  const snapped = yToFrequency(0.37, 0, true);
  assert.notEqual(free, snapped);
  assert.ok(free > 20 && free < 12_000);
});

test('autosave round-trips unrestricted strokes and all timestamps', () => {
  let saved = '';
  const storage = {
    setItem(key: string, value: string) {
      assert.equal(key, DRAW_STORAGE_KEY);
      saved = value;
    },
    getItem() { return saved || null; },
  };
  saveSession([stroke], storage);
  const restored = loadSession(storage);
  assert.equal(restored.length, 1);
  assert.equal(restored[0].points.length, 3);
  assert.deepEqual(restored, [stroke]);
});

test('malformed or truncated autosave degrades to an empty session', () => {
  const storage = {
    getItem() { return '{not json'; },
    setItem() {},
  };
  assert.deepEqual(loadSession(storage), []);
});
