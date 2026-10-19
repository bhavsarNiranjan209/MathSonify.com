import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';

import { parseEquation, sanitizeEquationString } from './equationParser';

/**
 * Evaluator edge cases: the semantics that shipped catalogues never exercise
 * but users will. Two kinds of row:
 *
 *   - LITERAL rows: the decided semantics, asserted directly (these pin down
 *     app decisions like the NaN gap or the numeric 1/0 logical contract).
 *   - ORACLE rows: must equal mathjs compiled.evaluate (test-only) at the
 *     listed points, within 1e-12 relative. mathjs semantics ARE the spec for
 *     anything not explicitly decided above (mod sign, rounding, associativity…).
 *
 * `sum(k=…)` never uses the oracle: mathjs's variadic `sum` reads
 * `sum(k=1,3,k)` as summing the values 1, 3 and k — a different operator from
 * the symbolic-bound Σ this evaluator implements — so those rows are literal.
 */

const REL = 1e-12;

/** Parses or fails the test loudly — every row here must parse. */
function ours(equation: string): (x: number) => number {
  const parsed = parseEquation(equation);
  assert.ok(parsed.success && parsed.evaluate, `expected "${equation}" to parse, got: ${parsed.error}`);
  return parsed.evaluate;
}

/** mathjs reference evaluator over the same sanitized string. */
function oracle(equation: string): (x: number) => number {
  const compiled = parse(sanitizeEquationString(equation)).compile();
  return (x) =>
    Number(compiled.evaluate({ x, pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E, tau: 2 * Math.PI }));
}

function assertPoint(actual: number, expected: number, equation: string, x: number): void {
  if (Number.isNaN(expected)) {
    assert.ok(Number.isNaN(actual), `"${equation}" @x=${x}: expected the NaN gap, got ${actual}`);
    return;
  }
  assert.ok(
    Math.abs(actual - expected) <= REL * Math.max(1, Math.abs(expected)),
    `"${equation}" @x=${x}: expected ${expected}, got ${actual}`,
  );
}

/** Asserts decided (literal) semantics for each equation at each point. */
function checkLiterals(rows: { equation: string; at: [number, number][] }[]): void {
  for (const row of rows) {
    const fn = ours(row.equation);
    for (const [x, expected] of row.at) assertPoint(fn(x), expected, row.equation, x);
  }
}

/** Asserts mathjs parity for each equation at each listed x. */
function checkAgainstOracle(rows: { equation: string; xs: number[] }[]): void {
  for (const row of rows) {
    const fn = ours(row.equation);
    const ref = oracle(row.equation);
    for (const x of row.xs) {
      const a = fn(x);
      const b = ref(x);
      if (Number.isNaN(b)) {
        assert.ok(Number.isNaN(a), `"${row.equation}" @x=${x}: oracle is NaN, ours is ${a}`);
      } else {
        assertPoint(a, b, row.equation, x);
      }
    }
  }
}

/* ── Implicit multiplication ─────────────────────────────────────────── */
test('implicit multiplication: 2x, 3(x+1), x(x-1) and friends', () => {
  checkLiterals([
    { equation: '2x', at: [[3, 6], [-2, -4]] },
    { equation: '3(x+1)', at: [[2, 9], [-1, 0]] },
    { equation: 'x(x-1)', at: [[3, 6], [0, 0], [-2, 6]] },
    { equation: '2x^2', at: [[3, 18]] },
    { equation: 'x sin(x)', at: [[0, 0]] }, // sanitized to x*sin(x); value at 0 is 0*0
    { equation: '4x + 2x', at: [[1, 6]] },
  ]);
  checkAgainstOracle([
    { equation: '2x cos(x)', xs: [0.5, 1, -1.5] },
    { equation: '3(x+1)(x-1)', xs: [2, -0.5] },
  ]);
});

/* ── Precedence ──────────────────────────────────────────────────────── */
test('precedence: -x^2 binds as -(x^2), 2^-x, -2^2', () => {
  checkLiterals([
    { equation: '-x^2', at: [[3, -9], [-2, -4]] },   // NOT (-x)^2 = 9
    { equation: '2^-x', at: [[1, 0.5], [2, 0.25]] },
    { equation: '-2^2', at: [[0, -4]] },             // -(2^2), not (-2)^2
    { equation: '-x^2 + 2x', at: [[1, 1]] },
    { equation: '2^3^2', at: [[0, 512]] },           // right-associative: 2^(3^2)
  ]);
  checkAgainstOracle([
    { equation: 'x - 2 - 3', xs: [1, 10] },          // left-associative: (x-2)-3
    { equation: '2 * 3 + 4 * 5', xs: [0, 1] },
    { equation: '-x * 2', xs: [3, -3] },
  ]);
});

