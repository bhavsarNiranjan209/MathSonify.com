/**
 * pasteDomainFit.ts — pick a domain where a pasted equation actually draws.
 *
 * Pasted equations arrive with no domain at all (a textbook writes `y = tan(x)`
 * and never says over which x). The Studio's current domain may show nothing
 * but asymptotes for it, so on "Use" we sample the normalised expression and
 * pick the first candidate domain where at least 60% of samples are finite.
 * Free parameters (k, a, b…) default to 1 while fitting; the Studio's own
 * parameter sliders take over once the equation is applied.
 *
 * Pure function of (expr, current domain): unit-testable, and deliberately
 * run ONCE on "Use" — the old card ran this on every keystroke.
 *
 * © 2026 MathSonify
 */
import { compile } from './miniEval';

export interface DomainFit {
  domain: [number, number];
  /** Fraction of samples that were non-finite in the chosen domain (0 = clean). */
  nonFiniteRatio: number;
}

const SAMPLES = 160;
const MAX_NON_FINITE = 0.4;

function nonFiniteRatio(expr: string, params: string[], min: number, max: number): number {
  const scope: Record<string, number> = {};
  for (const name of params) scope[name] = 1;
  let finite = 0;
  let total = 0;
  try {
    const f = compile(expr, scope);
    for (let i = 0; i <= SAMPLES; i++) {
      const x = min + ((max - min) * i) / SAMPLES;
      total++;
      if (Number.isFinite(f(x))) finite++;
    }
  } catch {
    return 1;
  }
  return total > 0 ? 1 - finite / total : 1;
}

export function fitDomainForExpression(
  expr: string,
  params: string[],
  current: [number, number],
): DomainFit {
  const candidates: [number, number][] = [
    current,
    [-10, 10],
    [-6.28, 6.28],
    [0, 10],
    [-20, 20],
    [-20, 60],
  ];
  for (const [min, max] of candidates) {
    const ratio = nonFiniteRatio(expr, params, min, max);
    if (ratio <= MAX_NON_FINITE) return { domain: [min, max], nonFiniteRatio: ratio };
  }
  // Nothing fits well (a function that is mostly undefined, e.g. log(x) on a
  // negative domain): keep the current domain rather than jumping somewhere
  // arbitrary, and let the caller report the ratio.
  return { domain: current, nonFiniteRatio: nonFiniteRatio(expr, params, current[0], current[1]) };
}
