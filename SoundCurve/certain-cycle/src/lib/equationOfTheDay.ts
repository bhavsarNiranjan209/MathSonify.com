/**
 * equationOfTheDay.ts — picks a deterministic "equation of the day" from a
 * usable list of equations.
 *
 * Pure function: same instant (same calendar date) + same list -> same pick,
 * on every device and in every time zone's *local* calendar. No Math.random.
 */
export function hashString(s: string): number { // FNV-1a, 32-bit (matches dailyChallenge)
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** "YYYY-MM-DD" in the host's local calendar for an instant. */
export function localDateKey(now: Date | number = Date.now()): string {
  const d = typeof now === 'number' ? new Date(now) : now;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function getEquationOfTheDay<T>(now: Date | number = Date.now(), usable: readonly T[]): T {
  if (!usable || usable.length === 0) {
    throw new Error('equationOfTheDay: usable list is empty');
  }
  const key = localDateKey(now);
  const index = hashString('mathsonify-eod:' + key) % usable.length;
  return usable[index];
}
