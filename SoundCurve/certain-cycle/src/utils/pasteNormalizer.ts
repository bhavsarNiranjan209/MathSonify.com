/**
 * pasteNormalizer.ts — turns ANY pasted/typed formula notation into the canonical typed syntax the
 * existing parser already understands (explicit "*", sqrt(), nthRoot(), abs(), sum(k=a,b,body) ...).
 *
 * Handles: plain text, LaTeX (\frac \sqrt[n] \sum_{}^{} \left|..\right| \sin^2 ...), Unicode (√ ∛ π × ÷ − ² ³ ⁻¹ ½ ° ∑ₖ₌₀¹²),
 * word forms (sum(k=0 to 12)[...], sum(k=0..12), Σ(k=0..12)), functions without brackets (sin 2x, sin²x, sin^-1 x),
 * implicit multiplication INCLUDING letter runs (kx -> k*x), |x| bars, y= / f(x)= prefixes, free parameters
 * (k, a, b, n...) and a renamed variable (sin(t) -> sin(x)).
 *
 * It never evaluates anything and never throws: failures come back as { ok:false, error } with a friendly message.
 */
export interface NormalizeResult {
  ok: boolean;
  /** canonical syntax, explicit "*" everywhere — feed straight to the existing parser */
  expr: string;
  /** tidy version for display ("Equation: …") */
  display: string;
  notes: string[];
  /** free single-letter constants found (k, a, b, n…) — the UI should offer sliders for these */
  params: string[];
  /** the symbol that was treated as x (usually "x") */
  xVar: string;
  error?: string;
}

class NormErr extends Error {}
const SEP = '\u2063', GV = '\u2064', MO = '\u27e6', MC = '\u27e7', BO = '\u27ea', BC = '\u27eb';

const HELP = 'Supported: plain text (sin(x)*cos(3x)), LaTeX (\\frac{1}{2}\\sin x, \\sqrt[3]{x}), symbols (√(3−x²), x², π, Σ with bounds) '
  + 'and sum(k=0,12, …). Not supported yet: implicit curves like x²+y²=4, piecewise/cases, integrals, derivatives, inequalities.';

const FN_NAMES = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'exp', 'ln', 'log', 'log10', 'log2', 'sqrt', 'cbrt', 'nthRoot', 'abs', 'sign', 'floor', 'ceil', 'round', 'min', 'max', 'mod'];
const FN_ALIAS: Record<string, string> = { arcsin: 'asin', arccos: 'acos', arctan: 'atan', arsinh: 'asinh', arcosh: 'acosh', artanh: 'atanh', sgn: 'sign', lg: 'log10', cosec: 'csc', tg: 'tan', ctg: 'cot' };
const CONSTS = ['pi', 'tau', 'e'];
const GREEK_WORDS = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'omega', 'sigma', 'kappa', 'zeta'];
const NAMES = [...FN_NAMES, ...Object.keys(FN_ALIAS), ...CONSTS, ...GREEK_WORDS].sort((a, b) => b.length - a.length);
const INVERSE: Record<string, string> = { sin: 'asin', cos: 'acos', tan: 'atan', sinh: 'asinh', cosh: 'acosh', tanh: 'atanh' };

const SUP: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁺': '+', '⁻': '-', '⁼': '=', '⁽': '(', '⁾': ')', 'ⁿ': 'n', 'ⁱ': 'i', 'ˣ': 'x' };
const SUB: Record<string, string> = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', '₊': '+', '₋': '-', '₌': '=', '₍': '(', '₎': ')', 'ₐ': 'a', 'ₑ': 'e', 'ₒ': 'o', 'ₓ': 'x', 'ₕ': 'h', 'ₖ': 'k', 'ₗ': 'l', 'ₘ': 'm', 'ₙ': 'n', 'ₚ': 'p', 'ₛ': 's', 'ₜ': 't', 'ᵢ': 'i', 'ⱼ': 'j' };
const GREEK_CHARS: Record<string, string> = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'θ': 'theta', 'λ': 'lambda', 'ω': 'omega', 'σ': 'sigma', 'κ': 'kappa', 'ζ': 'zeta', 'φ': 'phi', 'ψ': 'psi', 'ρ': 'rho', 'μ': 'mu', 'ν': 'nu', 'η': 'eta', 'χ': 'chi' };
const VULGAR: Record<string, string> = { '½': '(1/2)', '⅓': '(1/3)', '⅔': '(2/3)', '¼': '(1/4)', '¾': '(3/4)', '⅕': '(1/5)', '⅖': '(2/5)', '⅗': '(3/5)', '⅘': '(4/5)', '⅙': '(1/6)', '⅛': '(1/8)' };
const SIMPLE: Record<string, string> = { '−': '-', '–': '-', '—': '-', '‒': '-', '×': '*', '·': '*', '⋅': '*', '∙': '*', '∗': '*', '÷': '/', '⁄': '/', 'π': 'pi', 'τ': 'tau', 'ℯ': 'e', '“': '"', '”': '"', '\u00a0': ' ', '\u200b': '', '\u200c': '', '\u200d': '', '\ufeff': '', '\u2009': ' ', '\u202f': ' ' };
/** Precomposed letters with a macron (the mean bar) -> base letter, e.g. ȳ -> y. */
const MACRON_PRE: Record<string, string> = { 'ā': 'a', 'ē': 'e', 'ī': 'i', 'ō': 'o', 'ū': 'u', 'ȳ': 'y', 'Ā': 'A', 'Ē': 'E', 'Ī': 'I', 'Ō': 'O', 'Ū': 'U', 'Ȳ': 'Y' };

