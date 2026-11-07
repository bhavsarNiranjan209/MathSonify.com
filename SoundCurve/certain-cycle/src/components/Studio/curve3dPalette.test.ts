/**
 * Regression test for the 3D graph in light mode.
 *
 * The first light palette was a black tube (0x14161a) with zero emissive on
 * a shadow-only floor — a thin black worm in a faint grey cage. It read as
 * broken in the light-mode screenshot. Light mode is designed on its own
 * terms now: green curve (was brass #C9A24B until Nov 7, when the user asked
 * for green), real glow, readable grid, paper floor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { curve3DPalette } from '../../utils/curve3dPalette';

test('light: the curve is green (#15803d), with a real glow', () => {
  const light = curve3DPalette(false);
  assert.equal(light.tube, 0x15803d);
  assert.equal(light.emissive, 0x15803d);
  assert.ok(light.emissiveI > 0, 'emissive intensity must be > 0 in light mode');
  assert.equal(light.head, 0x15803d);
});

test('light: the tube is thicker than dark, so it reads as an object', () => {
  const light = curve3DPalette(false);
  const dark = curve3DPalette(true);
  assert.ok(light.tubeR > dark.tubeR, `light tubeR ${light.tubeR} must exceed dark ${dark.tubeR}`);
});

test('light: the grid and box actually read on paper', () => {
  const light = curve3DPalette(false);
  assert.ok(light.gridOp >= 0.45, `gridOp ${light.gridOp} is too faint`);
  assert.ok(light.wallOp >= 0.3, `wallOp ${light.wallOp} is too faint`);
  assert.ok(light.boxOp >= 0.65, `boxOp ${light.boxOp} is too faint`);
});

test('light: the floor is a filled warm paper, not a shadow catcher', () => {
  const light = curve3DPalette(false);
  // 0xf7f4ef — clearly a light paper colour, not black (0) or near-black.
  assert.ok(light.floor > 0xf0f0f0, `floor 0x${light.floor.toString(16)} is not a paper colour`);
});

test('dark: unchanged — white tube, blue glow, near-black floor', () => {
  const dark = curve3DPalette(true);
  assert.equal(dark.tube, 0xffffff);
  assert.equal(dark.emissive, 0x9db4ff);
  assert.equal(dark.floor, 0x0a0a0c);
  assert.equal(dark.tubeR, 0.04);
});
