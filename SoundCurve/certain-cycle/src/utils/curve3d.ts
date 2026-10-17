/**
 * Curve -> 3D layout math for the (dev-only) 3D curve viewer.
 *
 * Everything here is pure: no DOM, no WebGL, no renderer. That is deliberate —
 * it is the half of the 3D viewer that can be unit-tested in Node, which is the
 * only part of a WebGL feature that can be verified without a browser. The
 * component that consumes this owns the scene, the lights and the loop.
 *
 * Honesty about what this is: every equation in this app is single-variable,
 * y = f(x). There is no second input to map to depth, so this does NOT invent
 * a z = f(x,y) surface. It lays the *same* sampled points the 2D view draws
 * into a 3D scene as a lit, glowing tube you can orbit. The "3D" is the camera
 * moving around a real 3D object, not fabricated data.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  TubeGeometry,
  Vector3,
} from 'three';
import type { SamplePoint } from './equationParser';

export interface CurveLayoutOptions {
  /** Target width of the laid-out curve, in world units. */
  width?: number;
  /** Height of the curve above the grid floor, in world units. */
  lift?: number;
  /** Cap on points fed to the spline — bounds tube cost on dense equations. */
  maxPoints?: number;
}

export interface CurveLayout {
  /** Centreline of the tube, in world space, on the z = 0 plane. */
  centerline: Vector3[];
  /** Uniform scale applied to x and y (never anisotropic — no distortion). */
  scale: number;
  /** Where the grid floor sits, in world units. */
  floorY: number;
  /** Bounds after layout, for framing the camera. */
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  /**
   * The curve's domain and range in EQUATION units — the numbers the user typed
   * and the numbers the 2D graph prints.
   *
   * `bounds` is in world units: it has been centred on the curve's midpoint and
   * lifted off the floor, so a curve running -1..+1 lands at world 1.4..3.4.
   * Labelling the 3D axes from `bounds` therefore made every tick read positive
   * and disagreed with the 2D graph sitting beside it. Ticks are positioned
   * using `bounds` (that is where the axis really is) but LABELLED from this,
   * so the two views show the same numbers.
   */
  dataBounds: { minX: number; maxX: number; minY: number; maxY: number };
  /** How many of the sampled points were valid and used. */
  pointCount: number;
  /**
   * Whether the display y-range was percentile-trimmed to keep asymptotic
   * curves (e.g. tan) from stretching the view beyond the shape worth showing.
   */
  yTrimmed: boolean;
}

/**
 * The valid points, decimated to at most `maxPoints`.
 *
 * Decimation is a uniform stride rather than filtering, so the shape is
 * preserved — dropping every other sample of a uniform sampling traces the same
 * line. The two endpoints are always kept: losing the last point would shorten
 * the tube at exactly the domain edge, which reads as a visibly truncated curve.
 */
export function usablePoints(points: SamplePoint[], maxPoints = 512): SamplePoint[] {
  const valid = points.filter((p) => p.isValid);
  if (valid.length <= maxPoints) return valid;

  const stride = Math.ceil(valid.length / (maxPoints - 1));
  const kept = valid.filter((_, i) => i % stride === 0);
  const last = valid[valid.length - 1];
  // The stride lands on neither endpoint, so pin them explicitly.
  if (kept[kept.length - 1] !== last) kept.push(last);
  return kept;
}

/** The `q`-th percentile of a sorted sample, by linear interpolation. */
function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const rank = q * (sorted.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  const frac = rank - lower;
  return sorted[lower] * (1 - frac) + sorted[upper] * frac;
}

/**
 * Lays sampled 2D points out as a 3D centreline floating above a floor.
 *
 * x and y are scaled by the *same* factor so the curve keeps its true aspect
 * ratio: equations here span wildly different domains and y-ranges (Heart is
 * ~3.5 units tall over 3.5 units of x; a high-degree polynomial can be 1e5
 * tall), and a per-axis fit would quietly misrepresent their geometry.
 */
