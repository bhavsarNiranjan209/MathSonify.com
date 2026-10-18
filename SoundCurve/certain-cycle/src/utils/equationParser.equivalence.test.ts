import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from 'mathjs';

import { parseEquation, sanitizeEquationString } from './equationParser';
import { PRESETS } from '../data/presets';
import { SCIENTISTS } from '../data/scientists';
import { GUESS_LIBRARY } from '../data/guessLibrary';
import { COMPOSITIONS } from '../data/compositions';
import { engineDomain } from './compositionValidator';

/**
 * Differential equivalence: the app's evaluator vs mathjs.
 *
 * Every equation the app ships — presets, scientist equations, the Guess
 * library, the Funny Questions subset, and the SoundLab composition catalogue
 * — is evaluated at 800 points across its domain by BOTH:
 *
 *   ours:   parseEquation(raw).evaluate, and
 *   oracle: mathjs parse(sanitized).compile().evaluate (TEST-ONLY usage).
 *
 * Both sides receive the IDENTICAL sanitized string (the app's own
 * `sanitizeEquationString`), so the comparison isolates the evaluator from
 * the input pre-processing. Required: equality within 1e-12 relative, or a
 * matching non-finite on both sides.
 *
 * Documented comparison semantics (normalisations, not weakenings — each
 * maps one app behaviour onto its mathjs equivalent):
 *
 *   - mathjs booleans (`true`/`false` from comparisons) ≙ our 1/0: coerced
 *     with `Number()` on the oracle side. The app's evaluate contract is
 *     `number`, so this aligns the ORACLE with the app, never the reverse.
 *   - mathjs throwing at a point (domain errors) ≙ NaN: caught to NaN on the
 *     oracle side. Our evaluator catches per-point errors to NaN too.
 *   - Our evaluate clamps ±Infinity to ±1e6 (a deliberate, pre-existing
 *     graph-safety contract): oracle ±Infinity maps to our ±1e6 sentinel
 *     with matching sign; oracle NaN must match our NaN exactly.
 *
 * Guess-library entries ship `display` strings in typographic math
 * (`·`, `√`, `²`, `−`, `|x|`). `displayToEquation` normalises those to ASCII
 * ONCE, identically for both evaluators — the differential compares
 * evaluators, not typography.
 */

const POINTS = 800;
const REL = 1e-12;
/** parseEquation's published stand-in for ±Infinity. */
const POS_INF_SENTINEL = 1e6;
const NEG_INF_SENTINEL = -1e6;

/**
 * Typographic display maths → parseable ASCII. Applied identically to both
 * sides. `√` is function application, so it is scanned rather than blindly
 * substituted: `√(9 − x²)` must wrap the whole group and `√|x|` (→ `√abs(x)`)
 * must wrap the function call, or the two tokens fuse into `sqrtabs(x)`.
 */
function displayToEquation(display: string): string {
  const s = display
    .replace(/·/g, '*')
    .replace(/²/g, '^2')
    .replace(/−/g, '-')
    .replace(/\|([^|]+)\|/g, 'abs($1)');

  /** Consumes one primary expression starting at `j`: a parenthesised group
   *  or a single token (identifier, optionally with a call argument group). */
  const consumePrimary = (str: string, j: number): number => {
    if (str[j] === '(') {
      let depth = 1;
      j++;
      while (j < str.length && depth > 0) {
        if (str[j] === '(') depth++;
        else if (str[j] === ')') depth--;
        j++;
      }
      return j;
    }
    if (/[a-zA-Z]/.test(str[j] ?? '')) {
      while (j < str.length && /[a-zA-Z0-9]/.test(str[j])) j++;
      if (str[j] === '(') return consumePrimary(str, j); // function call: abs(x)
      return j;
    }
    return j + 1; // single character (digit, operator…)
  };

  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '√') {
      out += s[i];
      continue;
    }
    const end = consumePrimary(s, i + 1);
    out += `sqrt(${s.slice(i + 1, end)})`;
    i = end - 1;
  }
  return out;
}

interface EquivalenceCase {
  source: string;
  id: string;
  equation: string;
  minX: number;
  maxX: number;
}

