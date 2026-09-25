import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sampleEquationToControlPoints,
  evaluateCatmullRomSpline,
  deformControlPointsWithBrush,
  smoothFalloff,
} from './curveSpline';
import { fitClosestEquation } from './curveFitting';

test('sampleEquationToControlPoints generates evenly distributed control points', () => {
  const points = sampleEquationToControlPoints('sin(x)', -Math.PI, Math.PI, 32);
  assert.equal(points.length, 32);
  assert.ok(Math.abs(points[0].x - (-Math.PI)) < 1e-4);
  assert.ok(Math.abs(points[31].x - Math.PI) < 1e-4);
  assert.ok(Math.abs(points[0].y) < 1e-4); // sin(-pi) ~ 0
});

test('evaluateCatmullRomSpline interpolates smoothly and returns valid sample points', () => {
  const controlPoints = sampleEquationToControlPoints('sin(x)', -Math.PI, Math.PI, 16);
  const splineSamples = evaluateCatmullRomSpline(controlPoints, 200);

  assert.equal(splineSamples.length, 200);
  assert.ok(splineSamples.every((p) => p.isValid));
  assert.ok(splineSamples.every((p) => typeof p.dy === 'number' && !isNaN(p.dy)));
  assert.ok(splineSamples.every((p) => typeof p.curvature === 'number' && !isNaN(p.curvature)));

  // Spline of sin(x) should closely approximate sin(x)
  const midPoint = splineSamples[Math.floor(splineSamples.length / 2)];
  assert.ok(Math.abs(midPoint.y) < 0.2); // near x=0, sin(0)=0
});

test('smoothFalloff smoothly drops from 1 at center to 0 at radius', () => {
  assert.equal(smoothFalloff(0, 10), 1);
  assert.equal(smoothFalloff(10, 10), 0);
  assert.equal(smoothFalloff(15, 10), 0);
  assert.ok(smoothFalloff(5, 10) > 0 && smoothFalloff(5, 10) < 1);
});

test('deformControlPointsWithBrush deforms center point and softly influences neighbors', () => {
  const initial = sampleEquationToControlPoints('0', -10, 10, 21);
  const centerIdx = 10; // x = 0
  const deformed = deformControlPointsWithBrush(initial, centerIdx, 5, 0.3, -10, 10);

  assert.equal(deformed[centerIdx].y, 5); // Target moved by exact delta
  assert.ok(deformed[centerIdx - 1].y > 0 && deformed[centerIdx - 1].y < 5); // Neighbor influenced
  assert.ok(deformed[centerIdx + 1].y > 0 && deformed[centerIdx + 1].y < 5);
  assert.equal(deformed[0].y, 0); // Far away point unaffected
});

test('fitClosestEquation identifies standard functions with high R^2', () => {
  // Test a clean sine wave
  const sinePoints = sampleEquationToControlPoints('2*sin(x)', -6.28, 6.28, 40);
  const sineFit = fitClosestEquation(sinePoints);
  assert.ok(sineFit.success);
  assert.ok(sineFit.rSquared > 0.90, `Expected R^2 > 0.90 for sine wave, got ${sineFit.rSquared}`);

  // Test a quadratic curve
  const quadPoints = sampleEquationToControlPoints('0.5*x^2 - 2', -4, 4, 30);
  const quadFit = fitClosestEquation(quadPoints);
  assert.ok(quadFit.success);
  assert.ok(quadFit.rSquared > 0.95, `Expected R^2 > 0.95 for quadratic, got ${quadFit.rSquared}`);
});
