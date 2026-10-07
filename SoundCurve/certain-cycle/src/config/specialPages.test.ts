import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The five special states — 404, 500, and the three feature "building" pages.
 *
 * These pages are the ones a visitor reaches when something is wrong, and they
 * must never be the thing that is broken. These tests assert the properties
 * that matter: they are distinct from each other, they use the one global
 * theme, they are genuinely lightweight, and their CTAs are real links.
 */

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

const PAGES = {
  notFound: '../pages/404.astro',
  serverError: '../pages/500.astro',
  building: '../components/FeatureBuildingState.astro',
};

test('all five special states exist', () => {
  for (const p of Object.values(PAGES)) {
    assert.ok(existsSync(src(p)), `${p} is missing`);
  }
  for (const p of ['../pages/soundlab.astro', '../pages/draw.astro', '../pages/music-lab.astro']) {
    assert.ok(existsSync(src(p)), `${p} is missing`);
  }
});

test('404 and 500 are genuinely different pages, not copies', () => {
  const notFound = read(PAGES.notFound);
  const serverError = read(PAGES.serverError);
  // Shared shell is fine; the *visual state* and the copy must differ.
  assert.notEqual(notFound, serverError);
  assert.match(serverError, /err-fault/, '500 should show a clipping fault, not a missing curve');
  assert.notEqual(notFound.includes('err-fault'), true, '404 should not use the 500 visual');
});

