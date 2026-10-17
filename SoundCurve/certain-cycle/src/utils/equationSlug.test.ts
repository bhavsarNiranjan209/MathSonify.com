/** Slugify edge cases for 3D image export file names. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { equationSlug } from './render3DImage';

test('lowercases and collapses whitespace into hyphens', () => {
  assert.equal(equationSlug('  Y = sin(x)  '), 'y-sinx');
});

test('drops punctuation other than letters, digits, underscore, dot and hyphen', () => {
  assert.equal(equationSlug('f(x) = x^2 + 1'), 'fx-x2-1');
});

test('keeps unicode letters and numeric superscripts', () => {
  assert.equal(equationSlug('y = π · r²'), 'y-π-r²');
});


test('keeps dots for decimal-looking equations', () => {
  assert.equal(equationSlug('y=0.5x+1'), 'y0.5x1');
});

test('falls back to untitled for empty input', () => {
  assert.equal(equationSlug(''), 'untitled');
});

test('keeps leading plus-sign-free names and strips surrounding hyphens', () => {
  assert.equal(equationSlug('- - y = x -'), 'y-x');
});