/**
 * Mean bar: x̄ (x + combining macron U+0304 / overline U+0305) and precomposed
 * ȳ become a distinct variable named "<letter>bar" (xbar, ybar), wrapped in the
 * same GV markers Greek letters use, so the tokenizer sees one variable.
 * x̄ is a DIFFERENT variable from x — the bar is not stripped, it is named.
 */
function barToPlain(s: string): string {
  return s
    // LaTeX \bar{x} / \overline{x} (braced or bare) — converted early so a
    // \bar{y} on the left of = is recognised as the dependent variable.
    .replace(/\\(?:bar|overline)\{([A-Za-z])\}/g, (_, l) => `${GV}${l}bar${GV}`)
    .replace(/\\(?:bar|overline)\s+([A-Za-z])(?![A-Za-z])/g, (_, l) => `${GV}${l}bar${GV}`)
    .replace(/([A-Za-z])([\u0304\u0305])/g, (_, l) => `${GV}${l}bar${GV}`)
    .replace(/[āēīōūȳĀĒĪŌŪȲ]/g, (ch) => `${GV}${MACRON_PRE[ch]}bar${GV}`);
}

/* ---------------------------------------------------------------- guards */
function unsupported(src: string): string | null {
  if (/[∫∮]|\\int\b|\\oint|\\iint/.test(src)) return "Integrals aren't supported — enter the function you want to graph instead.";
  if (/\\lim\b|\blim\b/i.test(src)) return "Limits aren't supported — enter the function itself.";
  if (/[∂]|\\partial|\bd\s*[xy]\s*\/\s*d\s*[xy]|\b[yf]\s*['′]/.test(src)) return "Derivatives and differential equations aren't supported — enter y = … directly.";
  if (/\\begin\s*\{|\bcases\b/.test(src)) return "Piecewise (cases) isn't supported yet — enter each piece as its own equation.";
  if (/∞|\\infty/.test(src)) return "∞ can't be graphed — use a finite number (e.g. 50 as the upper bound).";
  if (/\\vec|\\binom|\\choose|\\nabla|\\det/.test(src)) return "That notation isn't supported.";
  if (/<=|>=|[<>≤≥≠]|\\leq?\b|\\geq?\b|\\neq?\b/.test(src)) return "Inequalities can't be graphed — enter an equation like y = …";
  return null;
}

/* ---------------------------------------------------------------- LaTeX -> plain */
function readGroup(s: string, i: number): { body: string; end: number } | null {
  if (s[i] !== '{') return null;
  let d = 0;
  for (let j = i; j < s.length; j++) {
    if (s[j] === '{') d++;
    else if (s[j] === '}') { d--; if (d === 0) return { body: s.slice(i + 1, j), end: j + 1 }; }
  }
  return null;
}
function skipSp(s: string, i: number) { while (i < s.length && /\s/.test(s[i])) i++; return i; }
/** one LaTeX argument: {group} | \command | single char */
function readArg(s: string, i: number): { body: string; end: number } {
  i = skipSp(s, i);
  const g = readGroup(s, i);
  if (g) return g;
  if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))!; return { body: m[0], end: i + m[0].length }; }
  if (i < s.length) return { body: s[i], end: i + 1 };
  throw new NormErr('A LaTeX command is missing its argument.');
}
function sigmaMarker(kind: string, lower: string, upper: string): string {
  const m = /^\s*([A-Za-z])\s*(?:=|:)\s*(.+?)\s*$/.exec(lower || '');
  if (!m || !upper) throw new NormErr(`Σ needs bounds like k=0 to 12. Type it as sum(k=0,12, …).`);
  return `${MO}S${SEP}${kind}${SEP}${m[1]}${SEP}${m[2]}${SEP}${upper.trim()}${MC}`;
}
const LATEX_PLAIN_FN = new Set(['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'sinh', 'cosh', 'tanh', 'arcsin', 'arccos', 'arctan', 'ln', 'log', 'exp', 'min', 'max', 'sgn', 'lg', 'arsinh', 'arcosh', 'artanh']);
const LATEX_GREEK = new Set(['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'theta', 'vartheta', 'lambda', 'mu', 'nu', 'omega', 'sigma', 'rho', 'kappa', 'zeta', 'eta', 'phi', 'varphi', 'psi', 'chi']);

function latexToPlain(s: string, depth = 0): string {
  if (depth > 12) throw new NormErr('That formula is nested too deeply.');
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i))!;
      const cmd = m[1]; i += m[0].length;
      if (/^[,;:! ]$/.test(cmd) || ['left', 'right', 'displaystyle', 'limits', 'nolimits', 'big', 'Big', 'bigg', 'Bigg', 'quad', 'qquad'].includes(cmd)) { if ((cmd === 'left' || cmd === 'right') && s[i] === '.') i++; continue; }
      if (cmd === 'frac' || cmd === 'dfrac' || cmd === 'tfrac') {
        const a = readArg(s, i); const b = readArg(s, a.end); i = b.end;
        out += `((${latexToPlain(a.body, depth + 1)})/(${latexToPlain(b.body, depth + 1)}))`; continue;
      }
      if (cmd === 'sqrt') {
        let n: string | null = null; let j = skipSp(s, i);
        if (s[j] === '[') { const k = s.indexOf(']', j); if (k < 0) throw new NormErr('\\sqrt[ is missing its ].'); n = s.slice(j + 1, k); i = k + 1; }
        const a = readArg(s, i); i = a.end;
        out += n ? `nthRoot(${latexToPlain(a.body, depth + 1)},${latexToPlain(n, depth + 1)})` : `sqrt(${latexToPlain(a.body, depth + 1)})`; continue;
      }
      if (cmd === 'sum' || cmd === 'prod') {
        let lower = '', upper = '';
        for (let k = 0; k < 2; k++) {
          let j = skipSp(s, i);
          if (s.slice(j, j + 7) === '\\limits') j = skipSp(s, j + 7);
          if (s[j] === '_') { const a = readArg(s, j + 1); lower = latexToPlain(a.body, depth + 1); i = a.end; }
          else if (s[j] === '^') { const a = readArg(s, j + 1); upper = latexToPlain(a.body, depth + 1); i = a.end; }
          else break;
        }
        out += sigmaMarker(cmd, lower, upper); continue;
      }
      if (cmd === 'operatorname' || cmd === 'mathrm' || cmd === 'mathit' || cmd === 'text' || cmd === 'textbf' || cmd === 'mathbf') {
        const a = readArg(s, i); i = a.end; out += latexToPlain(a.body, depth + 1); continue;
      }
      if (cmd === 'cdot' || cmd === 'times' || cmd === 'ast' || cmd === 'bullet') { out += '*'; continue; }
      if (cmd === 'div') { out += '/'; continue; }
      if (cmd === 'pi') { out += 'pi'; continue; }
      if (cmd === 'tau') { out += 'tau'; continue; }
      if (cmd === 'bar' || cmd === 'overline') {
        const a = readArg(s, i); i = a.end;
        const body = a.body.trim();
        if (!/^[A-Za-z]$/.test(body)) throw new NormErr('\\bar only works on a single letter, e.g. \\bar{x}.');
        out += `${GV}${body}bar${GV}`; continue;
      }
      if (cmd === 'lfloor') { out += 'floor('; continue; } if (cmd === 'rfloor') { out += ')'; continue; }
      if (cmd === 'lceil') { out += 'ceil('; continue; } if (cmd === 'rceil') { out += ')'; continue; }
      if (cmd === 'circ' || cmd === 'degree') { out += '*(pi/180)'; continue; }
      if (cmd === '{' || cmd === '(') { out += '('; continue; } if (cmd === '}' || cmd === ')') { out += ')'; continue; }
      if (cmd === '|') { out += '|'; continue; }
      if (LATEX_GREEK.has(cmd)) { out += `${GV}${cmd.replace(/^var/, '')}${GV}`; continue; }
      if (cmd === 'log' && s[skipSp(s, i)] === '_') {
        const a = readArg(s, skipSp(s, i) + 1); i = a.end;
        const b = a.body.trim();
        if (b === '10') out += 'log10'; else if (b === '2') out += 'log2';
        else throw new NormErr('log with a base other than 10 or 2: write log(x, base).');
        continue;
      }
      if (LATEX_PLAIN_FN.has(cmd)) { out += cmd; continue; }
      throw new NormErr(`The LaTeX command \\${cmd} isn't supported.`);
    }
    if (c === '^') {
      const a = readArg(s, i + 1); i = a.end;
      const body = a.body.trim();
      if (body === '\\circ' || body === '°') { out += '*(pi/180)'; continue; }
      out += `^(${latexToPlain(a.body, depth + 1)})`; continue;
    }
    if (c === '_') throw new NormErr("Subscripts (like x₁) aren't supported — use a plain letter such as a or b.");
    if (c === '{') { const g = readGroup(s, i); if (!g) throw new NormErr('Unbalanced { } in the LaTeX.'); out += `(${latexToPlain(g.body, depth + 1)})`; i = g.end; continue; }
    if (c === '}') throw new NormErr('Unbalanced { } in the LaTeX.');
    out += c; i++;
  }
  return out;
}

