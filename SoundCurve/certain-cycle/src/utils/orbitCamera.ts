/**
 * Hand-rolled orbit / zoom / pan maths for the 3D curve viewer.
 *
 * Pure state transitions over spherical camera coordinates. Written by hand
 * rather than pulling in OrbitControls so the viewer stays a single dependency,
 * and kept separate from the renderer so the *feel* of the controls — the
 * clamping, the pinch scaling, the pan basis — is unit-testable without WebGL.
 *
 * The camera orbits a target point. `theta` is the azimuth, `phi` the polar
 * angle measured from +Y, and `radius` the distance. phi is clamped away from
 * both poles so the camera never flips over the top or under the floor.
 */

export interface OrbitState {
  /** Azimuth, radians. */
  theta: number;
  /** Polar angle from +Y, radians. Clamped to (EPS, PI - EPS). */
  phi: number;
  /** Distance from target. Always clamped to [min, max]. */
  radius: number;
  /** Point the camera looks at, in world space. */
  target: { x: number; y: number; z: number };
}

export interface OrbitLimits {
  minRadius: number;
  maxRadius: number;
  /** Guards against gimbal flip at the poles. */
  epsilon: number;
}

export const DEFAULT_LIMITS: OrbitLimits = {
  // minRadius: far enough in that a small curve is still a recognisable object
  // rather than a wall of surface.
  minRadius: 2.5,
  // maxRadius: 160, up from 60.
  //
  // Zoom-out is clamped in ABSOLUTE world units, so this number is not "a bit
  // more zoom" — it decides whether pulling back is possible at all. At 60 the
  // clamp sat close to a typical framed distance, so entering 3D felt stuck:
  // the view was pinned near the curve with almost no room to stand off. The
  // limit only needs to be generous enough to keep the curve inside the fog
  // far plane (see `fogRadiiFor`) and to stop the user losing it entirely.
  maxRadius: 160,
  epsilon: 0.05,
};

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How much one unit of `deltaY` moves the camera, per wheel notch.
 *
 * Exposed as a constant rather than an inline literal so the zoom's feel can be
 * tuned in one obvious place, and asserted directly in the tests: zoom is the one
 * control where the difference between "responsive" and "far too slow" is a
 * single number, and it is worth pinning.
 */
export const ZOOM_SENSITIVITY = 0.0024;

/** Camera position for a given orbit state, in world space. */
export function orbitPosition(state: OrbitState): { x: number; y: number; z: number } {
  const sinPhi = Math.sin(state.phi);
  return {
    x: state.target.x + state.radius * sinPhi * Math.sin(state.theta),
    y: state.target.y + state.radius * Math.cos(state.phi),
    z: state.target.z + state.radius * sinPhi * Math.cos(state.theta),
  };
}

/** Drag to orbit. Returns a new state; never mutates the input. */
export function applyOrbit(
  state: OrbitState,
  dxPx: number,
  dyPx: number,
  limits: OrbitLimits = DEFAULT_LIMITS,
): OrbitState {
  // A full turn per ~600px of drag feels natural on both mouse and trackpad.
  const ROTATE_PER_PX = (Math.PI * 2) / 600;
  return {
    ...state,
    theta: state.theta - dxPx * ROTATE_PER_PX,
    phi: clamp(
      state.phi - dyPx * ROTATE_PER_PX,
      limits.epsilon,
      Math.PI - limits.epsilon,
    ),
    radius: state.radius,
    target: state.target,
  };
}

/**
 * Wheel / pinch to zoom.
 *
 * `deltaY` is positive for wheel-down and pinch-out. Zoom is multiplicative
 * rather than additive so it feels the same at any distance, and is clamped so
 * the curve can neither be lost inside the near plane nor shrunk to a dot.
 */
export function applyZoom(
  state: OrbitState,
  deltaY: number,
  limits: OrbitLimits = DEFAULT_LIMITS,
): OrbitState {
  // 0.0024, up from 0.0012. The multiplier is applied to `deltaY`, which a
  // typical wheel notch delivers as ~100, so the old value moved the camera only
  // ~12% per notch — far too slow to feel like a responsive zoom.
  //
  // Still `exp()` rather than a linear `radius * (1 + k)`: exponential zoom feels
  // identical at every distance, so pulling back and pushing in have the same
  // weight. A larger constant scales that curve up without changing its shape,
  // so raising it does not make the control twitchy — the orbit damping is what
  // smooths the result, and that is unchanged.
  const factor = Math.exp(deltaY * ZOOM_SENSITIVITY);
  return {
    ...state,
    theta: state.theta,
    phi: state.phi,
    radius: clamp(state.radius * factor, limits.minRadius, limits.maxRadius),
    target: state.target,
  };
}

