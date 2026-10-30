import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDailyKey, msUntilNextReset, previousDayKey, hashString, mulberry32, seededShuffle, buildDailyGame, canPlayDaily, nextStreak, shareText } from './dailyChallenge';

const FAMILIES = ['trig', 'beat', 'chirp', 'perc', 'decay', 'shape'];
const LIB = FAMILIES.flatMap(f => Array.from({ length: 5 }, (_, i) => ({ id: `${f}-${i + 1}`, family: f })));
const U = Date.UTC;

describe('daily date: one worldwide day on the US Eastern clock', () => {
  test('summer (EDT): the date changes at 04:00 UTC', () => {
    assert.equal(getDailyKey(U(2026, 9, 27, 3, 59, 59)), '2026-10-26'); assert.equal(getDailyKey(U(2026, 9, 27, 4, 0, 0)), '2026-10-27');
  });
  test('winter (EST): the date changes at 05:00 UTC', () => {
    assert.equal(getDailyKey(U(2026, 11, 15, 4, 59, 59)), '2026-12-14'); assert.equal(getDailyKey(U(2026, 11, 15, 5, 0, 0)), '2026-12-15');
  });
  test('DST ends 1 Nov 2026 (day has 25 hours)', () => {
    assert.equal(getDailyKey(U(2026, 10, 2, 4, 59, 59)), '2026-11-01'); assert.equal(getDailyKey(U(2026, 10, 2, 5, 0, 0)), '2026-11-02');
  });
  test('DST starts 8 Mar 2026 (day has 23 hours)', () => {
    assert.equal(getDailyKey(U(2026, 2, 8, 4, 59, 59)), '2026-03-07'); assert.equal(getDailyKey(U(2026, 2, 8, 5, 0, 0)), '2026-03-08');
    assert.equal(getDailyKey(U(2026, 2, 9, 3, 59, 59)), '2026-03-08'); assert.equal(getDailyKey(U(2026, 2, 9, 4, 0, 0)), '2026-03-09');
  });
  test('India morning/evening both map to the same US day until 9:30 / 10:30 IST', () => {
    assert.equal(getDailyKey(U(2026, 9, 27, 3, 59)), getDailyKey(U(2026, 9, 26, 20, 0))); // 09:29 IST and 01:30 IST same US day
  });
  test('independent of the machine time zone (run under several TZ values by verify/run.sh)', () => {
    assert.equal(getDailyKey(U(2026, 9, 27, 18, 30)), '2026-10-27');
  });
  test('countdown is exact, including 23h and 25h days', () => {
    assert.equal(msUntilNextReset(U(2026, 9, 27, 3, 59, 0)), 60_000);
    assert.equal(msUntilNextReset(U(2026, 9, 27, 4, 0, 0)), 24 * 3_600_000);
    assert.equal(msUntilNextReset(U(2026, 10, 1, 4, 0, 0)), 25 * 3_600_000);
    assert.equal(msUntilNextReset(U(2026, 2, 8, 5, 0, 0)), 23 * 3_600_000);
  });
  test('previousDayKey crosses month and year', () => { assert.equal(previousDayKey('2026-03-01'), '2026-02-28'); assert.equal(previousDayKey('2027-01-01'), '2026-12-31'); assert.equal(previousDayKey('2028-03-01'), '2028-02-29'); });
});

