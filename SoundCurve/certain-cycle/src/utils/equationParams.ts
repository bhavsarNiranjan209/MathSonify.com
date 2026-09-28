/**
 * Parameterized equation model.
 *
 * Turns a supported equation into an editable parameter set, edits those
 * parameters, and serialises them back to an equation string. This is the
 * single source of truth behind the graph control points: the handles, the
 * equation text and the audio all read from the SAME parameters, so they can
 * never disagree.
 *
 * Only equation families that can be represented exactly are accepted. An
 * equation we cannot parameterise reports as `null` and the UI then offers
 * plain text editing rather than showing misleading handles.
 *
 * Supported families:
 *   A·sin(Bx + C) + D      periodic (sin/cos): amplitude/frequency/phase/offset
 *   A·x + D                linear: slope/offset
 *   A·x² + B·x + D         quadratic: a/b/c
 *   A·√(B·x + C) + D       root, with real-domain care
 *   A·e^(B·x) + D          exponential
 *
 * © 2026 MathSonify
 */

import { sanitizeEquationString } from './equationParser';

/**
 * Editable handles exposed on the graph.
 * `rate` is the exponential growth rate; it is stored in `frequency` because
 * both are the coefficient of x inside the function, but they are edited with
 * different affordances (different handles, different allowed ranges).
 */
export type ParamKey =
  | 'amplitude'
  | 'frequency'
  | 'phase'
  | 'offset'
  | 'linearTerm'
  | 'rootConstant'
  | 'rate';

/** Which field of `EquationParams` a handle actually writes to. */
export const PARAM_TARGET: Record<ParamKey, keyof EquationParams> = {
  amplitude: 'amplitude',
  frequency: 'frequency',
  phase: 'phase',
  offset: 'offset',
  linearTerm: 'linearTerm',
  rootConstant: 'rootConstant',
  rate: 'frequency',
};

/** One draggable handle and where it sits on the curve. */
export interface ControlHandle {
  key: ParamKey;
  label: string;
  /** Value the handle currently represents. */
  value: number;
  /** Anchor point in math coordinates, used to place the handle. */
  at: { x: number; y: number };
  /** Short human label, e.g. "1.42" or "π/4". */
  display: string;
}

export type ParamFamily = 'periodic' | 'linear' | 'quadratic' | 'root' | 'exponential';

export interface EquationParams {
  family: ParamFamily;
  /** Amplitude (or slope for linear, leading coefficient elsewhere). */
  amplitude: number;
  /** Frequency (periodic) / root inner scale / exponent rate. */
  frequency: number;
  /** Phase offset in radians (periodic only). */
  phase: number;
  /** Vertical offset. */
  offset: number;
  /** Linear/quadratic middle term. */
  linearTerm: number;
  /** Constant inside the radical. */
  rootConstant: number;
}

const EPS = 1e-9;

/** Round to 4 decimals and drop trailing zeros so equations stay readable. */
export function tidy(value: number): string {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 10000) / 10000;
  if (Math.abs(rounded) < EPS) return '0';
  return String(rounded);
}

/** Format a phase for display, preferring π notation. */
export function formatPhase(phase: number): string {
  if (Math.abs(phase) < 0.005) return '0';

  // Prefer a π fraction (π/4, 3π/2, …) when the phase is a close rational
  // multiple of π — those read far better in an equation than 0.7854.
  const overPi = phase / Math.PI;
  for (const [denominator, tolerance] of [[2, 0.02], [3, 0.015], [4, 0.01], [6, 0.008]] as const) {
    const numerator = Math.round(overPi * denominator);
    if (numerator === 0) continue;
    if (Math.abs(overPi - numerator / denominator) < tolerance) {
      // The loop only visits denominators of 2, 3, 4 and 6, so a bare "π" is
      // handled by the `Math.abs(overPi - 1)` branch below.
      return `${numerator > 0 ? '' : '-'}π/${denominator}`;
    }
  }

  const whole = Math.round(overPi);
  if (whole !== 0 && Math.abs(overPi - whole) < 0.02) {
    const magnitude = Math.abs(whole) === 1 ? 'π' : `${Math.abs(whole)}π`;
    return whole > 0 ? magnitude : `-${magnitude}`;
  }

  return tidy(phase);
}

