import { useCallback, useEffect, useRef, useState } from 'react';

import GuessCurveReveal from './Guess/GuessCurveReveal';
import GuessConfetti from './Guess/GuessConfetti';
import GuessDailyCard from './Guess/GuessDailyCard';
import GuessDailyFinish from './Guess/GuessDailyFinish';
import { GUESS_ROUNDS_PER_PLAY, buildPlaythrough, type GuessRound } from '../utils/guessRounds';
import {
  GUESS_FAMILIES,
  GUESS_FAMILY_ACCENT,
  type GuessEquation,
} from '../data/guessLibrary';
import {
  feedbackFor,
  gradeFor,
  deservesBigCelebration,
  type GuessOutcome,
} from '../data/guessFeedback';
import { audioEngine } from '../utils/audioEngine';
import {
  playTierSting,
  tierFor,
  TIER_BURSTS,
  TIER_GLOW,
} from '../utils/celebrationTiers';
import { CURVE_SAMPLE_COUNT } from '../utils/activeCurve';
import { sampleEquationDetailed } from '../utils/equationParser';
import { equationLabel } from '../utils/equationLabel';
import { useTranslation } from '../i18n/index';
import { writeDailyResult } from '../utils/guessDaily';

/**
 * How long a round's equation is heard for. Short enough to replay freely,
 * long enough to hear the curve's character.
 */
const PLAY_DURATION_SECONDS = 2.5;

/** Volume for the reveal playback — a little below the Studio's default. */
const PLAY_VOLUME = 0.55;

/** Streak is only surfaced once it is actually worth celebrating. */
const STREAK_DISPLAY_THRESHOLD = 2;

/**
 * Answer-state styling for the option buttons.
 *
 * Kept as a scoped block rather than Tailwind utilities because of a real
 * collision: `global.css` defines `.panel` AFTER `@tailwind utilities`, so a
 * utility like `border-sc-live` ties with `.panel` at (0,1,0) and loses on
 * source order — and `.panel`'s `border:` shorthand then resets border-color.
 * The effect was that answering a question appeared to do nothing at all.
 *
 * `.guess-option[data-state='…']` is (0,2,0) and wins on specificity, so it
 * survives any future reordering of global.css. No `!important` is used: the
 * conflict is with an ordinary class rule that is perfectly well-behaved, just
 * declared later, so raising specificity is the correct fix rather than a
 * last resort.
 *
 * The colours deliberately match the progress strip's `green-500` / `red-500`,
 * so a correct answer reads the same colour in both places.
 */
const OPTION_STATE_CSS = `
.guess-option[data-state='correct'] {
  border-color: #22c55e;
  background-color: rgb(34 197 94 / 0.14);
}
.guess-option[data-state='wrong'] {
  border-color: #ef4444;
  background-color: rgb(239 68 68 / 0.14);
}
.guess-option[data-state='muted'] {
  opacity: 0.45;
}
.guess-option-tag {
  color: inherit;
  opacity: 0.85;
}
`;

/** Per-round outcome, kept for the progress indicator. `null` = not yet played. */
type RoundResult = 'correct' | 'wrong' | null;

