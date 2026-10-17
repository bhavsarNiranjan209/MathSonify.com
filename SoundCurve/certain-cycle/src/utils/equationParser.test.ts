/**
 * Tests for `parseEquation`, including the `sum(k=lo, hi, body)` series
 * summation support.
 *
 * `sum()` is an AST transform, not a mathjs builtin: the body stays symbolic
 * so the index can be rebound to each integer on every iteration. These tests
 * lock in that behaviour and guard against regressions in the shared evaluator
 * that every view (2D, 3D, audio, export) depends on.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEquation } from './equationParser';

const evaluate = (equation: string, x: number): number => {
  const res = parseEquation(equation);
  assert.equal(res.success, true, `\"${equation}\" should parse: ${res.error}`);
  assert.ok(res.evaluate, `\"${equation}\" should produce an evaluator`);
  return res.evaluate!(x);
};

/* ── sum() basics ─────────────────────────────────────────────────── */

test('sum(k=1, 5, k) is the triangular number 15', () => {
  assert.equal(evaluate('sum(k=1, 5, k)', 0), 15);
});

test('sum(k=1, 5, k^2) is the square pyramidal number 55', () => {
  assert.equal(evaluate('sum(k=1, 5, k^2)', 0), 55);
});

test('sum(k=1, 5, 2*k+1) sums the odd numbers 3, 5, 7, 9, 11 to 35', () => {
  assert.equal(evaluate('sum(k=1, 5, 2*k + 1)', 0), 35);
});

test('sum(k=1, 3, k^3) sums 1, 8, 27 to 36', () => {
  assert.equal(evaluate('sum(k=1, 3, k^3)', 0), 36);
});

test('sum(k=-2, 2, k) cancels to 0 across the origin', () => {
  assert.equal(evaluate('sum(k=-2, 2, k)', 0), 0);
});

test('sum(k=5, 1, k) with an empty range is 0', () => {
  assert.equal(evaluate('sum(k=5, 1, k)', 0), 0);
});

test('sum(k=1, 5.5, k) floors the non-integer upper bound', () => {
  assert.equal(evaluate('sum(k=1, 5.5, k)', 0), 15);
});

/* ── the bound index is rebound per iteration ─────────────────────── */

test('sum(k=1, x, k) follows x: x=4 gives 10, x=1 gives 1', () => {
  assert.equal(evaluate('sum(k=1, x, k)', 4), 10);
  assert.equal(evaluate('sum(k=1, x, k)', 1), 1);
  assert.equal(evaluate('sum(k=1, x, k)', 0), 0);
});

test('sum(k=1, 3, x*k) scales by x: x=2 gives 12', () => {
  assert.equal(evaluate('sum(k=1, 3, x * k)', 2), 12);
});

/* ── composition ──────────────────────────────────────────────────── */

test('sum combines with ordinary functions: sin(0) + sum(k=1,3,k) = 6', () => {
  assert.equal(evaluate('sin(x) + sum(k=1, 3, k)', 0), 6);
});

test('nested sum: sum(k=1, 3, sum(j=1, k, j)) = 1 + 3 + 6 = 10', () => {
  assert.equal(evaluate('sum(k=1, 3, sum(j=1, k, j))', 0), 10);
});

test('sum in a larger expression: 2 * sum(k=1, 4, k) + 1 = 21', () => {
  assert.equal(evaluate('2 * sum(k=1, 4, k) + 1', 0), 21);
});

/* ── sampling works with sum() ────────────────────────────────────── */

test('sample() yields the summed value at every x', () => {
  const res = parseEquation('sum(k=1, 4, k)');
  assert.equal(res.success, true);
  const points = res.sample!(0, 2, 3);
  // sampleCount=3 means 3 intervals = 4 points (i <= sampleCount).
  assert.equal(points.length, 4);
  assert.ok(points.every((p) => p.isValid && p.y === 10));
});

/* ── invalid sum() is rejected ────────────────────────────────────── */

test('sum() with two arguments does not parse', () => {
  const res = parseEquation('sum(k=1, 5)');
  assert.equal(res.success, false);
  assert.ok(res.error);
});

test('sum() with a non-assignment first argument does not parse', () => {
  const res = parseEquation('sum(k, 1, 5, k)');
  assert.equal(res.success, false);
  assert.ok(res.error);
});

/* ── no regressions for previously-supported equations ────────────── */

test('standard equations still parse and evaluate', () => {
  const cases: Array<[string, number, number]> = [
    ['sin(x)', 0, 0],
    ['cos(x)', 0, 1],
    ['x^2 - 4', 2, 0],
    ['abs(x)', -3, 3],
    ['exp(-x)', 0, 1],
    ['sqrt(9 - x^2)', 0, 3],
    ['tan(x)', 0, 0],
  ];
  for (const [equation, x, expected] of cases) {
    assert.equal(evaluate(equation, x), expected, `${equation} at x=${x}`);
  }
});
