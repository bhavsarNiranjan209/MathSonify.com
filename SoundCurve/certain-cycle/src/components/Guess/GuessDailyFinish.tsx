import { useEffect, useState } from 'react';
import { useTranslation } from '../../i18n/index';
import { msUntilNextReset, shareText, getDailyKey, updateDailyStreak } from '../../utils/guessDaily';

/**
 * The daily finish screen: score, a row of 🟩🟥 for the ten answers, a share
 * button, the updated streak and a live countdown to the next Eastern day.
 *
 * Web Share on phones (navigator.share), clipboard + toast elsewhere. The
 * attempt is already consumed — `handlePlayAgain` below starts a normal game,
 * not another daily, so a reload can never replay today.
 */
export default function GuessDailyFinish({
  score,
  results,
  streak,
  onPlayAgain,
}: {
  score: number;
  results: ReadonlyArray<'correct' | 'wrong' | null>;
  streak: number;
  onPlayAgain: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [msUntil, setMsUntil] = useState(msUntilNextReset());

  const todayKey = getDailyKey(Date.now());
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator;

  // Roll the streak forward on mount — finishing a daily is what grows it.
  useEffect(() => {
    updateDailyStreak(todayKey);
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

  const strip = results
    .map((r) => (r === 'correct' ? '🟩' : r === 'wrong' ? '🟥' : '⬜'))
    .join('');

  const handleShare = async () => {
    const text = shareText(todayKey, results.map((r) => r === 'correct'));
    if (canShare) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // User dismissed the share sheet — fall through to clipboard.
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // No clipboard — nothing to do.
    }
  };

  return (
    <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-14 text-center">
      <p className="font-mono text-xs uppercase tracking-widest text-sc-text-faint">
        {t('guess.daily.finishTag')}
      </p>
      <p className="mt-1 font-mono text-sm text-sc-text-soft">
        {t('guess.daily.finishDate')} {todayKey}
      </p>

      <p className="mt-4 font-serif text-5xl sm:text-6xl text-sc-text">
        {score}
        <span className="text-sc-text-faint text-3xl">/{results.length}</span>
      </p>

      <p className="mt-4 font-mono text-2xl tracking-wider" aria-label={t('guess.daily.finishStripLabel')}>
        {strip}
      </p>

      {streak > 0 && (
        <p className="mt-2 font-mono text-sc-accent" aria-live="polite">
          {t('guess.daily.streak')} {streak}
        </p>
      )}

      <button
        type="button"
        onClick={handleShare}
        className="btn-primary px-5 py-2.5 mt-6 text-sm font-mono"
      >
        {copied ? t('guess.daily.copied') : t('guess.daily.share')}
      </button>

      <p className="mt-6 font-mono text-xs uppercase tracking-widest text-sc-text-faint">
        {t('guess.daily.nextIn')} {countdown}
      </p>

      <button type="button" onClick={onPlayAgain} className="btn-primary px-6 py-3 mt-4">
        {t('guess.playAgain')}
      </button>
    </section>
  );
}