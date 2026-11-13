/**
 * debounce.test.ts — the Studio lag fix leans on this: a burst of keystrokes
 * must collapse to ONE curve re-resolve, with the latest equation, after the
 * user pauses. If this ever regresses, typing lags again.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { debounce, EQUATION_COMMIT_DEBOUNCE_MS } from './debounce';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('debounce: a burst of calls runs once, with the latest args', async () => {
  const seen: string[] = [];
  const fn = debounce((v: string) => seen.push(v), 20);
  fn('sin(');
  fn('sin(x');
  fn('sin(x)');
  assert.deepEqual(seen, [], 'nothing runs while the burst is still going');
  await sleep(50);
  assert.deepEqual(seen, ['sin(x)'], 'one run, with the final value');
});

test('debounce: calls spaced past the wait run separately', async () => {
  const seen: string[] = [];
  const fn = debounce((v: string) => seen.push(v), 15);
  fn('a');
  await sleep(40);
  fn('b');
  await sleep(40);
  assert.deepEqual(seen, ['a', 'b']);
});

test('debounce: cancel drops a pending call', async () => {
  const seen: string[] = [];
  const fn = debounce((v: string) => seen.push(v), 15);
  fn('x^2');
  fn.cancel();
  await sleep(40);
  assert.deepEqual(seen, [], 'cancelled call must never run');
});

test('debounce: flush runs the pending call immediately, once', async () => {
  const seen: string[] = [];
  const fn = debounce((v: string) => seen.push(v), 1000);
  fn('cos(x)');
  fn.flush();
  assert.deepEqual(seen, ['cos(x)'], 'flush runs it now, not after the wait');
  await sleep(30);
  assert.deepEqual(seen, ['cos(x)'], 'flush must not also fire later');
});

test('debounce: the Studio wait is 200ms', () => {
  assert.equal(EQUATION_COMMIT_DEBOUNCE_MS, 200);
});
