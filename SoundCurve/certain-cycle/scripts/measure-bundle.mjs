/**
 * Bundle-size accounting for dist/_astro.
 *
 * Reports raw and gzipped bytes per asset plus totals, and can be diffed
 * against a saved baseline so a dependency's real cost is measured rather
 * than estimated. `three` in particular looks enormous by name but tree-shakes
 * to a fraction of it, so the number that matters is this one.
 *
 * Usage:
 *   node scripts/measure-bundle.mjs save baseline
 *   node scripts/measure-bundle.mjs diff baseline
 */
import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { gzipSync, brotliCompressSync, constants } from 'node:zlib';
import path from 'node:path';

const DIR = 'dist/_astro';
const ASSET_RE = /\.(js|mjs|css|woff2?|svg|jpg|jpeg|png|webp)$/i;

function walk(dir) {
  return readdirSync(dir).flatMap((e) => {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) return walk(full);
    return ASSET_RE.test(e) ? [full] : [];
  });
}

const files = walk(DIR);
const rows = files.map((f) => {
  const buf = readFileSync(f);
  return {
    file: path.basename(f),
    raw: buf.length,
    gz: gzipSync(buf, { level: 9 }).length,
    br: brotliCompressSync(buf, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
}).sort((a, b) => b.gz - a.gz);

const totals = rows.reduce(
  (acc, r) => ({
    raw: acc.raw + r.raw,
    gz: acc.gz + r.gz,
    br: acc.br + r.br,
  }),
  { raw: 0, gz: 0, br: 0 },
);

const kb = (n) => (n / 1024).toFixed(1).padStart(8);
console.log('largest assets (gzip KB):');
for (const r of rows.slice(0, 12)) {
  console.log(`  ${kb(r.gz)}  gzip | ${kb(r.br)} br | ${kb(r.raw)} raw  ${r.file}`);
}
console.log(`\nTOTAL ${rows.length} assets: ${kb(totals.gz)} gzip | ${kb(totals.br)} brotli | ${kb(totals.raw)} raw`);

const snapshot = { rows, totals };

if (process.argv[2] === 'save') {
  const name = process.argv[3] || 'baseline';
  writeFileSync(`.bundle-${name}.json`, JSON.stringify(snapshot));
  console.log(`\nsaved baseline -> .bundle-${name}.json`);
}

if (process.argv[2] === 'diff') {
  const name = process.argv[3] || 'baseline';
  const file = `.bundle-${name}.json`;
  if (!existsSync(file)) {
    console.log(`\nno baseline at ${file} — run: node scripts/measure-bundle.mjs save ${name}`);
  } else {
    const base = JSON.parse(readFileSync(file, 'utf8'));
    const before = new Map(base.rows.map((r) => [r.file, r]));
    const after = new Map(rows.map((r) => [r.file, r]));

    const added = rows.filter((r) => !before.has(r.file));
    const removed = base.rows.filter((r) => !after.has(r.file));
    const grown = rows
      .filter((r) => before.has(r.file))
      .map((r) => ({ file: r.file, d: r.gz - before.get(r.file).gz }))
      .filter((x) => Math.abs(x.d) > 512);

    const d = totals.gz - base.totals.gz;
    console.log('\n— gzip delta vs baseline —');
    for (const a of added) console.log(`  +${kb(a.gz)}  NEW      ${a.file}`);
    for (const r of removed) console.log(`  -${kb(r.gz)}  REMOVED  ${r.file}`);
    for (const g of grown.sort((x, y) => y.d - x.d)) {
      console.log(`  ${g.d > 0 ? '+' : '-'}${kb(Math.abs(g.d))}  changed  ${g.file}`);
    }
    const sign = d > 0 ? '+' : d < 0 ? '' : ' ';
    console.log(`\nTOTAL gzip delta: ${sign}${(d / 1024).toFixed(1)} KB`);
    console.log(`TOTAL brotli delta: ${(((totals.br - base.totals.br) / 1024) || 0).toFixed(1)} KB`);
    console.log(`TOTAL raw delta: ${(((totals.raw - base.totals.raw) / 1024) || 0).toFixed(1)} KB`);
  }
}