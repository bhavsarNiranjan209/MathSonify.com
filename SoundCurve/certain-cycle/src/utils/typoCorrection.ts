/**
 * Best-effort correction for mistyped equations.
 *
 * This module NEVER rewrites what the user typed. It only *proposes* candidate
 * strings; `parseEquation` validates each one against the real mathjs parser and
 * only surfaces a suggestion that genuinely parses. So a wrong guess costs the
 * user nothing — they see "Did you mean sin(x)?" and decide.
 *
 * Deliberately free of any import from `equationParser`, so there is no import
 * cycle and this can be unit-tested on its own.
 */

/**
 * Functions this app actually supports — the correction is only ever allowed to
 * point at something the symbol pad offers, so a suggestion can never be a
 * function the user could not otherwise have typed.
 */
export const KNOWN_FUNCTIONS: readonly string[] = [
  'sqrt', 'cbrt', 'abs', 'exp', 'log', 'sin', 'cos', 'tan', 'cot', 'sec', 'csc',
  'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh', 'floor', 'ceil',
  'round', 'sign', 'max', 'min', 'pow', 'mod', 'hypot', 'ln',
];

/** Tokens shorter than this are left alone: `x`, `pi`, `e` are not typos. */
const MIN_TOKEN_LENGTH = 3;

/** Longest common prefix length — used to pick between equally-distant fixes. */
function commonPrefix(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n && a[i] === b[i]) i++;
  return i;
}

/**
 * Damerau-Levenshtein (optimal string alignment) distance, bailing out once it
 * exceeds `limit`.
 *
 * Damerau rather than plain Levenshtein specifically because a transposition
 * counts as ONE edit here. `sqtr` -> `sqrt` is the case that matters: under plain
 * Levenshtein that is a delete plus an insert (distance 2), so it would fall
 * outside a limit of 1 and the most obvious real-world typo would go
 * uncorrected.
 *
 * Bailing matters too: this runs on every failed keystroke, against every known
 * function.
 */
export function editDistanceWithin(a: string, b: string, limit: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const d: number[][] = Array.from({ length: rows }, () => new Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i++) d[i][0] = i;
  for (let j = 0; j < cols; j++) d[0][j] = j;

  for (let i = 1; i < rows; i++) {
    let rowMin = Infinity;
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[i - 2][j - 2] + 1);
      }
      d[i][j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > limit) return limit + 1;
  }
  return d[rows - 1][cols - 1];
}

/**
 * The known function a mistyped token was probably meant to be, or null.
 *
 * A distance of 1 covers both failure modes in one mechanism: a doubled letter
 * (`sinn` -> `sin`, `taan` -> `tan`) is a deletion, and a misspelling
 * (`sqtr` -> `sqrt`) is a transposition.
 *
 * Ties are broken by longest shared prefix, which is what stops `sinn` being
 * "corrected" to `sign` — both are one edit away, but only `sin` shares the
 * first three characters. Remaining ties fall back to the shorter name, then
 * alphabetically, so the same typo always yields the same suggestion.
 */
export function nearestFunction(token: string): string | null {
  if (token.length < MIN_TOKEN_LENGTH) return null;
  // A token that is already a known function is not a typo. Without this guard
  // `sinh` (distance 0 from itself, but distance 1 from `sin`) would be "corrected"
  // to `sin` — and the distance-1 filter below would never catch it.
  if (KNOWN_FUNCTIONS.includes(token)) return null;

  const candidates = KNOWN_FUNCTIONS
    .filter((fn) => editDistanceWithin(token, fn, 1) === 1)
    .sort(
      (a, b) =>
        commonPrefix(token, b) - commonPrefix(token, a) ||
        a.length - b.length ||
        a.localeCompare(b),
    );
  return candidates[0] ?? null;
}

/** Why a candidate was proposed — lets the UI explain itself honestly. */
export type CorrectionKind = 'function-name' | 'missing-bracket';

export interface CorrectionCandidate {
  /** The proposed equation. Unvalidated. */
  text: string;
  kind: CorrectionKind;
  /** The function the token was corrected to, when kind is 'function-name'. */
  fn?: string;
}

/**
 * Candidate corrections for a raw equation string, in priority order.
 *
 * These are unvalidated guesses. The caller must confirm each one actually
 * parses before offering it, which is what keeps this honest.
 */
export function correctionCandidates(raw: string): CorrectionCandidate[] {
  const input = raw.trim();
  if (!input) return [];

  const out: CorrectionCandidate[] = [];
  const seen = new Set<string>();
  const push = (candidate: CorrectionCandidate) => {
    if (candidate.text !== input && !seen.has(candidate.text)) {
      seen.add(candidate.text);
      out.push(candidate);
    }
  };

  // 1. Function-name typos. Per alphabetic token, longest token first so a long
  //    name is not shadowed by a short prefix of it.
  const tokens = [...input.matchAll(/[a-zA-Z]{3,}/g)]
    .map((m) => ({ text: m[0], index: m.index as number }))
    .sort((a, b) => b.text.length - a.text.length || a.index - b.index);

  for (const { text, index } of tokens) {
    const fn = nearestFunction(text);
    if (!fn) continue;
    push({
      text: input.slice(0, index) + fn + input.slice(index + text.length),
      kind: 'function-name',
      fn,
    });
  }

  // 2. Exactly one missing closing paren.
  const opens = (input.match(/\(/g) ?? []).length;
  const closes = (input.match(/\)/g) ?? []).length;
  if (opens === closes + 1) push({ text: `${input})`, kind: 'missing-bracket' });

  return out;
}

/** One-line explanation for the UI. Kept here so the wording stays testable. */
export function correctionReason(candidate: CorrectionCandidate): string {
  return candidate.kind === 'function-name'
    ? `corrected the function name to "${candidate.fn}"`
    : 'added a missing closing bracket';
}