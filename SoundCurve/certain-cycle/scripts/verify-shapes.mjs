/**
 * Shape verification harness for catalog equations (dev tool, not shipped).
 *
 * Plots an equation through the REAL parser + sampler the app uses, then
 * renders it as ASCII so the silhouette can actually be looked at instead of
 * trusted. Also reports the valid-point fraction, which is the number that
 * catches the classic trap here: a sqrt domain that goes imaginary across half
 * the plotted range, so the curve silently renders as a gap.
 *
 * Usage: node --import ./scripts/ts-resolve.mjs scripts/verify-shapes.mjs <shapes.json>
 */
import { readFileSync } from 'node:fs';
import { parseEquation } from '../src/utils/equationParser.ts';

const COLS = Number(process.env.GRID_COLS || 74);
const ROWS = Number(process.env.GRID_ROWS || 24);

/** @type {Array<{name:string, eq:string, minX:number, maxX:number}>} */
// PowerShell 5.1's `Set-Content -Encoding UTF8` prepends a BOM, which JSON.parse
// rejects — strip it so the harness works with files written either way.
const CANDIDATES = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));

function plot(points) {
  const valid = points.filter((p) => p.isValid);
  if (valid.length === 0) return { art: ['(no valid points)'], min: 0, max: 0 };
  const min = Math.min(...valid.map((p) => p.y));
  const max = Math.max(...valid.map((p) => p.y));
  const span = max - min || 1;
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(' '));

  for (const p of points) {
    if (!p.isValid) continue;
    const cx = Math.round(((p.x - points[0].x) / (points[points.length - 1].x - points[0].x)) * (COLS - 1));
    const cy = Math.round((1 - (p.y - min) / span) * (ROWS - 1));
    if (grid[cy]) grid[cy][cx] = '*';
  }
  return { art: grid.map((r) => r.join('')), min, max };
}

let failures = 0;
for (const c of CANDIDATES) {
  const res = parseEquation(c.eq);
  if (!res.success || !res.sample) {
    console.log(`\n### ${c.name}\n  eq: ${c.eq}\n  PARSE FAILED: ${res.error}`);
    failures++;
    continue;
  }
  const points = res.sample(c.minX, c.maxX, 600);
  const validPct = Math.round((points.filter((p) => p.isValid).length / points.length) * 100);
  const { art, min, max } = plot(points);
  console.log(`\n### ${c.name}\n  eq: ${c.eq}\n  domain: [${c.minX}, ${c.maxX}]  valid: ${validPct}%  y: [${min.toFixed(2)}, ${max.toFixed(2)}]`);
  for (const row of art) console.log('  |' + row + '|');
  if (validPct < 90) {
    console.log(`  !! LOW VALID FRACTION (${validPct}%) — curve will render with gaps`);
    failures++;
  }
}
console.log(`\n${CANDIDATES.length - failures}/${CANDIDATES.length} rendered without gaps.`);