/* ── Factorial, mod, % ───────────────────────────────────────────────── */
test('factorial: integers via gamma-consistent mathjs semantics', () => {
  checkLiterals([
    { equation: '5!', at: [[0, 120]] },
    { equation: '0!', at: [[0, 1]] },
    { equation: '(2+3)!', at: [[0, 120]] },
  ]);
  checkAgainstOracle([
    { equation: 'x!', xs: [3, 4] },        // integer domain only: x! at 3.5 differs by gamma convention
    { equation: '(x+1)!', xs: [2, 3] },
  ]);
});

test('mod and %: sign conventions match mathjs mod', () => {
  checkAgainstOracle([
    { equation: 'mod(x, 3)', xs: [-7, -3, 0, 4, 8] },
    { equation: 'x % 3', xs: [-7, 4, 8] },
    { equation: 'mod(x, -3)', xs: [7, -7] },
    { equation: 'x % x', xs: [0] },        // 0 % 0 -> NaN on both sides
  ]);
});

/* ── Ternary & comparisons ───────────────────────────────────────────── */
test('ternary: branches, nesting, numeric truth', () => {
  checkLiterals([
    { equation: 'x > 0 ? 1 : 0', at: [[1, 1], [-1, 0], [0, 0]] },
    { equation: 'x > 0 ? x : -x', at: [[2, 2], [-3, 3]] },     // abs via ternary
    { equation: 'x > 1 ? (x > 2 ? 3 : 2) : 1', at: [[0, 1], [1.5, 2], [2.5, 3]] },
    { equation: 'x == 0 ? 0 : 1/x', at: [[0, 0], [2, 0.5]] },  // lazy: 1/0 never evaluated
  ]);
  checkAgainstOracle([
    { equation: 'x <= 0 ? -x : x', xs: [-1, 0, 1] },
    { equation: '(x > 0 ? 1 : 2) + (x < 0 ? 10 : 20)', xs: [-1, 1] },
  ]);
});
test('comparisons: >, <, >=, <=, ==, != all yield 1/0', () => {
  checkLiterals([
    { equation: 'x > 0', at: [[1, 1], [-1, 0], [0, 0]] },
    { equation: 'x < 0', at: [[-1, 1], [1, 0]] },
    { equation: 'x >= 1', at: [[1, 1], [0.999, 0]] },
    { equation: 'x <= -1', at: [[-1, 1], [0, 0]] },
    { equation: 'x == 2', at: [[2, 1], [3, 0]] },
    { equation: 'x != 2', at: [[3, 1], [2, 0]] },
    { equation: '(x > 0) * (x < 2)', at: [[1, 1], [3, 0]] },    // boolean AND via multiply
  ]);
});

/* ── Logical operators and functions ─────────────────────────────────── */
test('and/or/xor/not: keywords and functions, numeric contract', () => {
  // mathjs spells logical AND/OR as the `and`/`or` keywords (its parser
  // rejects C-style `&&`/`||`) and NOT as a prefix `!` — `not(x)` is the
  // function form. Rows use only syntax the parser accepts.
  checkLiterals([
    { equation: '(x > 0) and (x < 2)', at: [[1, 1], [3, 0]] },
    { equation: '(x > 0) or (x < -2)', at: [[1, 1], [-3, 1], [0, 0]] },
    { equation: 'not(x > 0)', at: [[1, 0], [-1, 1]] },
    { equation: 'and(x > 0, x < 2)', at: [[1, 1], [3, 0]] },
    { equation: 'or(x > 0, x < -2)', at: [[-3, 1], [0, 0]] },
    { equation: 'xor(x > 0, x > 1)', at: [[0.5, 1], [1.5, 0], [0, 0]] }, // at 1.5 both sides true -> xor false (oracle-verified)
    { equation: 'not(not(x > 0))', at: [[1, 1], [-1, 0]] },
    { equation: 'x > 0 and x != 1', at: [[0.5, 1], [1, 0], [2, 1]] },
  ]);
  checkAgainstOracle([
    { equation: '(x > 0) and (x != 1)', xs: [0.5, 1, 2] },
    { equation: 'x < 0 or x > 2', xs: [-1, 1, 3] },
    { equation: 'xor(x > 0, x > 1)', xs: [-1, 0.5, 1.5] }, // both-true -> false, regression guard
  ]);
});

/* ── sign / floor / ceil / round ─────────────────────────────────────── */
test('sign/floor/ceil/round on negatives and halves', () => {
  checkAgainstOracle([
    { equation: 'sign(x)', xs: [-2.5, 0, 2.5] },
    { equation: 'floor(x)', xs: [-1.5, 0.5, 2] },
    { equation: 'ceil(x)', xs: [-1.5, 0.5, 2] },
    { equation: 'round(x)', xs: [-2.5, -0.5, 0.5, 2.5] },
    { equation: 'sign(x) * floor(abs(x))', xs: [-3.2, 4.7] },
    { equation: 'ceil(x) - x', xs: [-1.2, 0.3] },
  ]);
  checkLiterals([
    { equation: 'sign(-2.5)', at: [[0, -1]] },
    { equation: 'floor(-1.5)', at: [[0, -2]] },
    { equation: 'ceil(1.2)', at: [[0, 2]] },
  ]);
});

