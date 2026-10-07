/**
 * Tests for the Guess game's round construction.
 *
 * The behaviour under test is the thing that makes the game a listening test at
 * all: the three wrong answers must be drawn from the SAME family as the
 * correct one. These assert it by running many playthroughs and checking every
 * single round, not just one lucky sample — a rule that held 99% of the time
 * would still be a broken game.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GUESS_OPTIONS_PER_ROUND,
  GUESS_ROUNDS_PER_PLAY,
  buildDeck,
  buildPlaythrough,
  buildRound,
  shuffle,
  type Rng,
} from './guessRounds';
import { GUESS_LIBRARY, guessFamilyMembers, type GuessEquation } from '../data/guessLibrary';

/** Deterministic RNG (mulberry32) so a failure is always reproducible. */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('a round has exactly four options and contains its correct answer', () => {
  const rng = seeded(1);
  for (let i = 0; i < 200; i++) {
    const correct = GUESS_LIBRARY[i % GUESS_LIBRARY.length];
    const round = buildRound(correct, GUESS_LIBRARY, rng);
    assert.equal(round.options.length, GUESS_OPTIONS_PER_ROUND);
    assert.ok(round.options.includes(correct), 'the correct answer must be an option');
    // No duplicates — a repeated option would make the round a 3-way choice.
    assert.equal(new Set(round.options.map((o) => o.id)).size, GUESS_OPTIONS_PER_ROUND);
  }
});

test('all three distractors come from the same family', () => {
  const rng = seeded(7);
  for (let i = 0; i < 200; i++) {
    const correct = GUESS_LIBRARY[i % GUESS_LIBRARY.length];
    const round = buildRound(correct, GUESS_LIBRARY, rng);
    for (const option of round.options) {
      assert.equal(
        option.family,
        correct.family,
        `${correct.id} was offered ${option.id} from another family`,
      );
    }
  }
});

test('every family has enough members to fill a round on its own', () => {
  // The precondition behind "same-family first": each family must have at least
  // one correct answer plus three unused siblings.
  for (const family of ['trig', 'beat', 'chirp', 'perc', 'decay', 'shape'] as const) {
    const members = guessFamilyMembers(family);
    assert.ok(
      members.length >= GUESS_OPTIONS_PER_ROUND,
      `${family} has only ${members.length} members, which cannot fill ${GUESS_OPTIONS_PER_ROUND} options`,
    );
  }
});

test('a whole playthrough stays same-family, round after round', () => {
  // The explicit check the design depends on: not one round, but ten in a row.
  const rounds = buildPlaythrough(GUESS_LIBRARY, seeded(42));
  assert.equal(rounds.length, GUESS_ROUNDS_PER_PLAY);
  rounds.forEach((round, i) => {
    const families = new Set(round.options.map((o) => o.family));
    assert.equal(
      families.size,
      1,
      `round ${i + 1} mixed families: ${[...families].join(', ')}`,
    );
    assert.equal(round.options.length, GUESS_OPTIONS_PER_ROUND);
    assert.ok(round.options.includes(round.correct));
  });
});

test('the cross-family fallback only engages when a family runs short', () => {
  // Simulate a future thin family: 2 members cannot fill 4 options, so the
  // round must top up from elsewhere rather than return a 2-option question.
  const thin: GuessEquation[] = [
    ...GUESS_LIBRARY.filter((eq) => eq.family === 'trig').slice(0, 2),
    ...GUESS_LIBRARY.filter((eq) => eq.family !== 'trig'),
  ];
  const correct = thin[0];
  const round = buildRound(correct, thin, seeded(3));
  assert.equal(round.options.length, GUESS_OPTIONS_PER_ROUND);
  assert.ok(round.options.includes(correct));
  // It should still prefer the one available sibling first.
  assert.ok(round.options.includes(thin[1]), 'the sibling should be used before going cross-family');
});

test('options are shuffled, not always in library order', () => {
  // Without shuffling, the correct answer would be in a predictable slot.
  const rng = seeded(11);
  const positions = new Set<number>();
  for (let i = 0; i < 120; i++) {
    const correct = GUESS_LIBRARY[i % GUESS_LIBRARY.length];
    positions.add(buildRound(correct, GUESS_LIBRARY, rng).options.indexOf(correct));
  }
  assert.ok(positions.size > 1, 'the correct answer must not always land in the same slot');
});

test('a playthrough never repeats a correct answer', () => {
  // The regression this guards: each round used to be drawn independently, so a
  // playthrough could ask the same equation twice. Many games are checked,
  // because a single game proves nothing about a shuffle.
  for (let seed = 1; seed <= 400; seed++) {
    const rounds = buildPlaythrough(GUESS_LIBRARY, seeded(seed));
    const ids = rounds.map((r) => r.correct.id);
    assert.equal(
      new Set(ids).size,
      ids.length,
      `seed ${seed} repeated an equation: ${ids.join(', ')}`,
    );
  }
});

test('the deck is 10 distinct equations drawn from all 30', () => {
  const deck = buildDeck(GUESS_LIBRARY, seeded(5));
  assert.equal(deck.length, GUESS_ROUNDS_PER_PLAY);
  assert.equal(new Set(deck.map((e) => e.id)).size, GUESS_ROUNDS_PER_PLAY);
  // Drawn from the library, not invented.
  const libraryIds = new Set(GUESS_LIBRARY.map((e) => e.id));
  for (const eq of deck) assert.ok(libraryIds.has(eq.id), `${eq.id} is not in the library`);
});

test('every new game gets a genuinely different deck', () => {
  // A fresh shuffle per game, not one shuffle reused for the session: over many
  // games the opening round must vary.
  const openings = new Set<string>();
  for (let seed = 1; seed <= 60; seed++) {
    openings.add(buildPlaythrough(GUESS_LIBRARY, seeded(seed))[0].correct.id);
  }
  // 30 equations, 60 games — at least a dozen distinct openers proves it moves.
  assert.ok(openings.size >= 12, `only ${openings.size} distinct opening equations across 60 games`);
});

test('the deck draws from across the whole library, not one family', () => {
  // Guards against a shuffle that is secretly order-preserving within families.
  const deck = buildDeck(GUESS_LIBRARY, seeded(17));
  assert.ok(new Set(deck.map((e) => e.family)).size >= 4, 'a deck should span several families');
});

test('shuffle does not mutate its input', () => {
  const original = GUESS_LIBRARY.slice();
  shuffle(GUESS_LIBRARY, seeded(5));
  assert.deepEqual(GUESS_LIBRARY.map((e) => e.id), original.map((e) => e.id));
});