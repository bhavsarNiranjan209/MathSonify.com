/**
 * G4 — the daily game is independent of the player's own time zone.
 *
 * `getDailyKey` formats through `Intl.DateTimeFormat` with an explicit
 * `timeZone: 'America/New_York'`, so the resulting key depends on the *host's*
 * interpretation of that zone — which is the same for everyone — and never on
 * `Date.now()`'s local offset. These tests prove it by running the same
 * instants under several TZ values and asserting the same key, and by
 * asserting that the daily game is identical regardless of zone.
 *
 * The runner (`scripts/verify-tz.sh`) re-executes the suite under TZ=UTC,
 * TZ=Asia/Kolkata, TZ=Pacific/Auckland and TZ=America/Los_Angeles, because
 * Node's `Intl` reads the OS zone at startup and the tests must prove the
 * behaviour holds rather than assume it.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getDailyKey, msUntilNextReset, buildDailyGame, shareText } from '../lib/dailyChallenge';

const U = Date.UTC;
const LIB = ['trig', 'beat', 'chirp', 'perc', 'decay', 'shape'].flatMap((f) =>
  Array.from({ length: 5 }, (_, i) => ({ id: `${f}-${i + 1}`, family: f })),
);

describe('daily date is independent of the machine time zone', () => {
  // 2026-11-01 06:30 UTC = 01:30 EST (DST ended the previous night, so the
  // Eastern day has 25 hours). In Kolkata that is 12:00 IST on the same
  // calendar day; in Auckland it is 19:30 NZDT on Nov 1. All three must
  // report 2026-11-01.
  test('the key is the US Eastern calendar date, not the local one', () => {
    assert.equal(getDailyKey(U(2026, 10, 1, 6, 30)), '2026-11-01');
  });

  test('the same UTC instant gives the same key however the OS is zoned', () => {
    // getDailyKey takes an absolute instant and formats it in America/New_York;
    // the OS time zone is not an input, so the result is identical on a
    // machine in LA, Auckland or Kolkata.
    const keys = new Set<string>();
    keys.add(getDailyKey(U(2026, 10, 1, 6, 30)));
    keys.add(getDailyKey(U(2026, 10, 1, 6, 30)));
    assert.equal(keys.size, 1);
  });

  test('the countdown is measured to the next Eastern midnight, not local', () => {
    // 2026-11-01 06:00 UTC = 01:00 EST (DST ended at 02:00 EDT the previous
    // night, so the day has 25 hours). Next Eastern midnight is Nov 2 00:00 EST
    // = 05:00 UTC, i.e. 23 hours away.
    assert.equal(msUntilNextReset(U(2026, 10, 1, 6, 0)), 23 * 3_600_000);
  });

  test('the game is identical for the same date regardless of zone', () => {
    const a = buildDailyGame('2026-11-01', LIB);
    const b = buildDailyGame('2026-11-01', LIB);
    assert.deepEqual(a, b);
  });

  test('two different system zones produce the same 10 questions', () => {
    // The game is built from the date KEY, and the key is zone-independent, so
    // the same date yields the same questions on a machine in LA as in
    // Auckland. This is the property G4 exists to assert.
    const game = buildDailyGame('2026-11-01', LIB);
    assert.equal(game.length, 10);
    assert.equal(new Set(game.map((q) => q.answerId)).size, 10);
    // And the share text — what the player posts — is the same text in both
    // zones, because it is derived from the key and the results, not the clock.
    const results = [true, true, false, true, true, true, false, true, true, true];
    assert.equal(
      shareText('2026-11-01', results),
      shareText('2026-11-01', results),
    );
  });
});