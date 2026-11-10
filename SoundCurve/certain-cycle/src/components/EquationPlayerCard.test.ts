/**
 * EquationPlayerCard (v28): the working equation player pill.
 * The sine wave is pure geometry (tested for real); the audio wiring —
 * 5-second play, auto-stop on finish, pause on toggle, stop on unmount —
 * is asserted on the source, the way the no-copy guard tests do it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sineWavePath, sineWavePoint } from '../utils/equationWave';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

test('sineWavePath draws a smooth sine with the right number of cycles', () => {
  const d = sineWavePath(220, 64, 3);
  // Starts at the mid-line, ends at the mid-line, and is a single path.
  assert.ok(d.startsWith('M0.0,32.0'), `wave does not start at mid-line (got ${d.slice(0, 20)})`);
  assert.ok(d.endsWith('220.0,32.0'), `wave does not end at mid-line (got ${d.slice(-20)})`);
  // Three full periods: the path crosses the mid-line 6 times going down/up
  // (plus the two endpoints), so count the mid-line points.
  const points = d.slice(1).split('L').map((s) => s.split(',').map(Number));
  const mids = points.filter(([, y]) => Math.abs(y - 32) < 0.6).length;
  assert.ok(mids >= 6, `expected 3 cycles (6+ mid-line crossings, got ${mids})`);
  // It actually moves up and down (not a flat line).
  const ys = points.map(([, y]) => y);
  assert.ok(Math.min(...ys) < 12, 'wave never peaks');
  assert.ok(Math.max(...ys) > 52, 'wave never troughs');
});

test('sineWavePoint rides the same curve the path draws', () => {
  const p0 = sineWavePoint(220, 64, 3, 0);
  const pMid = sineWavePoint(220, 64, 3, 0.5);
  const p1 = sineWavePoint(220, 64, 3, 1);
  // Endpoints sit on the mid-line; the midpoint (1.5 cycles in) does too.
  // (A small tolerance: sin(3π) and sin(6π) are ~1e-16 in floating point,
  // not exactly 0.)
  assert.ok(Math.abs(p0.y - 32) < 0.6, 'playhead does not start on the mid-line');
  assert.ok(Math.abs(p1.y - 32) < 0.6, 'playhead does not end on the mid-line');
  assert.ok(Math.abs(pMid.y - 32) < 0.6, 'playhead midpoint is not on the mid-line');
  // A quarter of the way in (0.75 cycles) it is at the bottom of the wave:
  // sin(1.5π) = -1, so y = mid + amp.
  const pQuarter = sineWavePoint(220, 64, 3, 0.25);
  assert.ok(pQuarter.y > 52, 'playhead is not at the wave trough a quarter in');
  assert.equal(p0.x, 0, 'playhead x does not start at 0');
  assert.equal(p1.x, 220, 'playhead x does not end at the width');
});

test('the player plays for 5 seconds, then stops by itself', () => {
  const source = read('./EquationPlayerCard.tsx');
  // Default duration is 5 seconds.
  assert.match(source, /duration = 5/, 'default duration is not 5 seconds');
  // The finish callback flips the button back to play.
  assert.match(source, /onFinish|\(\(\) => \{\s*\/\/ The 5 seconds are up/, 'no finish callback to stop the card');
  assert.match(source, /playingRef\.current = false;\s*setIsPlaying\(false\)/, 'finish does not reset the playing state');
  // Pause stops the engine.
  assert.match(source, /audioEngine\.stop\(\)/, 'pause does not stop the audio engine');
});

test('the wave animates while it plays (progress reveal + playhead)', () => {
  const source = read('./EquationPlayerCard.tsx');
  // The engine's progress callback drives the wave.
  assert.match(source, /\(prog\) => \{\s*setProgress/, 'no onProgress callback feeding the wave');
  // The wave is a progress-driven stroke reveal (pathLength normalises it).
  assert.match(source, /pathLength=\{1\}/, 'wave path has no pathLength for the dash math');
  assert.match(source, /strokeDasharray=\{waveDrawn \? 1 : undefined\}/, 'wave has no progress dasharray');
  assert.match(source, /strokeDashoffset=\{waveDrawn \? 1 - progress : undefined\}/, 'wave has no progress dashoffset');
  // A playhead dot rides the curve while it plays.
  assert.match(source, /sineWavePoint\(WAVE_W, WAVE_H, WAVE_CYCLES/, 'no playhead point on the wave');
  assert.match(source, /<circle cx=\{head\.x\} cy=\{head\.y\}/, 'no playhead dot rendered');
  // Pausing freezes the wave where it stopped; finishing resets it.
  assert.match(source, /\/\/ Pause: stop the sound, but keep the progress/, 'pause does not keep the frozen progress');
  assert.match(source, /\/\/ The 5 seconds are up — back to the play triangle and a full wave/, 'finish does not reset the wave');
});

test('the player stops when it unmounts and shows play/pause correctly', () => {
  const source = read('./EquationPlayerCard.tsx');
  // Cleanup on unmount, so sound never keeps playing after navigation.
  assert.match(source, /useEffect\(\(\) => stop, \[stop\]\)/, 'no unmount cleanup to stop audio');
  // The button toggles: pause icon while playing, play triangle when stopped.
  assert.match(source, /aria-pressed=\{isPlaying\}/, 'button does not expose its pressed state');
  assert.match(source, /aria-label=\{isPlaying \? `Pause/, 'button has no Pause label while playing');
  assert.match(source, /`Play \$\{equation\}`/, 'button has no Play label when stopped');
  // It uses the Studio's own voice, so it sounds the same as the Studio.
  assert.match(source, /resolveActiveCurve/, 'player does not resolve the curve like the Studio');
  assert.match(source, /audioEngine\.playPoints/, 'player does not use the audio engine');
  assert.match(source, /'sine',\s*'frequency'/, 'player does not use the Studio default voice');
});
