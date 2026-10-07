import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SURFACE_RESOLUTION,
  analyzeEquation,
  buildSurfaceMesh,
  freeVariables,
} from './surface3d';

/* ── classification ───────────────────────────────────────────────── */

test('a single-variable equation is a curve', () => {
  // A bare constant is excluded: it has no free variable and nothing to sweep,
  // so it is reported as unsupported rather than drawn as a meaningless dot.
  for (const eq of ['sin(x)', 'x^3 - 2*x', 'x!', 'abs(x)', 'exp(-0.5*x^2)']) {
    assert.equal(analyzeEquation(eq).kind, 'curve', `${eq} should be a curve`);
  }
});

test('a two-variable equation is a genuine surface', () => {
  for (const eq of ['sin(x) * cos(y)', 'x^2 + y^2', 'x * y', 'sin(sqrt(x^2 + y^2))']) {
    assert.equal(analyzeEquation(eq).kind, 'surface', `${eq} should be a surface`);
  }
});

test('function names are not variables', () => {
  // The regression that mattered most. mathjs models `sin(x)` as a FunctionNode
  // containing a SymbolNode, so a naive symbol sweep counts `sin` as a variable.
  // That made `sin(x)` look two-variable and `sin(x) * cos(y)` look four-variable
  // — which would have sent every realistic surface down the unsupported path.
  assert.deepEqual(freeVariables('sin(x)'), ['x']);
  assert.deepEqual(freeVariables('abs(x)'), ['x']);
  assert.deepEqual(freeVariables('exp(-0.5*x^2)'), ['x']);
  assert.deepEqual(freeVariables('sin(x) * cos(y)').sort(), ['x', 'y']);
  // Mixed function and arithmetic forms.
  assert.deepEqual(freeVariables('sqrt(x^2 + 1) - log(abs(y))').sort(), ['x', 'y']);
  assert.equal(analyzeEquation('sin(x)').kind, 'curve');
  assert.equal(analyzeEquation('sin(x) * cos(y)').kind, 'surface');
});

test('constants are never mistaken for variables', () => {
  // `e` and `pi` must not push a one-variable equation over the surface
  // threshold — that would render sin(x) as a phantom 3D surface.
  assert.deepEqual(freeVariables('sin(x) * e'), ['x']);
  assert.deepEqual(freeVariables('pi * x^2'), ['x']);
  assert.equal(analyzeEquation('sin(x) * e').kind, 'curve');
  assert.equal(analyzeEquation('pi * x^2').kind, 'curve');
});

test('a two-variable equation with one inert axis is a curve, not a fake surface', () => {
  // `sin(x) * 3` mentions no second variable at all, but `sin(x) + 0*y` does —
  // and a ribbon that never moves along y is not a surface.
  const analysis = analyzeEquation('sin(x) + 0 * y');
  assert.equal(analysis.kind, 'curve');
  assert.match(analysis.reason ?? '', /constant/);
});

test('unsupported inputs are reported, not guessed at', () => {
  assert.equal(analyzeEquation('').kind, 'unsupported');
  assert.equal(analyzeEquation('5').kind, 'unsupported', 'a bare constant has nothing to plot');
  // Three free variables need a fourth dimension; saying so beats faking it.
  const three = analyzeEquation('x + y + z');
  assert.equal(three.kind, 'unsupported');
  assert.match(three.reason ?? '', /fourth dimension/);
  // Unparseable input must not throw.
  assert.doesNotThrow(() => analyzeEquation('sin('));
});

/* ── surface sampling ─────────────────────────────────────────────── */

test('a surface mesh is well formed', () => {
  const mesh = buildSurfaceMesh('sin(x) * cos(y)', -3, 3, -3, 3, 24);
  assert.ok(mesh, 'a valid two-variable equation must produce a mesh');

  const side = 24 + 1;
  assert.equal(mesh.positions.length, side * side * 3);
  assert.equal(mesh.normals.length, side * side * 3);
  assert.equal(mesh.uvs.length, side * side * 2);
  // Every quad becomes two triangles: 3 indices each.
  assert.equal(mesh.indices.length, 24 * 24 * 6);
  assert.equal(mesh.invalidCells, 0);

  // All positions and normals must be finite, or the mesh renders as noise.
  for (const v of mesh.positions) assert.ok(Number.isFinite(v));
  for (const v of mesh.normals) assert.ok(Number.isFinite(v));
});

test('every normal is unit length and points the right way', () => {
  const mesh = buildSurfaceMesh('x^2 - y^2', -2, 2, -2, 2, 16);
  assert.ok(mesh);
  for (let i = 0; i < mesh.normals.length; i += 3) {
    const [x, y, z] = [mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]];
    const len = Math.hypot(x, y, z);
    assert.ok(Math.abs(len - 1) < 1e-3, `normal ${i / 3} has length ${len}`);
    // A near-flat test surface opens upward, so normals must not point down.
    assert.ok(z > -0.05, `normal ${i / 3} points downward (z = ${z})`);
  }
});