/* ---------------------------------------------------------------- Unicode -> plain */
function mapRun(s: string, i: number, table: Record<string, string>): { text: string; end: number } {
  let j = i, t = '';
  while (j < s.length && table[s[j]] !== undefined) { t += table[s[j]]; j++; }
  return { text: t, end: j };
}
function matching(s: string, i: number, open: string, close: string): number {
  let d = 0;
  for (let j = i; j < s.length; j++) { if (s[j] === open) d++; else if (s[j] === close) { d--; if (d === 0) return j; } }
  return -1;
}
function parseHeader(h: string): { idx: string; lo: string; hi: string } | null {
  const m = /^\s*([A-Za-z])\s*(?:=|:|\bfrom\b)\s*(.+?)\s*(?:\.\.\.?|…|\bto\b|→|\bthrough\b)\s*(.+?)\s*$/i.exec(h);
  return m ? { idx: m[1], lo: m[2], hi: m[3] } : null;
}
/** Split on top-level commas only (commas inside brackets don't split). */
function splitTopCommas(s: string): string[] {
  const parts: string[] = []; let d = 0, last = 0;
  for (let k = 0; k < s.length; k++) { const ch = s[k]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ',' && d === 0) { parts.push(s.slice(last, k)); last = k + 1; } }
  parts.push(s.slice(last)); return parts;
}
/**
 * Bounds + optional body inside Σ(...) / ∏(...): "k=0 to 12, 1/2^k",
 * "k=0..12, 1/2^k" and "k=0,12, 1/2^k". The body is the remainder after
 * the header parts; without a body the term follows outside the brackets.
 */