export default function GuessGame() {
  const { t } = useTranslation();

  const [rounds, setRounds] = useState<GuessRound[]>(() => buildPlaythrough());
  const [roundIndex, setRoundIndex] = useState(0);
  /** The option the player clicked this round, or null while still answering. */
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [results, setResults] = useState<RoundResult[]>(() =>
    new Array(GUESS_ROUNDS_PER_PLAY).fill(null),
  );
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  /** 0..1 elapsed through the current clip — drives the progress ring. */
  const [playProgress, setPlayProgress] = useState(0);
  const [audioError, setAudioError] = useState('');
  /** Increments per correct answer so each one fires its own confetti burst. */
  const [burstKey, setBurstKey] = useState(0);
  /** True only for the large end-of-game celebration. */
  const [bigCelebration, setBigCelebration] = useState(false);

/**
   * The current game's mode: normal (shuffle your own deck) or daily (built by
   * `buildDailyRounds`, same questions for everyone on this date).
   *
   * The distinction is load-bearing: a daily attempt is consumed the moment the
   * FIRST answer is given, so a player who closes the tab mid-round cannot
   * replay the same day. `dailyAttemptUsed` is what enforces that — it is set
   * inside `handleChoose` before any state that depends on it.
   */
  const [dailyMode, setDailyMode] = useState(false);
  const [dailyAttemptUsed, setDailyAttemptUsed] = useState(false);

  /**
   * The running tally of daily answers, kept in a ref rather than state because
   * it is written to localStorage on every answer and never needs to trigger a
   * re-render. State would batch these writes and lose the "consumed at the
   * first answer" property.
   */
  const dailyResultsRef = useRef<boolean[]>(new Array(GUESS_ROUNDS_PER_PLAY).fill(false));

  const round = rounds[roundIndex];
  const answered = chosenId !== null;

  /**
   * Bumped by every stop and every start. A playback callback may only touch
   * state while its own generation is still current, which is what makes a late
   * `onFinish` from an already-abandoned clip harmless.
   */
  const audioGenerationRef = useRef(0);

  /**
   * THE ONLY function that stops a voice.
   *
   * Every path that can end or replace audio routes through here: answering,
   * advancing a round, replaying, toggling playback off, natural completion and
   * unmount. There is deliberately no second `audioEngine.stop()` call anywhere
   * else in this file. Audio leaked before because stopping was duplicated
   * across handlers and any one of them could be skipped — centralising it makes
   * "never two voices at once" a property of the code rather than something to
   * remember at each call site.
   */
  const stopAudio = useCallback(() => {
    // Bump FIRST: any callback already queued for the old voice is now stale and
    // will be ignored when it lands, so a natural-completion callback that fires
    // after a manual stop cannot fight the newer state.
    audioGenerationRef.current++;
    audioEngine.stop();
    setIsPlaying(false);
    setPlayProgress(0);
  }, []);

  // Unmounting must never leave a tone running behind the next page.
  useEffect(() => stopAudio, [stopAudio]);

  const playEquation = useCallback(
    async (equation: GuessEquation) => {
      // Begin from a guaranteed-silent engine, THEN claim a fresh generation.
      // Order matters: stopAudio() bumps the counter, so reading it afterwards
      // is what makes this play the current one.
      stopAudio();
      const generation = audioGenerationRef.current;

      try {
        setAudioError('');
        setIsPlaying(true);
        setPlayProgress(0);

        // Sampled with the site's shared sampler and sonified through the shared
        // engine — the exact x -> time, y -> pitch pipeline the Studio uses.
        // There is deliberately no Guess-specific audio path.
        const points = sampleEquationDetailed(
          equation.plot,
          equation.minX,
          equation.maxX,
          CURVE_SAMPLE_COUNT,
        );

        await audioEngine.playPoints(
          points,
          equation.minX,
          equation.maxX,
          equation.minFreq,
          equation.maxFreq,
          PLAY_DURATION_SECONDS,
          PLAY_VOLUME,
          equation.instrument,
          'frequency',
          false,
          'major',
          // Drives the ring around the play button, so the button shows elapsed
          // time rather than flipping its icon once and going still.
          (progress) => {
            if (audioGenerationRef.current === generation) setPlayProgress(progress);
          },
          // Natural completion routes through stopAudio() — the SAME path a
          // manual stop takes. No second reset path exists to drift out of sync.
          () => {
            if (audioGenerationRef.current === generation) stopAudio();
          },
        );
      } catch (err) {
        if (audioGenerationRef.current !== generation) return;
        stopAudio();
        setAudioError(err instanceof Error ? err.message : 'Could not play this equation');
      }
    },
    [stopAudio],
  );

  /**
   * Play / stop toggle.
   *
   * Tapping while playing stops immediately and reverts to idle. There is no
   * resume-from-position: a clean stop and a full replay is the whole of the
   * "pause" behaviour this game needs, and resuming mid-curve would undercut the
   * point of hearing the whole shape.
   */
  const handleTogglePlay = () => {
    if (!round || answered) return;
    if (isPlaying) {
      stopAudio();
      return;
    }
    void playEquation(round.correct);
  };

  const handleChoose = (option: GuessEquation) => {
    // Lock on the first answer: no re-answering, no score farming.
    if (!round || answered) return;

    // A daily attempt is consumed the moment the FIRST answer is given. This
    // happens BEFORE any state that depends on it, so a player who closes the
    // tab mid-round cannot replay the same day — the storage write is the
    // single source of truth, and `dailyAttemptUsed` is just the in-memory
    // mirror that keeps the card's button disabled during the round.
    if (dailyMode && !dailyAttemptUsed) {
      setDailyAttemptUsed(true);
    }

    // Silence the clip BEFORE revealing. Otherwise the tail of the previous audio
    // plays under the reveal and it reads as two things happening at once.
    stopAudio();

    const wasCorrect = option.id === round.correct.id;
    setChosenId(option.id);

    if (wasCorrect) {
      setScore((s) => s + 1);
      setStreak((s) => s + 1);
      setBurstKey((k) => k + 1);
    } else {
      setStreak(0);
    }

    setResults((prev) => {
      const next = prev.slice();
      next[roundIndex] = wasCorrect ? 'correct' : 'wrong';
      return next;
    });

    // Persist the daily answer immediately. The ref (not state) is used so the
    // write is never coalesced away by a batched update — the attempt must be
    // consumed even if the tab is closed mid-round.
    if (dailyMode) {
      dailyResultsRef.current[roundIndex] = wasCorrect;
      writeDailyResult(dailyResultsRef.current.slice());
    }
  };

  /*
   * KEEP THE QUESTION IN VIEW.
   *
   * On a phone the reveal lands below the fold, so answering left the feedback —
   * the whole point of answering — off screen until the user scrolled to find it.
   * And pressing "Next round" then left them parked wherever the previous reveal
   * had scrolled them, landing on the new round's options with the play button
   * and the prompt still out of sight above.
   *
   * Both are driven by state in an effect rather than by calling scrollIntoView
   * inside the click handlers: the reveal does not exist in the DOM at the moment
   * the answer is chosen, so scrolling to it synchronously would be a no-op.
   *
   * No viewport-width gate. `scrollIntoView` on an element already in view does
   * nothing, so on desktop — where the whole round fits — this is a silent no-op
   * rather than a special case to maintain. `scroll-mt-4` on both targets keeps
   * them clear of a sticky header when one is present.
   */
  const revealRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLDivElement | null>(null);
  const endCardRef = useRef<HTMLElement | null>(null);

  /*
   * FIRE THE TIER CELEBRATION ONCE, WHEN THE END SCREEN APPEARS.
   *
   * Gated on `finished` rather than called from handleNext, so it fires on mount
   * of the end screen. `playedTierRef` is the real once-only guard: without it
   * the effect would re-fire on every re-render of the end screen.
   *
   * No extra audio unlock is needed — reaching the end of the game means the
   * visitor has already pressed play, so the AudioContext exists and has had a
   * user gesture.
   */
  const playedTierRef = useRef<string | null>(null);

  useEffect(() => {
    if (!finished) {
      playedTierRef.current = null; // so a replayed game celebrates again
      return;
    }

    const tier = tierFor(score, GUESS_ROUNDS_PER_PLAY);
    if (playedTierRef.current === tier) return;
    playedTierRef.current = tier;

    playTierSting(tier);

    /*
     * The reference's `gentlePulse`: alternate a wide glow and a resting one,
     * 1.1s apart, for the tier's cycle count. Timeouts rather than a CSS
     * animation so the cycle COUNT is honoured exactly, and cleaned up on
     * unmount so a replay mid-pulse cannot leave a timer writing to a detached
     * node.
     */
    const card = endCardRef.current;
    if (!card) return;
    const { color, cycles } = TIER_GLOW[tier];
    const timers: ReturnType<typeof setTimeout>[] = [];
    let done = 0;

    const pulse = () => {
      card.style.boxShadow = `0 0 46px -6px ${color}`;
      timers.push(
        setTimeout(() => {
          card.style.boxShadow = `0 0 10px -6px ${color}`;
          done += 1;
          if (done < cycles) timers.push(setTimeout(pulse, 1100));
        }, 1100),
      );
    };
    pulse();

    return () => timers.forEach(clearTimeout);
  }, [finished, score]);

  // Answering: bring the reveal into view.
  useEffect(() => {
    if (chosenId === null) return;
    revealRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [chosenId, roundIndex]);

  // Moving on: bring the prompt back, so the next round starts at its top.
  useEffect(() => {
    if (answered) return;
    promptRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [answered, roundIndex]);

  const handleNext = () => {
    // Before building the new round: the previous voice must be gone first.
    stopAudio();
    setChosenId(null);

    if (roundIndex >= rounds.length - 1) {
      setFinished(true);
      setBigCelebration(deservesBigCelebration(score, rounds.length));
      return;
    }
    setRoundIndex((i) => i + 1);
  };

  /**
   * A fresh shuffled deck — score, streak and the results strip all reset.
   *
   * `buildPlaythrough()` is called again here rather than reusing the previous
   * rounds, so every replay is an independently shuffled game.
   */
  const handlePlayAgain = () => {
    stopAudio();
    setRounds(buildPlaythrough());
    setRoundIndex(0);
    setChosenId(null);
    setResults(new Array(GUESS_ROUNDS_PER_PLAY).fill(null));
    setScore(0);
    setStreak(0);
    setFinished(false);
    setBigCelebration(false);
    setAudioError('');
    setDailyMode(false);
    setDailyAttemptUsed(false);
  };

  /**
   * Start the worldwide daily challenge.
   *
   * `buildDailyRounds()` reads the clock to pick today's key, so the same 10
   * questions come back for every player on the same Eastern date. The attempt
   * is NOT consumed here — it is consumed the moment the first answer is given,
   * inside `handleChoose`, so a player who closes the tab mid-round has lost
   * nothing and can come back to the same game.
   */
  const handleDailyStart = (nextRounds: GuessRound[]) => {
    stopAudio();
    setRounds(nextRounds);
    setRoundIndex(0);
    setChosenId(null);
    setResults(new Array(GUESS_ROUNDS_PER_PLAY).fill(null));
    setScore(0);
    setStreak(0);
    setFinished(false);
    setBigCelebration(false);
    setAudioError('');
    setDailyMode(true);
    setDailyAttemptUsed(false);
  };

  /* ── End of game ──────────────────────────────────────────────────── */
  if (finished) {
    const tier = tierFor(score, GUESS_ROUNDS_PER_PLAY);
    const bursts = TIER_BURSTS[tier];

    // Daily games get their own finish screen: the score, the 🟩🟥 strip, a
    // share button, the updated streak and a live countdown to the next day.
    // Normal play falls back to the tier celebration card below.
    if (dailyMode) {
      return <GuessDailyFinish score={score} results={results} streak={streak} onPlayAgain={handlePlayAgain} />;
    }

    return (
      <section
        ref={endCardRef}
        className="celebrate-card relative max-w-2xl mx-auto px-4 sm:px-6 py-16 text-center"
      >
        {/*
          The tier's confetti. The reference fires up to three staggered bursts
          (0ms, 220ms, 320ms) rather than one, which is what makes the perfect
          band read as a firework instead of a pop. Only the low band has none.
        */}
        {bursts.map((burst, i) => (
          <div key={i} className="absolute inset-x-0 top-6">
            <GuessConfetti burstKey={burstKey + 1000 + i} count={burst.count} colors={burst.colors} />
          </div>
        ))}

        <p className="font-mono text-xs uppercase tracking-widest text-sc-text-faint">
          {t('guess.finalLabel')}
        </p>
        <p className="mt-4 font-serif text-5xl sm:text-6xl text-sc-text">
          {score}
          <span className="text-sc-text-faint text-3xl">/{GUESS_ROUNDS_PER_PLAY}</span>
        </p>
        <p className="mt-4 text-sc-text-soft">{t(`guess.tier.${tier}.grade`)}</p>
        <p className="mt-2 text-sm text-sc-text-soft/80">{t(`guess.tier.${tier}.msg`)}</p>
        <button type="button" onClick={handlePlayAgain} className="btn-primary px-6 py-3 mt-8">
          {t('guess.playAgain')}
        </button>
      </section>
    );
  }

  if (!round) return null;

  const wasCorrect = chosenId === round.correct.id;
  const accent = GUESS_FAMILY_ACCENT[round.correct.family];

  /**
   * Which of the three feedback lines applies.
   *
   * A near miss (wrong, but the option picked was a same-family sibling) is a
   * genuinely different situation from picking something unrelated, and it is
   * the one worth congratising: the ear was in the right neighbourhood.
   */
  const outcome: GuessOutcome = wasCorrect
    ? 'correct'
    : round.options.some((o) => o.id === chosenId && o.family === round.correct.family)
      ? 'wrong-same-family'
      : 'wrong-other-family';

  return (
    <>
      {/* Injected once per mounted game. The option-state rules must out-specify
          `.panel` from global.css, so they cannot be Tailwind utilities. */}
      <style>{OPTION_STATE_CSS}</style>
      <section className="max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
      {/* ── Progress strip + status ──────────────────────────────────── */}
      <div className="mb-8">
        {/* Ten segments, one per round: filled green for a correct answer, red
                    for a wrong one, and the active round is always outlined in
                    the current family's accent so "where am I" is visual. */}
        <ol className="flex items-center gap-1.5" aria-label={t('guess.progressLabel')}>
          {results.map((result, i) => {
            const isCurrent = i === roundIndex;
            const tone =
              result === 'correct'
                ? 'bg-green-500'
                : result === 'wrong'
                  ? 'bg-red-500'
                  : 'bg-sc-line/20';
            return (
              <li
                key={i}
                aria-current={isCurrent ? 'step' : undefined}
                className={`h-2 flex-1 rounded-full transition-all ${tone} ${
                  isCurrent ? 'ring-2 ring-offset-2 ring-offset-sc-bg' : ''
                }`}
                // The ring colour is set inline because it must be the live family
                // accent, which is data-driven and cannot be a static class.
                style={isCurrent ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
              />
            );
          })}
        </ol>

        <div className="mt-3 flex items-center justify-between gap-4 text-sm">
          <p className="font-mono text-xs uppercase tracking-widest text-sc-text-faint">
            {t('guess.round')} {roundIndex + 1}/{rounds.length}
          </p>
          <div className="flex items-center gap-4">
            <span className="text-sc-text-soft">
              {t('guess.score')}{' '}
              <span className="font-mono text-sc-text">
                {score}/{roundIndex}
              </span>
            </span>
            {streak >= STREAK_DISPLAY_THRESHOLD && (
              <span className="font-mono text-sc-accent" aria-live="polite">
                {t('guess.streak')} {streak}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Daily challenge card (beside normal play) ──────────────────── */}
      <div className="mt-8">
        <GuessDailyCard onDailyStart={handleDailyStart} />
      </div>

      {/* ── Prompt + play ───────────────────────────────────────────── */}
      {/* The card's ambient glow is the family accent: the colour itself starts
          teaching which family you are listening to before any label is read. */}
      <div
        ref={promptRef}
        className="panel relative p-6 sm:p-8 text-center overflow-hidden scroll-mt-4"
        style={{ boxShadow: `inset 0 0 60px -30px ${accent}` }}
      >
        <h1 className="font-serif text-2xl sm:text-3xl text-sc-text">
          {answered ? t('guess.wasIt') : t('guess.listenTitle')}
        </h1>
        <p className="mt-2 text-sm text-sc-text-soft">
          {answered ? t('guess.revealHint') : t('guess.listenHint')}
        </p>

        {/* Play / stop toggle. Never disabled while playing — tapping it is how
            the player stops the clip early. */}
        <div className="relative inline-flex items-center justify-center mt-6">
          {/* Progress ring: an SVG circle whose dash offset tracks elapsed time,
              so there is continuous feedback for the whole 2.5s rather than a
              one-shot icon swap. */}
          <svg
            className="absolute -inset-3 w-[calc(100%+1.5rem)] h-[calc(100%+1.5rem)] -rotate-90 pointer-events-none"
            viewBox="0 0 100 100"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r="48"
              fill="none"
              stroke={accent}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 48}
              strokeDashoffset={2 * Math.PI * 48 * (1 - (isPlaying ? playProgress : 0))}
              opacity={isPlaying ? 0.9 : 0}
              className="transition-[stroke-dashoffset,opacity] duration-100 ease-linear"
            />
          </svg>

          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={answered}
            aria-label={isPlaying ? t('guess.stop') : t('guess.play')}
            className="btn-primary px-6 py-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {/* Icon swap: triangle when idle, stop square while playing. */}
            <span aria-hidden="true" className="inline-block mr-2 align-middle">
              {isPlaying ? (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <rect x="2" y="2" width="10" height="10" rx="1.5" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                  <path d="M3 2 L12 7 L3 12 Z" />
                </svg>
              )}
            </span>
            {isPlaying ? t('guess.playing') : answered ? t('guess.played') : t('guess.play')}
          </button>
        </div>

        {audioError && (
          <p className="mt-3 text-sm text-sc-text-soft" role="status">
            {audioError}
          </p>
        )}
      </div>

      {/* ── Options ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
        {round.options.map((option) => {
          const isChosen = chosenId === option.id;
          const isCorrect = option.id === round.correct.id;

          // State as a data attribute, styled by the scoped block below.
          //
          // This previously toggled `border-sc-live` / `border-sc-accent`
          // utilities, which silently did nothing: `.panel` is defined in
          // global.css AFTER `@tailwind utilities`, so at equal specificity
          // (.panel is (0,1,0), as is the utility) the later rule wins — and
          // `.panel` sets the `border:` shorthand, which resets border-color
          // outright. Answering a question appeared to change nothing.
          //
          // `.guess-option[data-state='…']` is (0,2,0), so it beats `.panel` on
          // SPECIFICITY rather than on source order. That also means it keeps
          // working if global.css is ever reordered, which the utility version
          // would not.
          //
          // The four states also encode the both-at-once requirement: on a wrong
          // pick the chosen option is 'wrong' (red) while the real answer is
          // 'correct' (green), and the remaining two are merely muted.
          const state = !answered
            ? 'idle'
            : isCorrect
              ? 'correct'
              : isChosen
                ? 'wrong'
                : 'muted';

          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleChoose(option)}
              disabled={answered}
              aria-pressed={isChosen}
              data-state={state}
              className="guess-option panel text-left p-4 font-mono text-sm text-sc-text transition-colors disabled:cursor-default"
            >
              {option.display}
              {answered && isCorrect && (
                <span className="ml-2 font-sans text-xs guess-option-tag">{t('guess.correct')}</span>
              )}
              {answered && isChosen && !isCorrect && (
                <span className="ml-2 font-sans text-xs guess-option-tag">{t('guess.yourAnswer')}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Reveal ──────────────────────────────────────────────────── */}
      {answered && (
        <div ref={revealRef} className="panel relative mt-6 p-6 sm:p-8 overflow-hidden scroll-mt-4">
          {/* Burst on a correct answer. Keyed so each correct answer re-runs it. */}
          {wasCorrect && <GuessConfetti burstKey={burstKey} />}

          <p className="font-mono text-sm text-sc-text text-center break-words">
            {equationLabel(round.correct.display)}
          </p>

          {/* Rendered only now — before this answer there is no curve element in
              the DOM at all, so nothing about the shape is observable. */}
          <div className="mt-4 -mx-2">
            <GuessCurveReveal equation={round.correct} accent={accent} />
          </div>

          {/* Badges carry the family accent, tying the reveal to the colour the
              player has been seeing on the card and the progress strip. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-sc-text-soft">
            <span
              className="font-mono rounded px-2 py-1"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {round.correct.difficulty}
            </span>
            <span
              className="font-mono rounded px-2 py-1"
              style={{ backgroundColor: `${accent}22`, color: accent }}
            >
              {GUESS_FAMILIES[round.correct.family].label}
            </span>
            <span className="basis-full sm:basis-auto text-sc-text-faint">
              {GUESS_FAMILIES[round.correct.family].blurb}
            </span>
          </div>

          {/* Varied feedback, rotated per round. A near miss gets its own line
              because "wrong" would undersell how close it was. */}
          <p className="mt-4 text-center text-sm" role="status" aria-live="polite">
            {t(feedbackFor(outcome, roundIndex))}
          </p>

          <button type="button" onClick={handleNext} className="btn-primary px-6 py-3 mt-6 w-full sm:w-auto">
            {roundIndex >= rounds.length - 1 ? t('guess.seeResults') : t('guess.next')}
          </button>
        </div>
      )}
      </section>
    </>
  );
}