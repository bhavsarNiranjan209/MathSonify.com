/**
 * Offline + 503 — the error pages that complete the set.
 *
 * The offline page is the one a visitor reaches when the network is gone,
 * so it must survive with nothing else: no layout, no stylesheet bundle,
 * no JavaScript bundle. It is built to the user's own design, pixel for
 * pixel — the exact colours, the wave canvas that breaks at the gap, the
 * "The signal dropped." headline — with the preview-only controls removed
 * and real online/offline detection in their place. These tests pin exactly
 * that: the design is intact, the preview is gone, the worker serves the
 * page on a failed navigation and caches the fonts so the typography
 * survives with no network, and the 503 is a real maintenance page rather
 * than a copy of the 500.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const read = (p: string) => readFileSync(src(p), 'utf8');

/** Comments stripped: prose that documents a rule necessarily names the rule. */
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\/[^\n]*/g, '');

test('the service worker exists and precaches the offline page', () => {
  const swPath = src('../../public/sw.js');
  assert.ok(existsSync(swPath), 'public/sw.js is missing');
  const sw = read('../../public/sw.js');
  // A versioned cache name, so a changed offline page can evict the old one.
  assert.match(sw, /const CACHE = 'mathsonify-v\d+';/, 'worker must use a versioned cache name');
  assert.match(sw, /OFFLINE_URL = '\/offline\/'/, 'worker must know the offline page URL');
  assert.match(
    sw,
    /PRECACHE = \[OFFLINE_URL, '\/', '\/studio', '\/guess', '\/favicon\.jpeg'\]/,
    'worker must precache the offline page, home, Studio, Guess and the favicon',
  );
  assert.match(sw, /cache\.add\(url\)/, 'worker must cache each precache URL');
});

