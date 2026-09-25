import type { SamplePoint } from './equationParser';
import type { SplineControlPoint } from './curveSpline';

export interface FitResult {
  success: boolean;
  equation: string;
  family: string;
  rSquared: number; // 0.0 to 1.0
  percentage: number; // 0 to 100
  isAcceptable: boolean; // rSquared >= 0.60
  explanation?: string;
}

interface DataPoint {
  x: number;
  y: number;
}

/**
 * Solves a linear least-squares system X * beta = Y via Normal Equations (X^T * X) * beta = X^T * Y.
 * Uses Gaussian elimination with partial pivoting.
 */
function solveLinearLeastSquares(X: number[][], Y: number[]): number[] | null {
  const m = X.length;
  if (m === 0) return null;
  const n = X[0].length;
  if (m < n) return null;

  // Compute A = X^T * X (n x n) and B = X^T * Y (n x 1)
  const A: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const B: number[] = Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += X[k][i] * X[k][j];
      }
      A[i][j] = sum;
    }
    let bSum = 0;
    for (let k = 0; k < m; k++) {
      bSum += X[k][i] * Y[k];
    }
    B[i] = bSum;
  }

  // Gaussian elimination with partial pivoting
  for (let col = 0; col < n; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(A[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col]);
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) {
      return null; // Singular matrix
    }

    // Swap rows
    if (maxRow !== col) {
      const tempRow = A[col];
      A[col] = A[maxRow];
      A[maxRow] = tempRow;
      const tempB = B[col];
      B[col] = B[maxRow];
      B[maxRow] = tempB;
    }

    // Eliminate below
    for (let row = col + 1; row < n; row++) {
      const factor = A[row][col] / A[col][col];
      for (let j = col; j < n; j++) {
        A[row][j] -= factor * A[col][j];
      }
      B[row] -= factor * B[col];
    }
  }

  // Back substitution
  const beta = Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = B[row];
    for (let j = row + 1; j < n; j++) {
      sum -= A[row][j] * beta[j];
    }
    beta[row] = sum / A[row][row];
  }

  return beta;
}

/**
 * Computes R-squared (coefficient of determination) for predicted vs actual values.
 */
function computeRSquared(actual: number[], predicted: number[]): number {
  if (actual.length !== predicted.length || actual.length === 0) return 0;

  const n = actual.length;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumY += actual[i];
  }
  const meanY = sumY / n;

  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const diffTot = actual[i] - meanY;
    const diffRes = actual[i] - predicted[i];
    ssTot += diffTot * diffTot;
    ssRes += diffRes * diffRes;
  }

  if (ssTot < 1e-10) {
    // Constant line: if predictions also match, R^2 is 1, else 0
    return ssRes < 1e-8 ? 1 : 0;
  }

  const r2 = 1 - ssRes / ssTot;
  return Math.max(0, Math.min(1, r2));
}

function formatNum(num: number, decimals: number = 2): string {
  if (Math.abs(num) < 1e-4) return '0';
  const str = num.toFixed(decimals);
  return str.replace(/\.?0+$/, '');
}

/**
 * Fits linear model: y = a*x + b
 */
function fitLinear(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const X = data.map((d) => [d.x, 1]);
  const Y = data.map((d) => d.y);
  const beta = solveLinearLeastSquares(X, Y);
  if (!beta) return null;

  const [a, b] = beta;
  const predict = (x: number) => a * x + b;
  const preds = data.map((d) => predict(d.x));
  const r2 = computeRSquared(Y, preds);

  let eq = '';
  if (Math.abs(a) > 1e-4) {
    eq = `${formatNum(a)}*x`;
  }
  if (Math.abs(b) > 1e-4) {
    eq = eq ? `${eq} ${b >= 0 ? '+' : '-'} ${formatNum(Math.abs(b))}` : `${formatNum(b)}`;
  }
  if (!eq) eq = '0';

  return { equation: eq, r2, predict };
}

/**
 * Fits quadratic model: y = a*x^2 + b*x + c
 */
