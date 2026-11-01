import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getEquationOfTheDay, localDateKey, hashString } from './equationOfTheDay';

describe('equationOfTheDay', () => {
  const usable = ['a', 'b', 'c', 'd', 'e'];

  test('deterministic for same instant', () => {
    assert.equal(getEquationOfTheDay(1700000000000, usable), getEquationOfTheDay(1700000000000, usable));
  });

  test('returns a member of usable', () => {
    assert.ok(usable.includes(getEquationOfTheDay(Date.now(), usable)));
  });

  test('time of day does not change the pick', () => {
    const d = new Date('2026-05-10T08:00:00');
    const e = new Date('2026-05-10T23:00:00');
    assert.equal(getEquationOfTheDay(d.getTime(), usable), getEquationOfTheDay(e.getTime(), usable));
  });

  test('throws on empty usable', () => {
    assert.throws(() => getEquationOfTheDay(Date.now(), []));
  });

  test('localDateKey stable', () => {
    assert.match(localDateKey(0), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('hashString fnv reference', () => {
    assert.equal(hashString('a'), 0xe40c292c);
  });
});
