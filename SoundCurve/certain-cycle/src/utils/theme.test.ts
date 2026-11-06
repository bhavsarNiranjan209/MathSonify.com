/**
 * theme.test.ts — the canvas palettes stay legible in both modes.
 *
 * Regression test for the light-mode Studio: the curve's "core" hairline and
 * the playhead's centre dot were WHITE on a WHITE canvas, so the curve read
 * as two ~1px grey edges and the playhead dot vanished. Light mode now inks
 * a solid black curve; dark mode keeps its outlined white-on-black stroke.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { getCanvasPalette } from './theme';

test('light palette: curve and playhead are solid black on white', () => {
  const p = getCanvasPalette('light');
  assert.equal(p.canvas, '#ffffff');
  // Solid ink: the core is the curve colour, not the canvas colour.
  assert.equal(p.curveCore, p.curve);
  assert.equal(p.liveCore, p.live);
  assert.equal(p.curve, '#000000');
  assert.equal(p.live, '#000000');
});

test('light palette: labels and axes have real contrast', () => {
  const p = getCanvasPalette('light');
  const alphaOf = (c: string) => Number(/([\d.]+)\)$/.exec(c)?.[1] ?? 0);
  assert.ok(alphaOf(p.label) >= 0.7, `label alpha ${p.label} is too faint`);
  assert.ok(alphaOf(p.axis) >= 0.3, `axis alpha ${p.axis} is too faint`);
});

test('dark palette: outlined white curve on black is unchanged', () => {
  const p = getCanvasPalette('dark');
  assert.equal(p.canvas, '#080A0C');
  assert.equal(p.curve, '#FFFFFF');
  // The dark core is the canvas colour — the outlined stroke that reads
  // well on black. This test locks it so the light-mode fix never "fixes"
  // dark mode by accident.
  assert.equal(p.curveCore, p.canvas);
  assert.equal(p.liveCore, p.canvas);
});
