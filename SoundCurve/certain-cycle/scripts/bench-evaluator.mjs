/**
 * Evaluator benchmark (step 5).
 *
 * 800-point sweeps × 1000 reps of 5 representative equations through:
 *
 *   - OLD: the evaluator as of commit ab8f1cd (the step-1 baseline, before
 *     this task's allowlist/guard changes) — extracted from git at runtime;
 *   - NEW: the working-tree evaluator (allowlist walk runs once per parse;
 *     per-sample work adds own-property/scope and sum-cap checks);
 *   - mathjs `parse().compile().evaluate()` as an outside reference column.
 *
 * Verdict: NEW must stay within 2x of OLD for every equation; otherwise the
 * fix is to compile the AST to a closure once instead of walking per sample.
 *
 * Usage (from certain-cycle/):
 *   node --import ./scripts/ts-resolve.mjs scripts/bench-evaluator.mjs
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { parse as mathParse } from 'mathjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CYCLE = path.resolve(HERE, '..');
const REPO = path.resolve(CYCLE, '..');
const BASELINE_COMMIT = 'ab8f1cd';
const OLD_MODULE = '../src/utils/__benchOldParser';
const OLD_FILE = path.join(CYCLE, 'src', 'utils', '__benchOldParser.ts');

const EQUATIONS = [
  ['pure sine', 'sin(x)'],
  ['harmonic mix', 'cos(2*x) + 0.5*sin(x/3)'],
  ['polynomial', 'x^3 - 3*x + 1'],
  ['gaussian', 'exp(-x^2/2)'],
  ['fourier sum', 'sum(k=1, 10, sin(k*x)/k)'],
];

const POINTS = 800;
const REPS = 1000;
const WARMUP_REPS = 50;
const LIMIT = 2.0; // new/old ratio must stay ≤ this
const xs = Array.from({ length: POINTS }, (_, i) => -10 + (20 * i) / (POINTS - 1));

// Extract the baseline parser next to the current one so its relative import
// of ./typoCorrection resolves unchanged.
const oldSrc = execFileSync(
  'git',
  ['-C', REPO, 'show', `${BASELINE_COMMIT}:SoundCurve/certain-cycle/src/utils/equationParser.ts`],
  { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
);
writeFileSync(OLD_FILE, oldSrc);

let failed = false;
try {
  const oldMod = await import(OLD_MODULE);
  const newMod = await import('../src/utils/equationParser');

  /** Times REPS × 800 evaluations of one parsed equation. */
  const benchParsed = (evaluate) => {
    for (let r = 0; r < WARMUP_REPS; r++) for (const x of xs) evaluate(x);
    let sink = 0;
    const t0 = performance.now();
    for (let r = 0; r < REPS; r++) for (const x of xs) sink += evaluate(x);
    const t1 = performance.now();
    return { ms: t1 - t0, sink };
  };

  const rows = [];
  for (const [label, eq] of EQUATIONS) {
    const o = oldMod.parseEquation(eq);
    const n = newMod.parseEquation(eq);
    if (!o.success || !o.evaluate) throw new Error(`OLD failed to parse "${eq}": ${o.error}`);
    if (!n.success || !n.evaluate) throw new Error(`NEW failed to parse "${eq}": ${n.error}`);

    const oldRun = benchParsed(o.evaluate);
    const newRun = benchParsed(n.evaluate);

    // mathjs reference: compile once, evaluate over the same scope shape the
    // equivalence test uses (test-only usage of compile()).
    const compiled = mathParse(eq).compile();
    const mjEvaluate = (x) =>
      Number(compiled.evaluate({ x, pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E }));
    const mjRun = benchParsed(mjEvaluate);

    // Sanity: both evaluators must agree along the sweep or the numbers are
    // meaningless (spot-check 50 points, 1e-9 relative).
    for (let i = 0; i < POINTS; i += 16) {
      const a = n.evaluate(xs[i]);
      const b = o.evaluate(xs[i]);
      const bothNonFinite = !Number.isFinite(a) && !Number.isFinite(b);
      if (
        !bothNonFinite &&
        !(Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)))
      ) {
        throw new Error(`OLD/NEW disagree at x=${xs[i]} for "${eq}": old=${b} new=${a}`);
      }
    }

    rows.push({ label, eq, old: oldRun.ms, new: newRun.ms, mathjs: mjRun.ms, ratio: newRun.ms / oldRun.ms });
  }

  const pad = (s, w) => String(s).padEnd(w);
  const num = (v, w) => v.toFixed(1).padStart(w);
  const lines = [];
  lines.push(`evaluator benchmark — ${POINTS} points × ${REPS} reps per cell, baseline ${BASELINE_COMMIT}`);
  const header =
    `${pad('equation', 16)}${pad('expression', 30)}` +
    `${'old ms'.padStart(10)}${'new ms'.padStart(10)}${'new/old'.padStart(10)}${'mathjs ms'.padStart(11)}`;
  lines.push(header);
  lines.push('-'.repeat(header.length));
  for (const r of rows) {
    lines.push(
      `${pad(r.label, 16)}${pad(r.eq, 30)}${num(r.old, 10)}${num(r.new, 10)}${r.ratio.toFixed(2).padStart(10)}${num(r.mathjs, 11)}`,
    );
  }
  const worst = Math.max(...rows.map((r) => r.ratio));
  const verdict = worst <= LIMIT ? 'PASS' : 'FAIL';
  lines.push('');
  lines.push(`worst new/old ratio: ${worst.toFixed(2)} (limit ${LIMIT.toFixed(1)}) → ${verdict}`);
  if (verdict === 'FAIL') {
    lines.push('remedy required: compile the AST to a closure once instead of walking per sample.');
    failed = true;
  }

  const report = lines.join('\n');
  console.log(report);
  writeFileSync(path.join(HERE, 'bench-evaluator.results.md'), report + '\n');
} finally {
  try { unlinkSync(OLD_FILE); } catch { /* already gone */ }
}
process.exit(failed ? 1 : 0);
