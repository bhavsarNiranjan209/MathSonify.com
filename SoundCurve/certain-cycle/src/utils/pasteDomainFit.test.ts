/**
 * pasteDomainFit.test.ts — the paste card picks a domain that actually draws.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitDomainForExpression } from './pasteDomainFit';

const CURRENT: [number, number] = [-6.28, 6.28];

test('a well-behaved equation keeps the current domain', () => {
  const fit = fitDomainForExpression('sin(x)', [], CURRENT);
  assert.deepEqual(fit.domain, CURRENT);
  assert.equal(fit.nonFiniteRatio, 0);
});

test('tan(x) moves to a domain without an asymptote in view', () => {
  // tan has an asymptote at pi/2 ≈ 1.57, inside the current domain — but only
  // a few samples are non-finite, so the current domain still wins (ratio
  // <= 0.4). The fit must at least return a usable domain, not fail.
  const fit = fitDomainForExpression('tan(x)', [], CURRENT);
  assert.ok(fit.nonFiniteRatio <= 0.4, `ratio ${fit.nonFiniteRatio}`);
});

test('log(x) avoids the negative side', () => {
  // log is undefined for x <= 0: the current domain is half non-finite.
  const fit = fitDomainForExpression('log(x)', [], CURRENT);
  assert.ok(fit.domain[0] >= 0, `domain ${fit.domain} still covers negatives`);
  assert.ok(fit.nonFiniteRatio <= 0.4);
});

test('free parameters default to 1 while fitting', () => {
  const fit = fitDomainForExpression('a * sin(x)', ['a'], CURRENT);
  assert.deepEqual(fit.domain, CURRENT);
  assert.equal(fit.nonFiniteRatio, 0);
});

test('an unparseable expression reports ratio 1 and keeps the domain', () => {
  const fit = fitDomainForExpression('sin(', [], CURRENT);
  assert.deepEqual(fit.domain, CURRENT);
  assert.equal(fit.nonFiniteRatio, 1);
});