function fitQuadratic(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const X = data.map((d) => [d.x * d.x, d.x, 1]);
  const Y = data.map((d) => d.y);
  const beta = solveLinearLeastSquares(X, Y);
  if (!beta) return null;

  const [a, b, c] = beta;
  const predict = (x: number) => a * x * x + b * x + c;
  const preds = data.map((d) => predict(d.x));
  const r2 = computeRSquared(Y, preds);

  const terms: string[] = [];
  if (Math.abs(a) > 1e-4) terms.push(`${formatNum(a)}*x^2`);
  if (Math.abs(b) > 1e-4) {
    if (terms.length > 0) {
      terms.push(`${b >= 0 ? '+' : '-'} ${formatNum(Math.abs(b))}*x`);
    } else {
      terms.push(`${formatNum(b)}*x`);
    }
  }
  if (Math.abs(c) > 1e-4) {
    if (terms.length > 0) {
      terms.push(`${c >= 0 ? '+' : '-'} ${formatNum(Math.abs(c))}`);
    } else {
      terms.push(`${formatNum(c)}`);
    }
  }

  const eq = terms.length > 0 ? terms.join(' ') : '0';
  return { equation: eq, r2, predict };
}

/**
 * Fits cubic model: y = a*x^3 + b*x^2 + c*x + d
 */
function fitCubic(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const X = data.map((d) => [d.x * d.x * d.x, d.x * d.x, d.x, 1]);
  const Y = data.map((d) => d.y);
  const beta = solveLinearLeastSquares(X, Y);
  if (!beta) return null;

  const [a, b, c, d] = beta;
  const predict = (x: number) => a * x * x * x + b * x * x + c * x + d;
  const preds = data.map((pt) => predict(pt.x));
  const r2 = computeRSquared(Y, preds);

  const terms: string[] = [];
  if (Math.abs(a) > 1e-4) terms.push(`${formatNum(a)}*x^3`);
  if (Math.abs(b) > 1e-4) {
    if (terms.length > 0) terms.push(`${b >= 0 ? '+' : '-'} ${formatNum(Math.abs(b))}*x^2`);
    else terms.push(`${formatNum(b)}*x^2`);
  }
  if (Math.abs(c) > 1e-4) {
    if (terms.length > 0) terms.push(`${c >= 0 ? '+' : '-'} ${formatNum(Math.abs(c))}*x`);
    else terms.push(`${formatNum(c)}*x`);
  }
  if (Math.abs(d) > 1e-4) {
    if (terms.length > 0) terms.push(`${d >= 0 ? '+' : '-'} ${formatNum(Math.abs(d))}`);
    else terms.push(`${formatNum(d)}`);
  }

  const eq = terms.length > 0 ? terms.join(' ') : '0';
  return { equation: eq, r2, predict };
}

/**
 * Fits sinusoidal model: y = A*sin(w*x + phi) + C
 * Explores candidate frequencies omega, solving linear least squares for sin(w*x), cos(w*x), and 1.
 */
function fitSinusoid(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const n = data.length;
  if (n < 4) return null;

  const minX = data[0].x;
  const maxX = data[n - 1].x;
  const domain = Math.abs(maxX - minX) || 1;

  // Generate candidate angular frequencies (0.25 cycles to 6 cycles across domain)
  const candidateFrequencies: number[] = [];
  for (let cycles = 0.5; cycles <= 8; cycles += 0.25) {
    candidateFrequencies.push((2 * Math.PI * cycles) / domain);
  }

  let bestR2 = -1;
  let bestResult: { a: number; b: number; c: number; w: number } | null = null;
  const Y = data.map((d) => d.y);

  for (const w of candidateFrequencies) {
    // y = a*sin(w*x) + b*cos(w*x) + c
    const X = data.map((d) => [Math.sin(w * d.x), Math.cos(w * d.x), 1]);
    const beta = solveLinearLeastSquares(X, Y);
    if (!beta) continue;

    const [a, b, c] = beta;
    const preds = data.map((d) => a * Math.sin(w * d.x) + b * Math.cos(w * d.x) + c);
    const r2 = computeRSquared(Y, preds);

    if (r2 > bestR2) {
      bestR2 = r2;
      bestResult = { a, b, c, w };
    }
  }

  if (!bestResult || bestR2 < 0) return null;

  const { a, b, c, w } = bestResult;
  // Convert a*sin(w*x) + b*cos(w*x) to A*sin(w*x + phi)
  const amplitude = Math.sqrt(a * a + b * b);
  const phase = Math.atan2(b, a);

  const predict = (x: number) => amplitude * Math.sin(w * x + phase) + c;

  let eq = `${formatNum(amplitude)}*sin(${formatNum(w)}*x`;
  if (Math.abs(phase) > 0.05) {
    eq += ` ${phase >= 0 ? '+' : '-'} ${formatNum(Math.abs(phase))}`;
  }
  eq += ')';

  if (Math.abs(c) > 0.05) {
    eq += ` ${c >= 0 ? '+' : '-'} ${formatNum(Math.abs(c))}`;
  }

  return { equation: eq, r2: bestR2, predict };
}

