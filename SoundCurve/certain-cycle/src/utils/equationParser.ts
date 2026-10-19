import { parse, type MathNode } from 'mathjs';
import * as math from 'mathjs';
import { correctionCandidates, correctionReason } from './typoCorrection';

/**
 * Lookup for mathjs functions invoked by name from a `FunctionNode`.
 * Cast to a callable record so `math[name]` type-checks under `strict`.
 */
const mathFn = math as unknown as Record<string, (...args: number[]) => number>;

/** Binary operators mathjs emits as `op` chars, mapped to typed functions. */
const BINARY_OPS: Record<string, (...args: number[]) => number> = {
  '+': mathFn.add,
  '-': mathFn.subtract,
  '*': mathFn.multiply,
  '/': mathFn.divide,
  '^': mathFn.pow,
  '%': mathFn.mod,
  // Comparisons and logical operators. mathjs returns booleans here; they are
  // normalised to 1/0 so `Number()` at every call site keeps working, and so a
  // ternary condition can treat them like any other numeric truth.
  '>': (a, b) => (a > b ? 1 : 0),
  '<': (a, b) => (a < b ? 1 : 0),
  '>=': (a, b) => (a >= b ? 1 : 0),
  '<=': (a, b) => (a <= b ? 1 : 0),
  '==': (a, b) => (a === b ? 1 : 0),
  '!=': (a, b) => (a !== b ? 1 : 0),
  '&&': (a, b) => (a !== 0 && b !== 0 ? 1 : 0),
  '||': (a, b) => (a !== 0 || b !== 0 ? 1 : 0),
  // The `and`/`or` KEYWORDS parse as OperatorNodes with these op strings
  // (verified against mathjs's parser; `&&`/`||` keys above are never emitted
  // but kept so a future emitter change degrades to the same semantics).
  and: (a, b) => (a !== 0 && b !== 0 ? 1 : 0),
  or: (a, b) => (a !== 0 || b !== 0 ? 1 : 0),
};

/**
 * Logical FUNCTIONS (`not(x>1)`, `xor(a, b)`…). mathjs's typed signatures may
 * insist on booleans while the app's evaluate contract is numeric, so these
 * normalise 1/0 ⇄ truthiness here instead of delegating. Results are 1/0 like
 * every other comparison.
 *
 * A `Map`, not an object literal: `record['constructor']` would silently find
 * `Object.prototype.constructor` and CALL it.
 */
const LOGICAL_FUNCTIONS = new Map<string, (args: number[]) => number>([
  ['not', (a) => (a[0] === 0 ? 1 : 0)],
  ['and', (a) => (a[0] !== 0 && a[1] !== 0 ? 1 : 0)],
  ['or', (a) => (a[0] !== 0 || a[1] !== 0 ? 1 : 0)],
  ['xor', (a) => ((a[0] !== 0) !== (a[1] !== 0) ? 1 : 0)],
]);

export interface SamplePoint {
  x: number;
  y: number;
  dy: number; // Estimated 1st derivative (slope)
  curvature: number; // Approximate 2nd derivative / curvature
  isValid: boolean;
}

export interface ParseResult {
  success: boolean;
  error?: string;
  /**
   * A validated one-step fix for the input, present ONLY when parsing failed.
   *
   * This is a proposal, never an applied change: `parseEquation` never rewrites
   * what the user typed. The UI shows "Did you mean X? [Use this]" and the user
   * decides, because silently changing someone's equation is worse than
   * telling them they made a typo.
   */
  suggestion?: EquationSuggestion;
  evaluate?: (x: number) => number;
  sample?: (minX: number, maxX: number, sampleCount?: number) => SamplePoint[];
}

export interface EquationSuggestion {
  /** The proposed equation. Confirmed to parse successfully. */
  equation: string;
  /** Why it was proposed, in plain words. */
  reason: string;
}

