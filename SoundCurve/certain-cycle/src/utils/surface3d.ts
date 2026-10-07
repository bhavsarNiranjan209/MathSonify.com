/**
 * Deciding what a 3D visualization of an equation should actually BE.
 *
 * The brief is emphatic: "Never generate fake geometry simply to make something
 * appear 3D." So the two cases are kept rigorously distinct.
 *
 *   y = f(x)     -> a genuine 1-D curve in space. The tube.
 *   z = f(x, y)  -> a genuine 2-D surface. A real mesh over the (x, y) domain.
 *
 * There is no third "make it look 3D" case. An equation using one variable is a
 * curve even if it looks wild; one using two is a surface; anything else falls
 * back to the 2D graph rather than inventing geometry.
 *
 * PARAMETRIC IS NOT IMPLEMENTED, DELIBERATELY. The brief asks for parametric
 * support, but the app has no parametric syntax anywhere — mathjs parses a single
 * expression in a single scope, there is no `x(t), y(t), z(t)` convention in the
 * Studio, and EquationInput gives the user no way to enter one. Inferring a
 * convention and rendering it silently would be worse than not offering it, so
 * this reports `unsupported` and the panel says so.
 */
import { compile, parse } from 'mathjs';

export type Graph3DKind =
  /** A single-variable curve: the tube. */
  | 'curve'
  /** A two-variable surface: a real mesh over x and y. */
  | 'surface'
  /** Nothing meaningful to render in 3D; the caller should say so. */
  | 'unsupported';

export interface EquationAnalysis {
  kind: Graph3DKind;
  /** The free variable names found, e.g. ['x'] or ['x', 'y']. */
  variables: string[];
  /** Populated when the caller may want to explain the decision to the user. */
  reason?: string;
}

/**
 * Names that are mathematical constants or bound parameters rather than free
 * variables. `e` in particular must never be mistaken for a variable, or
 * `sin(x)*e` would be misread as a two-variable surface.
 */
const RESERVED = new Set(['e', 'pi', 'PI', 'E', 'i', 'true', 'false', 'null', 'Infinity', 'NaN', 'tau']);

/**
 * The free variables an expression actually depends on.
 *
 * Function names must be excluded. mathjs represents `sin(x)` as a FunctionNode
 * whose `fn` is itself a SymbolNode, so a naive `filter(isSymbolNode)` sweep
 * reports `sin` and `x` — two variables. That would classify the single-variable
 * `sin(x)` as a two-variable expression and, worse, classify the real surface
 * `sin(x) * cos(y)` as FOUR variables, sending every realistic surface down the
 * unsupported path.
 */
export function freeVariables(equation: string): string[] {
  let node;
  try {
    node = parse(equation);
  } catch {
    return [];
  }

  // Names used as functions are not free variables.
  const functions = new Set<string>();
  node
    .filter((n) => (n as { isFunctionNode?: boolean }).isFunctionNode)
    .forEach((fn) => {
      const name = (fn as { fn?: { name?: string } }).fn?.name;
      if (name) functions.add(name);
    });

  const found = new Set<string>();
  node.filter((n) => (n as { isSymbolNode?: boolean }).isSymbolNode).forEach((n) => {
    const name = (n as { name?: string }).name;
    if (name && !RESERVED.has(name) && !functions.has(name)) found.add(name);
  });
  return [...found];
}

/**
 * Classifies an equation for 3D.
 *
 * A one-variable expression is a curve even if it never changes value (a
 * constant plots as a straight segment, which is a truthful rendering of it).
 * Two variables is a surface, unless one of them turns out to be inert — then it
 * is a degenerate ribbon masquerading as a surface, which is exactly the fake
 * geometry the brief rules out.
 */