function toNumber(token: string | undefined): number | null {
  if (token === undefined) return null;
  const value = Number(token);
  return Number.isFinite(value) ? value : null;
}

/**
 * Convert a phase token to radians.
 * Handles "pi/2" (π/2), "pi * 2" (2π), a bare "pi" (π) and plain numbers.
 * Returns null when the token is not one of those.
 */
function parsePhaseToken(token: string): number | null {
  const t = token.replace(/\s+/g, '');
  if (/^pi$/i.test(t)) return Math.PI;

  const piFraction = t.match(/^pi(?:\/([\d.]+)|\*([\d.]+))$/i);
  if (piFraction) {
    const divisor = piFraction[1] ? Number(piFraction[1]) : Number(piFraction[2]);
    if (!Number.isFinite(divisor) || divisor === 0) return null;
    return piFraction[1] ? Math.PI / divisor : Math.PI * divisor;
  }

  const value = Number(t);
  return Number.isFinite(value) ? value : null;
}

/**
 * Extract a single numeric factor from a product term.
 * Handles: "2", "2.5", "-3", "1/2", "3/4", "" (=1), "-"(=-1).
 * Rejects anything containing a variable, so "2x" is not read as 2.
 */
function coefficient(term: string): number | null {
  // Strip the sign and any internal whitespace, so a term split out of
  // "sin(x) + 3" as "+ 3" is read as +3 rather than rejected.
  const t = term.replace(/\s+/g, '');
  if (t === '') return 1;
  if (t === '+') return 1;
  if (t === '-') return -1;
  const frac = t.match(/^([+-]?[\d.]+)\/([\d.]+)$/);
  if (frac) {
    const numerator = Number(frac[1]);
    const denominator = Number(frac[2]);
    if (denominator === 0) return null;
    return numerator / denominator;
  }
  if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(t)) return Number(t);
  return null;
}

/** Split "+"/"-" separated top-level terms, keeping each sign on its term. */
function splitTerms(expr: string): string[] {
  const terms: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0 && (ch === '+' || ch === '-') && i > 0) {
      // Never split on a sign that belongs to an exponent (x^-1) or to 'e'.
      if (expr[i - 1] === '^' || /[eE]/.test(expr[i - 1] ?? '')) { current += ch; continue; }
      terms.push(current);
      current = ch;
      continue;
    }
    current += ch;
  }
  terms.push(current);
  return terms;
}

