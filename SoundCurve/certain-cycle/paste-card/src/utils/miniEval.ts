/**
 * miniEval.ts — tiny SAFE evaluator for the canonical syntax produced by pasteNormalizer.
 * Recursive descent, no eval / no Function. Used as (1) the oracle in tests, (2) the live preview.
 * The real app keeps using its own evaluator; this file shows the exact semantics expected of it:
 *   - real roots for negative bases with odd-denominator exponents: (-8)^(1/3) = -2, (-8)^(2/3) = 4
 *   - sqrt/log of negatives -> NaN (a gap in the graph, never a crash)
 *   - sum/prod: bounds rounded, hard cap 10,000 terms
 */
export type Node =
  | { t: 'num'; v: number } | { t: 'var'; n: string } | { t: 'neg'; a: Node } | { t: 'fact'; a: Node }
  | { t: 'bin'; op: string; a: Node; b: Node } | { t: 'call'; fn: string; args: Node[] }
  | { t: 'sum'; prod: boolean; idx: string; lo: Node; hi: Node; body: Node };

const CONSTS: Record<string, number> = { pi: Math.PI, tau: 2 * Math.PI, e: Math.E };

function lex(src: string): string[] {
  const out: string[] = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const n = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(src.slice(i));
    if (n) { out.push(n[0]); i += n[0].length; continue; }
    const w = /^[A-Za-z][A-Za-z0-9]*/.exec(src.slice(i));
    if (w) { out.push(w[0]); i += w[0].length; continue; }
    if ('+-*/^!(),='.includes(c)) { out.push(c); i++; continue; }
    throw new Error(`bad character ${c}`);
  }
  return out;
}

export function parseExpr(src: string): Node {
  const t = lex(src); let p = 0;
  const peek = () => t[p], next = () => t[p++];
  const expect = (s: string) => { if (next() !== s) throw new Error(`expected ${s}`); };
  function expr(): Node { let a = term(); while (peek() === '+' || peek() === '-') { const op = next(); a = { t: 'bin', op, a, b: term() }; } return a; }
  function term(): Node { let a = unary(); while (peek() === '*' || peek() === '/') { const op = next(); a = { t: 'bin', op, a, b: unary() }; } return a; }
  function unary(): Node { if (peek() === '-') { next(); return { t: 'neg', a: unary() }; } if (peek() === '+') { next(); return unary(); } return power(); }
  function power(): Node { const a = postfix(); if (peek() === '^') { next(); return { t: 'bin', op: '^', a, b: unary() }; } return a; }
  function postfix(): Node { let a = primary(); while (peek() === '!') { next(); a = { t: 'fact', a }; } return a; }
  function primary(): Node {
    const k = next();
    if (k === undefined) throw new Error('unexpected end');
    if (k === '(') { const e = expr(); expect(')'); return e; }
    if (/^[\d.]/.test(k)) return { t: 'num', v: parseFloat(k) };
    if (/^[A-Za-z]/.test(k)) {
      if (peek() === '(') {
        next();
        if (k === 'sum' || k === 'prod') {
          const idx = next(); expect('='); const lo = expr(); expect(','); const hi = expr(); expect(','); const body = expr(); expect(')');
          return { t: 'sum', prod: k === 'prod', idx, lo, hi, body };
        }
        const args: Node[] = []; if (peek() !== ')') { args.push(expr()); while (peek() === ',') { next(); args.push(expr()); } }
        expect(')'); return { t: 'call', fn: k, args };
      }
      return { t: 'var', n: k };
    }
    throw new Error(`unexpected ${k}`);
  }
  const r = expr(); if (p !== t.length) throw new Error(`unexpected ${t[p]}`); return r;
}

export function realPow(a: number, b: number): number {
  if (a >= 0 || Number.isInteger(b)) return Math.pow(a, b);
  for (let q = 1; q <= 99; q += 2) { const pq = b * q; if (Math.abs(pq - Math.round(pq)) < 1e-9) { const r = Math.pow(-a, b); return Math.round(pq) % 2 === 0 ? r : -r; } }
  return NaN;
}
const fact = (n: number) => { if (!Number.isInteger(n) || n < 0 || n > 170) return NaN; let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; };
const FN: Record<string, (...a: number[]) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan, sec: x => 1 / Math.cos(x), csc: x => 1 / Math.sin(x), cot: x => 1 / Math.tan(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan, sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh, asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  exp: Math.exp, ln: Math.log, log: (x, b) => (b === undefined ? Math.log(x) : Math.log(x) / Math.log(b)), log10: Math.log10, log2: Math.log2,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, sign: Math.sign, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  min: Math.min, max: Math.max, mod: (x, y) => x - y * Math.floor(x / y),
  nthRoot: (x, n) => (Number.isInteger(n) && n % 2 === 1 ? Math.sign(x) * Math.pow(Math.abs(x), 1 / n) : x < 0 ? NaN : Math.pow(x, 1 / n)),
};

export function evalNode(n: Node, s: Record<string, number>): number {
  switch (n.t) {
    case 'num': return n.v;
    case 'var': { if (n.n in s) return s[n.n]; if (n.n in CONSTS) return CONSTS[n.n]; throw new Error(`unknown symbol ${n.n}`); }
    case 'neg': return -evalNode(n.a, s);
    case 'fact': return fact(evalNode(n.a, s));
    case 'bin': {
      const a = evalNode(n.a, s), b = evalNode(n.b, s);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : realPow(a, b);
    }
    case 'call': { const f = FN[n.fn]; if (!f) throw new Error(`unknown function ${n.fn}`); return f(...n.args.map(a => evalNode(a, s))); }
    case 'sum': {
      const lo = Math.round(evalNode(n.lo, s)), hi = Math.round(evalNode(n.hi, s));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return NaN;
      if (hi - lo + 1 > 10000) throw new Error('sum is limited to 10,000 terms');
      let acc = n.prod ? 1 : 0;
      for (let k = lo; k <= hi; k++) { const v = evalNode(n.body, { ...s, [n.idx]: k }); acc = n.prod ? acc * v : acc + v; }
      return acc;
    }
  }
}
export function compile(src: string, params: Record<string, number> = {}): (x: number) => number {
  const ast = parseExpr(src);
  return (x) => evalNode(ast, { ...params, x });
}