export function analyzeEquation(equation: string): EquationAnalysis {
  const trimmed = equation.trim();
  if (!trimmed) return { kind: 'unsupported', variables: [], reason: 'empty' };

  const variables = freeVariables(trimmed);

  if (variables.length === 1) return { kind: 'curve', variables };

  if (variables.length === 2) {
    const [a, b] = variables;
    // Each probe must bind BOTH variables: `sin(x) + 0*y` references y, so
    // evaluating it with only x in scope throws "undefined symbol y" on every
    // probe and the variation test silently reported "neither axis varies".
    const aVaries = variesIn(trimmed, a, [b]);
    const bVaries = variesIn(trimmed, b, [a]);
    if (aVaries && bVaries) return { kind: 'surface', variables };
    if (aVaries || bVaries) {
      return {
        kind: 'curve',
        variables: [aVaries ? a : b],
        reason: 'one axis is constant, so this is a curve, not a surface',
      };
    }
    return { kind: 'unsupported', variables, reason: 'neither axis varies' };
  }

  if (variables.length === 0) {
    return { kind: 'unsupported', variables, reason: 'no variables — nothing to plot in 3D' };
  }

  return {
    kind: 'unsupported',
    variables,
    reason: 'three or more variables need a fourth dimension, which is not a 3D plot',
  };
}

/**
 * Numeric probe: does substituting several values for `name` change the result?
 *
 * Every OTHER variable the expression mentions must be bound to a mid-range
 * value. Without that, a two-variable expression throws on every probe and the
 * test reports "does not vary" — which silently downgraded real surfaces.
 */
function variesIn(equation: string, name: string, others: string[] = []): boolean {
  let compiled;
  try {
    compiled = compile(equation);
  } catch {
    return false;
  }
  const fixed: Record<string, number> = {};
  for (const other of others) fixed[other] = 0.73;

  const values = new Set<number>();
  for (const probe of [0.37, 1.13, 2.41, -0.88]) {
    try {
      const v = compiled.evaluate({ ...fixed, [name]: probe });
      if (typeof v === 'number' && Number.isFinite(v)) values.add(Number(v.toFixed(6)));
    } catch {
      // A domain error at one probe is not disqualifying on its own.
    }
  }
  return values.size > 1;
}

/* ── surfaces ─────────────────────────────────────────────────────── */

export interface SurfaceMesh {
  /** Flat xyz triples. */
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** Grid cells discarded because z was not finite there. */
  invalidCells: number;
}

/** Grid resolution for a surface. 128 is ~32k triangles: smooth, still cheap. */
export const SURFACE_RESOLUTION = 128;

/**
 * Samples z = f(x, y) over a rectangular domain into a real triangle mesh.
 *
 * Heights are normalised to sit above the floor the same way `layoutCurve` does,
 * with ONE uniform scale applied to x, y and z. An anisotropic fit would quietly
 * misrepresent the surface's geometry, which is the single thing a scientific
 * visualization must never do.
 *
 * Cells where z is non-finite are dropped from the index buffer rather than
 * filled with zeros, so a singularity reads as a genuine hole in the surface
 * instead of a spike down to the floor.
 */