test('normals match the analytic gradient of a tilted plane', () => {
  // The precise oracle for the accumulator bug, rather than a heuristic. For
  // z = a + b*x + c*y the true normal is normalize(-b, -c, 1); an accumulator
  // that wrote the X component into all three slots fails here immediately.
  //
  // Deliberately NOT asserted via "components must differ": on a symmetric
  // surface a legitimate normal really can be (1,1,1)/sqrt(3), so that heuristic
  // reports a false positive on correct geometry.
  const b = 0.5;
  const c = 0.25;
  const mesh = buildSurfaceMesh(`${b} * x + ${c} * y + 1`, -2, 2, -2, 2, 8);
  assert.ok(mesh);
  const mag = Math.hypot(-b, -c, 1);
  const expected = [-b / mag, -c / mag, 1 / mag];

  for (let i = 0; i < mesh.normals.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      assert.ok(
        Math.abs(mesh.normals[i + k] - expected[k]) < 1e-3,
        `normal ${i / 3} component ${k} is ${mesh.normals[i + k]}, expected ${expected[k]}`,
      );
    }
  }
});

test('a saddle surface has no degenerate normals on its symmetry line', () => {
  // x^2 - y^2 is symmetric about x = 0. This is the exact case where a winding or
  // accumulation bug cancels face normals to zero down that column, which renders
  // as a band of black unlit geometry through the middle of the surface.
  for (const eq of ['x^2 - y^2', 'x * y', 'x^2 + y^2']) {
    const mesh = buildSurfaceMesh(eq, -2, 2, -2, 2, 16);
    assert.ok(mesh, eq);
    let degenerate = 0;
    for (let i = 0; i < mesh.normals.length; i += 3) {
      if (Math.hypot(mesh.normals[i], mesh.normals[i + 1], mesh.normals[i + 2]) < 0.5) {
        degenerate++;
      }
    }
    assert.equal(degenerate, 0, `${eq} produced ${degenerate} degenerate normals`);
  }
});

test('triangle winding is consistent across every quad', () => {
  // Both triangles of a quad must wind the same way, or their face normals
  // oppose each other and cancel. Verified on a surface whose normals must all
  // point up.
  const mesh = buildSurfaceMesh('0.001 * x + 1', -2, 2, -2, 2, 8);
  assert.ok(mesh);
  const steps = 8;
  const side = steps + 1;
  const P = (v: number) => [mesh.positions[v * 3], mesh.positions[v * 3 + 1], mesh.positions[v * 3 + 2]];
  let up = 0;
  let down = 0;
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [P(mesh.indices[t]), P(mesh.indices[t + 1]), P(mesh.indices[t + 2])];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nz = e1[0] * e2[1] - e1[1] * e2[0];
    if (nz > 0) up++;
    else down++;
  }
  assert.ok(down === 0, `${down} of ${mesh.indices.length / 3} triangles wind the wrong way`);
  assert.equal(up, (mesh.indices.length / 3), 'every triangle must face the same way');
  assert.ok(side > 0);
});

test('a surface keeps its aspect ratio across all three axes', () => {
  // One uniform scale on x, y and z. A per-axis fit would silently distort the
  // geometry, which is the one thing a scientific visualization must not do.
  const mesh = buildSurfaceMesh('x * 0.01 + y * 0.01', -2, 2, -2, 2, 16);
  assert.ok(mesh);
  const spanX = mesh.bounds.maxX - mesh.bounds.minX;
  const spanY = mesh.bounds.maxY - mesh.bounds.minY;
  assert.ok(Math.abs(spanX - spanY) < 1e-6, 'x and y must share one scale');
  // z spans 1 unit of source data against 4 units of x, so it must be ~1/4 as tall.
  const spanZ = mesh.bounds.maxZ - mesh.bounds.minZ;
  assert.ok(spanZ < spanX / 2, 'z must not be blown up to fill the frame');
});

test('a singularity leaves a hole, not a spike to the floor', () => {
  // 1/x is undefined at x = 0. The cells straddling it must be dropped rather
  // than filled with zeros, which would render as a spike down through the floor.
  const mesh = buildSurfaceMesh('1 / x', -2, 2, -2, 2, 24);
  assert.ok(mesh);
  assert.ok(mesh.invalidCells > 0, 'the singularity must have removed some cells');
  assert.ok(mesh.indices.length > 0, 'the rest of the surface must still be drawn');
  assert.ok(mesh.indices.length < 24 * 24 * 6, 'some quads must be missing');
});

test('an unplottable surface returns null rather than a broken mesh', () => {
  // ln of a negative number is undefined across the WHOLE domain here, so there
  // is nothing to draw and the caller must be told rather than handed NaNs.
  assert.equal(buildSurfaceMesh('ln(x - 100)', -2, 2, -2, 2, 8), null);
  // Unparseable input must not throw.
  assert.equal(buildSurfaceMesh('sin(', -1, 1, -1, 1, 8), null);
});

test('a near-flat surface still renders rather than being rejected', () => {
  // (1/x)*0 is 0 everywhere except a hole at x = 0. That is a truthful — if dull
  // — surface, and the hole is real, so it must be drawn with the hole punched
  // out rather than silently discarded as "unplottable".
  const mesh = buildSurfaceMesh('1 / x * 0', -2, 2, -2, 2, 24);
  assert.ok(mesh, 'a flat surface with a singularity is still a surface');
  assert.ok(mesh.invalidCells > 0, 'the singularity must punch a hole');
  for (const v of mesh.positions) {
    if (Number.isNaN(v)) continue;
    assert.ok(Number.isFinite(v));
  }
});

test('surface resolution is a sane default and is honoured', () => {
  assert.ok(SURFACE_RESOLUTION >= 64 && SURFACE_RESOLUTION <= 256);
  const small = buildSurfaceMesh('sin(x)*cos(y)', -1, 1, -1, 1, 8);
  assert.ok(small);
  assert.equal(small.indices.length, 8 * 8 * 6);
});