function parseSigmaParen(inside: string): { idx: string; lo: string; hi: string; body: string } | null {
  const parts = splitTopCommas(inside);
  const h1 = parseHeader(parts[0]);
  if (h1) return { ...h1, body: parts.slice(1).join(',').trim() };
  if (parts.length >= 2) {
    const m0 = /^\s*([A-Za-z])\s*=\s*(.+?)\s*$/.exec(parts[0]);
    if (m0 && parts[1].trim()) return { idx: m0[1], lo: m0[2], hi: parts[1].trim(), body: parts.slice(2).join(',').trim() };
  }
  return null;
}
function unicodeToPlain(s: string): string {
  s = barToPlain(s);
  let out = '', i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === '∑' || c === 'Σ' || c === '∏') {
      const kind = c === '∏' ? 'prod' : 'sum';
      let j = i + 1, lower = '', upper = '', emitted = false;
      for (let k = 0; k < 3; k++) {
        j = skipSp(s, j);
        if (SUB[s[j]] !== undefined) { const r = mapRun(s, j, SUB); lower = r.text; j = r.end; }
        else if (s[j] === '_') { const a = readArg(s, j + 1); lower = a.body; j = a.end; }
        else if (SUP[s[j]] !== undefined) { const r = mapRun(s, j, SUP); upper = r.text; j = r.end; }
        else if (s[j] === '^') { const a = readArg(s, j + 1); upper = a.body; j = a.end; }
        else if (s[j] === '(' && !lower && !upper) {
          const e = matching(s, j, '(', ')');
          if (e > 0) {
            const h = parseSigmaParen(s.slice(j + 1, e));
            if (h) {
              out += `${MO}S${SEP}${kind}${SEP}${h.idx}${SEP}${h.lo}${SEP}${h.hi}${MC}`;
              if (h.body) out += `${BO}${unicodeToPlain(h.body)}${BC}`;
              j = e + 1; emitted = true;
            }
          }
          break;
        }
        else break;
      }
      if (!emitted) out += sigmaMarker(kind, lower, upper);
      i = j; continue;
    }
    if (c === '√' || c === '∛' || c === '∜') {
      const fn = c === '√' ? 'sqrt' : c === '∛' ? 'cbrt' : 'nthRoot';
      let j = skipSp(s, i + 1), inner = '';
      if (s[j] === '(') { const e = matching(s, j, '(', ')'); if (e < 0) throw new NormErr('Unbalanced ( ) after √.'); inner = unicodeToPlain(s.slice(j + 1, e)); j = e + 1; }
      else {
        const m = /^(\d+(?:\.\d+)?|[A-Za-z]|π|τ)/.exec(s.slice(j));
        if (!m) throw new NormErr('√ needs a number, a letter or (…) after it.');
        j += m[0].length;
        const sup = mapRun(s, j, SUP); j = sup.end;
        inner = unicodeToPlain(m[0]) + (sup.text ? `^(${sup.text})` : '');
      }
      out += fn === 'nthRoot' ? `nthRoot(${inner},4)` : `${fn}(${inner})`;
      i = j; continue;
    }
    if (SUP[c] !== undefined) { const r = mapRun(s, i, SUP); out += `^(${r.text})`; i = r.end; continue; }
    if (SUB[c] !== undefined) throw new NormErr("Subscripts (like x₁) aren't supported — use a plain letter such as a or b.");
    if (VULGAR[c]) { out += VULGAR[c]; i++; continue; }
    if (GREEK_CHARS[c]) { out += `${GV}${GREEK_CHARS[c]}${GV}`; i++; continue; }
    if (c === '°') { out += '*(pi/180)'; i++; continue; }
    if (SIMPLE[c] !== undefined) { out += SIMPLE[c]; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* ---------------------------------------------------------------- word-form sums: sum(k=0 to 12)[…] / sum(k=0,12, …) */
function asciiSums(s: string): string {
  let out = '', i = 0;
  const re = /\b(sum|prod)\s*(?=[(_])/gi;
  while (i < s.length) {
    re.lastIndex = i;
    const m = re.exec(s);
    if (!m) { out += s.slice(i); break; }
    out += s.slice(i, m.index);
    const kind = m[1].toLowerCase();
    let j = m.index + m[0].length;
    if (s[j] === '_') { // sum_{k=0}^{12} or sum_(k=0)^(12)
      const rd = (k: number) => { k = skipSp(s, k); if (s[k] === '{') { const g = readGroup(s, k); if (!g) throw new NormErr('Unbalanced { }.'); return { body: g.body, end: g.end }; } if (s[k] === '(') { const e = matching(s, k, '(', ')'); if (e < 0) throw new NormErr('Unbalanced ( ).'); return { body: s.slice(k + 1, e), end: e + 1 }; } const mm = /^[A-Za-z0-9=+\-]+/.exec(s.slice(k)); if (!mm) throw new NormErr('Σ bounds are missing.'); return { body: mm[0], end: k + mm[0].length }; };
      const a = rd(j + 1); let k = skipSp(s, a.end);
      if (s[k] !== '^') throw new NormErr('Σ needs an upper bound after ^.');
      const b = rd(k + 1);
      out += sigmaMarker(kind, a.body, b.body); i = b.end; continue;
    }
    // sum( … )
    const e = matching(s, j, '(', ')');
    if (e < 0) throw new NormErr('Unbalanced ( ) in sum(…).');
    const inside = s.slice(j + 1, e);
    const parts: string[] = []; let d = 0, last = 0;
    for (let k = 0; k < inside.length; k++) { const ch = inside[k]; if ('([{'.includes(ch)) d++; else if (')]}'.includes(ch)) d--; else if (ch === ',' && d === 0) { parts.push(inside.slice(last, k)); last = k + 1; } }
    parts.push(inside.slice(last));
    if (parts.length === 3) { // canonical: sum(k=0,12, body)
      const h = /^\s*([A-Za-z])\s*=\s*(.+?)\s*$/.exec(parts[0]);
      if (!h) throw new NormErr('sum(…) must start with the index, e.g. sum(k=0,12, …).');
      out += `${MO}S${SEP}${kind}${SEP}${h[1]}${SEP}${h[2]}${SEP}${parts[1].trim()}${MC}${BO}${asciiSums(parts[2])}${BC}`; i = e + 1; continue;
    }
    const h = parseHeader(inside);
    if (!h) throw new NormErr('Could not read the Σ bounds. Type it as sum(k=0,12, …).');
    const marker = `${MO}S${SEP}${kind}${SEP}${h.idx}${SEP}${h.lo}${SEP}${h.hi}${MC}`;
    let k = skipSp(s, e + 1);
    if (s[k] === '*') k = skipSp(s, k + 1);
    const open = s[k], close = open === '[' ? ']' : open === '{' ? '}' : open === '(' ? ')' : '';
    if (close) { const ce = matching(s, k, open, close); if (ce < 0) throw new NormErr('Unbalanced brackets after Σ.'); out += `${marker}${BO}${asciiSums(s.slice(k + 1, ce))}${BC}`; i = ce + 1; }
    else { out += marker; i = e + 1; }
  }
  return out;
}

/* ---------------------------------------------------------------- tokens */
type Tok =
  | { t: 'num'; v: string } | { t: 'var'; v: string; bound?: boolean } | { t: 'const'; v: string } | { t: 'fn'; v: string }
  | { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '!' | '=' } | { t: 'lp' } | { t: 'rp' } | { t: 'comma' } | { t: 'bar' }
  | { t: 'sum'; kind: string; idx: string; lo: string; hi: string; explicit: boolean };

function splitRun(run: string, nextIsLP: boolean, notes: string[]): Tok[] {
  const low = run.toLowerCase();
  if (low === 'sum' || low === 'prod') throw new NormErr('Σ needs bounds. Type it as sum(k=0,12, …).');
  // "mean" is the average of a curve, not a function of x — and a bare word
  // must never silently split into a product (mean -> m*e*a*n was wrong).
  if (low === 'mean') throw new NormErr('"mean" is the average of a curve, not a function of x. Enter the function itself (e.g. sin(x)) — or use the mean symbol x̄ for a mean value.');
  if (low === 'median' || low === 'mode' || low === 'average') throw new NormErr(`"${run}" isn't a function of x — enter the function itself (e.g. sin(x)).`);
  if (nextIsLP && run.length > 2 && !NAMES.some(n => n.toLowerCase() === low)) throw new NormErr(`"${run}(" isn't a function MathSonify knows.`);
  const toks: Tok[] = []; let i = 0, singles = 0;
  while (i < run.length) {
    const rest = run.slice(i), lo = rest.toLowerCase();
    let hit: string | null = null;
    for (const n of NAMES) { const nl = n.toLowerCase(); if (lo.startsWith(nl) && (n.length > 1 || rest[0] === 'e')) { hit = n; break; } }
    if (hit) {
      if (FN_ALIAS[hit]) toks.push({ t: 'fn', v: FN_ALIAS[hit] });
      else if (FN_NAMES.includes(hit)) { if (hit === 'log') notes.push('log is read as the natural logarithm (ln). Use log10(x) for base 10.'); toks.push({ t: 'fn', v: hit }); }
      // A one-letter constant ('e') is still a single letter: a long run made
      // only of single letters is a word, not a product — "hello" must fail,
      // not become h*e*l*l*o. Multi-letter names (pi, theta, sin) don't count.
      else if (CONSTS.includes(hit)) { toks.push({ t: 'const', v: hit }); if (hit.length === 1) singles++; }
      else toks.push({ t: 'var', v: hit });
      i += hit.length;
    } else { toks.push({ t: 'var', v: rest[0] }); singles++; i++; }
  }
  if (run.length >= 4 && singles === run.length) throw new NormErr(`"${run}" isn't a known function or constant.`);
  return toks;
}

function tokenize(s: string, notes: string[]): Tok[] {
  const toks: Tok[] = []; let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === MO) {
      const e = s.indexOf(MC, i); const f = s.slice(i + 2, e).split(SEP);
      const explicit = s[e + 1] === BO;
      toks.push({ t: 'sum', kind: f[1], idx: f[2], lo: f[3], hi: f[4], explicit }); i = e + 1; continue;
    }
    if (c === BO) { toks.push({ t: 'lp' }); i++; continue; }
    if (c === BC) { toks.push({ t: 'rp' }); i++; continue; }
    if (c === GV) { const e = s.indexOf(GV, i + 1); toks.push({ t: 'var', v: s.slice(i + 1, e) }); i = e + 1; continue; }
    const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+(?![A-Za-z(]))?/.exec(s.slice(i));
    if (num) { toks.push({ t: 'num', v: num[0] }); i += num[0].length; continue; }
    const run = /^[A-Za-z]+/.exec(s.slice(i));
    if (run) {
      let word = run[0]; i += word.length;
      if (/log$/i.test(word)) { const d = /^(10|2)(?!\d)/.exec(s.slice(i)); if (d) { word += d[1]; i += d[1].length; } }
      toks.push(...splitRun(word, s[skipSp(s, i)] === '(', notes)); continue;
    }
    if (c === '*' && s[i + 1] === '*') { toks.push({ t: 'op', v: '^' }); i += 2; continue; }
    if ('+-*/^!='.includes(c)) { toks.push({ t: 'op', v: c as '+' }); i++; continue; }
    if ('([{'.includes(c)) { toks.push({ t: 'lp' }); i++; continue; }
    if (')]}'.includes(c)) { toks.push({ t: 'rp' }); i++; continue; }
    if (c === '_') throw new NormErr("Subscripts (like x₁) aren't supported — use a plain letter such as a or b.");
    if (c === ',') { toks.push({ t: 'comma' }); i++; continue; }
    if (c === '|') { toks.push({ t: 'bar' }); i++; continue; }
    throw new NormErr(`The character "${c}" isn't supported.`);
  }
  return toks;
}

