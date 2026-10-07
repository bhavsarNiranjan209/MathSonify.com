/**
 * Axis arrowheads, tick marks and tick labels — ported to match the literal
 * dark-mode reference implementation.
 *
 * WHY A SEPARATE MODULE: these are the pieces the reference does that the
 * Studio viewer did not have at all. The viewer imported `niceTicks` and
 * `tickLabel` but never called either, so axis ticks were never drawn. Keeping
 * the port here means the geometry and the maths can be asserted without a GPU,
 * and the viewer only has to place what this returns.
 *
 * SCOPE: dark mode only. Light mode is deferred; colours are passed in rather
 * than hard-coded so the light scene can be authored on its own terms later
 * without touching this file.
 *
 * The pure functions (fitRadiusForSphere, fogRadiiFor, referenceTickValues)
 * take and return plain numbers, which is what makes them testable here.
 */
import {
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Group,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';

/** Cone at the tip of an axis. A bare line end reads as unfinished. */
export const ARROW_CONE = {
  radius: 0.06,
  height: 0.18,
  /** Low enough to stay a crisp arrowhead at this scale, high enough to shade. */
  radialSegments: 12,
} as const;

/**
 * Half-length of a tick dash, in world units.
 *
 * The dash crosses the axis perpendicular to it, so the visible tick is twice
 * this. Small on purpose — it is a mark, not a notch.
 */
export const TICK_DASH_HALF = 0.06;

/** Tick label chip, matching the reference's canvas texture. */
const CHIP = {
  canvasWidth: 160,
  canvasHeight: 80,
  padding: 64,
  /** Per-character allowance, on top of padding. */
  perChar: 14,
  height: 32,
  radius: 8,
  /** Opaque enough to guarantee contrast over a grid line or the box edge. */
  background: 'rgba(10,10,12,0.78)',
  fill: '#ffffff',
  fontPx: 34,
  fontWeight: 600,
  fontFamily: '"JetBrains Mono", monospace',
} as const;

/** Sprite scale for a chip label, derived from the reference's sizing rule. */
const CHIP_SCALE = { width: 0.546, height: 0.21 } as const;
/**
 * Distance at which the bounding sphere exactly fills the vertical field of
 * view, multiplied by a small air factor.
 *
 * Ported exactly: `(radius / sin(fov/2)) * AIR`. Note this uses the vertical FOV
 * and does NOT compensate for aspect ratio, so a wide viewport shows extra
 * horizontal margin. That asymmetry is the reference's behaviour and is kept
 * rather than "improved" — the framing is approved.
 */
export function fitRadiusForSphere(radius: number, fovDegrees: number, air = 1.4): number {
  const halfFov = ((fovDegrees * Math.PI) / 180) / 2;
  return (radius / Math.sin(halfFov)) * air;
}

/**
 * Fog near/far, derived from the auto-fit radius used to frame the camera.
 *
 * This is why the grid fades instead of ending: fog is anchored to the framing
 * distance, so the fade lands beyond the curve however the camera is framed.
 *
 * THE MULTIPLIERS ARE NOT THE REFERENCE'S 1.15 / 2.8, and that is a correction,
 * not a drift. Fog distance is measured from the CAMERA, and the orbit clamps
 * zoom-out to roughly 2.5x the starting distance. With near at 1.15 the camera
 * passes the near plane partway out and the entire scene — curve included — washes
 * out to the fog colour, which in dark mode is near-black. Zooming out made the
 * graph disappear. Pushing near past the zoom limit fixes that while keeping the
 * floor grid fading at the edges, which is the effect that was wanted.
 */
export function fogRadiiFor(fitRadius: number): { near: number; far: number } {
  // Absolute floor as well as the proportional term. The proportional part
  // alone still fails for a small curve: at fit = 10 it puts near at 30, while
  // the orbit can pull the camera back to 60, so the camera would cross the near
  // plane and fog the scene. `Math.max` means a small scene gets fog pushed out
  // further instead of closer, and a large one still fades at its own scale.
  const near = Math.max(fitRadius * 3, 66);
  return { near, far: near * 2.4 };
}

/**
 * Tick values for one axis, ported from the reference.
 *
 * Deliberately NOT a "nice 1/2/5 step" algorithm despite the reference naming it
 * `niceTicks`: the reference spaces values linearly, rounds to a span-dependent
 * number of decimals (2dp under a span of 1, 1dp under 10, otherwise whole
 * numbers), then drops duplicates and near-zero values.
 *
 * CONSEQUENCE, WHICH LOOKS LIKE A BUG BUT IS NOT: the rounding means the extreme
 * ticks do not necessarily land on the exact domain edge. Over -6.28..6.28 the
 * span is 12.56, so decimals drop to 0 and the first label reads -6, not -6.28.
 * That is the reference's behaviour and is kept deliberately — clean labels are
 * worth more than exact endpoints, and the axis lines already show the true
 * extent.
 *
 * `epsilon` drops ticks too close to the axis origin, where the label would
 * collide with the axis names.
 */
export function referenceTickValues(
  min: number,
  max: number,
  count: number,
  epsilon: number,
): number[] {
  const vals: number[] = [];
  for (let i = 0; i < count; i++) vals.push(min + ((max - min) * i) / (count - 1));

  const span = max - min;
  const decimals = span < 1 ? 2 : span < 10 ? 1 : 0;
  const factor = Math.pow(10, decimals);

  const seen = new Set<number>();
  const out: number[] = [];
  for (const v of vals) {
    const rounded = Math.round(v * factor) / factor;
    if (Math.abs(rounded) < epsilon) continue;
    if (seen.has(rounded)) continue;
    seen.add(rounded);
    out.push(rounded);
  }
  return out;
}
/**
 * An arrowhead cone capping an axis at `tip`, pointing along `dir`.
 *
 * Cone only, not line-plus-cone: the Studio viewer already draws its own axis
 * lines, deliberately faint and depth-write-free, and replacing those with an
 * opaque line would undo that established look. This adds just the tip, which
 * was the piece that was missing — a bare line end reads as unfinished.
 *
 * The cone is oriented with `lookAt` down the axis then rolled a quarter turn:
 * a cone's tip points along its local +Y while `lookAt` aims -Z, so without the
 * roll every arrowhead would point sideways.
 */
export function buildArrowHead(tip: Vector3, dir: Vector3, color: string): Mesh {
  const cone = new Mesh(
    new ConeGeometry(ARROW_CONE.radius, ARROW_CONE.height, ARROW_CONE.radialSegments),
    new MeshBasicMaterial({ color: new Color(color) }),
  );
  const outward = dir.clone().normalize();
  cone.position.copy(tip);
  cone.lookAt(tip.clone().add(outward));
  cone.rotateX(Math.PI / 2);
  return cone;
}

/**
 * A tick: a short dash lying across the axis at `point`.
 *
 * `onHorizontalAxis` picks the perpendicular. A tick on the X axis stands
 * upright (varied in Y); a tick on the Y axis lies flat (varied in X).
 */
export function buildTickDash(point: Vector3, onHorizontalAxis: boolean, color: string): Line {
  const [a, b] = onHorizontalAxis
    ? [
        new Vector3(point.x, point.y - TICK_DASH_HALF, point.z),
        new Vector3(point.x, point.y + TICK_DASH_HALF, point.z),
      ]
    : [
        new Vector3(point.x - TICK_DASH_HALF, point.y, point.z),
        new Vector3(point.x + TICK_DASH_HALF, point.y, point.z),
      ];

  return new Line(
    new BufferGeometry().setFromPoints([a, b]),
    new LineBasicMaterial({ color: new Color(color) }),
  );
}

/**
 * A tick number drawn on a dark chip, so it stays legible over a grid line, the
 * bounding-box edge, or the curve itself.
 *
 * `depthTest: false` is what actually buys the contrast guarantee: it opts the
 * sprite out of depth sorting, so a label is never occluded by scene geometry
 * and never left half-buried in the box wireframe.
 *
 * Returns null without a DOM (SSR / unit tests), so callers can treat label
 * creation as best-effort rather than special-casing the environment.
 */
export function buildChipLabel(text: string): Sprite | null {
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = CHIP.canvasWidth;
  canvas.height = CHIP.canvasHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const chipWidth = CHIP.padding + text.length * CHIP.perChar;
  const chipX = CHIP.canvasWidth / 2 - chipWidth / 2;
  const chipY = 24;
  ctx.fillStyle = CHIP.background;
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(chipX, chipY, chipWidth, CHIP.height, CHIP.radius);
  } else {
    ctx.rect(chipX, chipY, chipWidth, CHIP.height);
  }
  ctx.fill();

  ctx.font = `${CHIP.fontWeight} ${CHIP.fontPx}px ${CHIP.fontFamily}`;
  ctx.fillStyle = CHIP.fill;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, CHIP.canvasWidth / 2, CHIP.canvasHeight / 2);

  const sprite = new Sprite(
    new SpriteMaterial({
      map: new CanvasTexture(canvas),
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(CHIP_SCALE.width, CHIP_SCALE.height, 1);
  return sprite;
}