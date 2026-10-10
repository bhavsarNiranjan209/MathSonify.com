/**
 * Startup contract, written after the second "Studio is blank" report.
 *
 * Two failure modes were worth defending against, and both are invisible to a
 * normal unit test because they live in inline HTML script and in render
 * wiring rather than in exported functions:
 *
 *   1. The preloader is `position:fixed; inset:0; z-index:9999` over an opaque
 *      background. It had exactly one dismissal path, guarded by an early
 *      `if (!wave) return;` — so a missing decorative element could skip the
 *      only setTimeout that removed it and strand an opaque overlay over a
 *      perfectly rendered Studio. The visitor calls that "blank".
 *
 *   2. The Studio is a `client:only` island, so Astro ships no markup for it.
 *      Any throw during render unmounts the island and leaves an empty page
 *      unless a boundary catches it.
 *
 * These are source-level assertions in the same style as `graphPanel.test.ts`;
 * the browser-side proof lives in `scripts/verify-studio-mounts.mjs`.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

/** Comments stripped: prose that documents a rule necessarily names the rule. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const inlineScripts = (path: string) =>
  [...read(path).matchAll(/<script is:inline>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

/** The boot script — the one that owns `sc-preloader`. */
const boot = () => {
  const found = inlineScripts('./BaseLayout.astro').find((s) => s.includes('sc-preloader'));
  assert.ok(found, 'the preloader boot script must exist');
  return code(found!);
};

test('the preloader cannot stay visible past the failsafe', () => {
  const clean = boot();

  // An absolute, unconditional cap on how long the overlay may exist.
  assert.match(clean, /var MOUNT_TIMEOUT_MS = 8000;/, 'there must be a hard 8s ceiling');
  assert.match(
    clean,
    /setTimeout\(function \(\) \{\s*dismiss\('startup-timeout-/,
    'the failsafe must remove the overlay unconditionally',
  );

  // ...armed BEFORE the decorative builder, which is where the old code
  // returned out of the whole IIFE and never reached its only setTimeout.
  const failsafeAt = clean.indexOf("dismiss('startup-timeout-");
  const builderAt = clean.indexOf('function buildLoaderArt');
  assert.ok(failsafeAt > 0, 'the failsafe registration must exist');
  assert.ok(builderAt > 0, 'the art builder must exist');
  assert.ok(
    failsafeAt < builderAt,
    'the failsafe must be registered before decoration can throw or return early',
  );

  // The wave guard is now scoped inside its own function, on a `try` it cannot
  // escape past — not on the path that arms dismissal.
  assert.match(clean, /function buildLoaderArt\(\) \{ try \{/);
  const guardAt = clean.indexOf('if (!wave) return');
  assert.ok(guardAt > builderAt, 'the wave guard must live inside buildLoaderArt');
});

test('dismissal has independent paths, never a single one', () => {
  const clean = boot();

  // Path 1: the island itself, observed AND polled.
  assert.match(clean, /new MutationObserver/);
  assert.match(clean, /allIslandsMounted\(\)\)\s*\{\s*state\.mounted = true/);

  // Path 2: DOMContentLoaded re-arms everything.
  assert.match(clean, /addEventListener\('DOMContentLoaded'/);

  // Path 3: the cosmetic window for pages that have nothing to wait for.
  assert.match(clean, /setTimeout\(function \(\) \{ dismiss\('cosmetic-cap'\); \}, 2800\)/);

  // Failure is loud, not silent: a visible panel, diagnostics, and a console
  // warning — because "nothing happened" is how this bug was reported twice.
  const html = read('./BaseLayout.astro');
  assert.match(html, /id="sc-startup-error"/, 'a visible failure panel must exist');
  assert.match(html, /id="sc-startup-diag"/, 'the panel must carry diagnostics');
  assert.match(html, /id="sc-startup-reload"/, 'the panel must offer a way out');
  assert.match(clean, /showStartupError\(/);
  assert.match(clean, /console\.warn\(/);
});

test('a throw inside the island shows a fallback, never a blank page', () => {
  // `client:only` means Astro ships the island element and nothing inside it,
  // so the boundary is the only thing between a render error and an empty page.
  const page = read('../pages/studio.astro');
  assert.match(page, /<Studio client:only="react" \/>/);

  const studio = read('../components/Studio.tsx');
  assert.match(studio, /<StudioErrorBoundary area="MathSonify Studio">/);
  assert.match(studio, /<StudioInner \/>/);

  const boundary = read('../components/Studio/StudioErrorBoundary.tsx');
  const clean = code(boundary);
  // The real error reaches the console...
  assert.match(boundary, /componentDidCatch/);
  assert.match(boundary, /console\.error/);
  // ...the visitor gets an explanation and a Reload button...
  assert.match(boundary, /Reload/);
  assert.match(boundary, /\{error\.message \|\| String\(error\)\}/);
  // ...and it renders that panel rather than giving up and returning nothing.
  assert.doesNotMatch(clean, /return null/);
});