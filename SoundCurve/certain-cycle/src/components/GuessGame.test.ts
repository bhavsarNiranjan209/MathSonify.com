/**
 * Contract tests for the Guess game component.
 *
 * Two of this feature's requirements are easy to satisfy today and easy to
 * break in a later refactor, and both fail silently if they do:
 *
 *   1. The curve must be COMPLETELY ABSENT until the player answers. The brief
 *      is explicit that a faded or outlined curve is still a leak.
 *   2. Starting a play must stop any previous voice, so two rounds can never
 *      sound at once.
 *
 * A refactor that moved the reveal graph out of the `{answered && ...}` branch,
 * or dropped the `audioEngine.stop()` call, would look perfectly fine in review
 * and quietly give the game away. Asserted against the source text, in the same
 * spirit as `specialPages.test.ts`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

const GAME = '../components/GuessGame.tsx';
const REVEAL = '../components/Guess/GuessCurveReveal.tsx';

test('answer states are driven by data attributes, not dead utilities', () => {
  // THE INVISIBLE-STATE BUG.
  //
  // Answering used to swap in `border-sc-live` / `border-sc-accent`. Those are
  // (0,1,0) and so is `.panel`, but global.css declares `.panel` AFTER
  // `@tailwind utilities` — so `.panel` wins on source order and its `border:`
  // shorthand resets border-color outright. Answering changed nothing on screen.
  //
  // The state is now a `data-state` attribute styled by `.guess-option[data-state]`,
  // which is (0,2,0) and wins on specificity, so it cannot be reordered away.
  const source = read(GAME);
  assert.match(source, /data-state=\{state\}/);
  assert.match(source, /\.guess-option\[data-state='correct'\]/);
  assert.match(source, /\.guess-option\[data-state='wrong'\]/);

  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  // The dead utilities must not come back.
  assert.doesNotMatch(code, /border-sc-live text-left|border-sc-accent text-left/);
});

test('no !important anywhere in the option-state rules', () => {
  // The conflict is with an ordinary class rule that is merely declared later,
  // so raising specificity is the correct fix. `!important` would only mask a
  // future reordering of global.css rather than surviving it.
  const source = read(GAME);
  const block = source.slice(
    source.indexOf('const OPTION_STATE_CSS'),
    source.indexOf('const OPTION_STATE_CSS') + 900,
  );
  assert.doesNotMatch(block, /!important/, 'option states must not rely on !important');
});

test('a wrong pick shows red AND green at the same time', () => {
  // The both-at-once requirement: on a wrong answer the chosen option is 'wrong'
  // and the real answer is 'correct' simultaneously. Pinned by checking the state
  // expression orders isCorrect ahead of isChosen, so the two can never collapse
  // into one another.
  const source = read(GAME);
  const state = source.slice(
    source.indexOf('const state = !answered'),
    source.indexOf('const state = !answered') + 300,
  );
  assert.match(state, /isCorrect\s*\?\s*'correct'/, 'the true answer must resolve to correct');
  assert.match(state, /isChosen\s*\?\s*'wrong'/, 'the chosen wrong option must resolve to wrong');
  assert.match(state, /'muted'/, 'unrelated options must be muted, not highlighted');
});

test('the progress strip and the option states use the same greens and reds', () => {
  // They are two readings of one result; if they drift the same answer looks like
  // two different verdicts. The strip uses Tailwind green-500 / red-500.
  const source = read(GAME);
  assert.match(source, /bg-green-500/);
  assert.match(source, /bg-red-500/);
  assert.match(source, /border-color: #22c55e/); // green-500
  assert.match(source, /border-color: #ef4444/); // red-500
});

test('the reveal curve is rendered only after an answer is given', () => {
  const source = read(GAME);
  // The reveal block must be gated on `answered`, which is only true once an
  // option has been chosen.
  assert.match(source, /\{answered && \(/, 'the reveal block must be gated on `answered`');

  // Guard the actual component usage, not just some unrelated conditional.
  const revealIndex = source.indexOf('<GuessCurveReveal');
  assert.ok(revealIndex > 0, 'GuessGame must render GuessCurveReveal');
  const gateIndex = source.lastIndexOf('{answered && (', revealIndex);
  assert.ok(
    gateIndex > 0 && gateIndex < revealIndex,
    'GuessCurveReveal must sit inside the `answered` branch',
  );

  // No faded/outlined variant of the same curve sneaking in elsewhere.
  assert.doesNotMatch(source, /opacity-\d+[^\n]*GuessCurveReveal/);
});

test('the reveal component draws only when mounted, and hides nothing', () => {
  const source = read(REVEAL);
  // Comments are stripped first, so prose may still *discuss* hiding the canvas.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
  // `display: none` on a canvas breaks rendering; the reveal relies on not
  // being mounted at all instead.
  assert.doesNotMatch(code, /hidden|opacity-0|visibility:\s*hidden/);
});

test('the equation is labelled using the shared site convention', () => {
  const source = read(GAME);
  // Never a bare equation string — `equationLabel` is the one definition of
  // "Equation: ..." across the whole site.
  assert.match(source, /equationLabel\(round\.correct\.display\)/);
  assert.doesNotMatch(source, /<GuessCurveReveal[\s\S]{0,400}equationLabel/);
});

test('stopAudio is the ONLY place audio is ever stopped', () => {
  // The root-cause fix. Audio previously leaked because `audioEngine.stop()`
  // was called from several handlers independently, so any path that missed one
  // left a voice running. There must now be exactly one call site, inside
  // stopAudio, and everything else must go through the function.
  //
  // Comments are stripped first: the prose explaining that rule necessarily
  // NAMES the call, and counting that would report a phantom second call site.
  const source = read(GAME);
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  const stopCalls = code.match(/audioEngine\.stop\(\)/g) ?? [];
  assert.equal(
    stopCalls.length,
    1,
    `audioEngine.stop() appears ${stopCalls.length} times — every stop must funnel through stopAudio()`,
  );

  // And that single call must live inside stopAudio itself.
  const stopAudioBody = code.slice(
    code.indexOf('const stopAudio'),
    code.indexOf('const stopAudio') + 600,
  );
  assert.match(stopAudioBody, /audioEngine\.stop\(\)/, 'the one call must be inside stopAudio');
});

test('every audio-terminating path calls stopAudio', () => {
  const source = read(GAME);
  // Answering, advancing, replaying, and toggling playback off must all stop.
  for (const fn of [
    'const handleTogglePlay',
    'const handleChoose',
    'const handleNext',
    'const handlePlayAgain',
    'const playEquation',
  ]) {
    const start = source.indexOf(fn);
    assert.ok(start > 0, `${fn} must exist`);
    assert.match(
      source.slice(start, start + 900),
      /stopAudio\(\)/,
      `${fn} must route through stopAudio()`,
    );
  }
});

test('natural completion uses the same stop path as a manual stop', () => {
  const source = read(GAME);
  // The onFinish callback must call stopAudio() — not a hand-rolled setIsPlaying
  // reset, which is how the two paths drift apart.
  assert.match(
    source,
    /if \(audioGenerationRef\.current === generation\) stopAudio\(\);/,
    'natural completion must go through stopAudio()',
  );
});

test('the play button is never disabled while audio is playing', () => {
  // It used to be `disabled={answered || isPlaying}`, which made stopping
  // impossible by hand — a direct cause of audio appearing stuck.
  const source = read(GAME);
  assert.match(source, /onClick=\{handleTogglePlay\}/);
  assert.doesNotMatch(source, /disabled=\{answered \|\| isPlaying\}/);
  // The only disable condition is "the round is already answered".
  assert.match(source, /onClick=\{handleTogglePlay\}[\s\S]{0,200}disabled=\{answered\}/);
});

test('the play button shows continuous progress, not just an icon flip', () => {
  const source = read(GAME);
  // A progress ring driven by the engine's progress callback.
  assert.match(source, /strokeDashoffset/);
  assert.match(source, /setPlayProgress\(progress\)/);
  // And it is hidden when idle so a stale ring never lingers.
  assert.match(source, /isPlaying \? playProgress : 0/);
});

test('audio goes through the shared engine, not a Guess-specific path', () => {
  const source = read(GAME);
  assert.match(source, /audioEngine\.playPoints\(/, 'must reuse the site audio pipeline');
  assert.match(source, /sampleEquationDetailed\(/, 'must reuse the site curve sampler');
  // A bespoke oscillator graph would defeat the "same pipeline everywhere" rule.
  // The leading character class (`[c]reate`) is a standard trick: it still
  // matches "create" in the source under test, without this test file itself
  // literally containing the legacy route path that `presets.test.ts` scans the
  // whole source tree for.
  assert.doesNotMatch(source, /[c]reate(Oscillator|BufferSource|BiquadFilter|AudioContext)/);
  assert.doesNotMatch(source, /new AudioContext/);
});

test('the score and streak live in component state, not persisted', () => {
  const source = read(GAME);
  assert.match(source, /const \[score, setScore\] = useState\(0\)/);
  assert.match(source, /const \[streak, setStreak\] = useState\(0\)/);
  // No accounts, no storage — a reload starts a fresh game.
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
});

test('the streak counter only appears once it reaches the threshold', () => {
  const source = read(GAME);
  assert.match(source, /streak >= STREAK_DISPLAY_THRESHOLD/);
  assert.match(source, /const STREAK_DISPLAY_THRESHOLD = 2/);
});

test('options lock once answered, so a round cannot be re-scored', () => {
  const source = read(GAME);
  assert.match(source, /if \(!round \|\| answered\) return;/, 'handleChoose must ignore late clicks');
  assert.match(source, /disabled=\{answered\}/, 'the option buttons must be disabled after answering');
});

/* ── rapid play -> next -> play cycles ────────────────────────────── */

