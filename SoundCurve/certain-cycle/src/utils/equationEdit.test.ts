import test from 'node:test';
import assert from 'node:assert/strict';
import { buildVerticalShiftEquation } from './equationParser';

test('buildVerticalShiftEquation keeps a base function and adds a rounded vertical offset', () => {
  assert.equal(buildVerticalShiftEquation('sin(x)', 1.234), 'sin(x) + 1.23');
  assert.equal(buildVerticalShiftEquation('sin(x)', -2.345), 'sin(x) - 2.35');
  assert.equal(buildVerticalShiftEquation('x^2 + 3', 0.004), 'x^2 + 3 + 0.00');
});
