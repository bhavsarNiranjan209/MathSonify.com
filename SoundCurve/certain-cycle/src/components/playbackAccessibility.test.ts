/**
 * Accessibility contract for the playback controls.
 *
 * Blind mode (#5 in the V2 spec) is described as pointless "if the rest of the
 * page isn't navigable without a mouse", so the transport controls themselves
 * have to be sound. These are static assertions on the source rather than a
 * rendered-DOM test, which is the only kind available here — they still catch
 * the realistic regression, which is someone adding a new control (or a new
 * slider) without a label.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(
  fileURLToPath(new URL('../components/AudioControls.tsx', import.meta.url)),
  'utf8',
);

/** Every `type="range"` input, with the attributes that follow it. */
function rangeInputs(): string[] {
  const out: string[] = [];
  const re = /<input\s[^>]*type="range"[\s\S]*?\/>/g;
  for (const m of source.matchAll(re)) out.push(m[0]);
  return out;
}

test('every slider has an accessible name and a readable value', () => {
  const ranges = rangeInputs();
  assert.ok(ranges.length >= 5, `expected the 5 transport sliders, found ${ranges.length}`);
  for (const input of ranges) {
    assert.match(input, /aria-label=\{t\('/, `slider is missing an aria-label: ${input.slice(0, 90)}`);
    // Without valuetext a screen reader reads the raw number, e.g. "0.7" for
    // volume or "12" for seconds, which is ambiguous at best.
    assert.match(input, /aria-valuetext=/, `slider is missing aria-valuetext: ${input.slice(0, 90)}`);
  }
});

test('no control is an unlabelled toggle', () => {
  // The loop switch is the trap: its only child is a decorative circle, so
  // without aria-label it has no accessible name whatsoever.
  assert.match(source, /aria-label=\{t\('audio\.loopPlayback'\)\}/);
  assert.match(source, /aria-pressed=\{loop\}/);
  // The decorative circle must not be announced.
  assert.match(source, /aria-hidden="true"\s*\n?\s*className=\{`inline-block h-3\.5/);
});

test('instrument and mode pickers expose their selection', () => {
  // Selection here is colour-only, so without aria-pressed a screen reader
  // hears six identical buttons and cannot tell which voice is active.
  assert.match(source, /aria-pressed=\{instrument === inst\.id\}/);
  assert.match(source, /aria-pressed=\{sonificationMode === m\.id\}/);
  assert.match(source, /role="group"\s*\n\s*aria-label=\{t\('audio\.chooseInstrument'\)\}/);
  assert.match(source, /role="group"\s*\n\s*aria-label=\{t\('audio\.howMathMakesSound'\)\}/);
});

test('the three V2 toggles report their pressed state', () => {
  for (const flag of ['learnMode', 'panningEnabled', 'curveDescriber']) {
    assert.match(
      source,
      new RegExp(`aria-pressed=\\{${flag}\\}`),
      `${flag} toggle must expose aria-pressed`,
    );
  }
});

test('the Learn-mode readout is polite, not assertive', () => {
  // It updates 60x a second; an assertive live region would make the page
  // unusable with a screen reader running.
  const learnPanel = readFileSync(
    fileURLToPath(new URL('../components/LearnPanel.tsx', import.meta.url)),
    'utf8',
  );
  assert.match(learnPanel, /aria-live="polite"/);
  assert.ok(!/aria-live="assertive"/.test(learnPanel), 'must never be assertive');
  // And it must do no maths of its own, or it can drift from the audio.
  assert.ok(
    !/normalize|parseEquation|resolveActiveCurve/.test(learnPanel),
    'LearnPanel must format only — sampling belongs to the engine',
  );
});

test('the curve describer describes the same curve the plot draws', () => {
  const describer = readFileSync(
    fileURLToPath(new URL('../components/CurveDescriber.tsx', import.meta.url)),
    'utf8',
  );
  // resolveActiveCurve is the single source of truth; anything else would be a
  // second sampler that can disagree with the audio.
  assert.match(describer, /resolveActiveCurve/);
  assert.ok(
    !/parseEquation\(/.test(describer),
    'must not re-parse the equation instead of using resolveActiveCurve',
  );
  // The written text must exist independently of speech synthesis.
  assert.match(describer, /description\.text/);
  assert.ok(/speechSynthesis/.test(describer), 'should still offer spoken output');
});