/**
 * Fits two-harmonic sinusoidal sum: y = a1*sin(w*x) + b1*cos(w*x) + a2*sin(2w*x) + b2*cos(2w*x) + c
 */
function fitHarmonicSum(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const n = data.length;
  if (n < 6) return null;

  const minX = data[0].x;
  const maxX = data[n - 1].x;
  const domain = Math.abs(maxX - minX) || 1;

  const candidateFrequencies: number[] = [];
  for (let cycles = 0.5; cycles <= 5; cycles += 0.5) {
    candidateFrequencies.push((2 * Math.PI * cycles) / domain);
  }

  let bestR2 = -1;
  let bestResult: { a1: number; b1: number; a2: number; b2: number; c: number; w: number } | null = null;
  const Y = data.map((d) => d.y);

  for (const w of candidateFrequencies) {
    const X = data.map((d) => [
      Math.sin(w * d.x),
      Math.cos(w * d.x),
      Math.sin(2 * w * d.x),
      Math.cos(2 * w * d.x),
      1,
    ]);
    const beta = solveLinearLeastSquares(X, Y);
    if (!beta) continue;

    const [a1, b1, a2, b2, c] = beta;
    const preds = data.map(
      (d) =>
        a1 * Math.sin(w * d.x) +
        b1 * Math.cos(w * d.x) +
        a2 * Math.sin(2 * w * d.x) +
        b2 * Math.cos(2 * w * d.x) +
        c
    );
    const r2 = computeRSquared(Y, preds);

    if (r2 > bestR2) {
      bestR2 = r2;
      bestResult = { a1, b1, a2, b2, c, w };
    }
  }

  if (!bestResult || bestR2 < 0) return null;

  const { a1, b1, a2, b2, c, w } = bestResult;
  const amp1 = Math.sqrt(a1 * a1 + b1 * b1);
  const phi1 = Math.atan2(b1, a1);
  const amp2 = Math.sqrt(a2 * a2 + b2 * b2);
  const phi2 = Math.atan2(b2, a2);

  const predict = (x: number) =>
    amp1 * Math.sin(w * x + phi1) + amp2 * Math.sin(2 * w * x + phi2) + c;

  let eq = `${formatNum(amp1)}*sin(${formatNum(w)}*x`;
  if (Math.abs(phi1) > 0.05) eq += ` ${phi1 >= 0 ? '+' : '-'} ${formatNum(Math.abs(phi1))}`;
  eq += `) + ${formatNum(amp2)}*sin(${formatNum(2 * w)}*x`;
  if (Math.abs(phi2) > 0.05) eq += ` ${phi2 >= 0 ? '+' : '-'} ${formatNum(Math.abs(phi2))}`;
  eq += ')';

  if (Math.abs(c) > 0.05) {
    eq += ` ${c >= 0 ? '+' : '-'} ${formatNum(Math.abs(c))}`;
  }

  return { equation: eq, r2: bestR2, predict };
}

/**
 * Fits Gaussian bell curve: y = a * exp(-(x - mu)^2 / (2 * sigma^2)) + c
 */
