import { useEffect, useState } from 'react';
import {
  buildDailyRounds,
  dailyDateLabel,
  readDailyStorage,
  updateDailyStreak,
  msUntilNextReset,
  canPlayDaily,
  getDailyKey,
} from '../../utils/guessDaily';
import type { GuessRound } from '../../utils/guessRounds';
import { useTranslation } from '../../i18n/index';

/**
 * The "Daily challenge" card that sits beside normal play on /guess.
 *
 * It shows today's US Eastern date, the player's streak, and one of two
 * button states:
 *   - not played today: a live "Play today" button that starts the daily game
 *   - played today:     a disabled button with a live "Next challenge in
 *                        hh:mm:ss" countdown, recomputed from the real clock
 *                        every second so it never drifts.
 *
 * The attempt is consumed the moment the first answer is given — handled by
 * the parent (GuessGame), which is told the rounds came from `buildDailyRounds`
 * and so writes the result to daily storage on completion.
 */
export default function GuessDailyCard({ onDailyStart }: { onDailyStart: (rounds: GuessRound[]) => void }) {
  const { t } = useTranslation();

  const [todayKey] = useState(() => getDailyKey(Date.now()));
  const [dateLabel] = useState(() => dailyDateLabel(Date.now()));
  const [streak, setStreak] = useState(() => readDailyStorage().streak);
  const [playedToday, setPlayedToday] = useState(() => !canPlayDaily(readDailyStorage().lastPlayedKey, todayKey));
  const [msUntil, setMsUntil] = useState(() => msUntilNextReset());

  // On mount, roll the streak forward if the last played day was yesterday and
  // the calendar has since advanced. This is what makes a streak survive an
  // overnight gap without the player doing anything.
  useEffect(() => {
    const s = updateDailyStreak(todayKey);
    setStreak(s);
    setPlayedToday(!canPlayDaily(readDailyStorage().lastPlayedKey, todayKey));
  }, [todayKey]);

  useEffect(() => {
    const id = setInterval(() => setMsUntil(msUntilNextReset()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = Math.max(0, msUntil);
  const hours = Math.floor(remaining / 3_600_000);
  const minutes = Math.floor((remaining % 3_600_000) / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);
  const countdown = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const disabled = playedToday;

  return (
    <section
      className="panel relative p-5 sm:p-6 overflow-hidden"
      style={{ boxShadow: 'inset 0 0 60px -30px #5DD6A0' }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-sc-text-faint">
            {t('guess.daily.tag')}
          </p>
          <p className="mt-1 font-serif text-lg sm:text-xl text-sc-text">
            {t('guess.daily.title')} <span className="text-sc-text-faint">·</span> {dateLabel}
          </p>
        </div>
        {streak > 0 && (
          <span
            className="shrink-0 font-mono text-sm rounded px-2 py-1"
            style={{ backgroundColor: 'rgb(93 214 160 / 0.18)', color: '#5DD6A0' }}
            aria-live="polite"
          >
            {t('guess.daily.streak')} {streak}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-sc-text-soft">
        {t('guess.daily.subtitle')}
      </p>

      <button
        type="button"
        disabled={disabled}
        onClick={() => onDailyStart(buildDailyRounds())}
        className={`mt-4 w-full sm:w-auto btn-primary px-5 py-2.5 text-sm font-mono disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0`}
        aria-disabled={disabled}
      >
        {disabled ? `${t('guess.daily.nextIn')} ${countdown}` : t('guess.daily.playToday')}
      </button>

      {disabled && (
        <p className="mt-3 font-mono text-xs text-sc-text-faint" aria-live="polite">
          {t('guess.daily.playedToday')}
        </p>
      )}
    </section>
  );
}