/**
 * Pinch to zoom. `scale` is the ratio of the current to the previous finger
 * separation: > 1 means the fingers moved apart, so the camera moves in.
 */
export function applyPinch(
  state: OrbitState,
  scale: number,
  limits: OrbitLimits = DEFAULT_LIMITS,
): OrbitState {
  if (!Number.isFinite(scale) || scale <= 0) return state;
  return {
    ...state,
    radius: clamp(state.radius / scale, limits.minRadius, limits.maxRadius),
  };
}

/**
 * Pan across the view plane, in the camera's own right/up basis so dragging
 * moves the curve with the cursor from any angle.
 *
 * `dx`/`dy` are pixels; the basis vectors are passed in already normalised.
 */
export function applyPan(
  state: OrbitState,
  dxPx: number,
  dyPx: number,
  right: { x: number; y: number; z: number },
  up: { x: number; y: number; z: number },
  metresPerPixel = 0.01,
): OrbitState {
  const move = (d: number, axis: { x: number; y: number; z: number }) => ({
    x: d * axis.x,
    y: d * axis.y,
    z: d * axis.z,
  });
  // Dragging right should push the scene right, hence the sign flip.
  const rx = move(-dxPx * metresPerPixel, right);
  const uy = move(dyPx * metresPerPixel, up);
  return {
    ...state,
    theta: state.theta,
    phi: state.phi,
    radius: state.radius,
    target: {
      x: state.target.x + rx.x + uy.x,
      y: state.target.y + rx.y + uy.y,
      z: state.target.z + rx.z + uy.z,
    },
  };
}

/**
 * Exponential easing of the camera toward a target orbit.
 *
 * WHY: an orbit control that tracks the pointer 1:1 feels mechanical — the
 * scene is pinned to the cursor and stops dead when it does. Easing the camera
 * toward a pointer-controlled TARGET adds a little inertia, so the curve keeps
 * gliding for a moment after the drag ends and catches up when you reverse.
 * That single change is most of what separates a premium control from a
 * mechanical one.
 *
 * Frame-rate independence: this is a `1 - (1 - damping) ** dt`-style factor
 * rather than a fixed fraction, but the caller passes a per-frame factor, so at
 * a steady 60fps a constant is fine and the visual result is identical. The
 * factor is clamped to (0, 1] so it can never overshoot or stall.
 *
 * Angles are interpolated on the SHORT way round. Without that, dragging past
 * ±180° makes the camera spin the long way to catch up, which reads as a glitch.
 */
export function dampOrbit(
  current: OrbitState,
  target: OrbitState,
  /** Fraction of the remaining distance to cover this frame. ~0.12–0.18 feels heavy. */
  factor: number,
): OrbitState {
  const k = Math.min(1, Math.max(0, factor));

  // Shortest signed angular difference, so we never take the long way round.
  const shortest = (from: number, to: number) => {
    let delta = (to - from) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
  };

  return {
    ...current,
    theta: current.theta + shortest(current.theta, target.theta) * k,
    phi: current.phi + (target.phi - current.phi) * k,
    radius: current.radius + (target.radius - current.radius) * k,
    target: {
      x: current.target.x + (target.target.x - current.target.x) * k,
      y: current.target.y + (target.target.y - current.target.y) * k,
      z: current.target.z + (target.target.z - current.target.z) * k,
    },
  };
}

/** Camera right and up vectors for a given orbit state (normalised). */
export function orbitBasis(state: OrbitState): {
  right: { x: number; y: number; z: number };
  up: { x: number; y: number; z: number };
} {
  // Forward is the unit vector from camera to target.
  const pos = orbitPosition(state);
  let fx = state.target.x - pos.x;
  let fy = state.target.y - pos.y;
  let fz = state.target.z - pos.z;
  const flen = Math.hypot(fx, fy, fz) || 1;
  fx /= flen;
  fy /= flen;
  fz /= flen;

  // right = normalise(cross(forward, worldUp)) with worldUp = (0, 1, 0), which
  // expands to (-fz, 0, fx). Getting this sign backwards is invisible in a
  // screenshot but makes drag-pan move the curve the wrong way, so it is
  // pinned by a test rather than left to inspection.
  let rx = -fz;
  let ry = 0;
  let rz = fx;
  const rlen = Math.hypot(rx, ry, rz);
  if (rlen < 1e-6) {
    // Looking straight up/down: right is degenerate, fall back to +X.
    rx = 1;
    ry = 0;
    rz = 0;
  } else {
    rx /= rlen;
    ry /= rlen;
    rz /= rlen;
  }

  // up = cross(right, forward) — note the order; the reverse gives -Y.
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;

  return {
    right: { x: rx, y: ry, z: rz },
    up: { x: ux, y: uy, z: uz },
  };
}