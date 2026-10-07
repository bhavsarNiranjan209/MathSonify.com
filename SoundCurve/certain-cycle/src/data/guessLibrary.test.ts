/**
 * Data-integrity tests for the Guess library.
 *
 * The failure modes here are all silent: a duplicated `id` makes two options
 * collide in React, a `sqrt` sampled outside its domain yields NaN and blanks
 * half the reveal graph, and a family that drifts out of five breaks the
 * same-family distractor guarantee. None of those throw — they just produce a
 * subtly broken game. So they are asserted explicitly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GUESS_LIBRARY, GUESS_FAMILIES, GUESS_FAMILY_ORDER, guessFamilyMembers } from './guessLibrary';
import { CURVE_SAMPLE_COUNT } from '../utils/activeCurve';
import { sampleEquationDetailed } from '../utils/equationParser';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('the library holds 30 equations in 6 families of 5', () => {
  assert.equal(GUESS_LIBRARY.length, 30);
  for (const family of GUESS_FAMILY_ORDER) {
    assert.equal(guessFamilyMembers(family).length, 5, `${family} should have 5 members`);
  }
});

test('every entry is a real object with unique ids and displays', () => {
  const ids = new Set<string>();
  const displays = new Set<string>();
  GUESS_LIBRARY.forEach((eq, i) => {
    assert.ok(eq && typeof eq === 'object', `slot ${i} is sparse`);
    assert.ok(eq.id && !ids.has(eq.id), `duplicate or missing id at slot ${i}: ${eq.id}`);
    ids.add(eq.id);
    assert.ok(eq.display && !displays.has(eq.display), `duplicate or missing display at slot ${i}`);
    displays.add(eq.display);
    assert.ok(GUESS_FAMILIES[eq.family], `unknown family ${eq.family}`);
    assert.ok(['Easy', 'Medium', 'Hard'].includes(eq.difficulty));
    assert.ok(eq.minX < eq.maxX, `${eq.id} has an empty x range`);
    assert.ok(eq.minFreq > 0 && eq.maxFreq > eq.minFreq, `${eq.id} has a bad pitch range`);
  });
});

test('every plot function samples to finite values across its domain', () => {
  // Uses the SAME sampler the game sonifies and draws with, so this proves the
  // real pipeline produces a usable curve — not just that Math.sin works.
  for (const eq of GUESS_LIBRARY) {
    const points = sampleEquationDetailed(eq.plot, eq.minX, eq.maxX, CURVE_SAMPLE_COUNT);
    const valid = points.filter((p) => p.isValid);
    assert.ok(
      valid.length > points.length * 0.9,
      `${eq.id} (${eq.display}) is only valid at ${valid.length}/${points.length} samples — ` +
        'its domain probably leaves a square root or division undefined',
    );
    // A flat curve would map to one pitch and be unanswerable by ear.
    const ys = valid.map((p) => p.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.01, `${eq.id} plots a flat line`);
  }
});

test('the library is self-contained and does not touch the Equations catalog', () => {
  // The spec is explicit that this dataset must not be pulled from, merged with,
  // or reference the main catalog. Asserted against the source text so a future
  // well-meaning "let's reuse that preset" edit fails here.
  const source = read('./guessLibrary.ts');
  assert.doesNotMatch(source, /from '\.\.\/data\/presets'|from '\.\/presets'/, 'must not import the catalog');
  assert.doesNotMatch(source, /PRESETS\b/, 'must not reference PRESETS');
});

test('the Guess game is not wired into the shared studio store', () => {
  // Score, streak and rounds are playthrough-local. Asserting no reference to the
  // studio store keeps it that way — the game must not pollute editor state.
  const source = read('../utils/guessRounds.ts');
  assert.doesNotMatch(source, /studioStore/, 'round building must stay pure');
});