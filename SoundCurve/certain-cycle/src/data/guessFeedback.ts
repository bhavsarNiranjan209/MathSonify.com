/**
 * Copy pools for the Guess feedback line and the end-of-game grade.
 *
 * Feedback is drawn from a small rotating pool rather than a single string per
 * outcome. One fixed "Not this time" ten rounds in a row reads as a machine
 * marking a form; a varied line reads as a response. The pools are separate per
 * outcome because they say genuinely different things:
 *
 *   - correct          — you heard it
 *   - wrong, same family — a NEAR MISS, and the most instructive case: the
 *     distractors were deliberately confusable, so being wrong here means the
 *     ear is close. Saying "wrong" flatly throws that away.
 *   - wrong, other family — a genuine miss, distinct from the near miss
 *
 * Selection is by round index rather than randomness, so a given round always
 * shows the same line for a given outcome (no flicker on re-render), while the
 * line still differs round to round.
 */
import type { TranslationKey } from '../i18n/index';

/** How the player's pick compared to the answer. */
export type GuessOutcome = 'correct' | 'wrong-same-family' | 'wrong-other-family';

const FEEDBACK_POOL: Record<GuessOutcome, TranslationKey[]> = {
  correct: [
    'guess.fb.correct1',
    'guess.fb.correct2',
    'guess.fb.correct3',
    'guess.fb.correct4',
    'guess.fb.correct5',
  ],
  'wrong-same-family': [
    'guess.fb.near1',
    'guess.fb.near2',
    'guess.fb.near3',
    'guess.fb.near4',
    'guess.fb.near5',
  ],
  'wrong-other-family': [
    'guess.fb.miss1',
    'guess.fb.miss2',
    'guess.fb.miss3',
    'guess.fb.miss4',
    'guess.fb.miss5',
  ],
};

/** The feedback line for a round, rotated by round index so it varies. */
export function feedbackFor(outcome: GuessOutcome, roundIndex: number): TranslationKey {
  const pool = FEEDBACK_POOL[outcome];
  return pool[((roundIndex % pool.length) + pool.length) % pool.length];
}

/** Score bands for the end-of-game grade, highest first. */
export const GUESS_GRADES: { min: number; key: TranslationKey }[] = [
  { min: 9, key: 'guess.grade.legend' },
  { min: 7, key: 'guess.grade.great' },
  { min: 4, key: 'guess.grade.learning' },
  { min: 0, key: 'guess.grade.beginning' },
];

/** The grade line for a final score out of `total`. */
export function gradeFor(score: number, total: number): TranslationKey {
  const ratio = total > 0 ? score / total : 0;
  const scaled = ratio * 10;
  const band = GUESS_GRADES.find((g) => scaled >= g.min) ?? GUESS_GRADES[GUESS_GRADES.length - 1];
  return band.key;
}

/** Score at or above which the finish earns the larger celebration. */
export const CELEBRATION_SCORE_THRESHOLD = 7;

/** Whether a finished score earns the bigger celebration. */
export function deservesBigCelebration(score: number, total: number): boolean {
  return total > 0 && score / total >= CELEBRATION_SCORE_THRESHOLD / 10;
}