// Predefined musical scale frequencies (A4 = 440Hz standard)
export const MUSICAL_SCALES = {
  major: {
    name: 'Major (Ionian)',
    notes: [
      130.81, 146.83, 164.81, 174.61, 196.0, 220.0, 246.94, // C3-B3
      261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88, // C4-B4
      523.25, 587.33, 659.25, 698.46, 783.99, 880.0, 987.77, // C5-B5
      1046.5, 1174.66, 1318.51,                              // C6-E6
    ],
  },
  minor: {
    name: 'Natural Minor (Aeolian)',
    notes: [
      130.81, 146.83, 155.56, 174.61, 196.0, 207.65, 233.08, // C3-Bb3
      261.63, 293.66, 311.13, 349.23, 392.0, 415.3, 466.16,  // C4-Bb4
      523.25, 587.33, 622.25, 698.46, 783.99, 830.61, 932.33, // C5-Bb5
      1046.5,                                                // C6
    ],
  },
  pentatonic: {
    name: 'Minor Pentatonic',
    notes: [
      130.81, 155.56, 174.61, 196.0, 233.08,
      261.63, 311.13, 349.23, 392.0, 466.16,
      523.25, 622.25, 698.46, 783.99, 932.33,
      1046.5, 1244.51,
    ],
  },
  dorian: {
    name: 'Dorian Mode',
    notes: [
      146.83, 164.81, 174.61, 196.0, 220.0, 246.94, 261.63,
      293.66, 329.63, 349.23, 392.0, 440.0, 493.88, 523.25,
      587.33, 659.25, 698.46, 783.99, 880.0, 987.77, 1046.5,
    ],
  },
  mixolydian: {
    name: 'Mixolydian Mode',
    notes: [
      130.81, 146.83, 164.81, 185.0, 196.0, 220.0, 246.94,
      261.63, 293.66, 329.63, 369.99, 392.0, 440.0, 493.88,
      523.25, 587.33, 659.25, 739.99, 783.99, 880.0, 987.77,
      1046.5,
    ],
  },
  majorPentatonic: {
    name: 'Major Pentatonic',
    notes: [
      130.81, 164.81, 196.0, 246.94, 293.66,
      329.63, 392.0, 493.88, 587.33, 659.25,
      783.99, 987.77,
    ],
  },
  hirajoshi: {
    name: 'Japanese Hirajoshi',
    notes: [
      130.81, 146.83, 155.56, 196.0, 207.65,
      261.63, 293.66, 311.13, 392.0, 415.3,
      523.25, 587.33, 622.25, 783.99, 830.61,
      1046.5,
    ],
  },
  chromatic: {
    name: 'Chromatic',
    notes: [
      130.81, 138.59, 146.83, 155.56, 164.81, 174.61, 185.0, 196.0, 207.65, 220.0, 233.08, 246.94,
      261.63, 277.18, 293.66, 311.13, 329.63, 349.23, 369.99, 392.0, 415.3, 440.0, 466.16, 493.88,
      523.25, 554.37, 587.33, 622.25, 659.25, 698.46, 739.99, 783.99, 830.61, 880.0, 932.33, 987.77,
      1046.5,
    ],
  },
} as const;

export type ScaleKey = keyof typeof MUSICAL_SCALES;

/**
 * Pre-sanitizes mathematical input strings for standard notation:
 * handles implicit multiplication (e.g. 3x -> 3*x, 2sin(x) -> 2*sin(x)),
 * replaces ln with log, etc.
 */