/** Split a product into factors on top-level `*` (ignoring `**` and parens). */
function splitFactors(term: string): string[] {
  const factors: string[] = [];
  let current = '';
  let depth = 0;
  for (let i = 0; i < term.length; i++) {
    const ch = term[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '*' && depth === 0) {
      if (term[i + 1] === '*') { current += '**'; i++; continue; }
      factors.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  factors.push(current);
  return factors;
}

// Matchers are applied to ONE factor of a product, after `sanitizeEquationString`
// has expanded implicit multiplication, so a scaled argument arrives as "3*x"
// and a bare one as "x".
//
// Three easy-to-break details, noted so they are not "simplified" back into bugs:
//  * the exponential alternation is (?:exp|e) — (?:e|exp) would match the
//    leading "e" of "exp" and then fail on the trailing "xp";
//  * the scaled-x group keeps its separator so the regex cannot stop early at
//    "3" and then fail to match "*x";
//  * the OUTER coefficient must require a trailing "*" as well. Without it the
//    optional group happily eats "0.5" in "0.5*exp(0.5*x)" and leaves a head
//    that no longer starts with a function name, so the term is rejected;
//  * exponentiation is written BOTH ways in the wild — mathjs accepts both
//    "exp(x)" and "e^(x)" — so the caret is optional here.
const NUM = '[\\d.]+(?:\\s*\\/\\s*[\\d.]+)?';
// An optional leading coefficient. The separator is inside the group so the
// coefficient and its "*" either both appear or both are absent — making them
// independent would let a bare "sin(x)" match the "s" as a coefficient.
const LEAD = `(?:(${NUM})\\s*\\*\\s*)?`;
const SCALED_X = `(?:(${NUM})\\s*\\*\\s*)?x`; // "x" or "3*x"
// A phase term: "pi/2", "pi * 2", "1.5" or "pi"
const PHASE = `(pi\\s*(?:\\*\\s*${NUM}|\\/\\s*[\\d.]+)?|${NUM})`;
const PERIODIC = new RegExp(
  `^${LEAD}(sin|cos)\\s*\\(\\s*${SCALED_X}\\s*(?:([+-])\\s*${PHASE})?\\s*\\)$`,
);
const ROOT = new RegExp(
  `^${LEAD}sqrt\\s*\\(\\s*${SCALED_X}\\s*(?:([+-])\\s*(${NUM}))?\\s*\\)$`,
);
const EXPONENTIAL = new RegExp(
  `^${LEAD}(?:exp|e)\\s*(?:\\^\\s*)?\\(\\s*${SCALED_X}\\s*\\)$`,
);
// The coefficient is optional AND its sign is optional, so a bare "-x" (a sign
// with no digits) parses as slope -1. Written as alternation rather than a
// trailing "?" so "-x" and "x" are both reachable.
const SIGNED_COEF = '([+-]?(?:[\\d.]+(?:\\s*\\/\\s*[\\d.]+)?)?)';
const QUADRATIC = new RegExp(`^${SIGNED_COEF}\\s*\\**\\s*x\\s*\\^\\s*2$`);
const LINEAR = new RegExp(`^${SIGNED_COEF}\\s*\\**\\s*x$`);


/**
 * Normalise user input into the canonical syntax the matchers expect.
 *
 * This deliberately reuses the app's existing `sanitizeEquationString` rather
 * than re-implementing implicit-multiplication rules. A second, subtly
 * different normaliser here previously corrupted inputs like "1.5sin(2x)"
 * into "1.*sin(2*x)"; sharing the one the parser and audio engine already use
 * guarantees the handles and the synthesiser agree on what an equation means.
 */
function normalizeInput(equation: string): string {
  let expr = sanitizeEquationString(equation).trim();
  expr = expr.replace(/\*\s*pi/gi, '*pi');
  return expr;
}

/**
 * Parse an equation into parameters.
 * Returns null when the equation is not one of the supported families — the
 * caller must then fall back to text editing.
 */
export function parseParameters(equation: string): EquationParams | null {
  const expr = normalizeInput(equation);
  if (!expr) return null;

  let amplitude = 1;
  let frequency = 1;
  let phase = 0;
  let offset = 0;
  let linearTerm = 0;
  let rootConstant = 0;
  let sawPeriodic = false;
  let sawRoot = false;
  let sawExp = false;
  let sawLinear = false;
  let sawQuadratic = false;
  let sawConstant = false;

  for (const rawTerm of splitTerms(expr)) {
    const term = rawTerm.trim();
    if (!term) continue;
    const factors = splitFactors(term).filter((f) => f.trim() !== '');
    if (factors.length === 0) continue;

    const lead = coefficient(factors.length > 1 ? factors[0] : '');
    // Each term keeps the whitespace that trailed its separator, so the head
    // arrives as "-x " rather than "-x". The matchers are anchored with $ and
    // would reject that, so match against a trimmed copy.
    const head = factors[factors.length - 1].trim();

    // Reject a term whose leading factor is a bare function rather than a
    // number, e.g. the "*cos(x)" half of "sin(x)*cos(x)". That expression is a
    // product of two periodic terms, not a single A·f(Bx + C) + D, so
    // parameterising it would silently drop a factor from the equation.
    // A leading sign is fine: "-x" is a negative coefficient, not a factor.
    if (factors.length > 1) {
      const first = factors[0].trim();
      const isLoneSign = first === '+' || first === '-';
      if (first !== '' && !isLoneSign && coefficient(first) === null) return null;
    }

    // A term that begins with a sign has no separating "*", so the sign ends up
    // glued to the head ("-x"). Fold that sign into the coefficient.
    const headIsSigned = /^[+-]/.test(head.trim());

    const periodic = head.match(PERIODIC);
    if (periodic) {
      if (sawPeriodic) return null;
      // groups: 1=outer coeff, 2=kind, 3=inner coeff(frequency), 4=sign, 5=phase
      const outer = periodic[1] === undefined ? 1 : Number(periodic[1]);
      const kind = periodic[2];
      const freqTok = periodic[3];
      const sign = periodic[4];
      const phaseTok = periodic[5];
      if (!Number.isFinite(outer)) return null;
      sawPeriodic = true;
      amplitude = factors.length > 1 && lead !== null ? lead : outer;
      frequency = toNumber(freqTok) ?? 1;
      let phaseMagnitude = 0;
      if (phaseTok) {
        const parsedPhase = parsePhaseToken(phaseTok);
        if (parsedPhase === null) return null;
        phaseMagnitude = parsedPhase;
      }
      phase = sign === '-' ? -phaseMagnitude : phaseMagnitude;
      if (kind === 'cos') phase += Math.PI / 2; // cos stored in sin form
      continue;
    }

    const root = head.match(ROOT);
    if (root) {
      if (sawRoot) return null;
      // groups: 1=outer coeff, 2=inner coeff(frequency), 3=sign, 4=constant
      sawRoot = true;
      amplitude = factors.length > 1 && lead !== null ? lead : (root[1] === undefined ? 1 : Number(root[1]));
      frequency = toNumber(root[2]) ?? 1;
      rootConstant = root[3] === '-' ? -Number(root[4]) : root[3] === '+' ? Number(root[4]) : 0;
      continue;
    }

    const exponential = head.match(EXPONENTIAL);
    if (exponential) {
      if (sawExp) return null;
      // groups: 1=outer coeff, 2=rate
      sawExp = true;
      amplitude = factors.length > 1 && lead !== null ? lead : (exponential[1] === undefined ? 1 : Number(exponential[1]));
      frequency = toNumber(exponential[2]) ?? 1;
      continue;
    }

    const quadratic = head.match(QUADRATIC);
    if (quadratic) {
      if (sawQuadratic) return null;
      sawQuadratic = true;
      // `quadratic[1]` is "" for a bare "x^2", which `coefficient` reads as 1.
      // Using it (rather than `Number("")`, which is NaN) keeps "x^2" intact.
      const headCoeff = coefficient(quadratic[1] ?? '');
      if (headCoeff === null) return null;
      const hasLead = factors.length > 1 && factors[0].trim() !== '';
      amplitude = hasLead && lead !== null ? lead : headCoeff;
      continue;
    }

    const linear = head.match(LINEAR);
    if (linear) {
      // The captured group can be "" (bare "x"), "+" or "-" (a sign with no
      // digits), or a full number. Route all of those through `coefficient`,
      // which already maps ""/"+" to 1 and "-" to -1.
      const headCoeff = coefficient(linear[1] ?? '');
      if (headCoeff === null) return null;
      const hasLead = factors.length > 1 && factors[0].trim() !== '' && factors[0].trim() !== '+' && factors[0].trim() !== '-';
      const slope = hasLead && lead !== null ? lead : headCoeff;
      if (sawQuadratic) {
        linearTerm += slope;
      } else if (sawLinear) {
        amplitude += slope; // x + 2x combines into one slope
      } else {
        sawLinear = true;
        amplitude = slope;
      }
      continue;
    }

    const constant = coefficient(term);
    if (constant === null) return null;
    offset += constant;
    sawConstant = true;
  }

  if (!sawPeriodic && !sawRoot && !sawExp && !sawLinear && !sawQuadratic && !sawConstant) {
    return null;
  }

  let family: ParamFamily;
  if (sawPeriodic) family = 'periodic';
  else if (sawQuadratic) family = 'quadratic';
  else if (sawRoot) family = 'root';
  else if (sawExp) family = 'exponential';
  else family = 'linear';

  // A bare constant is a vertical offset, not a slope.
  if (family === 'linear' && !sawLinear) amplitude = 0;

  return { family, amplitude, frequency, phase, offset, linearTerm, rootConstant };
}

/** Serialise a parameter set back into an equation string. */
export function serializeParameters(params: EquationParams): string {
  const { family, amplitude, frequency, phase, offset, linearTerm, rootConstant } = params;
  const parts: string[] = [];
  const offsetText = Math.abs(offset) < 0.0005 ? '' : ` + ${tidy(offset)}`;

  if (family === 'periodic') {
    // cos is sin shifted a quarter turn, so a phase of exactly π/2 (or -π/2)
    // can be written more legibly as cos. This is only true when the frequency
    // is also 1: sin(3x + π/2) is NOT cos(x), it is cos(3x) at a different
    // scale, so the shortcut is gated on frequency === 1.
    const normalized = ((phase % Math.PI) + Math.PI) % Math.PI;
    const isQuarterTurn = Math.abs(normalized - Math.PI / 2) < 1e-6;
    if (isQuarterTurn && Math.abs(frequency - 1) < 1e-9) {
      const ampText = Math.abs(amplitude - 1) < 1e-9 ? '' : tidy(amplitude);
      return `${ampText}cos(x)${offsetText}`.trim();
    }
    const inner = Math.abs(frequency - 1) < 1e-9 ? 'x' : `${tidy(frequency)}x`;
    // Fold the sign into the parameter itself so we never emit "sin(2x) + -1".
    const effectiveOffset = offset;
    const withPhase = Math.abs(phase) < 1e-9
      ? inner
      : `${inner} ${phase > 0 ? '+' : '-'} ${formatPhase(Math.abs(phase))}`;
    const ampText = Math.abs(amplitude - 1) < 1e-9 ? '' : tidy(amplitude);
    const signedOffset = Math.abs(effectiveOffset) < 0.0005
      ? ''
      : ` ${effectiveOffset > 0 ? '+' : '-'} ${tidy(Math.abs(effectiveOffset))}`;
    return `${ampText}sin(${withPhase})${signedOffset}`.trim();
  }

  if (family === 'quadratic') {
    // The coefficient carries its own sign, so print the magnitude and emit the
    // sign exactly once. A magnitude of 1 is implicit and therefore omitted.
    if (Math.abs(amplitude) > 0.0005) {
      const magnitude = Math.abs(Math.abs(amplitude) - 1) < 1e-9 ? '' : tidy(Math.abs(amplitude));
      parts.push(amplitude < 0 ? `- ${magnitude}x^2`.trim() : `${magnitude}x^2`);
    }
    if (Math.abs(linearTerm) > 0.0005) {
      const b = Math.abs(linearTerm);
      parts.push(`${linearTerm < 0 ? '- ' : '+ '}${Math.abs(b - 1) < 1e-9 ? '' : tidy(b)}x`);
    }
  } else if (family === 'root') {
    const inner = Math.abs(frequency - 1) < 1e-9 ? 'x' : `${tidy(frequency)}x`;
    const withConstant = Math.abs(rootConstant) < 1e-9
      ? inner
      : `${inner} ${rootConstant < 0 ? '-' : '+'} ${tidy(Math.abs(rootConstant))}`;
    const ampText = Math.abs(amplitude - 1) < 1e-9 ? '' : tidy(amplitude);
    parts.push(`${ampText}sqrt(${withConstant})`);
  } else if (family === 'exponential') {
    const rateText = Math.abs(frequency - 1) < 1e-9 ? '' : tidy(frequency);
    const ampText = Math.abs(amplitude - 1) < 1e-9 ? '' : tidy(amplitude);
    parts.push(`${ampText}exp(${rateText}x)`);
  } else {
    if (Math.abs(amplitude) > 0.0005) {
      // The coefficient carries its own sign, so the magnitude is printed
      // separately and the sign is emitted once.
      const magnitude = Math.abs(Math.abs(amplitude) - 1) < 1e-9 ? '' : tidy(Math.abs(amplitude));
      parts.push(amplitude < 0 ? `- ${magnitude}x`.trim() : `${magnitude}x`);
    }
  }

  if (Math.abs(offset) > 0.0005) {
    parts.push(`${offset < 0 ? '- ' : '+ '}${tidy(Math.abs(offset))}`);
  }

  return parts.join(' ').replace(/\+\s*\+\s*\d/g, '+ ').trim() || '0';
}

/** True when this equation can be edited with control points. */
export function isParameterizable(equation: string): boolean {
  return parseParameters(equation) !== null;
}

/** Apply one dragged handle to a parameter set, returning a new set. */
export function applyParameter(
  params: EquationParams,
  key: ParamKey,
  value: number,
): EquationParams {
  return { ...params, [PARAM_TARGET[key]]: value };
}

/** Read the value a handle currently represents. */
export function readParameter(params: EquationParams, key: ParamKey): number {
  return params[PARAM_TARGET[key]] as number;
}

/** Clamp a dragged value into a mathematically sane range. */
export function clampParamValue(key: ParamKey, value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (key === 'phase') return Math.max(-4 * Math.PI, Math.min(4 * Math.PI, value));
  return Math.max(-20, Math.min(20, value));
}

/** Which handles make sense for a given family. */
export function handlesFor(params: EquationParams): ParamKey[] {
  switch (params.family) {
    case 'periodic': return ['amplitude', 'frequency', 'phase', 'offset'];
    case 'root': return ['amplitude', 'rootConstant', 'offset'];
    case 'exponential': return ['amplitude', 'rate', 'offset'];
    case 'quadratic': return ['amplitude', 'linearTerm', 'offset'];
    case 'linear':
    default: return ['amplitude', 'offset'];
  }
}

export const HANDLE_LABEL: Record<ParamKey, string> = {
  amplitude: 'Amplitude',
  frequency: 'Frequency',
  phase: 'Phase',
  offset: 'Offset',
  linearTerm: 'Slope b',
  rootConstant: 'Inside √',
  rate: 'Rate',
};




/**
 * Where each handle sits, in math coordinates, for the current view window.
 * Handles are anchored to meaningful features of the curve (the crest, the
 * midline, the first period) so dragging one feels like touching a specific
 * part of the mathematics rather than an arbitrary dot.
 */
export function handlePositions(
  params: EquationParams,
  minX: number,
  maxX: number,
): ControlHandle[] {
  const midX = (minX + maxX) / 2;
  const span = Math.max(1e-6, maxX - minX);
  const out: ControlHandle[] = [];

  for (const key of handlesFor(params)) {
    const value = readParameter(params, key);
    let at = { x: midX, y: params.offset };
    let display = tidy(value);

    switch (key) {
      case 'amplitude':
        // The upper crest is where amplitude is most visible, so the
        // amplitude handle rides there.
        at = { x: midX, y: params.amplitude + params.offset };
        break;
      case 'frequency':
        // On the midline a quarter of the way across: dragging sideways
        // changes how many cycles fit, which is what frequency means.
        at = { x: minX + span * 0.25, y: params.offset };
        break;
      case 'phase':
        // On the midline at the window centre, so a horizontal drag reads as
        // a left/right slide of the wave.
        at = { x: midX, y: params.offset };
        display = formatPhase(value);
        break;
      case 'offset':
        at = { x: maxX - span * 0.1, y: params.offset };
        break;
      case 'linearTerm':
        at = {
          x: midX,
          y: params.amplitude * midX * midX + params.linearTerm * midX + params.offset,
        };
        break;
      case 'rootConstant': {
        const probeX = minX + span * 0.15;
        const inside = Math.max(0, params.frequency * probeX + params.rootConstant);
        at = { x: probeX, y: params.offset + params.amplitude * Math.sqrt(inside) };
        break;
      }
      case 'rate': {
        const probeX = minX + span * 0.2;
        const exponent = Math.max(-6, Math.min(6, params.frequency * probeX));
        at = { x: probeX, y: params.offset + params.amplitude * Math.exp(exponent) };
        break;
      }
      default:
        break;
    }

    if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) continue;
    out.push({ key, label: HANDLE_LABEL[key], value, at, display });
  }

  return out;
}
