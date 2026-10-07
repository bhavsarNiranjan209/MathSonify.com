import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CELEBRATION_SCORE_THRESHOLD,
  deservesBigCelebration,
  feedbackFor,
  gradeFor,
} from './guessFeedback';

/* ── varied feedback ──────────────────────────────────────────────── */

test('feedback varies across rounds instead of repeating one line', () => {
  // Ten rounds of the same outcome must not read as a form being marked.
  const lines = new Set<string>();
  for (let i = 0; i < 10; i++) lines.add(feedbackFor('correct', i));
  assert.ok(lines.size >= 5, `only ${lines.size} distinct lines across 10 rounds`);
});

test('a near miss reads differently from a genuine miss', () => {
  // The whole point of the three-way split: these are different situations and
  // must not share copy.
  const near = new Set([0, 1, 2, 3, 4].map((i) => feedbackFor('wrong-same-family', i)));
  const miss = new Set([0, 1, 2, 3, 4].map((i) => feedbackFor('wrong-other-family', i)));
  const correct = new Set([0, 1, 2, 3, 4].map((i) => feedbackFor('correct', i)));
  for (const line of near) {
    assert.ok(!miss.has(line), `near and miss share "${line}"`);
    assert.ok(!correct.has(line), `near and correct share "${line}"`);
  }
});

test('feedback selection is stable for a given round', () => {
  // Index-based rather than random, so a re-render cannot flicker the line.
  for (const outcome of ['correct', 'wrong-same-family', 'wrong-other-family'] as const) {
    assert.equal(feedbackFor(outcome, 3), feedbackFor(outcome, 3));
  }
});

test('feedback is stable for large and negative indices', () => {
  // Wraps rather than returning undefined if a caller passes an odd index.
  assert.ok(feedbackFor('correct', 0));
  assert.ok(feedbackFor('correct', 1000));
  assert.ok(feedbackFor('correct', -1));
});

/* ── end-of-game grades ───────────────────────────────────────────── */

test('grades are tiered by score', () => {
  const total = 10;
  // 9-10 is its own band, distinct from 7-8.
  assert.equal(gradeFor(10, total), gradeFor(9, total));
  assert.notEqual(gradeFor(9, total), gradeFor(8, total));
  // 7-8 share a band; 4-6 share another; below 4 is its own.
  assert.equal(gradeFor(8, total), gradeFor(7, total));
  assert.equal(gradeFor(6, total), gradeFor(4, total));
  assert.notEqual(gradeFor(7, total), gradeFor(6, total));
  assert.equal(gradeFor(3, total), gradeFor(0, total));
});

test('the celebration threshold matches the 7+/10 brief', () => {
  assert.equal(CELEBRATION_SCORE_THRESHOLD, 7);
  assert.equal(deservesBigCelebration(7, 10), true);
  assert.equal(deservesBigCelebration(10, 10), true);
  assert.equal(deservesBigCelebration(6, 10), false);
  // No division by zero on a degenerate game length.
  assert.equal(deservesBigCelebration(0, 0), false);
});