export function sanitizeEquationString(raw: string): string {
  let eq = raw.trim();

  // Strip leading "y=" or "f(x)="
  eq = eq.replace(/^(y\s*=|)/i, '').trim();

  // Replace ln with log
  eq = eq.replace(/\bln\b/g, 'log');

  // Replace unicode multiplication / powers if pasted
  eq = eq.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');

  // Handle implicit multiplication like 2x -> 2*x, 3sin(x) -> 3*sin(x), x(x+1) -> x*(x+1)
  eq = eq.replace(/(\d+)([a-zA-Z(])/g, '$1*$2');
  eq = eq.replace(/(\))([a-zA-Z0-9(])/g, '$1*$2');
  eq = eq.replace(/(x)(sin|cos|tan|exp|log|sqrt|abs)/gi, '$1*$2');
  // Juxtaposition of the variable/constants with a parenthesised group is
  // multiplication, not a call: mathjs parses `x(x-1)` as calling x, which
  // then fails "x is not a function". `x` is the only variable and `pi` is a
  // constant, so `x(`/`pi(` can only mean multiplication. \b keeps `max(`,
  // `exp(` etc. untouched (no boundary inside an identifier).
  eq = eq.replace(/\b(x|pi|PI)\(/g, '$1*(');

  return eq;
}

/**
 * Build a canonical equation with a vertical offset, e.g. sin(x) + 0.25.
 * This keeps the base equation stable while the curve is dragged up/down.
 */
export function buildVerticalShiftEquation(baseEquation: string, offset: number): string {
  const cleanedBase = sanitizeEquationString(baseEquation).trim();
  if (!cleanedBase) {
    return baseEquation.trim();
  }

  const roundedOffset = Math.abs(offset) < 0.005 ? '0.00' : Math.abs(offset).toFixed(2);
  const sign = offset >= 0 ? '+' : '-';
  return `${cleanedBase} ${sign} ${roundedOffset}`;
}

/**
 * Finds a validated one-step correction for input that failed to parse.
 *
 * Each candidate from `correctionCandidates` is put through the *real* mathjs
 * parser before being accepted, so a suggestion is never offered unless it
 * genuinely works. This is the difference between "we guessed you meant sin" and
 * "we checked that `sin(x)` really does parse".
 */
function findCorrection(rawEquation: string): EquationSuggestion | undefined {
  for (const candidate of correctionCandidates(rawEquation)) {
    const sanitized = sanitizeEquationString(candidate.text);
    if (!sanitized) continue;
    try {
      const compiled = parse(sanitized).compile();
      // A candidate that parses but cannot produce a finite number is still
      // broken (e.g. it references an unknown symbol), so evaluate it too.
      const value = compiled.evaluate({ x: 0.5, pi: Math.PI, PI: Math.PI, e: Math.E, E: Math.E });
      if (typeof value !== 'number' || Number.isNaN(value)) continue;
      return { equation: candidate.text, reason: correctionReason(candidate) };
    } catch {
      // Try the next candidate.
    }
  }
  return undefined;
}

/**
 * Structural shapes for the mathjs node kinds {@link evaluateNode} walks.
 *
 * mathjs's `MathNode` declares `type: string`, so it is NOT a discriminated
 * union: `Extract<MathNode, { type: 'ConstantNode' }>` collapses to `never`.
 * These local aliases pin the literal `type` plus only the fields each case
 * reads — which is exactly what the switch was meant to narrow. (`FunctionNode`
 * exposes `name` at runtime via the getter `this.fn.name || ""`.)
 */
type ConstantNodeLike = MathNode & { type: 'ConstantNode'; value: unknown };
type SymbolNodeLike = MathNode & { type: 'SymbolNode'; name: string };
type FunctionNodeLike = MathNode & {
  type: 'FunctionNode';
  name: string;
  args: MathNode[];
};
type OperatorNodeLike = MathNode & {
  type: 'OperatorNode';
  op: string;
  /** mathjs's function name for the op — distinguishes postfix `x!` (fn
   *  'factorial') from any other single-arg `!` node. */
  fn?: string;
  args: MathNode[];
};
type ParenthesisNodeLike = MathNode & { type: 'ParenthesisNode'; content: MathNode };
type AssignmentNodeLike = MathNode & {
  type: 'AssignmentNode';
  object: MathNode;
  value: MathNode;
};
type AccessorNodeLike = MathNode & { type: 'AccessorNode'; object: MathNode; index: MathNode };
type FunctionAssignmentNodeLike = MathNode & { type: 'FunctionAssignmentNode'; name: string; params: MathNode[]; body: MathNode };
type ArrayNodeLike = MathNode & { type: 'ArrayNode'; items: MathNode[] };
type ConditionalNodeLike = MathNode & {
  type: 'ConditionalNode';
  condition: MathNode;
  trueExpr: MathNode;
  falseExpr: MathNode;
};

/**
 * Evaluates a mathjs AST against `scope`.
 *
 * mathjs's own `compile()`/`evaluate()` is not used because equations can
 * contain `sum(k=lo, hi, body)`, whose body must stay symbolic so the index
 * can be rebound to each integer on every iteration — a mathjs typed-function
 * argument is always pre-evaluated, so it cannot carry a symbolic body.
 * Walking the AST read-only here also avoids reconstructing mathjs nodes,
 * whose constructors reject plain objects.
 */

/** Enforce the parsed-expression allowlist. Every live AST node must be one we
 * explicitly accept. Anything else (property access, assignment, function
 * assignment, the `this` identifier, unknown functions) is rejected without
 * ever reaching the evaluator. */
function validateAllowlist(node: MathNode): string | null {
  switch (node.type) {
    case 'AccessorNode': {
      const a = node as AccessorNodeLike;
      return `Property access (e.g. "x.constructor") is not allowed in an equation`;
    }
    case 'AssignmentNode': {
      const a = node as AssignmentNodeLike;
      return `Assignment (e.g. "a = 1") is not allowed in an equation`;
    }
    case 'FunctionAssignmentNode': {
      const f = node as FunctionAssignmentNodeLike;
      return `Function assignment (e.g. "f(x) = x") is not allowed in an equation`;
    }
    case 'SymbolNode': {
      const s = node as SymbolNodeLike;
      if (s.name === 'this') {
        return `The identifier "this" is not allowed in an equation`;
      }
      return null;
    }
    case 'FunctionNode': {
      const f = node as FunctionNodeLike;
      if (
        f.name === 'sum' ||
        LOGICAL_FUNCTIONS.has(f.name) ||
        typeof mathFn[f.name] === 'function'
      ) {
        return null;
      }
      return `The function "${f.name}" is not allowed in an equation`;
    }
    default:
      return null;
  }
}

function evaluateNode(node: MathNode, scope: Record<string, number>): number {
  switch (node.type) {
    case 'ConstantNode': {
      const c = node as ConstantNodeLike;
      return Number(c.value);
    }
    case 'SymbolNode': {
      const s = node as SymbolNodeLike;
      const value = scope[s.name];
      if (value === undefined) throw new Error(`Unknown symbol: ${s.name}`);
      return Number(value);
    }
    case 'FunctionNode': {
      const f = node as FunctionNodeLike;
      // sum(k=lo, hi, body): a series summation with a bound index variable.
      if (f.name === 'sum' && f.args.length === 3) {
        const [indexArg, hiArg, bodyArg] = f.args;
        const assign = indexArg as AssignmentNodeLike;
        if (
          assign.type === 'AssignmentNode' &&
          assign.object.type === 'SymbolNode'
        ) {
          // mathjs v15 stores the assigned expression in `value`, not `expr`.
          const lo = Math.floor(evaluateNode(assign.value, scope));
          const hi = Math.floor(evaluateNode(hiArg, scope));
          const index = (assign.object as SymbolNodeLike).name;
          let total = 0;
          for (let k = lo; k <= hi; k++) {
            total += evaluateNode(bodyArg, { ...scope, [index]: k });
          }
          return total;
        }
      }
      // Logical functions: normalise to the numeric 1/0 contract (see above).
      const logical = LOGICAL_FUNCTIONS.get(f.name);
      if (logical) {
        return logical(f.args.map((a) => evaluateNode(a, scope)));
      }
      const fn = mathFn[f.name];
      if (typeof fn !== 'function') throw new Error(`Unknown function: ${f.name}`);
      return Number(fn(...f.args.map((a) => evaluateNode(a, scope))));
    }
    case 'OperatorNode': {
      const o = node as OperatorNodeLike;
      // Unary minus/plus arrive as a single-argument OperatorNode in mathjs v15
      // (e.g. `-x`, `exp(-x)`), not as a UnaryMinusNode.
      if (o.args.length === 1 && (o.op === '-' || o.op === '+')) {
        const value = evaluateNode(o.args[0], scope);
        return o.op === '-' ? -value : value;
      }
      // Postfix factorial: mathjs emits op '!' with fn 'factorial' for `x!`.
      // Dispatch on `fn` — a bare single-arg '!' has no other producer.
      if (o.args.length === 1 && o.op === '!' && o.fn === 'factorial') {
        return Number(mathFn.factorial(evaluateNode(o.args[0], scope)));
      }
      // The `not(...)` FUNCTION parses as a single-arg OperatorNode with op
      // 'not' (mathjs folds it), so handle it here rather than only in the
      // LOGICAL_FUNCTIONS map.
      if (o.args.length === 1 && o.op === 'not') {
        return evaluateNode(o.args[0], scope) === 0 ? 1 : 0;
      }
      const fn = BINARY_OPS[o.op];
      if (typeof fn !== 'function') throw new Error(`Unsupported operator: ${o.op}`);
      return Number(fn(...o.args.map((a) => evaluateNode(a, scope))));
    }
    case 'ParenthesisNode': {
      const p = node as ParenthesisNodeLike;
      return evaluateNode(p.content, scope);
    }
    case 'ConditionalNode': {
      // `cond ? a : b`. Truth is "non-zero", which is exactly how the
      // comparison operators above normalise their boolean results.
      const c = node as ConditionalNodeLike;
      const branch =
        evaluateNode(c.condition, scope) !== 0 ? c.trueExpr : c.falseExpr;
      return evaluateNode(branch, scope);
    }
    case 'UnaryMinusNode': {
      return -evaluateNode(
        (node as unknown as { args: MathNode[] }).args[0],
        scope,
      );
    }
    case 'ArrayNode': {
      const arr = node as ArrayNodeLike;
      return Number(arr.items.map((a) => evaluateNode(a, scope)));
    }
    default: {
      throw new Error(
        `Unsupported expression node: ${(node as { type: string }).type}`,
      );
    }
  }
}

/**
 * Safely parses and validates a mathematical equation without ever using eval().
 */
export function parseEquation(rawEquation: string): ParseResult {
  const sanitized = sanitizeEquationString(rawEquation);

  if (!sanitized) {
    return {
      success: false,
      error: "Please enter an equation (e.g. sin(x) or x^2 - 4)",
    };
  }

  try {
    let node: MathNode;
    try {
      node = parse(sanitized);
    } catch {
      return {
        success: false,
        error: `We couldn't understand "${rawEquation}". Try something like sin(x) or x^2 + 3*x.`,
        suggestion: findCorrection(rawEquation),
      };
    }

    // Security allowlist walk: reject nodes mathjs lets through but the
    // evaluator should never see (property access, assignment, function
    // assignment, the `this` identifier, unknown functions). The rejection
    // wears the SAME normal "couldn't understand" error as any other bad
    // input — the detailed reason stays internal — and comes with the same
    // typo-suggestion flow, because `sinn(x)` lands here too.
    const block = validateAllowlist(node);
    if (block !== null) {
      return {
        success: false,
        error: `We couldn't understand "${rawEquation}". Try something like sin(x) or x^2 + 3*x.`,
        suggestion: findCorrection(rawEquation),
      };
    }

    const evaluateFn = (xVal: number): number => {
      try {
        const scope = {
          x: xVal,
          pi: Math.PI,
          PI: Math.PI,
          e: Math.E,
          E: Math.E,
          // mathjs injects tau into its own evaluate scope; mirror it so
          // `tau` means 2π here too instead of "unknown symbol".
          tau: 2 * Math.PI,
        };
        const result = evaluateNode(node, scope);

        if (typeof result !== 'number' || isNaN(result)) {
          return NaN;
        }
        if (!isFinite(result)) {
          return result > 0 ? 1e6 : -1e6;
        }
        return result;
      } catch {
        return NaN;
      }
    };

    // Test a few points to verify safety
    const testPoints = [-1, 0, 1, 2.5];
    let validSampleFound = false;
    for (const tp of testPoints) {
      const res = evaluateFn(tp);
      if (typeof res === 'number' && !isNaN(res)) {
        validSampleFound = true;
        break;
      }
    }

    if (!validSampleFound) {
      // Check if maybe it's valid elsewhere
      const res2 = evaluateFn(0.5);
      if (isNaN(res2)) {
        return {
          success: false,
          error: "Equation contains unsupported variables or functions. Only variable 'x' is supported.",
          // This is the branch a mistyped function name actually lands in:
          // mathjs happily *parses* `sinn(x)` as an undefined symbol and only
          // fails when it is evaluated, so a suggestion attached solely to the
          // parse-failure path would never fire for `sinn`/`sqtr`/`taan`.
          suggestion: findCorrection(rawEquation),
        };
      }
    }

    return {
      success: true,
      evaluate: evaluateFn,
      sample: (minX: number, maxX: number, sampleCount = 600) => {
        return sampleEquationDetailed(evaluateFn, minX, maxX, sampleCount);
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Invalid equation syntax',
    };
  }
}

/**
 * Samples an evaluation function across [minX, maxX], calculating derivatives & filtering singularities.
 */
export function sampleEquationDetailed(
  evaluateFn: (x: number) => number,
  minX: number,
  maxX: number,
  sampleCount: number = 600
): SamplePoint[] {
  if (maxX <= minX) {
    maxX = minX + 1;
  }

  const step = (maxX - minX) / sampleCount;
  const rawPoints: Array<{ x: number; y: number; isValid: boolean }> = [];

  for (let i = 0; i <= sampleCount; i++) {
    const x = minX + i * step;
    const y = evaluateFn(x);
    const isValid = !isNaN(y) && isFinite(y) && Math.abs(y) < 1e5;
    rawPoints.push({ x, y: isValid ? y : 0, isValid });
  }

  // Calculate derivatives & curvature
  const points: SamplePoint[] = [];
  const dx = step || 0.001;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];
    if (!pt.isValid) {
      points.push({ x: pt.x, y: 0, dy: 0, curvature: 0, isValid: false });
      continue;
    }

    // Centered difference for 1st derivative (slope)
    let dy = 0;
    if (i > 0 && i < rawPoints.length - 1 && rawPoints[i - 1].isValid && rawPoints[i + 1].isValid) {
      dy = (rawPoints[i + 1].y - rawPoints[i - 1].y) / (2 * dx);
    } else if (i < rawPoints.length - 1 && rawPoints[i + 1].isValid) {
      dy = (rawPoints[i + 1].y - pt.y) / dx;
    } else if (i > 0 && rawPoints[i - 1].isValid) {
      dy = (pt.y - rawPoints[i - 1].y) / dx;
    }

    // Approximate 2nd derivative for curvature
    let d2y = 0;
    if (i > 0 && i < rawPoints.length - 1 && rawPoints[i - 1].isValid && rawPoints[i + 1].isValid) {
      d2y = (rawPoints[i + 1].y - 2 * pt.y + rawPoints[i - 1].y) / (dx * dx);
    }

    // Clamp huge slopes (e.g. near tan(x) asymptotes)
    const clampedDy = Math.max(-1000, Math.min(1000, dy));
    const curvature = Math.abs(d2y) / Math.pow(1 + clampedDy * clampedDy, 1.5);

    points.push({
      x: pt.x,
      y: pt.y,
      dy: clampedDy,
      curvature: isNaN(curvature) ? 0 : Math.min(10, curvature),
      isValid: true,
    });
  }

  return points;
}

/**
 * Normalizes a number linearly between minOutput and maxOutput.
 */
export function normalize(
  value: number,
  minInput: number,
  maxInput: number,
  minOutput: number,
  maxOutput: number
): number {
  if (maxInput === minInput) return (minOutput + maxOutput) / 2;
  const clampedVal = Math.max(minInput, Math.min(maxInput, value));
  const t = (clampedVal - minInput) / (maxInput - minInput);
  return minOutput + t * (maxOutput - minOutput);
}

/**
 * Clamps a number between min and max.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Quantizes a normalized 0..1 value to the nearest pitch in a given musical scale.
 */
export function quantizeToScale(
  normalizedValue01: number,
  scaleKey: ScaleKey = 'major'
): number {
  const scale = MUSICAL_SCALES[scaleKey] || MUSICAL_SCALES.major;
  const index = Math.round(clamp(normalizedValue01, 0, 1) * (scale.notes.length - 1));
  return scale.notes[index];
}
