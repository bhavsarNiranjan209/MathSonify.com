/**
 * Guard behaviour: the three caps (expression length, AST nesting depth, sum()
 * iterations) must fail FAST with a friendly, human message and never hand
 * back an evaluator — so sum(k=0, 1e9, k) cannot freeze the tab.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEquation } from './equationParser';

test('length cap: over 1000 characters is refused before parsing', () => {
  // Exactly 1000 characters still parses…
  const atCap = parseEquation('sin(x)' + ' '.repeat(994));
  assert.equal(atCap.success, true, atCap.error);

  // …one more character fails with the friendly length message.
  const overCap = parseEquation('sin(x)' + ' '.repeat(995));
  assert.equal(overCap.success, false);
  assert.match(overCap.error!, /too long/i);
  assert.match(overCap.error!, /1,000/);
  assert.equal(overCap.evaluate, undefined);

  // A long hostile payload is stopped by length, never even parsed.
  const hostile = parseEquation('constructor(1) && ' + 'x'.repeat(5000));
  assert.equal(hostile.success, false);
  assert.match(hostile.error!, /too long/i);
  assert.equal(hostile.evaluate, undefined);
});

test('depth cap: 64 levels of nesting, friendly message, no evaluator', () => {
  // 80 nested parentheses — past the cap…
  const deep = parseEquation('('.repeat(80) + 'x' + ')'.repeat(80));
  assert.equal(deep.success, false);
  assert.match(deep.error!, /nests deeper/i);
  assert.equal(deep.evaluate, undefined);

  // …60 is comfortably under it and still works.
  const shallow = parseEquation('('.repeat(60) + 'x' + ')'.repeat(60));
  assert.equal(shallow.success, true, shallow.error);
  assert.equal(shallow.evaluate!(2), 2);

  // Depth counts every node, not just parentheses: nested calls trip it too.
  // (Each `sin(...)` group contributes one level; the cap is 64.)
  const deepCalls = parseEquation('sin('.repeat(70) + 'x' + ')'.repeat(70));
  assert.equal(deepCalls.success, false);
  assert.match(deepCalls.error!, /nests deeper/i);
  const shallowCalls = parseEquation('sin('.repeat(30) + 'x' + ')'.repeat(30));
  assert.equal(shallowCalls.success, true, shallowCalls.error);

  // Normal equations — including nested sum() — stay far under the cap.
  const normal = parseEquation('sum(k=1, 3, sum(j=1, k, sin(j*x))) + cos(x)');
  assert.equal(normal.success, true, normal.error);
});

test('sum() iteration cap: 10,000 terms, friendly error, no freeze', () => {
  const started = Date.now();
  const big = parseEquation('sum(k=0, 1e9, k)');
  const elapsed = Date.now() - started;
  assert.equal(big.success, false);
  assert.match(big.error!, /sum\(\)/i);
  assert.match(big.error!, /limit/i);
  assert.equal(big.evaluate, undefined);
  assert.ok(elapsed < 2000, `the guard must fail fast — took ${elapsed}ms`);

  // Bounds that only become huge for some x are caught on the probe points…
  const xBound = parseEquation('sum(k=0, 1e6*x, k)');
  assert.equal(xBound.success, false);
  assert.match(xBound.error!, /limit/i);

  // …and the cap composes with the rest of an expression.
  const composed = parseEquation('sum(k=1, 20000, k) + sin(x)');
  assert.equal(composed.success, false);
  assert.match(composed.error!, /limit/i);
});

test('sum() boundary: exactly 10,000 terms is allowed, 10,001 is not', () => {
  const atCap = parseEquation('sum(k=1, 10000, k)');
  assert.equal(atCap.success, true, atCap.error);
  assert.equal(atCap.evaluate!(0), 50005000);

  const overCap = parseEquation('sum(k=0, 10000, k)'); // 10 001 terms
  assert.equal(overCap.success, false);
  assert.match(overCap.error!, /limit/i);

  // The shipped shapes of sum() are nowhere near the cap and unchanged.
  const small = parseEquation('sum(k=1, 20, sin(k*x)/k)');
  assert.equal(small.success, true, small.error);
  assert.ok(Math.abs(small.evaluate!(1) - Math.sin(1)) < 1); // finite, sane
});