export function layoutCurve(
  points: SamplePoint[],
  options: CurveLayoutOptions = {},
): CurveLayout {
  const { width = 12, lift = 2.4, maxPoints = 512 } = options;
  const usable = usablePoints(points, maxPoints);

  if (usable.length < 2) {
    throw new Error(`layoutCurve needs at least 2 valid points, got ${usable.length}`);
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of usable) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const xSpan = maxX - minX || 1;
  const scale = width / xSpan;
  const midX = (minX + maxX) / 2;

  // Percentile-trim the y range so asymptotic curves (e.g. tan) do not stretch
  // the view far beyond the shape worth showing. When extreme outliers inflate
  // the raw span far past the inter-percentile range, the display range is
  // clamped to the 5th-95th percentile bulk; extreme points still exist in the
  // geometry but fall outside the framed viewport.
  const ys = usable.map((p) => p.y).sort((a, b) => a - b);
  const p5 = percentile(ys, 0.05);
  const p95 = percentile(ys, 0.95);
  const iqr = p95 - p5;
  let dispMinY = minY;
  let dispMaxY = maxY;
  let yTrimmed = false;
  if (iqr > 0 && maxY - minY > 4 * iqr) {
    dispMinY = p5;
    dispMaxY = p95;
    yTrimmed = true;
  }
  const midY = (dispMinY + dispMaxY) / 2;
  const ySpan = dispMaxY - dispMinY || 1;

  const centerline = usable.map(
    (p) => new Vector3((p.x - midX) * scale, (p.y - midY) * scale + lift, 0),
  );

  const halfHeight = (ySpan * scale) / 2;
  // Keep the lowest point of the curve a fixed distance above the floor so the
  // shadow always reads, instead of intersecting the grid.
  const floorY = lift - halfHeight - 1.6;

  return {
    centerline,
    scale,
    floorY,
    yTrimmed,
    bounds: {
      minX: (minX - midX) * scale,
      maxX: (maxX - midX) * scale,
      minY: lift - halfHeight,
      maxY: lift + halfHeight,
    },
    dataBounds: { minX, maxX, minY: dispMinY, maxY: dispMaxY },
    pointCount: usable.length,
  };
}

/**
 * Labelled coordinate axes for the 3D scene.
 *
 * Every equation in this app is single-variable (y = f(x)), so the curve lies on
 * the z = 0 plane. That is honest — but without a visible Z axis the scene reads
 * as "a flat 2D chart with a fancy background", and the viewer cannot tell that
 * the flatness is a property of the maths rather than a missing dimension. So all
 * three axes are drawn and labelled, and the Z axis is deliberately given real
 * length even though nothing sits on it.
 *
 * Axis colours are fixed here rather than derived from the theme so the three
 * axes are always mutually distinguishable, including in a monochrome or
 * high-contrast rendering where three shades of grey would not be.
 */
export interface AxisEndpoints {
  start: Vector3;
  end: Vector3;
}

export interface AxisSet {
  x: AxisEndpoints;
  y: AxisEndpoints;
  z: AxisEndpoints;
  /** Where the three labels sit — just past the end of each axis. */
  labelX: Vector3;
  labelY: Vector3;
  labelZ: Vector3;
}

export const AXIS_COLORS = {
  x: '#ff6b6b', // warm red
  y: '#7ee787', // green
  z: '#79c0ff', // blue — the conventional third primary
} as const;

/**
 * Builds the three axis lines and their label positions.
 *
 * The X axis spans the curve's own width so the curve visibly sits *on* it. Y
 * spans from the floor to above the tallest point. Z is a fixed length in both
 * directions from the origin, because there is no depth data to size it from and
 * a zero-length axis would be invisible.
 */
export function buildAxes(layout: CurveLayout, zLength = 6): AxisSet {
  const { bounds, floorY } = layout;
  const yTop = Math.max(bounds.maxY + 1.5, floorY + 4);

  return {
    // Y sits at x = 0 through the curve's plane, from the floor upward.
    x: {
      start: new Vector3(bounds.minX - 1.5, floorY, 0),
      end: new Vector3(bounds.maxX + 1.5, floorY, 0),
    },
    y: {
      start: new Vector3(0, floorY, 0),
      end: new Vector3(0, yTop, 0),
    },
    z: {
      start: new Vector3(0, floorY, -zLength),
      end: new Vector3(0, floorY, zLength),
    },
    labelX: new Vector3(bounds.maxX + 1.5, floorY, 0),
    labelY: new Vector3(0, yTop, 0),
    labelZ: new Vector3(0, floorY, zLength),
  };
}

