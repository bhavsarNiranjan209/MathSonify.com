/**
 * The ONE shared piece of state describing "the curve currently on screen".
 *
 * WHY THIS EXISTS — the staleness bug it fixes:
 *
 * `Visualizer` used to hold the sampled curve in `cachedPointsRef`, a plain ref
 * mutated from inside a `useEffect`, and separately held a `freeformRef` that
 * temporarily overrode it while the user dragged the curve upward. Drawing read
 * `freeformRef.current ?? cachedPointsRef.current`.
 *
 * That is two sources of truth with no ordering guarantee, and it fails hard:
 * `freeformRef` was cleared only on `pointerup` on the canvas. Drag the curve,
 * release the mouse outside the canvas (or have the pointer cancelled) and the
 * override is never cleared — so `freeformRef.current` keeps winning forever
 * and every subsequent equation change is silently invisible. The graph keeps
 * showing the previous equation with no error anywhere.
 *
 * THE FIX is structural rather than defensive: the active curve is now React
 * state derived from the store inputs, and the drag preview is a child of that
 * state with a bounded lifetime rather than a parallel cache that can outlive
 * the gesture. Both the 2D renderer and the 3D viewer read this same hook, so
 * neither can drift from the other.
 *
 * Deriving with `useMemo` (rather than an effect writing a ref) is the important
 * part: the value is correct during the same render that changed the equation,
 * so there is no frame in which a view can paint the previous curve.
 *
 * PERFORMANCE (Nov 2026) — the typed equation is debounced before it reaches
 * the resolver. Every keystroke used to re-sample 800 points and rebuild the
 * whole 3D scene, which is the lag the user reported. The input field, the
 * store, playback and exports all keep reading the LIVE equation, so only
 * the expensive derived work waits for a 200ms pause. Sculpted / freehand
 * curves are NOT debounced: dragging a point must follow the pointer live,
 * and a pending timer is cancelled the moment sculpting starts so a stale
 * equation can never overwrite the drag. Preset loads and scientist picks
 * pass through the same 200ms window — the field updates at once, the graph
 * follows a beat later.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  resolveActiveCurve,
  CURVE_SAMPLE_COUNT,
  type ActiveCurve,
  type ActiveCurveSource,
} from './activeCurve';
import { debounce, EQUATION_COMMIT_DEBOUNCE_MS, type DebouncedFunction } from './debounce';
import type { SamplePoint } from './equationParser';
import type { SplineControlPoint } from './curveSpline';

export interface UseActiveCurveInput {
  equation: string;
  minX: number;
  maxX: number;
  /** True once the user has deformed the curve away from the typed equation. */
  isCustomCurve: boolean;
  splineControlPoints: SplineControlPoint[];
}

/** The resolved active curve, or an error when it could not be built. */
export interface ActiveCurveState {
  /** Points to draw. Empty when `error` is set. */
  points: SamplePoint[];
  /** Whether the shape came from the spline or the typed equation. */
  source: ActiveCurveSource | null;
  /** Set when the equation could not be parsed or produced no valid values. */
  error: string | null;
}

/**
 * Resolves the active curve once, from the canonical inputs.
 *
 * Never throws: a bad equation is a state this component must be able to render
 * (an empty canvas plus an error), not an exception that unmounts the graph.
 */
export function useActiveCurve(input: UseActiveCurveInput): ActiveCurveState {
  const { equation, minX, maxX, isCustomCurve, splineControlPoints } = input;

  // The equation the graph actually resolves — the live one while sculpting,
  // the debounced one while typing. Starts live, so the first paint never waits.
  const [debouncedEquation, setDebouncedEquation] = useState({ equation, minX, maxX });
  const commitRef = useRef<DebouncedFunction<
    (next: { equation: string; minX: number; maxX: number }) => void
  > | null>(null);
  if (commitRef.current === null) {
    commitRef.current = debounce(
      (next: { equation: string; minX: number; maxX: number }) => setDebouncedEquation(next),
      EQUATION_COMMIT_DEBOUNCE_MS,
    );
  }
  useEffect(() => {
    if (isCustomCurve) {
      // Sculpting follows the pointer; never let a stale timer overwrite it.
      commitRef.current?.cancel();
      setDebouncedEquation({ equation, minX, maxX });
    } else {
      commitRef.current?.({ equation, minX, maxX });
    }
  }, [equation, minX, maxX, isCustomCurve]);
  useEffect(() => () => commitRef.current?.cancel(), []);

  const resolvedEquation = isCustomCurve ? equation : debouncedEquation.equation;
  const resolvedMinX = isCustomCurve ? minX : debouncedEquation.minX;
  const resolvedMaxX = isCustomCurve ? maxX : debouncedEquation.maxX;

  return useMemo<ActiveCurveState>(() => {
    try {
      const resolved: ActiveCurve = resolveActiveCurve({
        equation: resolvedEquation,
        minX: resolvedMinX,
        maxX: resolvedMaxX,
        isCustomCurve,
        splineControlPoints,
      });
      return { points: resolved.points, source: resolved.source, error: null };
    } catch (err) {
      return {
        points: [],
        source: null,
        error: err instanceof Error ? err.message : 'Cannot render equation',
      };
    }
    // `splineControlPoints` is an array from the store; its identity changes only
    // when the store sets it, so this is a correct and cheap dependency.
  }, [resolvedEquation, resolvedMinX, resolvedMaxX, isCustomCurve, splineControlPoints]);
}

export { CURVE_SAMPLE_COUNT };