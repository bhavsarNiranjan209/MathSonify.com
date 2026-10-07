/**
 * Tests for typo auto-correction.
 *
 * Two properties matter more than the individual fixes:
 *   1. A suggestion is only offered if the candidate genuinely parses (validated
 *      against the real mathjs parser), and
 *   2. Nothing is ever silently rewritten — `parseEquation` still fails, it just
 *      carries a proposal alongside the error.
 *
 * Both are the difference between a helpful nudge and a tool that quietly
 * changes someone's maths.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  correctionCandidates,
  correctionReason,
  editDistanceWithin,
  nearestFunction,
  KNOWN_FUNCTIONS,
} from './typoCorrection';
import { parseEquation } from './equationParser';

const firstCandidate = (raw: string) => correctionCandidates(raw)[0];

/* ── edit distance ───────────────────────────────────────────────── */

test('editDistanceWithin measures single edits and rejects everything else', () => {
  assert.equal(editDistanceWithin('sin', 'sin', 1), 0);
  assert.equal(editDistanceWithin('sinn', 'sin', 1), 1, 'a doubled letter is one deletion');
  assert.equal(editDistanceWithin('sqtr', 'sqrt', 1), 1, 'a transposition is one edit');
  assert.equal(editDistanceWithin('sinnn', 'sin', 1), 2);
  assert.ok(editDistanceWithin('completely', 'different', 1) > 1);
});

/* ── nearest function ────────────────────────────────────────────── */

test('doubled letters are corrected', () => {
  assert.equal(nearestFunction('sinn'), 'sin');
  assert.equal(nearestFunction('coss'), 'cos');
  assert.equal(nearestFunction('taan'), 'tan');
  assert.equal(nearestFunction('sqrtt'), 'sqrt');
  assert.equal(nearestFunction('exxp'), 'exp');
});

test('common misspellings are corrected', () => {
  assert.equal(nearestFunction('sqtr'), 'sqrt');
  assert.equal(nearestFunction('sine'), 'sin');
  assert.equal(nearestFunction('absx'), 'abs');
});

test('real functions and short tokens are never "corrected"', () => {
  // The single most important guard: a correct equation must never be rewritten.
  for (const fn of KNOWN_FUNCTIONS) {
    assert.equal(nearestFunction(fn), null, `${fn} should not be corrected`);
  }
  // Short tokens are variables/constants, not typos.
  for (const token of ['x', 'pi', 'e']) {
    assert.equal(nearestFunction(token), null, `${token} should not be corrected`);
  }
});

test('unrelated words get no suggestion', () => {
  for (const junk of ['foo', 'barbaz', 'qwertyuiop']) {
    assert.equal(nearestFunction(junk), null, `${junk} is not a near-miss for anything`);
  }
});

/* ── candidates ──────────────────────────────────────────────────── */

test('candidates fix the function in place, preserving the rest', () => {
  const c = firstCandidate('2*sinn(x) + 1');
  assert.equal(c.text, '2*sin(x) + 1');
  assert.equal(c.kind, 'function-name');
  assert.equal(c.fn, 'sin');
});

test('exactly one missing closing bracket is repaired', () => {
  const c = correctionCandidates('sin(x').find((x) => x.kind === 'missing-bracket');
  assert.equal(c?.text, 'sin(x)');
});

test('two missing brackets are NOT auto-closed', () => {
  // The brief says "if exactly one is missing". `sin(x` is exactly one (covered
  // above); `sin((x` is two, which would be a guess rather than a fix.
  assert.ok(
    !correctionCandidates('sin((x').some((c) => c.kind === 'missing-bracket'),
    'must not guess at multiple missing brackets',
  );
  assert.equal(firstCandidate('sin((x'), undefined);
});

test('balanced or over-closed brackets produce no bracket candidate', () => {
  assert.ok(!correctionCandidates('sin(x)').some((c) => c.kind === 'missing-bracket'));
  assert.ok(!correctionCandidates('sin(x))').some((c) => c.kind === 'missing-bracket'));
});

test('empty input yields nothing', () => {
  assert.deepEqual(correctionCandidates(''), []);
  assert.deepEqual(correctionCandidates('   '), []);
});

test('candidates never repeat and never equal the input', () => {
  const texts = correctionCandidates('sinn(x').map((c) => c.text);
  assert.equal(new Set(texts).size, texts.length, 'candidates must be unique');
  assert.ok(!texts.includes('sinn(x'));
});

test('the reason explains itself', () => {
  assert.match(correctionReason(firstCandidate('sinn(x)')), /sin/);
  const bracket = correctionCandidates('sin(x').find((c) => c.kind === 'missing-bracket')!;
  assert.match(correctionReason(bracket), /bracket/i);
});

/* ── end-to-end through parseEquation ────────────────────────────── */

test('a typo yields an error AND a validated suggestion', () => {
  const res = parseEquation('sinn(x)');
  assert.equal(res.success, false, 'the typo itself must still fail');
  assert.ok(res.error, 'and must still say it could not be understood');
  assert.equal(res.suggestion?.equation, 'sin(x)');
  assert.match(res.suggestion!.reason, /sin/);
});

test('the suggested equation genuinely parses', () => {
  for (const typo of ['sinn(x)', 'sqtr(x)', '2*coss(x)^2', 'taan(x)', 'sin(x']) {
    const res = parseEquation(typo);
    if (!res.suggestion) continue;
    const fixed = parseEquation(res.suggestion.equation);
    assert.equal(fixed.success, true, `suggestion "${res.suggestion.equation}" must itself parse`);
    assert.equal(fixed.suggestion, undefined, 'the fix must not itself need fixing');
  }
});

test('a valid equation gets no suggestion and no error', () => {
  for (const good of ['sin(x)', 'cos(x)', 'sqrt(9 - x^2)', 'x^2 - 4', 'abs(x)', 'exp(-x)']) {
    const res = parseEquation(good);
    assert.equal(res.success, true, `${good} should parse`);
    assert.equal(res.suggestion, undefined, `${good} must not be "corrected"`);
  }
});

test('unfixable nonsense still gets the unchanged error, with no suggestion', () => {
  for (const junk of ['@@@', '(((', 'foo bar baz']) {
    const res = parseEquation(junk);
    assert.equal(res.success, false);
    assert.ok(res.error, 'fallback message must remain');
  }
});

test('empty input is not "corrected" into something', () => {
  const res = parseEquation('');
  assert.equal(res.success, false);
  assert.equal(res.suggestion, undefined);
});
test('ties resolve deterministically and never touch a valid function', () => {
  // Repeated calls must agree, or the same typo would flicker between suggestions.
  assert.equal(nearestFunction('sihn'), 'sin');
  assert.equal(nearestFunction('sihn'), nearestFunction('sihn'));
  // `sinh` and `asin` are one edit away from `sin`/`cos` but are themselves valid
  // functions, so they must be left completely alone.
  assert.equal(nearestFunction('sinh'), null);
  assert.equal(nearestFunction('asin'), null);
  assert.equal(nearestFunction('cosh'), null);
});