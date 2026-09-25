import { parseEquation, type SamplePoint } from './equationParser';

export interface SplineControlPoint {
  x: number;
  y: number;
  id: string;
}

/**
 * Samples an equation into a fixed number of control points across [minX, maxX].
 */
export function sampleEquationToControlPoints(
  equation: string,
  minX: number,
  maxX: number,
  count: number = 32
): SplineControlPoint[] {
  const safeCount = Math.max(8, Math.min(64, count));
  const parseResult = parseEquation(equation);
  const step = (maxX - minX) / (safeCount - 1);
  const points: SplineControlPoint[] = [];

  for (let i = 0; i < safeCount; i++) {
    const x = minX + i * step;
    let y = 0;
    if (parseResult.success && parseResult.evaluate) {
      const val = parseResult.evaluate(x);
      if (!isNaN(val) && isFinite(val) && Math.abs(val) < 1e5) {
        y = val;
      }
    }
    points.push({
      x,
      y,
      id: `cp-${i}`,
    });
  }

  return points;
}

/**
 * Evaluates Catmull-Rom cubic spline interpolation across control points.
 * Generates dense sample points with 1st derivatives (dy) and curvature.
 */
export function evaluateCatmullRomSpline(
  controlPoints: SplineControlPoint[],
  sampleCount: number = 800
): SamplePoint[] {
  if (!controlPoints || controlPoints.length === 0) {
    return [];
  }

  if (controlPoints.length === 1) {
    const p = controlPoints[0];
    return [{ x: p.x, y: p.y, dy: 0, curvature: 0, isValid: true }];
  }

  const n = controlPoints.length;
  const minX = controlPoints[0].x;
  const maxX = controlPoints[n - 1].x;
  const totalSamples = Math.max(50, sampleCount);
  const dx = (maxX - minX) / (totalSamples - 1);

  // Extend control points at endpoints for natural boundary conditions
  const extPoints: { x: number; y: number }[] = [];
  // P_{-1} = 2*P_0 - P_1
  extPoints.push({
    x: 2 * controlPoints[0].x - controlPoints[1].x,
    y: 2 * controlPoints[0].y - controlPoints[1].y,
  });
  for (let i = 0; i < n; i++) {
    extPoints.push({ x: controlPoints[i].x, y: controlPoints[i].y });
  }
  // P_{n} = 2*P_{n-1} - P_{n-2}
  extPoints.push({
    x: 2 * controlPoints[n - 1].x - controlPoints[n - 2].x,
    y: 2 * controlPoints[n - 1].y - controlPoints[n - 2].y,
  });

  const rawPoints: { x: number; y: number }[] = [];

  for (let s = 0; s < totalSamples; s++) {
    const currentX = minX + s * dx;

    // Find interval [controlPoints[seg], controlPoints[seg+1]]
    let seg = 0;
    while (seg < n - 2 && controlPoints[seg + 1].x < currentX) {
      seg++;
    }

    const x0 = controlPoints[seg].x;
    const x1 = controlPoints[seg + 1].x;
    const segWidth = x1 - x0 || 0.0001;
    const t = Math.max(0, Math.min(1, (currentX - x0) / segWidth));

    // In extPoints array, controlPoints[seg] corresponds to extPoints[seg + 1]
    const p0 = extPoints[seg];
    const p1 = extPoints[seg + 1];
    const p2 = extPoints[seg + 2];
    const p3 = extPoints[seg + 3];

    // Catmull-Rom cubic spline formula
    const t2 = t * t;
    const t3 = t2 * t;

    const y = 0.5 * (
      (2 * p1.y) +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
    );

    const safeY = !isNaN(y) && isFinite(y) && Math.abs(y) < 1e5 ? y : 0;
    rawPoints.push({ x: currentX, y: safeY });
  }

  // Calculate derivatives & curvature matching equationParser format
  const result: SamplePoint[] = [];
  const deltaX = dx || 0.001;

  for (let i = 0; i < rawPoints.length; i++) {
    const pt = rawPoints[i];

    let dy = 0;
    if (i > 0 && i < rawPoints.length - 1) {
      dy = (rawPoints[i + 1].y - rawPoints[i - 1].y) / (2 * deltaX);
    } else if (i < rawPoints.length - 1) {
      dy = (rawPoints[i + 1].y - pt.y) / deltaX;
    } else if (i > 0) {
      dy = (pt.y - rawPoints[i - 1].y) / deltaX;
    }

    let d2y = 0;
    if (i > 0 && i < rawPoints.length - 1) {
      d2y = (rawPoints[i + 1].y - 2 * pt.y + rawPoints[i - 1].y) / (deltaX * deltaX);
    }

    const clampedDy = Math.max(-1000, Math.min(1000, dy));
    const curvature = Math.abs(d2y) / Math.pow(1 + clampedDy * clampedDy, 1.5);

    result.push({
      x: pt.x,
      y: pt.y,
      dy: clampedDy,
      curvature: isNaN(curvature) ? 0 : Math.min(10, curvature),
      isValid: true,
    });
  }

  return result;
}

/**
 * Soft falloff deformation kernel.
 * Smooth quartic bell-curve: (1 - (d/R)^2)^2 for d < R, 0 otherwise.
 */
export function smoothFalloff(distance: number, radius: number): number {
  if (radius <= 0) return distance === 0 ? 1 : 0;
  const ratio = distance / radius;
  if (ratio >= 1) return 0;
  const factor = 1 - ratio * ratio;
  return factor * factor;
}

/**
 * Deforms control points with a sculpting brush.
 * targetIndex: the control point directly clicked/dragged.
 * deltaY: displacement in mathematical coordinates.
 * brushRadiusNormalized: brush influence radius as a fraction of the total domain [0.05, 1.0].
 */
export function deformControlPointsWithBrush(
  controlPoints: SplineControlPoint[],
  targetIndex: number,
  deltaY: number,
  brushRadiusNormalized: number,
  minX: number,
  maxX: number
): SplineControlPoint[] {
  if (!controlPoints || controlPoints.length === 0 || targetIndex < 0 || targetIndex >= controlPoints.length) {
    return controlPoints;
  }

  const domainWidth = Math.abs(maxX - minX) || 1;
  const radiusInMathUnits = Math.max(domainWidth * 0.05, brushRadiusNormalized * domainWidth);
  const targetX = controlPoints[targetIndex].x;

  return controlPoints.map((pt, idx) => {
    if (idx === targetIndex) {
      return {
        ...pt,
        y: pt.y + deltaY,
      };
    }

    const dist = Math.abs(pt.x - targetX);
    const weight = smoothFalloff(dist, radiusInMathUnits);

    if (weight <= 0) {
      return pt;
    }

    return {
      ...pt,
      y: pt.y + deltaY * weight,
    };
  });
}
