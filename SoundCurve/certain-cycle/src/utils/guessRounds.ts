/**
 * Round construction for the Guess game.
 *
 * This module is deliberately pure maths over `GUESS_LIBRARY`: no React, no DOM,
 * no Web Audio. The whole difficulty of the game lives in `buildRound`, so it is
 * testable on its own — see `guessRounds.test.ts`, which asserts the property
 * that actually matters (consecutive rounds produce same-family option sets).
 *
 * THE RULE: the three wrong answers for a round come from the SAME family as the
 * correct answer whenever that family has enough unused members. That is the
 * entire point of the family grouping — `sin(x)` against `cos(3x)` is a guess you
 * can win by reading the options, whereas `sin(x)` against a decaying chirp is
 * something you can only answer by listening. The cross-family fallback exists
 * purely for forward-compatibility (a future family of 2, or an option count
 * raised above 5) and should never trigger with the current 30.
 */
import { GUESS_LIBRARY, guessFamilyMembers, type GuessEquation } from '../data/guessLibrary';

/** Rounds in one playthrough. The single knob for how long a game is. */
export const GUESS_ROUNDS_PER_PLAY = 10;

/** Options shown per round: one correct plus three distractors. */
export const GUESS_OPTIONS_PER_ROUND = 4;

/** Injectable RNG so tests are deterministic instead of relying on luck. */
export type Rng = () => number;

/** One question: the correct answer plus the shuffled option set. */
export interface GuessRound {
  /** 0-based position in the playthrough. */
  index: number;
  /** The equation whose audio is played, and the answer to pick. */
  correct: GuessEquation;
  /** `GUESS_OPTIONS_PER_ROUND` entries, shuffled, always containing `correct`. */
  options: GuessEquation[];
}

/**
 * Fisher-Yates shuffle.
 *
 * Returns a new array rather than sorting in place: the library is module-level
 * shared state, and mutating its order would make one round's shuffle leak into
 * the next. Written as an explicit loop because `Array.prototype.sort` with a
 * random comparator is biased and, worse, sorts in place.
 */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Pick `count` distinct items at random, skipping anything in `exclude`. */
function sample<T>(
  pool: readonly T[],
  count: number,
  rng: Rng,
  exclude: ReadonlySet<T>,
): T[] {
  const available = pool.filter((item) => !exclude.has(item));
  return shuffle(available, rng).slice(0, Math.max(0, count));
}

/**
 * Builds one round around a given correct answer.
 *
 * Distractors are filled same-family first and only then topped up from the rest
 * of the library, so the *worst case* is a partially cross-family round — never a
 * fully random one when the family had members to give.
 */
export function buildRound(
  correct: GuessEquation,
  library: readonly GuessEquation[] = GUESS_LIBRARY,
  rng: Rng = Math.random,
  optionsPerRound: number = GUESS_OPTIONS_PER_ROUND,
): GuessRound {
  const needed = Math.max(1, optionsPerRound) - 1;

  const chosen = new Set<GuessEquation>([correct]);
  const options: GuessEquation[] = [correct];

  // 1. Same family — the preferred source, and the one that makes the game work.
  for (const sibling of sample(guessFamilyMembers(correct.family, library), needed, rng, chosen)) {
    chosen.add(sibling);
    options.push(sibling);
  }

  // 2. Cross-family top-up. Unreachable at 5 members per family and 4 options;
  //    kept so a future family or a larger option count degrades gracefully
  //    instead of returning fewer options than the UI promises.
  if (options.length < optionsPerRound) {
    const others = library.filter((eq) => !chosen.has(eq));
    for (const filler of sample(others, optionsPerRound - options.length, rng, chosen)) {
      chosen.add(filler);
      options.push(filler);
    }
  }

  return { index: 0, correct, options: shuffle(options, rng) };
}

/** Picks a random correct answer from the library. */
export function pickCorrect(
  library: readonly GuessEquation[] = GUESS_LIBRARY,
  rng: Rng = Math.random,
): GuessEquation {
  return library[Math.floor(rng() * library.length)];
}

/**
 * Builds the deck of correct answers for one playthrough.
 *
 * The whole library is shuffled and the first `rounds` entries are taken, so
 * the deck holds DISTINCT equations by construction — there is no code path
 * that can ask the same question twice in one game. (The previous version drew
 * each round independently and relied on a "skip the ones already used" search,
 * which is correct but reads as though repeats were possible, and did allow one
 * once the pool was tight.)
 *
 * Called afresh for every new game, so the second playthrough is not the first
 * one repeated.
 */
export function buildDeck(
  library: readonly GuessEquation[] = GUESS_LIBRARY,
  rng: Rng = Math.random,
  rounds: number = GUESS_ROUNDS_PER_PLAY,
): GuessEquation[] {
  // Shuffling the entire library (rather than picking `rounds` at a time) is
  // what guarantees distinctness: a slice of a permutation has no duplicates by
  // definition.
  return shuffle(library, rng).slice(0, Math.max(0, rounds));
}

/**
 * A full playthrough: one round per deck entry.
 *
 * The deck fixes the order of the correct answers up front; each round then
 * draws its own distractors, still same-family first (see `buildRound`).
 */
export function buildPlaythrough(
  library: readonly GuessEquation[] = GUESS_LIBRARY,
  rng: Rng = Math.random,
  rounds: number = GUESS_ROUNDS_PER_PLAY,
): GuessRound[] {
  return buildDeck(library, rng, rounds).map((correct, index) => ({
    ...buildRound(correct, library, rng),
    index,
  }));
}