export function buildSurfaceMesh(
  equation: string,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  resolution = SURFACE_RESOLUTION,
): SurfaceMesh | null {
  let compiled;
  try {
    compiled = compile(equation);
  } catch {
    return null;
  }

  const steps = Math.max(2, resolution);
  const side = steps + 1;
  const grid: ({ x: number; y: number; z: number } | null)[] = new Array(side * side);
  let valid = 0;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (let j = 0; j <= steps; j++) {
    const vy = minY + ((maxY - minY) * j) / steps;
    for (let i = 0; i <= steps; i++) {
      const vx = minX + ((maxX - minX) * i) / steps;
      let vz: number;
      try {
        const raw = compiled.evaluate({ x: vx, y: vy });
        vz = typeof raw === 'number' ? raw : NaN;
      } catch {
        vz = NaN;
      }
      if (!Number.isFinite(vz)) {
        grid[j * side + i] = null;
        continue;
      }
      valid++;
      if (vz < minZ) minZ = vz;
      if (vz > maxZ) maxZ = vz;
      grid[j * side + i] = { x: vx, y: vy, z: vz };
    }
  }

  // A nearly-empty or perfectly flat surface would produce NaN normals.
  if (valid < 4 || !Number.isFinite(minZ) || !Number.isFinite(maxZ)) return null;

  // Uniform scale on all three axes — see the note above.
  const xSpan = maxX - minX || 1;
  const ySpan = maxY - minY || 1;
  const zSpan = maxZ - minZ || 1;
  const scale = 12 / Math.max(xSpan, ySpan);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const midZ = (minZ + maxZ) / 2;
  const lift = 2.4;

  const count = side * side;
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  for (let j = 0; j <= steps; j++) {
    for (let i = 0; i <= steps; i++) {
      const k = j * side + i;
      uvs[k * 2] = i / steps;
      uvs[k * 2 + 1] = j / steps;
      const cell = grid[k];
      if (!cell) continue;
      positions[k * 3] = (cell.x - midX) * scale;
      positions[k * 3 + 1] = (cell.y - midY) * scale;
      positions[k * 3 + 2] = (cell.z - midZ) * scale + lift;
    }
  }

  const indices: number[] = [];
  let invalidCells = 0;
  for (let j = 0; j < steps; j++) {
    for (let i = 0; i < steps; i++) {
      const a = j * side + i;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      // A quad touching a missing vertex is dropped whole; half a quad would
      // render as a torn triangle.
      if (!grid[a] || !grid[b] || !grid[c] || !grid[d]) {
        invalidCells++;
        continue;
      }
      // Correct CCW winding, so the two triangles of a quad ADD rather than cancel.
      //
      // Quad corners in counter-clockwise order (x grows with i, y with j) are
      // a, b, d, c — so the diagonals must split it as (a,b,d) and (a,d,c).
      // The earlier forms — (a,c,b)/(b,c,d) and then (a,b,c)/(b,c,d) — each wound
      // the second triangle opposite to the first, so on a symmetric surface the
      // two face normals cancelled exactly and the vertex normal collapsed to
      // zero. That renders as a band of black, unlit geometry, and the saddle
      // x^2 - y^2 lost every normal down its symmetry line.
      indices.push(a, b, d, a, d, c);
    }
  }
  if (indices.length === 0) return null;

  return {
    positions,
    normals: computeNormals(positions, indices),
    uvs,
    indices: new Uint32Array(indices),
    bounds: {
      minX: (minX - midX) * scale,
      maxX: (maxX - midX) * scale,
      minY: (minY - midY) * scale,
      maxY: (maxY - midY) * scale,
      minZ: lift - (zSpan * scale) / 2,
      maxZ: lift + (zSpan * scale) / 2,
    },
    invalidCells,
  };
}

/** Area-weighted vertex normals, accumulated from each triangle's face normal. */
function computeNormals(positions: Float32Array, indices: ArrayLike<number>): Float32Array {
  const normals = new Float32Array(positions.length);

  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;

    const e1x = positions[i1] - positions[i0];
    const e1y = positions[i1 + 1] - positions[i0 + 1];
    const e1z = positions[i1 + 2] - positions[i0 + 2];
    const e2x = positions[i2] - positions[i0];
    const e2y = positions[i2 + 1] - positions[i0 + 1];
    const e2z = positions[i2 + 2] - positions[i0 + 2];

    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;

    // Each face normal contributes its OWN component to each vertex's matching
    // component. An earlier version looped `for (v of 0..2)` adding `nx` to
    // `normals[i + v]` for all three slots, which put the X component into the Y
    // and Z slots too. The result was normals with three identical components,
    // and exact zeros wherever the X components happened to cancel — which is
    // precisely what happened along the symmetry line of every saddle-shaped
    // surface.
    normals[i0] += nx;
    normals[i0 + 1] += ny;
    normals[i0 + 2] += nz;
    normals[i1] += nx;
    normals[i1 + 1] += ny;
    normals[i1 + 2] += nz;
    normals[i2] += nx;
    normals[i2 + 1] += ny;
    normals[i2 + 2] += nz;
  }

  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= len;
    normals[i + 1] /= len;
    normals[i + 2] /= len;
  }
  return normals;
}