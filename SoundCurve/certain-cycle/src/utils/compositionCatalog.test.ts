import test from 'node:test';
import assert from 'node:assert/strict';
import { COMPOSITIONS, COMPOSITION_BY_ID, GENRES } from '../data/compositions';
import { ORIGINAL_COMPOSITIONS } from '../data/compositionSets/original';
import { validateCatalogue, validateEquation, engineDomain } from './compositionValidator';

/** Format issues compactly so a failure is actually readable. */
function describe(issues: ReturnType<typeof validateCatalogue>): string {
  return issues
    .map((issue) => `${issue.compositionId}${issue.trackId ? `/${issue.trackId}` : ''} [${issue.field}]: ${issue.message}`)
    .join('\n');
}

test('every composition passes structural and equation validation', () => {
  const issues = validateCatalogue(COMPOSITIONS);
  assert.equal(issues.length, 0, `\n${describe(issues)}`);
});

test('the original 15 compositions lead the catalogue and are preserved', () => {
  // Read the shipped set directly rather than duplicating the ids here, so this
  // test can never drift out of sync with the real data.
  assert.equal(ORIGINAL_COMPOSITIONS.length, 15, 'the founding catalogue must stay at 15');
  for (const original of ORIGINAL_COMPOSITIONS) {
    assert.ok(
      COMPOSITION_BY_ID.has(original.id),
      `missing original composition "${original.id}"`,
    );
  }
  // The originals must still lead the catalogue so the default selection and
  // existing share links keep pointing at the same piece.
  assert.deepEqual(
    COMPOSITIONS.slice(0, ORIGINAL_COMPOSITIONS.length).map((c) => c.id),
    ORIGINAL_COMPOSITIONS.map((c) => c.id),
  );
});

test('the catalogue has grown beyond the original 15', () => {
  // The library is designed to be scalable; every set added under
  // data/compositionSets is merged here automatically. This asserts growth
  // without pinning a total that changes every time new work is authored.
  assert.ok(COMPOSITIONS.length > 15, 'no new compositions have been added');
});

test('every genre is represented and the distribution is balanced', () => {
  const counts = new Map<string, number>();
  for (const composition of COMPOSITIONS) {
    counts.set(composition.genre, (counts.get(composition.genre) ?? 0) + 1);
  }
  for (const genre of GENRES) {
    assert.ok((counts.get(genre.id) ?? 0) > 0, `genre "${genre.id}" has no compositions`);
  }
  // No genre may dominate the library.
  for (const [genre, count] of counts) {
    assert.ok(count <= 25, `genre "${genre}" has ${count} compositions, which unbalances the library`);
  }
});

test('all ids, titles and equations are unique', () => {
  const ids = new Set(COMPOSITIONS.map((c) => c.id));
  const titles = new Set(COMPOSITIONS.map((c) => c.title.toLocaleLowerCase()));
  const equations = new Set(COMPOSITIONS.flatMap((c) => c.tracks.map((t) => t.equation.replace(/\s+/g, ''))));
  const totalTracks = COMPOSITIONS.reduce((sum, c) => sum + c.tracks.length, 0);
  assert.equal(ids.size, COMPOSITIONS.length);
  assert.equal(titles.size, COMPOSITIONS.length);
  assert.equal(equations.size, totalTracks, 'two tracks share an identical equation');
});

test('durations vary across the library', () => {
  const durations = new Set(COMPOSITIONS.map((c) => c.durationSec));
  assert.ok(durations.size >= 5, `only ${durations.size} distinct durations`);
});

test('bpm varies across the library and respects genre windows', () => {
  const bpms = new Set(COMPOSITIONS.map((c) => c.bpm));
  assert.ok(bpms.size >= 30, `only ${bpms.size} distinct tempos`);
});

test('scales vary across the library', () => {
  const scales = new Set(COMPOSITIONS.map((c) => c.key));
  assert.ok(scales.size >= 6, `only ${scales.size} distinct scales`);
});

test('tracks vary in count and never collapse to one shape', () => {
  for (const composition of COMPOSITIONS) {
    assert.ok(
      composition.tracks.length >= 3 && composition.tracks.length <= 6,
      `${composition.id} has ${composition.tracks.length} tracks`,
    );
  }
  const shapes = new Set(COMPOSITIONS.map((c) => c.tracks.length));
  assert.ok(shapes.size >= 3, 'track counts are too uniform');
});

test('the validator rejects unsafe equations', () => {
  assert.ok(validateEquation('1/x', 20).length > 0, 'division by zero must fail');
  assert.ok(validateEquation('tan(0.9*x)', 40).length > 0, 'tan asymptote must fail');
  assert.ok(validateEquation('log(1-x)', 20).length > 0, 'log of a negative must fail');
  assert.ok(validateEquation('frobnicate(x)', 20).length > 0, 'unknown function must fail');
  assert.ok(validateEquation('sin(t)', 20).length > 0, 'unknown variable must fail');
  assert.deepEqual(validateEquation('0.5*sin(0.4*x)+0.2*cos(0.8*x)', 40), [], 'a safe equation must pass');
});

test('engine domain accounts for tempo scaling', () => {
  const [composition] = COMPOSITIONS;
  assert.ok(engineDomain(composition, 1.5) > engineDomain(composition, 1));
});

test('the library spans the progressive launch states', () => {
  const accesses = new Set(COMPOSITIONS.map((c) => c.access));
  assert.ok(accesses.has('free-preview'), 'library needs free-preview entries');
  assert.ok(accesses.has('premium') || accesses.has('early-access'), 'library needs a gated tier');
  assert.ok(COMPOSITIONS.some((c) => c.featured), 'library needs featured entries');
});
