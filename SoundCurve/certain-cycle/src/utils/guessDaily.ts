import { getDailyKey, buildDailyGame, canPlayDaily, nextStreak, msUntilNextReset, shareText, previousDayKey } from '../lib/dailyChallenge';
import { GUESS_LIBRARY, type GuessEquation } from '../data/guessLibrary';
import type { GuessRound } from './guessRounds';

export const GUESS_DAILY_LAST_PLAYED_KEY = 'mathsonify-guess-daily-last-played';
export const GUESS_DAILY_RESULTS_KEY = 'mathsonify-guess-daily-results';
export const GUESS_DAILY_STREAK_KEY = 'mathsonify-guess-daily-streak';

export function dailyDateLabel(now: number = Date.now()): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(now));
}

export function buildDailyRounds(): GuessRound[] {
  const key = getDailyKey(Date.now());
  const items = GUESS_LIBRARY.map((e) => ({ id: e.id, family: e.family }));
  const questions = buildDailyGame(key, items);
  return questions.map((q, i) => ({
    index: i,
    correct: GUESS_LIBRARY.find((e) => e.id === q.answerId)!,
    options: q.optionIds.map((id) => GUESS_LIBRARY.find((e) => e.id === id)!),
  }));
}

export function readDailyStorage() {
  try {
    const lastPlayedKey = localStorage.getItem(GUESS_DAILY_LAST_PLAYED_KEY);
    const streak = Number(localStorage.getItem(GUESS_DAILY_STREAK_KEY) ?? '0') || 0;
    const resultsRaw = localStorage.getItem(GUESS_DAILY_RESULTS_KEY);
    const results: boolean[] | null = resultsRaw ? JSON.parse(resultsRaw) : null;
    return { lastPlayedKey, streak, results };
  } catch {
    return { lastPlayedKey: null, streak: 0, results: null };
  }
}

export function writeDailyResult(results: boolean[]) {
  const todayKey = getDailyKey(Date.now());
  try {
    localStorage.setItem(GUESS_DAILY_LAST_PLAYED_KEY, todayKey);
    localStorage.setItem(GUESS_DAILY_RESULTS_KEY, JSON.stringify(results));
  } catch {}
}

export function updateDailyStreak(todayKey: string): number {
  let lastPlayedKey: string | null = null;
  let streak = 0;
  try {
    lastPlayedKey = localStorage.getItem(GUESS_DAILY_LAST_PLAYED_KEY);
    streak = Number(localStorage.getItem(GUESS_DAILY_STREAK_KEY) ?? '0') || 0;
  } catch {}
  const next = nextStreak(lastPlayedKey, streak, todayKey);
  try { localStorage.setItem(GUESS_DAILY_STREAK_KEY, String(next)); } catch {}
  return next;
}

export { canPlayDaily, msUntilNextReset, shareText, getDailyKey };