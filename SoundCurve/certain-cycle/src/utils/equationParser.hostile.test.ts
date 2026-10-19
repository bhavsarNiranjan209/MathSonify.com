import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEquation } from './equationParser';

/**
 * Hostile input must behave like ANY other unparseable equation: the normal
 * "couldn't understand" error, a suggestion flow that never executes
 * anything, and NO evaluator — `parseEquation` must never hand back a
 * function for these, at any nesting depth.
 *
 * Every entry here is parsed happily by mathjs itself (verified against
 * mathjs 15 at the time of writing): only this evaluator's explicit
 * allowlist (a `Map` of named functions, an `Object.hasOwn` check on the
 * binary operators, an own-property check on the scope) stands between them
 * and evaluation. The list mirrors the audit's hostile set exactly, plus
 * nested/obfuscated variants — the allowlist walk is recursive, so trouble
 * hiding under `sin(...)`, `+` or `sum(...)` must be caught just the same.
 */
const HOSTILE = [
  'constructor(1)',
  '__proto__',
  'toString(1)',
  'hasOwnProperty("x")',
  'valueOf',
  'this',
  'x.constructor',
  '[1,2][0]',
  'a=1',
  'f(x)=x',
  'eval(x)',
  'Function(x)',
  'import(x)',
  // nested / obfuscated variants
  'sin(x.constructor)',
  '2 + constructor(1)',
  'sum(k=1,3,k)*toString(1)',
  'this + 1',
  'x.__proto__',
  'x + valueOf',
  'cos(__proto__) + 1',
];

const NORMAL_ERROR = "couldn't understand";

test('hostile input gets the normal error and never an evaluator', () => {
  for (const eq of HOSTILE) {
    const res = parseEquation(eq);
    assert.equal(res.success, false, `"${eq}" must be rejected`);
    assert.ok(
      res.error && res.error.includes(NORMAL_ERROR),
      `"${eq}" must get the normal "${NORMAL_ERROR}" error, got: ${res.error}`,
    );
    assert.equal(res.evaluate, undefined, `"${eq}" must never expose an evaluator`);
    assert.equal(res.sample, undefined, `"${eq}" must never expose a sampler`);
  }
});

test('hostile input never evaluates — no value ever comes back', () => {
  // Belt and braces: even reaching for a value must be impossible, because
  // ParseResult without `evaluate`/`sample` is the only surface the app uses.
  for (const eq of HOSTILE) {
    const res = parseEquation(eq);
    assert.equal('evaluate' in res && res.evaluate !== undefined, false, `"${eq}" leaked evaluate`);
  }
});

test('the allowlist is a real allowlist: valid equations still parse', () => {
  // The rejection list must not eat legitimate traffic — including every
  // shape the edge-case matrix and shipped catalogues rely on.
  for (const eq of [
    'sin(x)',
    'x(x-1)',
    '3(x+1)',
    '2x',
    'sum(k=1, 10, k)',
    'sum(k=1, 5, sin(k*x)/k)',
    'x>0 and x<1',
    'not(x>1)',
    'xor(1, 0)',
    'x>0 ? 1 : -1',
    'x!',
    'nthRoot(x, 3)',
    'log(x, 2)',
    'pi*x + e',
    'tau/2',
    'sin(pi*x) + cos(tau*x)',
  ]) {
    const res = parseEquation(eq);
    assert.ok(res.success && res.evaluate, `"${eq}" must still parse: ${res.error}`);
  }
});

test('unknown symbols are refused like any other hostile name', () => {
  // `a`, `y`, `foo` are not in the symbol allowlist — they get the normal
  // error too (previously a distinct "unsupported variables" message).
  for (const eq of ['a', 'y+1', 'foo(x)', 'x and y']) {
    const res = parseEquation(eq);
    assert.equal(res.success, false, `"${eq}" must be rejected`);
    assert.ok(res.error && res.error.includes(NORMAL_ERROR), `"${eq}" got: ${res.error}`);
  }
});