/**
 * Where the travelling playhead sits, as a fraction along the centreline.
 *
 * Kept here rather than in the renderer so the mapping from playback progress to
 * a position on the curve is unit-testable, and so the 3D head and the 2D
 * playhead cannot disagree about which sample is currently sounding.
 *
 * Invalid samples are skipped rather than counted, so a curve with a singularity
 * still reaches its true end at progress 1 instead of stalling short.
 */
export function headIndexForProgress(pointCount: number, progress: number): number {
  if (pointCount <= 0) return 0;
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(pointCount - 1, Math.floor(clamped * (pointCount - 1)));
}

/** The world-space position of the playhead at a given progress. */
export function headPosition(
  centerline: Vector3[],
  progress: number,
): Vector3 | null {
  if (centerline.length === 0) return null;
  const index = headIndexForProgress(centerline.length, progress);
  return centerline[index] ?? null;
}

/**
 * Builds the curve as a tube, with the `positionAlong` attribute the curve
 * shader needs.
 *
 * A tube (rather than the flat ribbon used in an earlier pass) because the brief
 * now calls for a physically-based surface with clearcoat, and a clearcoat
 * highlight needs real curved geometry with real normals. A flat ribbon has
 * essentially one normal direction, so its specular lobe never moves as the
 * camera orbits — which is exactly the "reads flat from every angle" problem
 * clearcoat was introduced to solve.
 *
 * `positionAlong` runs 0..1 along the length, matching the tube's own parameter
 * and (for the uniform x-sampling the parser produces) the arc-length fraction.
 * The shader compares it against the shared playback progress, which is what
 * keeps the 3D playhead locked to the audio: both index the same samples.
 */
export function buildCurveTube(
  centerline: Vector3[],
  tubularSegments: number,
  radialSegments: number,
  radius: number,
): TubeGeometry {
  const spline = new CatmullRomCurve3(centerline, false, 'centripetal');
  const geometry = new TubeGeometry(spline, tubularSegments, radius, radialSegments, false);
  const along = new Float32Array((tubularSegments + 1) * (radialSegments + 1));
  for (let i = 0; i <= tubularSegments; i++) {
    // Uniform in the spline's parameter, matching uv.x.
    const t = i / tubularSegments;
    for (let j = 0; j <= radialSegments; j++) {
      along[i * (radialSegments + 1) + j] = t;
    }
  }
  geometry.setAttribute('positionAlong', new BufferAttribute(along, 1));
  return geometry;
}

/**
 * The eight edges of a box enclosing the curve's region.
 *
 * This is the cue that most makes a scene read as "a real coordinate space"
 * rather than "an object floating in void" — the eye needs to know the bounds of
 * the space it is in. Edges only: a solid or even translucent box would occlude
 * or tint the curve, which is the thing that must stay dominant.
 *
 * The box is padded slightly beyond the curve so the curve is clearly INSIDE its
 * space rather than touching the walls.
 */