function collectCases(): EquivalenceCase[] {
  const cases: EquivalenceCase[] = [];
  for (const p of PRESETS) {
    cases.push({
      source: 'preset',
      id: p.id,
      equation: p.equation,
      minX: p.recommendedSettings.minX,
      maxX: p.recommendedSettings.maxX,
    });
  }
  for (const s of SCIENTISTS) {
    // `.equations` carries sparse holes (deleted entries left `,,` in the
    // data). The app iterates with map/filter, which skip holes; guard here
    // so a hole is never mistaken for an equation.
    for (const e of s.equations) {
      if (!e) continue;
      cases.push({ source: `scientist:${s.id}`, id: e.id, equation: e.equation, minX: e.minX, maxX: e.maxX });
    }
  }
  for (const g of GUESS_LIBRARY) {
    cases.push({
      source: 'guess',
      id: g.id,
      equation: displayToEquation(g.display),
      minX: g.minX,
      maxX: g.maxX,
    });
  }
  for (const c of COMPOSITIONS) {
    const maxX = engineDomain(c); // validator's widest-case domain (tempo 1.5x)
    for (const track of c.tracks) {
      cases.push({ source: `composition:${c.id}`, id: track.id, equation: track.equation, minX: 0, maxX });
    }
  }
  return cases;
}

/** Oracle value at x: mathjs, with throw→NaN and boolean→1/0. */
function oracleAt(compiled: ReturnType<ReturnType<typeof parse>['compile']>, x: number): number {
  const scope = { x, pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E };
  try {
    return Number(compiled.evaluate(scope));
  } catch {
    return NaN;
  }
}

/** Maps the oracle's ±Infinity onto our documented ±1e6 sentinel. */
function oracleNonFiniteMarker(theirs: number): number {
  if (theirs === Infinity) return POS_INF_SENTINEL;
  if (theirs === -Infinity) return NEG_INF_SENTINEL;
  return NaN;
}

function closeEnough(a: number, b: number): boolean {
  return Math.abs(a - b) <= REL * Math.max(1, Math.abs(a), Math.abs(b));
}

/** Runs one case; returns a mismatch description, or null when equivalent. */
function checkCase(c: EquivalenceCase): string | null {
  const parsed = parseEquation(c.equation);
  if (!parsed.success || !parsed.evaluate) {
    return `${c.source}/${c.id} [${c.equation}]: ours failed to parse: ${parsed.error ?? 'unknown error'}`;
  }
  const sanitized = sanitizeEquationString(c.equation);
  let compiled: ReturnType<ReturnType<typeof parse>['compile']>;
  try {
    compiled = parse(sanitized).compile();
  } catch (err) {
    return `${c.source}/${c.id} [${c.equation}]: oracle failed to parse sanitized form "${sanitized}": ${err instanceof Error ? err.message : err}`;
  }

  const ours = parsed.evaluate;
  for (let i = 0; i < POINTS; i++) {
    const x = c.minX + (i / (POINTS - 1)) * (c.maxX - c.minX);
    const a = ours(x);
    const bRaw = oracleAt(compiled, x);

    if (!Number.isFinite(bRaw)) {
      // Both sides must be non-finite together; ours encodes ±Inf as ±1e6.
      const b = oracleNonFiniteMarker(bRaw);
      if (Number.isNaN(b) ? !Number.isNaN(a) : a !== b) {
        return `${c.source}/${c.id} [${c.equation}] @x=${x}: ours=${a}, oracle non-finite (${bRaw})`;
      }
      continue;
    }
    if (!Number.isFinite(a)) {
      return `${c.source}/${c.id} [${c.equation}] @x=${x}: ours non-finite (${a}), oracle=${bRaw}`;
    }
    if (!closeEnough(a, bRaw)) {
      return `${c.source}/${c.id} [${c.equation}] @x=${x}: ours=${a}, oracle=${bRaw}`;
    }
  }
  return null;
}

function sweep(name: string, filter: (c: EquivalenceCase) => boolean, minCount: number): void {
  test(`every ${name} equation matches mathjs at 800 domain points`, () => {
    const cases = collectCases().filter(filter);
    assert.ok(
      cases.length >= minCount,
      `sweep found only ${cases.length} ${name} cases (expected ≥ ${minCount}) — coverage must not silently shrink`,
    );
    const failures = cases.map(checkCase).filter((f): f is string => f !== null);
    assert.deepEqual(failures, [], `\n${failures.join('\n')}`);
  });
}

sweep('preset', (c) => c.source === 'preset', 100);
sweep('scientist', (c) => c.source.startsWith('scientist:'), 10);
sweep('guess-library', (c) => c.source === 'guess', 30);
// Funny Questions is the 'rare' preset category — asserted as its own sweep so
// the "every Funny Questions equation" requirement is provably covered.
sweep(
  'Funny Questions',
  (c) => c.source === 'preset' && PRESETS.find((p) => p.id === c.id)?.category === 'rare',
  5,
);
sweep('composition-catalogue', (c) => c.source.startsWith('composition:'), 50);
