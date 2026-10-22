import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePasted } from './pasteNormalizer';
import { compile } from './miniEval';

const same = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || (Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));
const XS = [-3.1, -2.2, -1.3, -0.4, 0.3, 0.9, 1.7, 2.6, 4.2];
const sumK = (a: number, b: number, f: (k: number) => number) => { let s = 0; for (let k = a; k <= b; k++) s += f(k); return s; };
const cbrt2 = (x: number) => Math.cbrt(x * x);

type Case = { name: string; input: string; ref: (x: number) => number; params?: Record<string, number> };
const CASES: Case[] = [
  // plain text
  { name: 'plain sin(x)', input: 'sin(x)', ref: Math.sin },
  { name: 'y= prefix + implicit mult', input: 'y = sin(x)cos(3x)', ref: x => Math.sin(x) * Math.cos(3 * x) },
  { name: 'f(x)= polynomial', input: 'f(x) = x^2 + 3x + 2', ref: x => x * x + 3 * x + 2 },
  { name: '** power', input: 'x**2 - 1', ref: x => x * x - 1 },
  { name: 'e^x and exp', input: 'e^x - exp(-x^2)', ref: x => Math.E ** x - Math.exp(-x * x) },
  { name: 'abs function', input: 'abs(x-1)+abs(x+1)', ref: x => Math.abs(x - 1) + Math.abs(x + 1) },
  { name: 'ln and log10', input: 'ln(x^2+1) + log10(x^2+1)', ref: x => Math.log(x * x + 1) + Math.log10(x * x + 1) },
  // functions without brackets
  { name: 'sin x', input: 'sin x', ref: Math.sin },
  { name: 'sin 2x', input: 'sin 2x', ref: x => Math.sin(2 * x) },
  { name: 'sin x cos x', input: 'sin x cos x', ref: x => Math.sin(x) * Math.cos(x) },
  { name: 'sinx glued', input: 'sinx + cos2x', ref: x => Math.sin(x) + Math.cos(2 * x) },
  { name: 'sin^2(x)', input: 'sin^2(x) + cos^2(x)', ref: () => 1 },
  { name: 'sin² unicode', input: 'sin²(x) + 3', ref: x => Math.sin(x) ** 2 + 3 },
  { name: 'sin^-1', input: 'sin^-1(x/4)', ref: x => Math.asin(x / 4) },
  { name: 'arctan word', input: 'arctan(x)', ref: Math.atan },
  // unicode symbols
  { name: 'x² + 3x', input: 'x² + 3x + 2', ref: x => x * x + 3 * x + 2 },
  { name: 'x³ − x with unicode minus', input: 'x³ − x', ref: x => x ** 3 - x },
  { name: 'π and ×', input: 'sin(πx) × 2', ref: x => 2 * Math.sin(Math.PI * x) },
  { name: '÷ and ·', input: 'x ÷ 2 · 3', ref: x => (x / 2) * 3 },
  { name: '√(3 − x²)', input: '√(3 − x²)', ref: x => Math.sqrt(3 - x * x) },
  { name: '√x and ∛x', input: '√x + ∛x', ref: x => Math.sqrt(x) + Math.cbrt(x) },
  { name: 'x⁻¹', input: 'x⁻¹ + 1', ref: x => 1 / x + 1 },
  { name: 'vulgar fraction', input: '½x + ¾', ref: x => 0.5 * x + 0.75 },
  { name: 'degrees', input: 'sin(x°)', ref: x => Math.sin((x * Math.PI) / 180) },
  // roots
  { name: 'cube root real for negatives', input: 'x^(1/3)', ref: Math.cbrt },
  { name: 'x^(2/3) real for negatives', input: 'y = x^(2/3)', ref: cbrt2 },
  { name: 'nthRoot', input: 'nthRoot(x, 5)', ref: x => Math.sign(x) * Math.abs(x) ** 0.2 },
  { name: 'LaTeX \\sqrt{}', input: '\\sqrt{3-x^2}', ref: x => Math.sqrt(3 - x * x) },
  { name: 'LaTeX \\sqrt[3]{}', input: '\\sqrt[3]{x}', ref: Math.cbrt },
  { name: 'LaTeX \\sqrt[4]{}', input: '\\sqrt[4]{x^2+1}', ref: x => (x * x + 1) ** 0.25 },
  // LaTeX
  { name: 'LaTeX \\frac', input: '\\frac{x^2}{2} + \\sin(x)', ref: x => (x * x) / 2 + Math.sin(x) },
  { name: 'LaTeX \\dfrac nested', input: '\\dfrac{1}{1+\\frac{1}{x^2+1}}', ref: x => 1 / (1 + 1 / (x * x + 1)) },
  { name: 'LaTeX \\sin x \\cdot', input: '\\sin x \\cdot \\cos(2x)', ref: x => Math.sin(x) * Math.cos(2 * x) },
  { name: 'LaTeX ^{} and \\pi', input: 'e^{-x^2} \\sin(\\pi x)', ref: x => Math.exp(-x * x) * Math.sin(Math.PI * x) },
  { name: 'LaTeX \\sin^{2}', input: '\\sin^{2}(x) + \\cos^2 x', ref: () => 1 },
  { name: 'LaTeX \\left| \\right|', input: '\\left| \\sin x \\right|', ref: x => Math.abs(Math.sin(x)) },
  { name: 'LaTeX \\ln', input: '\\ln(x^2+1)', ref: x => Math.log(x * x + 1) },
  { name: 'LaTeX $$ wrapper', input: '$$ y = \\frac{\\sin x}{x^2+1} $$', ref: x => Math.sin(x) / (x * x + 1) },
  { name: 'LaTeX floor', input: '\\lfloor x \\rfloor', ref: Math.floor },
  { name: 'LaTeX \\operatorname', input: '\\operatorname{sign}(x)', ref: Math.sign },
  // absolute value bars
  { name: '|x|', input: '|x|', ref: Math.abs },
  { name: '|x-1|+|x+1|', input: '|x - 1| + |x + 1|', ref: x => Math.abs(x - 1) + Math.abs(x + 1) },
  { name: '2|x| - |x-1|', input: '2|x| - |x-1|', ref: x => 2 * Math.abs(x) - Math.abs(x - 1) },
  { name: 'nested bars', input: '||x|-1|', ref: x => Math.abs(Math.abs(x) - 1) },
  // letter runs and constants
  { name: 'ax^2+bx+c params', input: 'ax^2 + bx + c', params: { a: 2, b: -3, c: 1 }, ref: x => 2 * x * x - 3 * x + 1 },
  { name: 'a*sin(b*x)', input: 'a sin(bx)', params: { a: 3, b: 2 }, ref: x => 3 * Math.sin(2 * x) },
  { name: 'cos(kx)', input: 'cos(kx)', params: { k: 5 }, ref: x => Math.cos(5 * x) },
  { name: 'variable t renamed', input: 'sin(t) + t', ref: x => Math.sin(x) + x },
  { name: 'theta renamed', input: 'cos(\\theta)', ref: Math.cos },
  { name: 'tau and 2pi', input: 'sin(2pi x) + tau', ref: x => Math.sin(2 * Math.PI * x) + 2 * Math.PI },
  { name: 'factorial', input: 'x!', ref: x => { const n = x; return Number.isInteger(n) && n >= 0 ? [1, 1, 2, 6, 24][n] ?? NaN : NaN; } },
  // THE HEART (your YouTube equation) — plain, unicode, LaTeX
  { name: 'heart plain', input: 'y = x^(2/3) + 0.9 sin(kx) sqrt(3 - x^2)', params: { k: 7 }, ref: x => cbrt2(x) + 0.9 * Math.sin(7 * x) * Math.sqrt(3 - x * x) },
  { name: 'heart unicode', input: 'y = x^(2/3) + 0.9 sin(kx) √(3 − x²)', params: { k: 7 }, ref: x => cbrt2(x) + 0.9 * Math.sin(7 * x) * Math.sqrt(3 - x * x) },
  { name: 'heart LaTeX', input: 'y = x^{\\frac{2}{3}} + 0.9\\sin(kx)\\sqrt{3-x^2}', params: { k: 7 }, ref: x => cbrt2(x) + 0.9 * Math.sin(7 * x) * Math.sqrt(3 - x * x) },
  { name: 'heart unicode superscript 2/3', input: 'y = x^(⅔) + 0.9cos(kx)√(3−x²)', params: { k: 3 }, ref: x => cbrt2(x) + 0.9 * Math.cos(3 * x) * Math.sqrt(3 - x * x) },
  // SIGMA — every notation seen in the wild
  { name: 'Σ canonical sum(k=0,12,…)', input: 'y = 5*sum(k=0,12, 1/(k+1)*sin((4*k+1)*x))', ref: x => 5 * sumK(0, 12, k => Math.sin((4 * k + 1) * x) / (k + 1)) },
  { name: 'Σ words: sum(k=0 to 12)[…]', input: 'y = 5 * sum(k=0 to 12) [1/(k+1) * sin((4k+1)x)]', ref: x => 5 * sumK(0, 12, k => Math.sin((4 * k + 1) * x) / (k + 1)) },
  { name: 'Σ words: sum(k=0..12) no body brackets', input: 'sum(k=1..5) sin(kx)/k', ref: x => sumK(1, 5, k => Math.sin(k * x) / k) },
  { name: 'Σ unicode subscripts/superscripts', input: 'y = 5∑ₖ₌₀¹² 1/(k+1) sin((4k+1)x)', ref: x => 5 * sumK(0, 12, k => Math.sin((4 * k + 1) * x) / (k + 1)) },
  { name: 'Σ unicode, upper bound 0 (your original)', input: 'y = 5∑ₖ₌₀⁰ 1/(k+1) sin((4k+1)x)', ref: x => 5 * Math.sin(x) },
  { name: 'Σ LaTeX \\sum_{}^{}', input: 'y = 5 \\sum_{k=0}^{12} \\frac{1}{k+1} \\sin((4k+1)x)', ref: x => 5 * sumK(0, 12, k => Math.sin((4 * k + 1) * x) / (k + 1)) },
  { name: 'Σ LaTeX \\limits', input: '\\sum\\limits_{k=1}^{5} \\frac{\\sin(kx)}{k}', ref: x => sumK(1, 5, k => Math.sin(k * x) / k) },
  { name: 'Σ body stops at +', input: '\\sum_{k=1}^{5} \\frac{\\sin(kx)}{k} + 2', ref: x => sumK(1, 5, k => Math.sin(k * x) / k) + 2 },
  { name: 'Σ square-wave series', input: '\\frac{4}{\\pi}\\sum_{k=0}^{20}\\frac{\\sin((2k+1)x)}{2k+1}', ref: x => (4 / Math.PI) * sumK(0, 20, k => Math.sin((2 * k + 1) * x) / (2 * k + 1)) },
  { name: 'Σ Σ symbol with (k=0..n)', input: 'Σ(k=0..4) x^k', ref: x => sumK(0, 4, k => x ** k) },
  { name: 'Σ with n as a slider', input: '\\sum_{k=1}^{n} \\frac{\\sin(kx)}{k}', params: { n: 6 }, ref: x => sumK(1, 6, k => Math.sin(k * x) / k) },
  { name: 'Σ alternating (-1)^k', input: '\\sum_{k=0}^{10} \\frac{(-1)^k x^{2k+1}}{(2k+1)!}', ref: x => sumK(0, 10, k => ((-1) ** k * x ** (2 * k + 1)) / [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880, 3628800, 39916800, 479001600, 6227020800, 87178291200, 1307674368000, 20922789888000, 355687428096000, 6402373705728000, 121645100408832000, 2432902008176640000, 51090942171709440000, 1124000727777607680000][2 * k + 1]) },
  { name: 'Π product', input: '\\prod_{k=1}^{4} (x + k)', ref: x => (x + 1) * (x + 2) * (x + 3) * (x + 4) },
  { name: 'nested Σ', input: 'sum(i=1,3, sum(j=1,2, i*j*x))', ref: x => sumK(1, 3, i => sumK(1, 2, j => i * j * x)) },
];

