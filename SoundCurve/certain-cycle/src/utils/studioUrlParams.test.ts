/**
 * Regression tests for the shared-link domain parsing.
 *
 * A shared link with minX=0 (Poisson, Equation of the Day and several other
 * scientist equations all start at 0) used to load as -6.28, because the
 * parser used `parseFloat(raw) || fallback` and 0 is falsy. 0 must survive.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseBoundParam } from './studioUrlParams';

test('parseBoundParam keeps a bound of exactly 0', () => {
  assert.equal(parseBoundParam('0', -6.28), 0);
  assert.equal(parseBoundParam('0', 6.28), 0);
});

test('parseBoundParam keeps ordinary bounds', () => {
  assert.equal(parseBoundParam('-6.28', -6.28), -6.28);
  assert.equal(parseBoundParam('6.283', 6.28), 6.283);
  assert.equal(parseBoundParam('8', 6.28), 8);
});

test('parseBoundParam returns null when the param is absent', () => {
  assert.equal(parseBoundParam(null, -6.28), null);
  assert.equal(parseBoundParam('', -6.28), null);
});

test('parseBoundParam falls back only for non-numeric values', () => {
  assert.equal(parseBoundParam('abc', -6.28), -6.28);
  assert.equal(parseBoundParam('abc', 6.28), 6.28);
});
