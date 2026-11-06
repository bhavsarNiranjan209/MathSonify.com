/**
 * tickLabels.test.ts — the edge labels stay fully on-canvas.
 *
 * Regression test for the light-mode Studio screenshot where the top y-label
 * ("1.2") and the bottom y-labels ("-18.6", "-25.4") were drawn half outside
 * the graph frame and clipped by the panel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { clampTickLabelX, clampTickLabelY } from './tickLabels';

test('top y-label baseline is pushed down onto the canvas', () => {
  // The top tick sits at y = 0; its label is drawn at baseline 3.
  assert.equal(clampTickLabelY(3, 400), 9);
  // A label already on-canvas is untouched.
  assert.equal(clampTickLabelY(200, 400), 200);
});

test('bottom y-label baseline is pulled up onto the canvas', () => {
  // The bottom tick sits at y = height; its label is drawn at baseline height + 3.
  assert.equal(clampTickLabelY(403, 400), 398);
});

test('x-labels near the left/right edges are pulled inside', () => {
  assert.equal(clampTickLabelX(0, 12, 600), 14);
  assert.equal(clampTickLabelX(600, 12, 600), 586);
  assert.equal(clampTickLabelX(300, 12, 600), 300);
});
