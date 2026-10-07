/**
 * The single source of truth for "what curve is currently active".
 *
 * The Create tab can be showing a curve that is NOT described by the equation
 * string: sculpting the curve with the brush, dragging the freehand editor or
 * fitting a new equation all replace the plotted shape while `equation` keeps
 * holding the pre-edit text. Anything that needs the plotted shape — the live
 * visual, live playback, the WAV export and the video export — must therefore
 * ask this module rather than parsing `equation` for itself.
 *
 * The rule is intentionally identical to the one `Studio.tsx` and
 * `AudioControls.tsx` already applied inline before this module existed:
 *
 *   isCustomCurve && splineControlPoints.length > 0
 *     ? evaluateCatmullRomSpline(splineControlPoints)   // sculpted / freehand
 *     : parseEquation(equation).sample(...)              // typed equation
 *
 * Keep that ternary in ONE place. If it is ever duplicated, the preview and the
 * export can drift apart again.
 */
import { parseEquation, type SamplePoint } from './equationParser';
import { evaluateCatmullRomSpline, type SplineControlPoint } from './curveSpline';

/** Sample density shared by the preview, the audio engines and every export. */
export const CURVE_SAMPLE_COUNT = 800;

export interface ActiveCurveInput {
  equation: string;
  minX: number;
  maxX: number;
  /** True once the user has deformed the curve away from the typed equation. */
  isCustomCurve: boolean;
  splineControlPoints: SplineControlPoint[];
}

/** Which branch produced the points — surfaced for debugging and for tests. */
export type ActiveCurveSource = 'spline' | 'equation';

export interface ActiveCurve {
  points: SamplePoint[];
  source: ActiveCurveSource;
}

/**
 * Resolves the currently-active curve to dense sample points.
 *
 * @throws when neither branch yields a usable curve, with the parser's own
 *         message so the UI can show why the export was refused.
 */
export function resolveActiveCurve(input: ActiveCurveInput): ActiveCurve {
  const { equation, minX, maxX, isCustomCurve, splineControlPoints } = input;

  if (isCustomCurve && splineControlPoints.length > 0) {
    const points = evaluateCatmullRomSpline(splineControlPoints, CURVE_SAMPLE_COUNT);
    const valid = points.filter((p) => p.isValid);
    if (valid.length > 0) return { points, source: 'spline' };
    // A degenerate spline (all points identical / NaN) falls through to the
    // equation rather than exporting an empty frame.
  }

  const parsed = parseEquation(equation);
  if (!parsed.success || !parsed.sample) {
    throw new Error(parsed.error || 'Invalid equation');
  }

  const points = parsed.sample(minX, maxX, CURVE_SAMPLE_COUNT);
  const valid = points.filter((p) => p.isValid);
  if (valid.length === 0) {
    throw new Error('Equation does not produce valid numerical values in this range');
  }
  return { points, source: 'equation' };
}

/**
 * Padded y-range for plotting — 18% headroom above and below the data so the
 * curve never touches the panel edge. Shared by the visualizer, the edit
 * overlay and the video export so all three frame the curve identically.
 */
export function paddedYRange(pts: SamplePoint[]): { paddedMinY: number; paddedMaxY: number } {
  const yVals = pts.map((p) => p.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const yPad = Math.max(0.5, (maxY - minY) * 0.18);
  return { paddedMinY: minY - yPad, paddedMaxY: maxY + yPad };
}