export function buildBoundingBox(layout: CurveLayout, hex: string, pad = 1.2): BufferGeometry {
  const { bounds, floorY } = layout;

  // A CUBE FOOTPRINT WITH A MODEST HEIGHT.
  //
  // Two separate mistakes were corrected here. First, deriving depth from a
  // fraction of the X width gave a long low tunnel — a rectangle. Then forcing
  // all three sides equal made a wide flat curve as TALL as it is long, which
  // added a large empty volume above the graph — baggage.
  //
  // Now X and Z are equal, so the footprint is square and the volume reads as a
  // cube when seen from the default three-quarter angle, while Y stops just
  // above the highest tick label instead of being inflated to match. Extending
  // Z to the full X span is what gives it the Z depth that makes it read solid
  // rather than as a shallow tray.
  const tickClearance = pad * 0.9;
  const spanX = bounds.maxX - bounds.minX + pad * 2;
  const spanZ = spanX;
  const spanY = bounds.maxY - floorY + pad + tickClearance;

  const centreX = (bounds.minX + bounds.maxX) / 2;
  const minX = centreX - spanX / 2;
  const maxX = centreX + spanX / 2;
  // Stands on the floor rather than floating: a box suspended in mid-air reads
  // as a mistake, whereas one resting on the ground plane reads as the volume
  // the curve occupies.
  const minY = floorY;
  const maxY = floorY + spanY;
  const minZ = -spanZ / 2;
  const maxZ = spanZ / 2;

  const corners: Vector3[] = [];
  for (const x of [minX, maxX]) {
    for (const y of [minY, maxY]) {
      for (const z of [minZ, maxZ]) corners.push(new Vector3(x, y, z));
    }
  }

  // Corner indices in the order the nested loops above produced them.
  const edges: [number, number][] = [
    [0, 1], [2, 3], [4, 5], [6, 7], // along x
    [0, 2], [1, 3], [4, 6], [5, 7], // along y
    [0, 4], [1, 5], [2, 6], [3, 7], // along z
  ];
  const points: Vector3[] = [];
  for (const [a, b] of edges) points.push(corners[a], corners[b]);

  const geometry = new BufferGeometry().setFromPoints(points);
  geometry.userData.boxColor = hex;
  return geometry;
}

/**
 * World size of an axis label sprite.
 *
 * The previous value was 1.6 world units — roughly 6% of a 26-unit scene width,
 * which on a 520px panel rendered as a letter several centimetres across, and
 * read as a chart label rather than an instrument annotation. Small, precise and
 * quiet is the goal; these labels are spatial references, not headlines.
 */
export const AXIS_LABEL_SCALE = 0.62;

/* ── numeric axis ticks ──────────────────────────────────────────── */

/**
 * A "nice" tick step — 1, 2, 5 or 10 times a power of ten.
 *
 * The rounding thresholds are 1.5 / 3 / 7 rather than the textbook 1 / 2 / 5.
 * With the conventional cut-offs a span of [-6.28, 6.28] picks a step of 5 and
 * yields only three labels (-5, 0, 5), leaving most of the axis bare; these
 * thresholds pick 2 and give seven. Both produce round numbers — these just
 * keep them dense enough to read an axis by.
 */
export function niceStep(span: number, targetIntervals = 5): number {
  if (!(span > 0) || !Number.isFinite(span)) return 1;
  const rough = span / Math.max(1, targetIntervals);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalised = rough / magnitude;
  const nice = normalised <= 1.5 ? 1 : normalised <= 3 ? 2 : normalised <= 7 ? 5 : 10;
  return nice * magnitude;
}

/**
 * Tick values covering [min, max] at round intervals.
 *
 * Placed along the X and Y axes so the numeric scale is readable, which the
 * bare axis lines and the single "X"/"Y"/"Z" sprites do not provide. Z is
 * deliberately excluded: the curve lies in the z = 0 plane, so there is no
 * depth scale to label.
 */
export function niceTicks(min: number, max: number, targetIntervals = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return [];
  const step = niceStep(max - min, targetIntervals);
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  // Bounded loop: a pathological step must not spin forever.
  for (let i = 0; i < 500; i++) {
    const v = first + i * step;
    if (v > max + step * 1e-6) break;
    // Re-round to kill floating-point dust like 0.30000000000000004.
    ticks.push(Number(v.toFixed(10)));
  }
  return ticks;
}

/** Short label text for a tick, e.g. 2.5 -> "2.5", 12 -> "12". */
export function tickLabel(value: number): string {
  return String(Number(value.toFixed(6)));
}

/**
 * Builds the curve as a camera-facing luminous RIBBON, not a tube.
 *
 * WHY A RIBBON AND NOT A TUBE — this is the single biggest reason the previous
 * version read as a WebGL demo. `TubeGeometry` is a solid pipe: it has a hard
 * silhouette, a visible specular highlight running along it, and a fixed physical
 * thickness. It looks like a plastic object, because that is exactly what it is.
 *
 * A ribbon is two triangles per segment spanning a centreline, expanded in the
 * VERTEX SHADER to always face the camera. That buys the things the brief asks
 * for and a tube cannot do:
 *
 *   - screen-space-constant thin width, so it reads as a drawn stroke rather than
 *     an object that happens to be thin;
 *   - a soft cross-section falloff, so the stroke has luminous edges and a
 *     brighter core instead of a hard rim;
 *   - ends that taper to nothing, so the curve enters and leaves the space
 *     instead of being chopped off by the domain boundary;
 *   - a live width response to playback energy, which is a one-line vertex
 *     change here and impossible on a baked tube without rebuilding geometry.
 *
 * The curve remains mathematically exact: the centreline is the same set of
 * sampled points the 2D graph draws, and the ribbon only ever widens or fades it.
 */
