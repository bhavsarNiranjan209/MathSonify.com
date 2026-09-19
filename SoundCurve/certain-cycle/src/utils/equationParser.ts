import { parse, type MathNode } from 'mathjs';

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
  evaluate?: (x: number) => number;
  sample?: (minX: number, maxX: number, sampleCount?: number) => SamplePoint[];
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
  eq = eq.replace(/^(y\s*=|f\s*\(\s*x\s*\)\s*=)/i, '').trim();

  // Replace ln with log
  eq = eq.replace(/\bln\b/g, 'log');

  // Replace unicode multiplication / powers if pasted
  eq = eq.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/π/g, 'pi');

  // Handle implicit multiplication like 2x -> 2*x, 3sin(x) -> 3*sin(x), x(x+1) -> x*(x+1)
  eq = eq.replace(/(\d+)([a-zA-Z(])/g, '$1*$2');
  eq = eq.replace(/(\))([a-zA-Z0-9(])/g, '$1*$2');
  eq = eq.replace(/(x)(sin|cos|tan|exp|log|sqrt|abs)/gi, '$1*$2');

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
      };
    }

    const compiled = node.compile();

    const evaluateFn = (xVal: number): number => {
      try {
        const scope = {
          x: xVal,
          pi: Math.PI,
          PI: Math.PI,
          e: Math.E,
          E: Math.E,
        };
        const result = compiled.evaluate(scope);

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