/* ── Roots, logs, bases ──────────────────────────────────────────────── */
test('nthRoot/cbrt/log with explicit base', () => {
  checkLiterals([
    { equation: 'cbrt(8)', at: [[0, 2]] },
    { equation: 'cbrt(-8)', at: [[0, -2]] },        // real cube root of a negative
    { equation: 'nthRoot(27, 3)', at: [[0, 3]] },
    { equation: 'nthRoot(16, 4)', at: [[0, 2]] },
    { equation: 'log(8, 2)', at: [[0, 3]] },        // log base 2
    { equation: 'log(1000, 10)', at: [[0, 3]] },
  ]);
  checkAgainstOracle([
    { equation: 'nthRoot(x, 3)', xs: [8, 27] },
    { equation: 'log(x, 2)', xs: [4, 16] },
  ]);
});

/* ── The decided NaN gap ─────────────────────────────────────────────── */
test('sqrt/log of negatives is a NaN gap (decided and asserted)', () => {
  // DECISION: the real domain only. No complex results — sqrt/log of a
  // negative is NaN, which the graph renders as a gap. (mathjs in its default
  // app configuration would return a Complex for `sqrt(-1)`; we never do.)
  //
  // A CONSTANT NaN equation (`sqrt(-1)`) is rejected outright by the sample
  // validator — there is nothing to draw — so the gap is asserted on the
  // domain rows, where other points are finite and parsing succeeds.
  checkLiterals([
    { equation: 'sqrt(x)', at: [[-4, NaN], [4, 2]] },
    { equation: 'log(x)', at: [[-1, NaN], [1, 0]] },
    { equation: 'sqrt(-x)', at: [[1, NaN], [-1, 1]] },
    { equation: 'sqrt(x) + x', at: [[-9, NaN], [4, 6]] },
  ]);
  // The rejection itself is part of the contract: normal error, never a value.
  for (const constantNaN of ['sqrt(-1)', 'log(-1)', 'sqrt(0-4)']) {
    const parsed = parseEquation(constantNaN);
    assert.equal(parsed.success, false, `"${constantNaN}" must be rejected, not evaluated`);
    assert.equal(parsed.evaluate, undefined, `"${constantNaN}" must never expose an evaluator`);
    assert.ok(parsed.error && parsed.error.length > 0, 'a friendly error is always present');
  }
  checkAgainstOracle([
    { equation: 'sqrt(x) + log(x)', xs: [0.5, 4] },  // log(0.5) fine, sqrt fine
    { equation: 'sin(x) / sqrt(x)', xs: [0.25, 1] },
  ]);
});

/* ── Constants ───────────────────────────────────────────────────────── */
test('constants: pi, e, tau (both cases, tau = 2pi)', () => {
  checkLiterals([
    { equation: 'pi', at: [[0, Math.PI]] },
    { equation: 'PI', at: [[0, Math.PI]] },
    { equation: 'e', at: [[0, Math.E]] },
    { equation: 'E', at: [[0, Math.E]] },
    { equation: 'tau', at: [[0, 2 * Math.PI]] },
    { equation: 'tau / 2', at: [[0, Math.PI]] },
    { equation: 'sin(tau)', at: [[0, Math.sin(2 * Math.PI)]] },
    { equation: 'e^x', at: [[0, 1], [1, Math.E]] },
  ]);
  checkAgainstOracle([
    { equation: 'sin(pi*x)', xs: [0.5, 1, 2] },
    { equation: 'cos(x) + e^-x', xs: [0, 1] },
  ]);
});

/* ── sum(): nested, empty, reversed ──────────────────────────────────── */
test('nested sum(): inner bound may reference the outer index', () => {
  // Σ_{k=1..3} Σ_{j=1..k} j = 1 + (1+2) + (1+2+3) = 10. Literal by design:
  // mathjs's variadic sum is a different operator, so no oracle here.
  checkLiterals([
    { equation: 'sum(k=1, 3, sum(j=1, k, j))', at: [[0, 10]] },
    { equation: 'sum(k=1, 4, sum(j=1, 4, k))', at: [[0, 40]] },  // inner adds k four times: 4·(1+2+3+4)
    { equation: 'sum(k=0, 5, sum(j=0, 0, 1))', at: [[0, 6]] },    // inner runs once per k
  ]);
});

test('sum() with empty or reversed bounds is the empty sum, 0', () => {
  checkLiterals([
    { equation: 'sum(k=5, 4, k)', at: [[0, 0]] },    // empty: lo > hi
    { equation: 'sum(k=10, 2, k)', at: [[0, 0]] },   // reversed
    { equation: 'sum(k=3, 3, k)', at: [[0, 3]] },    // exactly one term
    { equation: 'sum(k=1, 5, k)', at: [[0, 15]] },   // sanity: 1+2+3+4+5
    { equation: 'sum(k=1, 5, k) + 1', at: [[0, 16]] },
    { equation: 'sum(k=1, 4, x*k)', at: [[2, 20]] }, // bound body may use x: 2*(1+2+3+4)
  ]);
});

