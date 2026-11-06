/**
 * The whole equation catalog must render: every scientist equation and every
 * preset resolves to a real, varying curve in its declared range.
 *
 * This is the regression test for the flat-line entries that shipped before:
 *   - sin(x)^2 + cos(x)^2 is the Pythagorean identity — always exactly 1.
 *   - sin(x) + sin(x + pi) cancels exactly — always exactly 0.
 *   - bare sums of constants (1 + 1/4 + 1/9 + …) have no x in them at all.
 * Each of those parsed fine and "rendered" as a horizontal line with a single
 * flat tone, which reads as broken. A curve that never varies fails here.
 *
 * Deliberately flat on purpose: 'constant-line' (the Constant Function
 * preset) — a constant IS the lesson of that teaching preset.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCIENTISTS } from './scientists';
import { PRESETS } from './presets';
import { resolveActiveCurve } from '../utils/activeCurve';

const FLAT_ALLOWLIST = new Set(['constant-line']);

function checkCurve(equation: string, minX: number, maxX: number): string | null {
  let curve;
  try {
    curve = resolveActiveCurve({
      equation,
      minX,
      maxX,
      isCustomCurve: false,
      splineControlPoints: [],
    });
  } catch (err) {
    return `throws: ${(err as Error).message}`;
  }
  const valid = curve.points.filter((p) => p.isValid);
  if (valid.length < curve.points.length * 0.9) {
    return `only ${valid.length}/${curve.points.length} valid samples`;
  }
  const ys = valid.map((p) => p.y);
  const span = Math.max(...ys) - Math.min(...ys);
  if (!(span > 1e-9)) {
    return 'flat: the curve never varies (a constant, or an identity that cancels out)';
  }
  return null;
}

test('every scientist equation resolves to a varying curve', () => {
  const bad: string[] = [];
  for (const s of SCIENTISTS) {
    for (const e of s.equations) {
      const problem = checkCurve(e.equation, e.minX, e.maxX);
      if (problem) bad.push(`${s.name} / ${e.name} (${e.equation}): ${problem}`);
    }
  }
  assert.deepEqual(bad, []);
});

test('every preset resolves to a varying curve', () => {
  const bad: string[] = [];
  for (const p of PRESETS) {
    if (FLAT_ALLOWLIST.has(p.id)) continue;
    const { minX, maxX } = p.recommendedSettings;
    const problem = checkCurve(p.equation, minX, maxX);
    if (problem) bad.push(`${p.name} (${p.equation}): ${problem}`);
  }
  assert.deepEqual(bad, []);
});