test('both error pages declare themselves noindex-free/appropriate and theme-agnostic', () => {
  // Both must run through the one BaseLayout, never a bespoke theme.
  for (const p of [PAGES.notFound, PAGES.serverError]) {
    const source = read(p);
    assert.match(source, /BaseLayout/, `${p} must use the shared layout`);
    assert.doesNotMatch(source, /data-theme=['"]dark['"]|dataset\.theme\s*=/, `${p} must not set its own theme`);
  }
});

test('the 500 is self-contained so it renders when assets fail', () => {
  const source = read(PAGES.serverError);
  // A 500 often means a static asset is what broke, so the critical layout and
  // the theme tokens must be inline rather than in an external stylesheet.
  assert.match(source, /<style is:inline>/, '500 must inline its critical CSS');
  assert.match(source, /--sc-accent/, '500 must inline the theme tokens');
});

test('special pages never hardcode theme colours', () => {
  // A literal #FFFFFF stroke is invisible on the light background, and a
  // fixed grey fails contrast in one theme or the other. Every colour on these
  // pages must come from the shared --sc-* tokens so both modes are correct.
  // Comments are stripped first so prose may still mention a hex value.
  const strip = (s: string) => s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

  const pages = [
    PAGES.notFound,
    PAGES.serverError,
    PAGES.building,
    '../pages/soundlab.astro',
    '../pages/draw.astro',
  ];

  for (const p of pages) {
    const code = strip(read(p));
    // Hex literals in fill/stroke/color, and inline rgb()/rgba() literals.
    assert.doesNotMatch(
      code,
      /(?:fill|stroke|color)\s*[:=]\s*["']?#(?:fff|ffffff|f2f2f0|ede|8e949a|ae)/i,
      `${p} hardcodes a light/dark-only colour — use a --sc-* token instead`,
    );
    assert.doesNotMatch(
      code,
      /(?:fill|stroke|color)\s*[:=]\s*["']?rgba?\(\s*\d/i,
      `${p} hardcodes an rgb() colour — use a --sc-* token instead`,
    );
  }
});

test('the disabled half of a feature route is theme-clean', () => {
  // music-lab.astro carries BOTH branches: the lightweight "being built"
  // state (disabled) and the legacy unreleased app (enabled). Only the
  // building state is user-facing today, so only that half is held to the
  // token rule — the unreleased app keeps its original palette until it is
  // rebuilt, and it ships no code at all while the flag is false.
  const source = read('../pages/music-lab.astro');
  const guard = source.indexOf(') : (');
  assert.ok(guard > 0, 'expected the enabled branch to start at ") : ("');
  const disabledBranch = source.slice(0, guard);
  assert.match(disabledBranch, /FeatureBuildingState/);
  assert.doesNotMatch(
    disabledBranch,
    /(?:fill|stroke|color)\s*[:=]\s*["']?#(?:fff|ffffff|8e949a)/i,
    'the disabled music-lab branch must not hardcode a theme colour',
  );
});

test('the 404 curve is drawn with a theme token, not literal white', () => {
  const source = read(PAGES.notFound);
  // The signature moment of this page is the curve that runs off the graph. If
  // it is stroked in #FFFFFF it disappears entirely in light mode.
  assert.match(source, /id="c-left"[^>]*stroke="rgb\(var\(--sc-ink\)\)"/);
  assert.match(source, /id="c-right"[^>]*stroke="rgb\(var\(--sc-ink\)\)"/);
  assert.doesNotMatch(source, /stroke="#FFFFFF"/);
});

test('error pages respect reduced motion and keep a visible state', () => {
  const source = read(PAGES.serverError);
  assert.match(source, /prefers-reduced-motion/, '500 must respect reduced motion');
  assert.match(source, /err-signal[^{]*\{[^}]*opacity/, 'reduced motion must leave the signal visible');
});

test('every error-page CTA is a real, non-empty destination', () => {
  for (const p of [PAGES.notFound, PAGES.serverError]) {
    const source = read(p);
    // No placeholder or dead links.
    assert.doesNotMatch(source, /href="#"/, `${p} has a dead link`);
    assert.match(source, /href="\/"/, `${p} must offer a way home`);
  }
  // The 404 offers the Studio as a second route into the product.
  assert.match(read(PAGES.notFound), /href="\/studio"/);
});

test('the 404 states that the path does not exist, in the brand voice', () => {
  const source = read(PAGES.notFound);
  assert.match(source, /undefined/i, '404 should express an undefined result');
  assert.doesNotMatch(source, /Page Not Found/i, '404 must not be a generic template');
});

test('the shared building component covers all three features with distinct copy', () => {
  const source = read(PAGES.building);
  for (const key of ['soundLab', 'draw', 'musicLab']) {
    assert.ok(source.includes(`${key}:`), `building state is missing the "${key}" entry`);
  }
  // Distinct headlines, so the three pages are not interchangeable.
  const headlines = [...source.matchAll(/title:\s*'([^']+)'/g)].map((m) => m[1]);
  assert.equal(headlines.length, 3, 'expected one headline per feature');
  assert.equal(new Set(headlines).size, 3, 'the three building pages must not share a headline');
});

test('building states are dependency-free and reduced-motion aware', () => {
  const source = read(PAGES.building);
  // No React island, no canvas loop, no heavy runtime on a teaser page.
  // Matched against code only: the word "requestAnimationFrame" appears in a
  // comment explaining that this page deliberately avoids it.
  const code = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(code, /requestAnimationFrame/, 'building state must not run an rAF loop');
  assert.doesNotMatch(code, /<canvas/i, 'building state must not use a canvas');
  assert.doesNotMatch(code, /<script/i, 'building state must not need JavaScript');
  assert.match(source, /prefers-reduced-motion/, 'building state must respect reduced motion');
  // A real home link, and no fake "Try Now" on an unreleased feature.
  assert.match(source, /href="\/"/, 'building state must offer a way home');
  assert.doesNotMatch(source, /Try Now/i, 'an unreleased feature must not offer a preview');
});

test('building pages use the one global theme, never their own', () => {
  const source = read(PAGES.building);
  assert.doesNotMatch(source, /draw-theme|soundlab-theme|musiclab-theme/);
  // Colours come from the shared tokens.
  assert.match(source, /var\(--sc-accent\)|var\(--sc-live\)/);
});

test('each building page renders its own feature id through the guard', () => {
  const routes = {
    '../pages/soundlab.astro': 'soundLab',
    '../pages/draw.astro': 'draw',
    '../pages/music-lab.astro': 'musicLab',
  };
  for (const [page, feature] of Object.entries(routes)) {
    const source = read(page);
    assert.match(source, /FeatureBuildingState/, `${page} must use the shared building component`);
    assert.match(source, new RegExp(`feature="${feature}"`), `${page} must pass "${feature}"`);
    assert.match(source, /noindex/, `${page} must be noindex while unreleased`);
  }
});
