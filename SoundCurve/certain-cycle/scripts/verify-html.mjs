/**
 * Post-build check of the rendered Equations catalog (dev tool, not shipped).
 * Reads dist/equations/index.html and asserts the things a unit test on the
 * data layer cannot: that Astro actually emitted the cards, in the right order,
 * with the glow only where intended, and that "Open in studio" links carry a
 * URL-encoded equation that round-trips back to the original string.
 *
 * Usage: node scripts/verify-html.mjs
 */
import { readFileSync, readdirSync } from 'node:fs';
import { PRESETS } from '../src/data/presets.ts';

const html = readFileSync('dist/equations/index.html', 'utf8');
let failures = 0;
const check = (ok, msg) => {
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${msg}`);
  if (!ok) failures++;
};

// Cards, in DOM order.
const cards = [...html.matchAll(/class="equation-card[^"]*"[\s\S]*?data-category="([^"]+)"[\s\S]*?<h3[^>]*>([^<]*)<\/h3>/g)]
  .map((m) => ({ category: m[1], name: m[2] }));
console.log(`Cards rendered: ${cards.length} (expected ${PRESETS.filter(Boolean).length})`);
check(cards.length === PRESETS.filter(Boolean).length, 'every preset rendered exactly one card');

const rare = cards.filter((c) => c.category === 'rare').map((c) => c.name);
console.log('First 8 under Funny Questions:', rare.slice(0, 8).join(' | '));
check(
  JSON.stringify(rare.slice(0, 5)) === JSON.stringify(['Heart', 'Bloom', 'Starburst', 'Crown', 'Shell']),
  'the five prioritised entries are first under Funny Questions',
);

// Glow: exactly five, one per accent. The accent is emitted as a custom
// property (box-shadow cannot be animated), and the breathing is CSS.
const accented = [...html.matchAll(/class="equation-card[^"]*equation-card--glow[^"]*"[\s\S]*?--card-accent:\s*(#[0-9A-F]{6})/g)]
  .map((m) => m[1]);
console.log('Glow cards found:', accented.join(' '));
check(accented.length === 5, 'exactly five cards carry the breathing glow class');
check(new Set(accented).size === 5, 'each glow uses a distinct accent colour');
check(
  accented.join(',') === '#E5484D,#F5A623,#9B6BFF,#2DD4BF,#38BDF8',
  'glow colours match the assigned accents in order',
);

// No glow leaked onto a card that has no accentColor.
const totalAccentProps = (html.match(/--card-accent:/g) || []).length;
check(totalAccentProps === 5, 'no non-accented card received an accent property');
check(
  (html.match(/equation-card--glow/g) || []).length === 5,
  'the glow class appears on exactly five cards',
);

// The breathing animation itself must be in the stylesheet, looping, with a
// cycle inside the requested 2.5-3s band. The CSS minifier rewrites the
// `animation` shorthand into its own attribute order, so match the whole
// declaration by name and pull the duration out of it rather than assuming a
// fixed `name duration …` layout.
const cssFiles = readdirSync('dist/_astro').filter((f) => f.endsWith('.css'));
const css = cssFiles.map((f) => readFileSync(`dist/_astro/${f}`, 'utf8')).join('\n');

function checkGlowAnim(name) {
  const decl = new RegExp(`animation:([^;}]*)\\b${name}\\b([^;}]*)`).exec(css);
  if (!decl) { check(false, `the ${name} animation declaration is present`); return; }
  const shorthand = decl[1] + decl[2];
  check(true, `the ${name} animation declaration is present`);
  check(/\binfinite\b/.test(shorthand), `${name} loops continuously`);
  const secs = parseFloat((/([\d.]+)s/.exec(shorthand) || [])[1]);
  check(
    secs >= 2.5 && secs <= 3,
    `${name} cycle is ${secs}s (must be 2.5-3s)`,
  );
}
checkGlowAnim('sc-card-glow-edge');
checkGlowAnim('sc-card-glow-halo');
check(/@keyframes\s+sc-card-glow-edge/.test(css), 'sc-card-glow-edge keyframes exist');
check(/@keyframes\s+sc-card-glow-halo/.test(css), 'sc-card-glow-halo keyframes exist');
check(
  /\.equation-card--glow\s*\{[^}]*isolation:\s*isolate/.test(css),
  'the glow card establishes a stacking context (keeps the halo behind the text)',
);

// Wavy chip: only the Funny Questions one, and only its border layer.
const wavyChips = (html.match(/chip--wavy/g) || []).length;
check(wavyChips === 1, 'exactly one chip carries the wavy treatment');
check((html.match(/class="chip-ripple"/g) || []).length === 1, 'exactly one chip-ripple layer');
check(
  /class="category-filter-btn[^"]*chip--wavy"[^>]*data-category="rare"/s.test(html),
  'the wavy chip is the Funny Questions (rare) one',
);
check(/filter:\s*url\(#sc-ripple\)/.test(css), 'the ripple layer references the SVG filter');
check(/<filter id="sc-ripple"/.test(html), 'the ripple filter is defined in the page');
check(/feTurbulence/.test(html) && /feDisplacementMap/.test(html),
  'the filter uses feTurbulence + feDisplacementMap');
// One-shot with a wavy resting state: frozen on a non-zero displacement.
// Astro serialises SVG children as `></animate>` rather than self-closing, so
// take a window of text around the id instead of assuming a tag shape.
const animIdx = html.indexOf('id="sc-ripple-map-anim"');
check(animIdx >= 0, 'the displacement scale is animated');
if (animIdx >= 0) {
  const a = html.slice(animIdx, animIdx + 500);
  check(/attributeName="scale"/.test(a), 'it animates the displacement scale');
  check(/fill="freeze"/.test(a), 'the ripple does not loop forever (fill=freeze)');
  check(/dur="2s"/.test(a), 'the ripple plays for ~2s');
  const values = /values="([^"]+)"/.exec(a)?.[1];
  const lastValue = values ? Number(values.trim().split(';').pop()) : NaN;
  check(
    Number.isFinite(lastValue) && lastValue > 0,
    `the ripple rests on a wavy final state (settles at scale ${values?.split(';').pop()}, not 0)`,
  );
  check(
    !/repeatCount|indefinite/.test(a),
    'the ripple is not declared to loop forever',
  );
}
const noiseIdx = html.indexOf('id="sc-ripple-noise-anim"');
check(noiseIdx >= 0, 'the turbulence frequency is animated too');
if (noiseIdx >= 0) {
  const a = html.slice(noiseIdx, noiseIdx + 300);
  check(/attributeName="baseFrequency"/.test(a), 'it animates baseFrequency');
  check(/fill="freeze"/.test(a), 'the turbulence settles rather than looping');
}
check(
  /if \(activeCategory === 'rare'\) playRipple\(\);/.test(html),
  'the ripple replays on click and on load-if-active',
);

// "Open in studio" round-trip. Astro HTML-escapes the `&` separators as `&amp;`,
// so the pattern has to match the escaped form.
const links = [...html.matchAll(/href="\/studio\?eq=([^&"]+)&amp;inst=([^&"]+)&amp;mode=([^&"]+)&amp;dur=([^&"]+)&amp;minX=([^&"]+)&amp;maxX=([^"]+)"/g)];
check(links.length === PRESETS.filter(Boolean).length, 'every card has an Open-in-studio link');
const FEATURED = ['rare-heart', 'rare-bloom', 'rare-starburst', 'rare-crown', 'rare-shell'];
for (const id of FEATURED) {
  const preset = PRESETS.find((p) => p.id === id);
  const link = links.find((l) => decodeURIComponent(l[1]) === preset.equation);
  const s = preset.recommendedSettings;
  check(!!link, `${id} link decodes back to the exact equation`);
  if (link) {
    const [, , inst, mode, dur, minX, maxX] = link;
    check(
      inst === s.instrument && mode === s.sonificationMode && Number(dur) === s.duration &&
        Number(minX) === s.minX && Number(maxX) === s.maxX,
      `${id} link carries its recommended settings (${inst}/${mode} ${dur}s [${minX}, ${maxX}])`,
    );
  }
}

console.log(failures === 0 ? '\nAll HTML checks passed.' : `\n${failures} HTML check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