function fitGaussian(data: DataPoint[]): { equation: string; r2: number; predict: (x: number) => number } | null {
  const n = data.length;
  if (n < 6) return null;

  // Find peak index
  let peakIdx = 0;
  let maxAbsY = Math.abs(data[0].y);
  for (let i = 1; i < n; i++) {
    if (Math.abs(data[i].y) > maxAbsY) {
      maxAbsY = Math.abs(data[i].y);
      peakIdx = i;
    }
  }

  const mu = data[peakIdx].x;
  const domain = Math.abs(data[n - 1].x - data[0].x) || 1;
  const Y = data.map((d) => d.y);

  let bestR2 = -1;
  let bestResult: { a: number; c: number; sigma: number } | null = null;

  // Candidate sigma values
  for (let s = 0.1; s <= 0.8; s += 0.05) {
    const sigma = s * domain;
    const X = data.map((d) => {
      const z = (d.x - mu) / sigma;
      return [Math.exp(-0.5 * z * z), 1];
    });

    const beta = solveLinearLeastSquares(X, Y);
    if (!beta) continue;

    const [a, c] = beta;
    const preds = data.map((d) => {
      const z = (d.x - mu) / sigma;
      return a * Math.exp(-0.5 * z * z) + c;
    });
    const r2 = computeRSquared(Y, preds);

    if (r2 > bestR2) {
      bestR2 = r2;
      bestResult = { a, c, sigma };
    }
  }

  if (!bestResult || bestR2 < 0) return null;

  const { a, c, sigma } = bestResult;
  const predict = (x: number) => {
    const z = (x - mu) / sigma;
    return a * Math.exp(-0.5 * z * z) + c;
  };

  const muStr = Math.abs(mu) > 0.05 ? (mu >= 0 ? ` - ${formatNum(mu)}` : ` + ${formatNum(Math.abs(mu))}`) : '';
  const denom = 2 * sigma * sigma;
  let eq = `${formatNum(a)}*exp(-((x${muStr})^2)/${formatNum(denom)})`;
  if (Math.abs(c) > 0.05) {
    eq += ` ${c >= 0 ? '+' : '-'} ${formatNum(Math.abs(c))}`;
  }

  return { equation: eq, r2: bestR2, predict };
}

/**
 * Main function: fits the closest symbolic equation against common mathematical families on demand.
 */
export function fitClosestEquation(
  points: SamplePoint[] | SplineControlPoint[]
): FitResult {
  if (!points || points.length < 4) {
    return {
      success: false,
      equation: '',
      family: 'None',
      rSquared: 0,
      percentage: 0,
      isAcceptable: false,
      explanation: 'Not enough points to fit',
    };
  }

  // Downsample to ~50 data points for fast, robust regression
  const data: DataPoint[] = [];
  const step = Math.max(1, Math.floor(points.length / 50));
  for (let i = 0; i < points.length; i += step) {
    const p = points[i];
    if ('isValid' in p && !p.isValid) continue;
    data.push({ x: p.x, y: p.y });
  }

  if (data.length < 4) {
    return {
      success: false,
      equation: '',
      family: 'None',
      rSquared: 0,
      percentage: 0,
      isAcceptable: false,
      explanation: 'Valid data points insufficient for fitting',
    };
  }

  // Run all candidate models
  const candidates: Array<{ family: string; result: { equation: string; r2: number } | null }> = [
    { family: 'Sinusoid', result: fitSinusoid(data) },
    { family: 'Harmonic Sum', result: fitHarmonicSum(data) },
    { family: 'Cubic Polynomial', result: fitCubic(data) },
    { family: 'Quadratic Polynomial', result: fitQuadratic(data) },
    { family: 'Gaussian Bell', result: fitGaussian(data) },
    { family: 'Linear', result: fitLinear(data) },
  ];

  let best: { family: string; equation: string; r2: number } | null = null;

  for (const c of candidates) {
    if (!c.result) continue;
    if (!best || c.result.r2 > best.r2) {
      best = {
        family: c.family,
        equation: c.result.equation,
        r2: c.result.r2,
      };
    }
  }

  if (!best) {
    return {
      success: false,
      equation: '',
      family: 'Custom',
      rSquared: 0,
      percentage: 0,
      isAcceptable: false,
      explanation: 'No close match found — this is now a custom curve',
    };
  }

  const percentage = Math.round(best.r2 * 1000) / 10;
  const isAcceptable = best.r2 >= 0.60;

  return {
    success: true,
    equation: best.equation,
    family: best.family,
    rSquared: best.r2,
    percentage,
    isAcceptable,
    explanation: isAcceptable
      ? `Approximated as ${best.family} with R² = ${percentage}%`
      : 'No close match found — this is now a custom curve',
  };
}