describe('daily game: identical for everyone on the same date', () => {
  test('same date -> identical questions, options and option order', () => assert.deepEqual(buildDailyGame('2026-10-27', LIB), buildDailyGame('2026-10-27', LIB)));
  test('different dates -> different games (30 dates give at least 25 distinct decks)', () => {
    const seen = new Set<string>(); for (let d = 1; d <= 30; d++) seen.add(JSON.stringify(buildDailyGame(`2026-11-${String(d).padStart(2, '0')}`, LIB).map(q => q.answerId))); assert.ok(seen.size >= 25, String(seen.size));
  });
  test('10 DISTINCT questions, 4 DISTINCT options each, answer included', () => {
    for (const day of ['2026-10-27', '2026-11-01', '2027-01-01']) {
      const g = buildDailyGame(day, LIB); assert.equal(g.length, 10); assert.equal(new Set(g.map(q => q.answerId)).size, 10);
      for (const q of g) { assert.equal(q.optionIds.length, 4); assert.equal(new Set(q.optionIds).size, 4); assert.ok(q.optionIds.includes(q.answerId)); }
    }
  });
  test('distractors come from the SAME family as the answer', () => {
    const fam = new Map(LIB.map(x => [x.id, x.family]));
    for (const q of buildDailyGame('2026-10-27', LIB)) for (const o of q.optionIds) assert.equal(fam.get(o), fam.get(q.answerId));
  });
  test('the correct answer is not always in the same slot', () => {
    const slots = new Set<number>(); for (let d = 1; d <= 20; d++) for (const q of buildDailyGame(`2026-12-${String(d).padStart(2, '0')}`, LIB)) slots.add(q.optionIds.indexOf(q.answerId)); assert.equal(slots.size, 4);
  });
  test('tiny families fall back to other families instead of failing', () => {
    const small = [...LIB.slice(0, 20), { id: 'solo', family: 'solo' }, ...LIB.slice(20)]; const g = buildDailyGame('2026-10-27', small, 10);
    for (const q of g) assert.equal(new Set(q.optionIds).size, 4);
  });
  test('refuses a library that is too small', () => assert.throws(() => buildDailyGame('2026-10-27', LIB.slice(0, 5))));
  test('hash and shuffle are stable (guards against accidental changes that would split players across different games)', () => {
    assert.equal(hashString('mathsonify-daily:2026-10-27'), hashString('mathsonify-daily:2026-10-27')); assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], mulberry32(7)), seededShuffle([1, 2, 3, 4, 5], mulberry32(7)));
    assert.equal(hashString('a'), 0xe40c292c); // the published FNV-1a reference value
    assert.equal(hashString('mathsonify-daily:2026-10-27'), 959149697);
    assert.equal(Math.round(mulberry32(1)() * 1e6), 627074); // values cross-checked against an independent Python implementation
  });
  test('GOLDEN GAME: 27 Oct 2026 must always start with these questions — if this fails, players would see different games', () => {
    assert.deepEqual(buildDailyGame('2026-10-27', LIB).slice(0, 3), [
      { answerId: 'shape-1', optionIds: ['shape-1', 'shape-4', 'shape-3', 'shape-2'] },
      { answerId: 'chirp-5', optionIds: ['chirp-1', 'chirp-4', 'chirp-5', 'chirp-2'] },
      { answerId: 'beat-4', optionIds: ['beat-1', 'beat-4', 'beat-2', 'beat-5'] },
    ]);
  });
});

describe('one try per day, streak, share text', () => {
  test('one scored try per day', () => { assert.equal(canPlayDaily(null, '2026-10-27'), true); assert.equal(canPlayDaily('2026-10-27', '2026-10-27'), false); assert.equal(canPlayDaily('2026-10-26', '2026-10-27'), true); });
  test('streak grows on consecutive days, resets after a gap, ignores replays', () => {
    assert.equal(nextStreak(null, 0, '2026-10-27'), 1); assert.equal(nextStreak('2026-10-26', 4, '2026-10-27'), 5);
    assert.equal(nextStreak('2026-10-24', 4, '2026-10-27'), 1); assert.equal(nextStreak('2026-10-27', 4, '2026-10-27'), 4); assert.equal(nextStreak('2026-02-28', 2, '2026-03-01'), 3);
  });
  test('share text', () => {
    const t = shareText('2026-10-27', [true, true, false, true, true, true, false, true, true, true]);
    assert.equal(t, 'MathSonify Daily · Oct 27 · 8/10 🟩🟩🟥🟩🟩🟩🟥🟩🟩🟩\nhttps://mathsonify.com/guess');
  });
});
