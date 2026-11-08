/**
 * Contract tests for the 2D / 3D demo card on /how-it-works.
 *
 * The card reuses the Studio's `Curve3DViewer` instead of growing a second,
 * simpler 3D scene, and its two faces share ONE play state. Both are wiring
 * rather than geometry — the geometry itself is covered by `curve3d.test.ts` —
 * so they are pinned here at the source level, which is where the wiring is
 * visible without a browser.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');
/**
 * Source with comments stripped.
 *
 * The prose documenting a rule necessarily names the thing the rule bans, so a
 * search over raw source reports a phantom violation inside its own comment.
 */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

const CARD = './HowItWorksExperience.tsx';
const VIEWER = '../Studio/Curve3DViewer.tsx';

test("the card reuses the Studio's ONE 3D viewer", () => {
  const source = read(CARD);
  // Eager or deferred, warmed or clicked, every reference must resolve to the
  // ONE shared module — never a second scene of this file's own.
  const specifiers = [...source.matchAll(/import\(['"]([^'"]+)['"]\)/g)]
    .map((m) => m[1])
    .filter((s) => s.includes('Curve3DViewer'));
  assert.ok(specifiers.length >= 1, 'the card must pull the shared viewer module');
  assert.ok(
    specifiers.every((s) => s === '../Studio/Curve3DViewer'),
    `every viewer import must be the single shared one, got: ${specifiers.join(', ')}`,
  );
  // No second scene: the card must never grow its own WebGL code, or the two
  // implementations drift and "every graph can go 3D" stops being true.
  assert.doesNotMatch(code(CARD), /new WebGLRenderer/);
  assert.doesNotMatch(code(CARD), /from 'three'/);
});

test('the flip keeps both faces laid out and never display:none the canvas', () => {
  const source = read(CARD);
  assert.match(source, /transformStyle: 'preserve-3d'/, 'the frame rotates on Y');
  assert.match(source, /rotateY\(\$\{show3D \? 180 : 0\}deg\)/, 'rotation tracks the view');
  assert.match(source, /perspective: '1600px'/, 'the flip needs a perspective to read as depth');
  assert.match(source, /backfaceVisibility: 'hidden'/, 'both faces opt out of depth sorting');
  // Mounted only in 3D — and deferred, so three.js is a cost paid by the
  // visitor who presses 3D rather than by everyone who reads the page.
  assert.match(source, /\{show3D && \(/, 'the WebGL view mounts only in 3D');
  assert.match(
    source,
    /lazy\(\(\) => import\('\.\.\/Studio\/Curve3DViewer'\)\)/,
    'the card must load the shared viewer module on demand',
  );
  // Reduced motion is honoured in CSS, so there is no JS branch to forget.
  assert.match(source, /motion-reduce:transition-none/);
  // AGENTS.md: a canvas taken out of layout stops tracking its container.
  assert.doesNotMatch(code(CARD), /display:\s*none/, 'the 2D canvas must never be display:none');
});

test('ONE Play state drives both faces', () => {
  const source = read(CARD);

  // Every write to the demo's own transport is mirrored into the studio store:
  // the run's ticks, its finish, a pause, a reset, and a changed equation.
  // One definition plus those five call sites.
  const sites = (source.match(/publishTransport\(/g) ?? []).length;
  assert.ok(
    sites >= 6,
    `expected the mirror at every transport write, found ${sites} occurrence(s)`,
  );

  // ... and the 3D face reads that store — by subscription, never by prop, so a
  // 60Hz tick costs no React render.
  const viewer = read(VIEWER);
  assert.match(viewer, /useStudioStore\.subscribe\(/);
  assert.match(viewer, /progressRef\.current = state\.progress/);
  assert.doesNotMatch(
    code(CARD),
    /<Curve3DViewer[^>]*progress/,
    'progress must reach the viewer through the store, not as a prop',
  );
});

test('the toggle is a panel-local mode, never navigation', () => {
  const source = read(CARD);
  assert.match(source, /aria-pressed=\{view === v\}/);
  // 3D is a MODE of this card: it swaps what is drawn inside the same frame and
  // navigates nowhere.
  assert.doesNotMatch(code(CARD), /<a\s+href|navigate\(/);
});

/* ── the live demo is the bare 3D graph: no card, no 2D ─────────── */

const DEMO = './HowItWorksDemo.tsx';

test('the demo renders only the 3D graph, with no card chrome', () => {
  const source = code(DEMO);
  assert.match(
    source,
    /lazy\(\(\) => import\('\.\.\/Studio\/Curve3DViewer'\)\)/,
    'the demo lazily loads the shared 3D viewer',
  );
  assert.match(source, /<Curve3DViewer/, 'the demo renders the viewer');
  assert.doesNotMatch(source, /HowItWorksLeftCard|HowItWorksRightCard/, 'no card components remain');
  assert.doesNotMatch(source, /panel/, 'no card panel class');
  assert.doesNotMatch(source, /2D Graph|2d/, 'no 2D view anywhere');
  assert.doesNotMatch(source, /onViewChange|setView/, 'no view toggle');
  assert.doesNotMatch(source, /Play|Reset/, 'no play/reset controls — the graph alone');
});

test('the bare demo has no audio wiring or preset chips', () => {
  const source = code(DEMO);
  assert.doesNotMatch(source, /audioEngine/, 'no audio engine in the bare demo');
  assert.doesNotMatch(source, /HOW_IT_WORKS_PRESETS/, 'no preset chips');
  assert.doesNotMatch(source, /useState/, 'no demo state — the curve is fixed');
});