const isOp = (t: Tok | undefined, v: string) => !!t && t.t === 'op' && t.v === v;
function matchGroup(toks: Tok[], i: number): number {
  let d = 0;
  for (let j = i; j < toks.length; j++) { if (toks[j].t === 'lp') d++; else if (toks[j].t === 'rp') { d--; if (d === 0) return j; } }
  throw new NormErr("The brackets don't match.");
}
const endsAtom = (t: Tok) => t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'rp' || isOp(t, '!');
const startsAtom = (t: Tok) => t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'lp' || t.t === 'fn';

function resolveBars(toks: Tok[]): Tok[] {
  const out: Tok[] = []; let open = 0;
  for (const t of toks) {
    if (t.t !== 'bar') { out.push(t); continue; }
    const prev = out[out.length - 1];
    const closer = open > 0 && !!prev && endsAtom(prev);
    if (closer) { out.push({ t: 'rp' }); open--; } else { out.push({ t: 'fn', v: 'abs' }, { t: 'lp' }); open++; }
  }
  if (open !== 0) throw new NormErr("The | | bars don't match.");
  return out;
}
function readExponent(toks: Tok[], k: number): { toks: Tok[]; next: number } {
  let j = k;
  if (isOp(toks[j], '-') || isOp(toks[j], '+')) j++;
  const t = toks[j];
  if (!t) throw new NormErr('An exponent is missing after ^.');
  if (t.t === 'lp') j = matchGroup(toks, j) + 1;
  else if (t.t === 'num' || t.t === 'var' || t.t === 'const') j++;
  else if (t.t === 'fn' && toks[j + 1]?.t === 'lp') j = matchGroup(toks, j + 1) + 1;
  else throw new NormErr('That exponent is not supported.');
  return { toks: toks.slice(k, j), next: j };
}
function readChain(toks: Tok[], j: number): { toks: Tok[]; next: number } {
  const start = j;
  while (j < toks.length) {
    const t = toks[j];
    if (!(t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'lp')) break;
    j = t.t === 'lp' ? matchGroup(toks, j) + 1 : j + 1;
    while (isOp(toks[j], '!')) j++;
    if (isOp(toks[j], '^')) j = readExponent(toks, j + 1).next;
  }
  return { toks: toks.slice(start, j), next: j };
}
function argify(toks: Tok[]): Tok[] {
  const out: Tok[] = []; let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t === 'fn') {
      let j = i + 1, expo: Tok[] | null = null;
      if (isOp(toks[j], '^')) { const r = readExponent(toks, j + 1); expo = r.toks; j = r.next; }
      let arg: Tok[];
      if (toks[j]?.t === 'lp') { const e = matchGroup(toks, j); arg = argify(toks.slice(j + 1, e)); j = e + 1; }
      else { const r = readChain(toks, j); if (!r.toks.length) throw new NormErr(`"${t.v}" needs something to apply to, e.g. ${t.v}(x).`); arg = argify(r.toks); j = r.next; }
      let name = t.v;
      if (expo && expo.length === 2 && isOp(expo[0], '-') && expo[1].t === 'num' && expo[1].v === '1') {
        if (!INVERSE[name]) throw new NormErr(`${name}^-1 is only supported for trig functions.`);
        name = INVERSE[name]; expo = null;
      }
      const call: Tok[] = [{ t: 'fn', v: name }, { t: 'lp' }, ...arg, { t: 'rp' }];
      if (expo) out.push({ t: 'lp' }, ...call, { t: 'rp' }, { t: 'op', v: '^' }, { t: 'lp' }, ...argify(expo), { t: 'rp' });
      else out.push(...call);
      i = j; continue;
    }
    if (t.t === 'lp') { const e = matchGroup(toks, i); out.push(t, ...argify(toks.slice(i + 1, e)), toks[e]); i = e + 1; continue; }
    out.push(t); i++;
  }
  return out;
}
function resolveSums(toks: Tok[], depth = 0): Tok[] {
  if (depth > 8) throw new NormErr('Σ is nested too deeply.');
  const out: Tok[] = []; let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (t.t !== 'sum') { out.push(t); i++; continue; }
    let body: Tok[]; const bs = i + 1;
    if (t.explicit) {
      if (toks[bs]?.t !== 'lp') throw new NormErr('The Σ body is missing.');
      const e = matchGroup(toks, bs); body = toks.slice(bs + 1, e); i = e + 1;
    } else {
      let d = 0, j = bs;
      for (; j < toks.length; j++) {
        const u = toks[j];
        if (u.t === 'lp') d++; else if (u.t === 'rp') { if (d === 0) break; d--; }
        else if (d === 0 && (u.t === 'comma' || ((isOp(u, '+') || isOp(u, '-')) && j > bs))) break;
      }
      body = toks.slice(bs, j); i = j;
    }
    if (!body.length) throw new NormErr('The Σ has no term after it.');
    const inner = resolveSums(body, depth + 1).map(b => (b.t === 'var' && b.v === t.idx ? { ...b, bound: true } : b));
    const lo = finishTokens(t.lo, [], depth + 1), hi = finishTokens(t.hi, [], depth + 1);
    out.push({ t: 'fn', v: t.kind }, { t: 'lp' }, { t: 'var', v: t.idx, bound: true }, { t: 'op', v: '=' }, ...lo, { t: 'comma' }, ...hi, { t: 'comma' }, ...inner, { t: 'rp' });
  }
  return out;
}
function implicitMul(toks: Tok[]): Tok[] {
  const out: Tok[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i], b = toks[i + 1];
    out.push(a);
    if (b && endsAtom(a) && startsAtom(b)) out.push({ t: 'op', v: '*' });
  }
  return out;
}
function finishTokens(plain: string, notes: string[], depth = 0): Tok[] {
  return implicitMul(resolveSums(argify(resolveBars(tokenize(toPlain(plain), notes))), depth));
}
function toPlain(s: string): string {
  const a = /\\/.test(s) ? latexToPlain(s) : s;
  return asciiSums(unicodeToPlain(a));
}
function render(toks: Tok[]): string {
  return toks.map(t => t.t === 'num' || t.t === 'var' || t.t === 'const' || t.t === 'fn' || t.t === 'op' ? t.v : t.t === 'lp' ? '(' : t.t === 'rp' ? ')' : t.t === 'comma' ? ',' : '').join('');
}
function pretty(toks: Tok[]): string {
  let s = '';
  toks.forEach((t, i) => {
    const prev = toks[i - 1];
    const binary = prev && endsAtom(prev);
    if (t.t === 'op' && (t.v === '+' || t.v === '-') && binary) s += ` ${t.v} `;
    else if (t.t === 'op' && (t.v === '*' || t.v === '/')) s += t.v === '*' ? '·' : '/';
    else if (t.t === 'comma') s += ', ';
    else if (t.t === 'var' && t.v.length > 3 && t.v.endsWith('bar')) s += `${t.v.slice(0, -3)}\u0304`;
    else s += render([t]);
  });
  return s;
}