export function buildCurveRibbon(centerline: Vector3[], samples = 400): BufferGeometry {
  const usable = centerline.length >= 2 ? centerline : [centerline[0] ?? new Vector3()];
  const segments = usable.length - 1;

  // Two vertices per sample, one on each side of the centreline.
  const count = (segments + 1) * 2;
  const positions = new Float32Array(count * 3);
  const tangents = new Float32Array(count * 3);
  const sides = new Float32Array(count);
  const along = new Float32Array(count);

  for (let i = 0; i <= segments; i++) {
    const p = usable[Math.min(i, segments)];
    // Central difference for the tangent: the forward difference at the start and
    // the backward one at the end, so the ribbon does not flare at its extremes.
    const prev = usable[Math.max(0, i - 1)];
    const next = usable[Math.min(segments, i + 1)];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const tz = next.z - prev.z;
    const t = segments === 0 ? 0 : i / segments;

    for (let s = 0; s < 2; s++) {
      const k = (i * 2 + s) * 3;
      positions[k] = p.x;
      positions[k + 1] = p.y;
      positions[k + 2] = p.z;
      tangents[k] = tx;
      tangents[k + 1] = ty;
      tangents[k + 2] = tz;
      sides[i * 2 + s] = s === 0 ? -1 : 1;
      along[i * 2 + s] = t;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aTangent', new BufferAttribute(tangents, 3));
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  geometry.setIndex(indices);
  // `samples` is the caller's intent for smoothing; the ribbon carries one
  // segment per centreline point, so it is recorded for tests and debugging.
  geometry.userData.ribbonSamples = samples;
  return geometry;
}

/**
 * Centred distance that frames a laid-out curve, for the initial camera.
 *
 * `aspect` is the viewport's width/height. It matters more than it looks: a
 * perspective camera's horizontal field of view is derived from the vertical
 * one via that ratio, so framing purely from world geometry with a fixed
 * multiplier produces a curve that is small and lost in the middle of a wide
 * panel — the "tiny graph at the bottom of a huge empty area" symptom.
 *
 * So the framing is fitted against whichever axis is tighter:
 *
 *   distance = half-extent / tan(halfFov) * margin
 *
 * with halfFov taken as the VERTICAL fov, and the horizontal half-angle derived
 * from `aspect`. In a wide viewport the horizontal field is wide, so the
 * horizontal extent is divided by the horizontal half-angle — which correctly
 * lets a wide curve come closer than a tall one would.
 *
 * `margin` is deliberately tight (1.06): the curve is the subject and should
 * fill the frame, with only a little air so the bounding box is not clipped.
 */
export function framingRadius(layout: CurveLayout, aspect: number, fovDeg: number): number {
  const halfW = (layout.bounds.maxX - layout.bounds.minX) / 2;
  const halfH = (layout.bounds.maxY - layout.bounds.minY) / 2;

  const vFov = (fovDeg * Math.PI) / 180;
  // The horizontal half-angle implied by a vertical fov at this aspect ratio.
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);

  // Fit on the axis that is proportionally tighter, so the nearer of the two
  // limits wins — that is what fills the frame rather than under-filling it.
  const distanceV = halfH / Math.tan(vFov / 2);
  const distanceH = halfW / Math.tan(hFov / 2);
  const margin = 1.06;

  // Floor the DEPTH, not the fit. Clamping the fitted distance itself would
  // flatten two genuinely different viewports to the same number and hide the
  // aspect behaviour entirely; this is a near-plane guard against a degenerate
  // (near-zero extent) curve, not a framing rule.
  const nearPlaneGuard = 0.5;
  return Math.max(nearPlaneGuard, Math.min(distanceV, distanceH) * margin);
}
