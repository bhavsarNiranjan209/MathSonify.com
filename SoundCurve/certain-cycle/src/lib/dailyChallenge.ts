/**
 * dailyChallenge.ts — the Guess daily challenge, as pure functions (no DOM, no storage, no clock inside).
 * ONE worldwide game per day, on the US Eastern clock (America/New_York, DST handled by the browser's Intl).
 * Same date -> exactly the same 10 questions, the same 4 options and the same option order, on every device.
 * Nothing here uses Math.random or the player's own time zone.
 */
export const DAILY_TZ = 'America/New_York';
export const DAILY_ROUNDS = 10;

const keyFmt = new Intl.DateTimeFormat('en-CA', { timeZone: DAILY_TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** "YYYY-MM-DD" on the US Eastern calendar for an instant. */
export function getDailyKey(now: Date | number = Date.now()): string {
  return keyFmt.format(typeof now === 'number' ? new Date(now) : now);
}

/** Milliseconds until the Eastern date changes (exact, including 23h / 25h DST days). */
export function msUntilNextReset(now: number = Date.now()): number {
  const key = getDailyKey(now);
  let lo = now, hi = now + 26 * 3_600_000; // the date always changes within 26 hours
  while (hi - lo > 1) { const mid = Math.floor((lo + hi) / 2); if (getDailyKey(mid) === key) lo = mid; else hi = mid; }
  return hi - now;
}

/** previous calendar day for a "YYYY-MM-DD" key (pure calendar arithmetic) */
export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
}

/* ---------- deterministic randomness ---------- */
export function hashString(s: string): number { // FNV-1a, 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seededShuffle<T>(items: readonly T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/* ---------- the game ---------- */
export interface Item { id: string; family: string }
export interface DailyQuestion { answerId: string; optionIds: string[] }

export function buildDailyGame<T extends Item>(key: string, library: readonly T[], rounds = DAILY_ROUNDS): DailyQuestion[] {
  if (library.length < Math.max(rounds, 4)) throw new Error('library too small for a daily game');
  const deck = seededShuffle(library, mulberry32(hashString('mathsonify-daily:' + key))).slice(0, rounds);
  return deck.map((answer, i) => {
    const rng = mulberry32(hashString(`mathsonify-daily:${key}:${i}:${answer.id}`));
    const same = seededShuffle(library.filter(x => x.family === answer.family && x.id !== answer.id), rng);
    const other = seededShuffle(library.filter(x => x.family !== answer.family), rng); // only used if a family is too small
    const distractors = [...same, ...other].slice(0, 3);
    return { answerId: answer.id, optionIds: seededShuffle([answer, ...distractors], rng).map(x => x.id) };
  });
}

/* ---------- one try per day, streak, share ---------- */
export const canPlayDaily = (lastPlayedKey: string | null, todayKey: string) => lastPlayedKey !== todayKey;

export function nextStreak(lastPlayedKey: string | null, streak: number, todayKey: string): number {
  if (lastPlayedKey === todayKey) return streak;
  return lastPlayedKey === previousDayKey(todayKey) ? streak + 1 : 1;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shareText(key: string, results: boolean[], url = 'https://mathsonify.com/guess'): string {
  const [, m, d] = key.split('-').map(Number);
  const score = results.filter(Boolean).length;
  return `MathSonify Daily · ${MONTHS[m - 1]} ${d} · ${score}/${results.length} ${results.map(r => (r ? '🟩' : '🟥')).join('')}\n${url}`;
}
