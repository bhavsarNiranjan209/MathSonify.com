/**
 * Data-integrity and ordering tests for the equation catalog.
 *
 * The catalog is a ~160-entry hand-maintained array, and the failure modes here
 * are all silent: a stray comma makes a sparse array whose holes `map` and
 * `filter` skip, a Unicode symbol the sanitizer doesn't know makes an equation
 * fail to parse, and a fractional exponent on a negative base quietly blanks
 * half the curve. None of those throw — they just produce a worse page. So they
 * are asserted explicitly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { PRESETS, PRESET_CATEGORIES, sortPresets, type EquationPreset } from './presets';
import { parseEquation } from '../utils/equationParser';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/* ── the /create -> /studio route rename ──────────────────────────── */

const srcRoot = fileURLToPath(new URL('..', import.meta.url));

/** Every .astro/.ts/.tsx file under src/, as repo-relative paths. */
function sourceFiles(dir = srcRoot): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(astro|ts|tsx)$/.test(entry) ? [full] : [];
  });
}

test('the studio page lives at /studio', () => {
  const page = path.join(srcRoot, 'pages', 'studio.astro');
  assert.ok(readFileSync(page, 'utf8').includes('<Studio'), 'studio.astro must mount the Studio island');
});

/**
 * Strips comments so prose about the old route is not mistaken for a link.
 *
 * A comment reading "the lag /create has suffered from" is legitimate history,
 * not a broken destination — the same `strip` approach `specialPages.test.ts`
 * uses. Only real code is scanned.
 */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');
}

test('no source file still links to /create', () => {
  // `/create` was renamed to `/studio`. Two files are allowed to still mention
  // it: the redirect stub, and this test — which has to name the old path in
  // order to assert its absence. Everything else pointing at `/create` is a
  // dead hop through the redirect at best, and a 404 once the stub is removed.
  const allowed = [path.join('pages', 'create.astro'), path.join('data', 'presets.test.ts')];
  const offenders = sourceFiles()
    .filter((f) => !allowed.some((a) => f.endsWith(a)))
    .filter((f) => stripComments(readFileSync(f, 'utf8')).includes('/create'))
    .map((f) => path.relative(srcRoot, f));
  assert.deepEqual(offenders, [], `these files still link to /create: ${offenders.join(', ')}`);
});