describe('pasteNormalizer: every notation converts to the SAME math', () => {
  for (const c of CASES) {
    test(c.name, () => {
      const r = normalizePasted(c.input);
      assert.equal(r.ok, true, `${c.input} -> ${r.error}`);
      const f = compile(r.expr, c.params ?? {});
      for (const x of XS) assert.ok(same(f(x), c.ref(x)), `${c.input}\n  expr: ${r.expr}\n  x=${x}: got ${f(x)} expected ${c.ref(x)}`);
      if (c.params) for (const k of Object.keys(c.params)) assert.ok(r.params.includes(k), `param ${k} not detected (got ${r.params})`);
      else assert.deepEqual(r.params, [], `unexpected params ${r.params}`);
    });
  }
});

describe('pasteNormalizer: unsupported input gives a clear message, never a crash', () => {
  const BAD: [string, RegExp][] = [
    ['\\int x dx', /Integrals/], ['x^2 + y^2 = 4', /implicit/i], ["y' = y", /Derivatives/], ['x < 2', /Inequalities/],
    ['f(x) = \\begin{cases} 1 & x>0 \\\\ 0 & x \\le 0 \\end{cases}', /Piecewise/], ['sum(k=0,∞, 1/k)', /∞/], ['x = y^2', /Only y = f\(x\)/],
    ['', /Paste an equation/], ['sin(', /brackets/i], ['foo(x)', /isn't a function/], ['constructor(1)', /isn't a function/],
    ['__proto__', /Subscripts|isn't supported/], ['toString(1)', /isn't a function/], ['x_1 + 2', /Subscripts/], ['Σ x', /bounds/],
    ['\\unknowncmd{x}', /isn't supported/], ['2 + * 3 )', /./],
  ];
  for (const [input, re] of BAD) test(`rejects ${JSON.stringify(input)}`, () => {
    const r = normalizePasted(input);
    assert.equal(r.ok, false);
    assert.match(r.error ?? '', re);
  });
  test('hostile code-like input is rejected and never reaches an evaluator', () => {
    for (const h of ['constructor(1)', 'toString(1)', 'hasOwnProperty("x")', 'valueOf(x)', 'x.constructor', 'this', '[1,2][0]', 'a=1', 'eval(x)', 'Function(x)', 'import(x)', 'process.exit()', 'window', 'alert(1)', '`x`', 'x;y', '"x"']) {
      const r = normalizePasted(h);
      assert.equal(r.ok && /constructor|prototype|eval|import|alert|process|window|Function/i.test(r.expr), false, `${h} produced ${r.expr}`);
    }
    for (const h of ['constructor(1)', 'toString(1)', 'eval(x)', 'Function(x)', 'import(x)', 'process.exit()', 'alert(1)', 'x.constructor']) assert.equal(normalizePasted(h).ok, false, h);
  });
  test('never throws on garbage', () => {
    for (const g of ['\u0000', '∑∑∑', '\\\\\\', '{{{{', '}}}}', '((((', '||||', '^^^', 'sin cos tan', '√', '∛', '\\frac', '\\sqrt[', 'a'.repeat(5000)]) {
      const r = normalizePasted(g); assert.equal(typeof r.ok, 'boolean');
    }
  });
});

describe('pasteNormalizer: display and notes', () => {
  test('notes mention parameters and renamed variable', () => {
    const r = normalizePasted('a sin(bt)');
    assert.equal(r.ok, true); assert.equal(r.xVar, 't'); assert.deepEqual(r.params, ['a', 'b']);
    assert.ok(r.notes.some(n => /Treated t/.test(n))); assert.ok(r.notes.some(n => /sliders/.test(n)));
  });
  test('log is flagged as natural log', () => {
    assert.ok(normalizePasted('log(x^2+1)').notes.some(n => /natural/.test(n)));
  });
  test('Σ bound index is not reported as a parameter', () => {
    assert.deepEqual(normalizePasted('sum(k=0,5, k*x)').params, []);
  });
});
