import { clamp, type DrawInstrument, type FreehandPoint, type FreehandStroke } from './freehandDraw';

export const MAX_CAPTURE_STEP_PX = 3;
const SCAN_EPSILON = 1e-7;

export interface ScanReading {
  color: string;
  instrument: DrawInstrument;
  /** Every exact y intersection at this x; one voice averages these values. */
  ys: number[];
  averageY: number;
}

function addIntersection(map: Map<string, ScanReading>, color: string, instrument: DrawInstrument, y: number): void {
  let reading = map.get(color);
  if (!reading) {
    reading = { color, instrument, ys: [], averageY: y };
    map.set(color, reading);
  }
  // Adjacent segments meeting at the scan line must not double-count the same hit.
  if (reading.ys.some((value) => Math.abs(value - y) < SCAN_EPSILON)) return;
  reading.ys.push(y);
  reading.averageY = reading.ys.reduce((sum, value) => sum + value, 0) / reading.ys.length;
}

/**
 * Read the CURRENT stroke list at one normalized x position.
 *
 * This deliberately does not build a stale color lookup: callers pass the live
 * array every animation frame. Segment interpolation means even a diagonal is
 * read continuously, while the capture densifier still guarantees dense data.
 */
export function scanStrokes(strokes: FreehandStroke[], scanX: number): ScanReading[] {
  const x = clamp(scanX, 0, 1);
  const readings = new Map<string, ScanReading>();

  for (const stroke of strokes) {
    const points = stroke.points;
    if (points.length === 0) continue;

    if (points.length === 1) {
      if (Math.abs(points[0].x - x) <= SCAN_EPSILON) addIntersection(readings, stroke.color, stroke.instrument, points[0].y);
      continue;
    }

    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i];
      const b = points[i + 1];
      const minX = Math.min(a.x, b.x);
      const maxX = Math.max(a.x, b.x);

      if (a.x === b.x) {
        if (Math.abs(a.x - x) <= SCAN_EPSILON) {
          addIntersection(readings, stroke.color, stroke.instrument, a.y);
          addIntersection(readings, stroke.color, stroke.instrument, b.y);
        }
        continue;
      }
      if (x < minX || x > maxX) continue;

      const ratio = (x - a.x) / (b.x - a.x);
      addIntersection(readings, stroke.color, stroke.instrument, a.y + (b.y - a.y) * ratio);
    }
  }

  return [...readings.values()];
}

function distanceSquaredToSegment(
  point: FreehandPoint,
  start: { x: number; y: number },
  end: { x: number; y: number },
  widthPx: number,
  heightPx: number,
): number {
  const px = point.x * widthPx;
  const py = point.y * heightPx;
  const ax = start.x * widthPx;
  const ay = start.y * heightPx;
  const bx = end.x * widthPx;
  const by = end.y * heightPx;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const ratio = lengthSquared > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lengthSquared)) : 0;
  const x = ax + ratio * dx;
  const y = ay + ratio * dy;
  return (px - x) ** 2 + (py - y) ** 2;
}

/** Return topmost-first stroke indices touched by an eraser sweep. */
export function findStrokesAlongSegment(
  strokes: FreehandStroke[],
  start: { x: number; y: number },
  end: { x: number; y: number },
  widthPx: number,
  heightPx: number,
  radiusPx: number,
): number[] {
  const radiusSquared = Math.max(1, radiusPx) ** 2;
  const hits: number[] = [];
  for (let strokeIndex = strokes.length - 1; strokeIndex >= 0; strokeIndex--) {
    const points = strokes[strokeIndex].points;
    if (points.length === 0) continue;
    if (points.length === 1) {
      if (distanceSquaredToSegment(points[0], start, end, widthPx, heightPx) <= radiusSquared) hits.push(strokeIndex);
      continue;
    }
    for (let pointIndex = 0; pointIndex < points.length; pointIndex++) {
      if (distanceSquaredToSegment(points[pointIndex], start, end, widthPx, heightPx) <= radiusSquared) {
        hits.push(strokeIndex);
        break;
      }
    }
  }
  return hits;
}

/**
 * Insert linearly interpolated points so consecutive stored samples are never
 * farther apart than maxStepPx in actual canvas pixels.
 *
 * The returned points exclude `from` and include `to`; timestamps interpolate
 * with the same ratio so the visual curve and underlying data stay identical.
 */
export function densifySegment(
  from: FreehandPoint,
  to: FreehandPoint,
  widthPx: number,
  heightPx: number,
  maxStepPx = MAX_CAPTURE_STEP_PX,
): FreehandPoint[] {
  const distance = Math.hypot((to.x - from.x) * widthPx, (to.y - from.y) * heightPx);
  if (distance <= 1e-6) return [];
  const steps = Math.max(1, Math.ceil(distance / Math.max(0.5, maxStepPx)));
  const points: FreehandPoint[] = [];
  for (let step = 1; step <= steps; step++) {
    const ratio = step / steps;
    points.push({
      x: from.x + (to.x - from.x) * ratio,
      y: from.y + (to.y - from.y) * ratio,
      t: from.t + (to.t - from.t) * ratio,
    });
  }
  return points;
}

export interface RecordingScanStep {
  x: number;
  elapsedMs: number;
  complete: boolean;
}

/** Advance a recording exactly one scan period from any current phase. */
export function advanceRecordingScan(
  scanX: number,
  elapsedMs: number,
  frameDeltaMs: number,
  periodMs: number,
): RecordingScanStep {
  const safePeriod = Math.max(1, periodMs);
  const elapsed = clamp(elapsedMs, 0, safePeriod);
  const remaining = Math.max(0, safePeriod - elapsed);
  const step = Math.min(Math.max(0, frameDeltaMs), remaining);
  const nextElapsed = Math.min(safePeriod, elapsed + step);
  const complete = nextElapsed >= safePeriod - 0.001;
  return {
    x: (clamp(scanX, 0, 1) + step / safePeriod) % 1,
    elapsedMs: nextElapsed,
    complete,
  };
}