test('the worker serves the offline page when a navigation fails', () => {
  const sw = read('../../public/sw.js');
  assert.match(sw, /request\.mode === 'navigate'/, 'worker must treat navigations specially');
  assert.match(sw, /fetch\(request\)\.catch\(\(\) => caches\.match\(OFFLINE_URL/, 'a failed navigation must fall back to the offline page');
  // A 404 is a real response, not a failure — the custom 404 must still show.
  assert.doesNotMatch(sw, /response\.status === 404/, 'worker must not hijack 404 responses');
});

test('the worker is careful about what it caches', () => {
  const sw = read('../../public/sw.js');
  assert.match(sw, /request\.method !== 'GET'/, 'worker must ignore non-GET requests');
  assert.match(sw, /url\.origin !== self\.location\.origin/, 'worker must ignore other origins');
  assert.match(sw, /response\.ok/, 'worker must only cache successful responses');
  assert.match(sw, /!url\.search/, 'worker must never store query-string requests (probes would pile up)');
  assert.match(sw, /self\.skipWaiting\(\)/, 'worker must take over without a second visit');
  assert.match(sw, /self\.clients\.claim\(\)/, 'worker must control already-open tabs');
});

test('the worker caches Google Fonts and no other external origin', () => {
  const sw = read('../../public/sw.js');
  // The offline page's typography comes from Google Fonts, so the worker
  // must cache the stylesheet and the font files — cache-first, so the
  // page renders in its real fonts with no network.
  assert.match(sw, /fonts\.googleapis\.com/, 'worker must cache the Google Fonts stylesheet');
  assert.match(sw, /fonts\.gstatic\.com/, 'worker must cache the Google Fonts files');
  assert.match(sw, /FONT_HOSTS/, 'worker must name the font hosts explicitly');
  assert.doesNotMatch(
    code(sw),
    /https?:\/\/(?!fonts\.googleapis\.com|fonts\.gstatic\.com)/,
    'worker must not fetch any external origin except Google Fonts',
  );
});

test('the offline page is the user design, colours and fonts intact', () => {
  const page = read('../pages/offline.astro');
  // The exact design tokens — dark #0A0A0C, light #F3F1EB.
  assert.match(page, /--bg:#0A0A0C/, 'offline page must use the design dark background');
  assert.match(page, /--bg:#F3F1EB/, 'offline page must use the design light background');
  assert.match(page, /--warn:#FF8A80/, 'offline page must use the design dark warn');
  assert.match(page, /--warn:#D6453D/, 'offline page must use the design light warn');
  // The exact fonts, loaded from Google Fonts and cached by the worker.
  assert.match(page, /fonts\.googleapis\.com\/css2\?family=Instrument\+Serif/, 'offline page must load Instrument Serif');
  assert.match(page, /family=JetBrains\+Mono/, 'offline page must load JetBrains Mono');
  assert.match(page, /family=Inter/, 'offline page must load Inter');
  // The exact layout: logo + theme toggle, pill, headline, stage, actions, works, footer.
  assert.match(page, /MathSonify\.com/, 'offline page must carry the logo');
  assert.match(page, /The signal <em>dropped\.<\/em>/, 'offline page must carry the design headline');
  assert.match(page, /id="cv"/, 'offline page must have the wave canvas');
  assert.match(page, /id="mid">no route</, 'offline page must have the "no route" label');
  assert.match(page, /your device · f\(x\) = sin\(x\)/, 'offline page must caption the device side');
  assert.match(page, /id="retry"/, 'offline page must have Try again');
  assert.match(page, /id="hear">♪ Hear the signal</, 'offline page must have Hear the signal');
  assert.match(page, /Still works, offline/, 'offline page must have the still-works card');
  assert.match(page, /Needs the internet/, 'offline page must have the needs-internet card');
  assert.match(page, /your equations are drawn on your device/, 'offline page must carry the design footer');
  assert.match(page, /rel="icon" href="\/favicon\.jpeg"/, 'offline page must link the favicon so the browser does not 404 /favicon.ico');
  assert.match(page, /prefers-reduced-motion/, 'offline page must respect reduced motion');
  // The "no route" label sits over the gap (58% across), not clipped off
  // the left edge as in the raw preview.
  assert.match(page, /\.mid\{[^}]*left:58%/, 'the "no route" label must be anchored over the gap');
});

test('the offline page has no preview controls left in it', () => {
  const page = read('../pages/offline.astro');
  const clean = code(page);
  assert.doesNotMatch(clean, /class="dev"/, 'offline page must not ship the preview-controls box');
  assert.doesNotMatch(clean, /dCache|dNet/, 'offline page must not ship the simulate buttons');
  assert.doesNotMatch(clean, /Simulate:/, 'offline page must not offer a simulate toggle');
  assert.doesNotMatch(clean, /preview controls/, 'offline page must not mention preview controls');
});

test('the offline page uses real online detection, not a toggle', () => {
  const page = read('../pages/offline.astro');
  assert.match(page, /navigator\.onLine/, 'offline page must read the real online state');
  assert.match(page, /addEventListener\('online'/, 'offline page must notice the network coming back');
  assert.match(page, /addEventListener\('offline'/, 'offline page must notice the network dropping');
  // Coming back online returns the visitor to the URL they wanted.
  assert.match(page, /window\.location\.reload\(\)/, 'coming back online must reload to the wanted URL');
  // Try again is a real connectivity check, not a timed fake. The query
  // string matters: the worker precaches /favicon.jpeg, so a plain fetch
  // would succeed from cache even with no network.
  assert.match(page, /fetch\('\/favicon\.jpeg\?probe='/, 'retry must fetch a cache-busting probe');
  assert.match(page, /AbortController/, 'retry must time out instead of hanging');
  assert.match(page, /stage.*shake|classList\.add\('shake'\)/, 'a failed retry must shake the stage');
});

test('the offline page offers real ways out', () => {
  const page = read('../pages/offline.astro');
  assert.doesNotMatch(page, /href="#"/, 'offline page must not have dead links');
  assert.doesNotMatch(page, /onclick="return false"/, 'offline page must not disable its own links');
  assert.match(page, /href="\/studio"/, 'Open the Studio must be a real link to /studio');
  assert.match(page, /id="retry"/, 'offline page must offer a retry');
});

test('the offline page keeps the theme in step with the site', () => {
  const page = read('../pages/offline.astro');
  assert.match(page, /mathsonify-theme/, 'offline page must reuse the saved theme key');
  assert.match(page, /localStorage\.setItem\('mathsonify-theme'/, 'the theme toggle must persist the choice');
  assert.match(page, /<style is:inline>/, 'offline page must inline its CSS');
  assert.match(page, /noindex, nofollow/, 'offline page must stay out of search results');
});

test('the 503 is a maintenance page, not a copy of the 500', () => {
  const maint = read('../pages/503.astro');
  const broken = read('../pages/500.astro');
  assert.notEqual(maint, broken, '503 must not be a copy of the 500');
  assert.match(maint, /BaseLayout/, '503 must use the shared layout');
  assert.match(maint, /noindex/, '503 must stay out of search results');
  assert.match(maint, /Taking a short breather/, '503 must say the site is resting, not broken');
  assert.match(maint, /maint-wave/, '503 must have its own settling-wave visual');
  assert.doesNotMatch(maint, /err-fault/, '503 must not reuse the 500 clipping fault');
  assert.match(maint, /href="\/"/, '503 must offer a way home');
  assert.match(maint, /prefers-reduced-motion/, '503 must respect reduced motion');
});

test('the service worker is registered in production only', () => {
  const layout = read('../layouts/BaseLayout.astro');
  assert.match(layout, /import\.meta\.env\.PROD/, 'registration must be gated on production builds');
  assert.match(layout, /navigator\.serviceWorker\.register\('\/sw\.js'\)/, 'layout must register the worker');
  assert.match(layout, /window\.addEventListener\('load'/, 'registration must wait for load so it never delays first paint');
});

test('utility pages stay out of the sitemap', () => {
  const sitemap = read('../../public/sitemap.xml');
  assert.doesNotMatch(sitemap, /\/offline/, 'offline page must not be in the sitemap');
  assert.doesNotMatch(sitemap, /\/503/, '503 page must not be in the sitemap');
});