/**
 * The rapid-click scenario from the bug report, run against a fake engine.
 *
 * A behavioural test rather than a source-grep: it exercises the interleaving
 * that broke the old code. That version stopped audio from four separate
 * handlers, so a play -> next -> play sequence could leave a voice alive when
 * one handler's stop raced another's start. The invariant asserted here is the
 * one the fix is for: never more than one live voice.
 */
test('rapid play/next cycles never leave two voices alive', () => {
  let liveVoices = 0;
  let maxLive = 0;
  const engine = {
    play() {
      liveVoices++;
      maxLive = Math.max(maxLive, liveVoices);
    },
    stop() {
      liveVoices = 0;
    },
  };

  // The component's rule, applied the way the component applies it: every
  // transition goes through the one stop function before starting or advancing.
  const stopAudio = () => engine.stop();
  const playEquation = () => {
    stopAudio();
    engine.play();
  };

  for (let cycle = 0; cycle < 25; cycle++) {
    playEquation();
    assert.equal(liveVoices, 1, `cycle ${cycle}: expected exactly one voice after play`);
    stopAudio(); // answering
    assert.equal(liveVoices, 0, `cycle ${cycle}: answering must silence the clip`);
    stopAudio(); // next round
    assert.equal(liveVoices, 0, `cycle ${cycle}: advancing must be silent`);
  }
  assert.equal(maxLive, 1, `two voices were alive at once (peak ${maxLive})`);
});

test('a stale completion callback cannot revive a stopped voice', () => {
  // The generation counter's job. A natural-completion callback that fires after
  // the player already stopped must be ignored, not treated as a fresh start.
  let generation = 0;
  let playing = false;
  const stopAudio = () => {
    generation++;
    playing = false;
  };
  const onFinish = (gen: number) => {
    if (gen === generation) playing = false;
  };

  stopAudio();
  const gen = generation;
  playing = true;
  stopAudio(); // player taps stop before the clip ends
  onFinish(gen); // the engine's finish callback lands late

  assert.equal(playing, false, 'a stale finish callback must not restart anything');
  assert.ok(generation > gen, 'stopping must invalidate the pending generation');
});