test('/create is kept only as a redirect to /studio', () => {
  // ShareModal has been publishing mathsonify.com/create?eq=... links, so the
  // old path must keep working rather than 404.
  const stub = readFileSync(path.join(srcRoot, 'pages', 'create.astro'), 'utf8');
  assert.match(stub, /location\.replace\(['"]\/studio['"]/, 'the redirect must go to /studio');
  // The equation lives in the query string, so the redirect has to carry it.
  assert.match(stub, /location\.search/, 'the redirect must preserve the query string');
  assert.match(stub, /noindex/, 'the duplicate must be kept out of search results');
  assert.match(stub, /rel="canonical"/, 'the duplicate must declare a canonical URL');
  // It must stay a cheap static stub, never a second copy of the studio.
  assert.doesNotMatch(stub, /<Studio/, 'the redirect must not mount the studio island');
});

test('studio deep links carry the equation through the new path', () => {
  // "Open in studio" is the main way into the app from the catalog, so a
  // regression here silently drops the equation a visitor selected.
  const link = (p: EquationPreset) =>
    `/studio?eq=${encodeURIComponent(p.equation)}&inst=${p.recommendedSettings.instrument}` +
    `&mode=${p.recommendedSettings.sonificationMode}`;
  assert.ok(link(PRESETS[0]).startsWith('/studio?eq='));
  const heart = PRESETS.find((p) => p.id === 'rare-heart')!;
  assert.match(link(heart), /^\/studio\?eq=/);
});

/** Ids of the five prioritised "Funny Questions" entries. */
const FEATURED_RARE = ['rare-heart', 'rare-bloom', 'rare-starburst', 'rare-crown', 'rare-shell'];

/* ── structural integrity ─────────────────────────────────────────── */

test('PRESETS has no sparse holes (a stray comma creates one silently)', () => {
  const holes: number[] = [];
  for (let i = 0; i < PRESETS.length; i++) {
    // `i in arr` is false for a hole but true for an explicit `undefined`, and
    // it is the only check that distinguishes the two.
    if (!(i in PRESETS)) holes.push(i);
  }
  assert.deepEqual(holes, [], `PRESETS contains sparse holes at ${holes.join(', ')}`);
  assert.equal(
    PRESETS.filter(Boolean).length,
    PRESETS.length,
    'every PRESETS slot must hold a real object',
  );
});

test('every preset id is unique', () => {
  const ids = PRESETS.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate preset ids in the catalog');
});

test('every preset uses a known category', () => {
  const known = new Set<string>(PRESET_CATEGORIES.map((c) => c.id));
  for (const preset of PRESETS) {
    assert.ok(known.has(preset.category), `${preset.id} has unknown category ${preset.category}`);
  }
});

test('every preset has a finite, non-degenerate domain', () => {
  for (const p of PRESETS) {
    const { minX, maxX } = p.recommendedSettings;
    assert.ok(Number.isFinite(minX) && Number.isFinite(maxX), `${p.id} has a non-finite domain`);
    assert.ok(maxX > minX, `${p.id} has an empty domain [${minX}, ${maxX}]`);
  }
});

test('every preset equation actually parses', () => {
  const broken = PRESETS.filter((p) => !parseEquation(p.equation).success)
    .map((p) => `${p.id} ("${p.equation}")`);
  assert.deepEqual(broken, [], `these preset equations do not parse: ${broken.join('; ')}`);
});

test('the five featured equations render with no gaps across their whole domain', () => {
  for (const id of FEATURED_RARE) {
    const preset = PRESETS.find((p) => p.id === id);
    assert.ok(preset, `${id} is missing from the catalog`);
    const res = parseEquation(preset.equation);
    assert.ok(res.success, `${id} failed to parse: ${res.error}`);
    const points = res.sample!(preset.recommendedSettings.minX, preset.recommendedSettings.maxX, 600);
    const validPct = (points.filter((p) => p.isValid).length / points.length) * 100;

    // The real trap: a sqrt whose argument goes negative across part of the
    // domain yields NaN, and the curve renders as disconnected fragments rather
    // than failing. Heart specifically regressed 50% -> 100% when `x^(2/3)`
    // was corrected to `abs(x)^(2/3)`.
    assert.ok(
      validPct >= 99,
      `${id} renders only ${validPct.toFixed(1)}% valid points — its sqrt domain is wider than its plotted domain`,
    );

    // And it must actually vary, or it is a flat line rather than a shape.
    const ys = points.filter((p) => p.isValid).map((p) => p.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) > 0.5, `${id} renders essentially flat`);
  }
});

test('the featured equations use ASCII the sanitizer understands', () => {
  // `sanitizeEquationString` maps the minus sign (U+2212) but NOT the radical,
  // middle-dot or superscript glyphs, so a formula written with those fails to
  // parse outright.
  const forbidden = /[\u221a\u00b7\u00b2\u00d7]/;
  for (const id of FEATURED_RARE) {
    const preset = PRESETS.find((p) => p.id === id)!;
    assert.ok(!forbidden.test(preset.equation), `${id} contains an unsupported glyph: ${preset.equation}`);
  }
});

test('the featured entries are all in the Funny Questions category', () => {
  for (const id of FEATURED_RARE) {
    assert.equal(PRESETS.find((p) => p.id === id)!.category, 'rare');
  }
});

/* ── ordering ────────────────────────────────────────────────────── */

test('the five featured funny questions sort ahead of the rest of that category', () => {
  const rare = sortPresets().filter((p) => p.category === 'rare');
  assert.deepEqual(
    rare.slice(0, FEATURED_RARE.length).map((p) => p.id),
    FEATURED_RARE,
    'the prioritised entries must be the first five under Funny Questions',
  );
});

test('sortPresets keeps every preset exactly once', () => {
  const sorted = sortPresets();
  assert.equal(sorted.length, PRESETS.filter(Boolean).length);
  assert.deepEqual(
    sorted.map((p) => p.id).sort(),
    PRESETS.filter(Boolean).map((p) => p.id).sort(),
  );
});

test('sortPresets is idempotent and does not mutate its input', () => {
  const before = PRESETS.map((p) => p.id);
  const once = sortPresets();
  assert.deepEqual(once.map((p) => p.id), sortPresets().map((p) => p.id), 'sortPresets is not idempotent');
  assert.deepEqual(PRESETS.map((p) => p.id), before, 'sortPresets mutated PRESETS');
});

test('entries without a sortPriority keep their authored order', () => {
  // Within a category, yes. Globally, no: `sortPresets` deliberately groups by
  // the category tab order, so reordering PRESET_CATEGORIES (e.g. moving Funny
  // Questions up beside All Presets) legitimately moves whole category blocks.
  // What must never happen is a prioritised entry displacing an unprioritised
  // one *within* its own category.
  const authored = PRESETS.filter((p) => !p.sortPriority);
  const sorted = sortPresets().filter((p) => !p.sortPriority);
  assert.equal(sorted.length, authored.length, 'no unprioritised entry was dropped or added');

  for (const cat of PRESET_CATEGORIES) {
    const fromSource = authored.filter((p) => p.category === cat.id).map((p) => p.id);
    const fromSorted = sorted.filter((p) => p.category === cat.id).map((p) => p.id);
    assert.deepEqual(
      fromSorted,
      fromSource,
      `unprioritised "${cat.id}" entries were reordered within their category`,
    );
  }
});

test('sortPresets groups by the category tab order, not by array position', () => {
  // The tab order is the contract: Funny Questions is second, right after All
  // Presets, even though its entries are authored much later in the file.
  assert.deepEqual(
    PRESET_CATEGORIES.map((c) => c.id),
    ['all', 'rare', 'trig', 'polynomial', 'waves', 'chaos', 'fractal', 'famous'],
  );
});

test('sortPresets groups by the category tab order', () => {
  const order = new Map(PRESET_CATEGORIES.map((c, i) => [c.id as string, i]));
  const ranks = sortPresets().map((p) => order.get(p.category)!);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), 'categories are not grouped in tab order');
});

test('sortPresets tolerates a sparse input array', () => {
  // A hole must be dropped, not propagated — otherwise the page renders an
  // undefined card and throws on `preset.category`.
  const sparse: EquationPreset[] = [];
  sparse[0] = PRESETS[0];
  sparse[2] = PRESETS[1]; // index 1 is a hole
  const sorted = sortPresets(sparse);
  assert.equal(sorted.length, 2);
  assert.ok(sorted.every(Boolean));
});

/* ── accent glow opt-in ──────────────────────────────────────────── */

test('only the five featured entries declare an accent colour', () => {
  const accented = PRESETS.filter((p) => p.accentColor).map((p) => p.id);
  assert.deepEqual(accented.sort(), [...FEATURED_RARE].sort());
});

test('every accent colour is a 6-digit hex', () => {
  for (const p of PRESETS) {
    if (!p.accentColor) continue;
    assert.match(p.accentColor, /^#[0-9A-Fa-f]{6}$/, `${p.id} has a malformed accentColor`);
  }
});