/* ---------------------------------------------------------------- public API */
/**
 * Option A (Nov 7, 2026): the Studio's parser only allows x, pi, e and tau,
 * and there are no parameter sliders — so on "Use" every free parameter is
 * set to 1 and the number lands in the equation, where the user can edit it.
 * Word-boundary replacement, longest names first, so "a" never corrupts
 * "alpha" and "xbar" never corrupts "x".
 */
export function substituteParams(expr: string, params: string[], value = 1): string {
  if (!params.length) return expr;
  const escaped = [...params]
    .sort((a, b) => b.length - a.length)
    .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return expr.replace(new RegExp(`\\b(${escaped.join('|')})\\b`, 'g'), String(value));
}

export function normalizePasted(raw: string): NormalizeResult {
  const fail = (error: string): NormalizeResult => ({ ok: false, expr: '', display: '', notes: [], params: [], xVar: 'x', error });
  try {
    let src = (raw ?? '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim();
    if (!src) return fail('Paste an equation to graph it.');
    if (src.length > 1000) return fail('That is too long to graph (limit 1000 characters).');
    src = src.replace(/^\${1,2}|\${1,2}$/g, '').replace(/^\\\(|\\\)$/g, '').replace(/^\\\[|\\\]$/g, '').replace(/[.;]\s*$/, '').trim();
    src = barToPlain(src);
    const un = unsupported(src); if (un) return fail(un);
    const lhs = /^\s*(?:(?:y|f|g|h|Y|F)\s*(?:\(\s*[A-Za-z]\s*\))?)\s*(?:=|:=)\s*/.exec(src);
    if (lhs) src = src.slice(lhs[0].length);
    else if (/^\s*(?:x|r|ρ|θ|t)\s*(?:\(\s*[A-Za-z]\s*\))?\s*=/i.test(src)) return fail('Only y = f(x) style equations can be graphed (not x = f(y), polar, or parametric ones). Solve for y first.');
    // A mean-bar on the left: ȳ = … is the dependent variable; x̄ = … is not.
    const barLhs = /^\s*\u2064([A-Za-z]+)bar\u2064\s*(?:\(\s*[A-Za-z]+\s*\))?\s*(?:=|:=)\s*/.exec(src);
    if (barLhs) {
      if (barLhs[1] === 'y' || barLhs[1] === 'Y') src = src.slice(barLhs[0].length);
      else return fail('Only y = f(x) style equations can be graphed (not x = f(y), polar, or parametric ones). Solve for y first.');
    }
    const plain = toPlain(src);
    if (plain.replace(/\u27e6[^\u27e7]*\u27e7/g, '').includes('=')) return fail('That looks like an implicit equation (it has = in the middle). Rewrite it as y = f(x).');
    const notes: string[] = [];
    let toks = tokenize(plain, notes);
    toks = implicitMul(resolveSums(argify(resolveBars(toks))));
    // brackets must balance
    let d = 0; for (const t of toks) { if (t.t === 'lp') d++; else if (t.t === 'rp') { d--; if (d < 0) break; } }
    if (d !== 0) return fail("The brackets don't match.");
    if (!toks.length) return fail('Paste an equation to graph it.');

    // which symbol is x, which are parameters
    const unbound: string[] = [];
    for (const t of toks) if (t.t === 'var' && !t.bound && !unbound.includes(t.v)) unbound.push(t.v);
    let xVar = 'x';
    if (!unbound.includes('x')) {
      const pref = ['t', 'theta', 'u', 's', 'z', 'w'].find(v => unbound.includes(v));
      if (pref) xVar = pref; else if (unbound.length === 1) xVar = unbound[0];
      if (xVar !== 'x') notes.push(`Treated ${xVar} as the horizontal variable x.`);
    }
    const params = unbound.filter(v => v !== xVar);
    if (params.length > 6) return fail('Too many unknown constants (' + params.join(', ') + '). Put numbers in for some of them.');
    if (xVar !== 'x') toks = toks.map(t => (t.t === 'var' && !t.bound && t.v === xVar ? { ...t, v: 'x' } : t));
    if (params.length) notes.push(`Unknown constants found: ${params.join(', ')}. They are set to 1 when applied — edit the number in the equation to change them.`);
    if (toks.length > 4000) return fail('That formula is too large to graph.');
    return { ok: true, expr: render(toks), display: pretty(toks), notes: Array.from(new Set(notes)), params, xVar };
  } catch (e) {
    return fail(e instanceof NormErr ? `${e.message} ${HELP}` : `We couldn't read that equation. ${HELP}`);
  }
}
