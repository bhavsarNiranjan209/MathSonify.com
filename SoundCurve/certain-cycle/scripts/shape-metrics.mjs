/**
 * Objective metrics for catalog equation candidates (dev tool, not shipped).
 *
 * The ASCII grid in verify-shapes.mjs aliases badly for dense curves (600
 * samples squeezed into ~58 columns), so "does this look like a Heart?" cannot
 * be answered by eye alone. These metrics give an objective basis:
 *
 *   valid%      fraction of the domain that yields a plottable point
 *   yRange      amplitude — catches near-flat curves that look like nothing
 *   turns       local extrema count — distinguishes a real shape from a wobble
 *   evenSym     1.0 = mirror-symmetric about x=0 (most named shapes want this)
 *   oddSym      1.0 = point-symmetric (odd function, e.g. an hourglass)
 *   asym         1 - max(best evenSym, best oddSym); high = genuinely lopsided
 *
 * Usage: node --import ./scripts/ts-resolve.mjs scripts/shape-metrics.mjs <shapes.json>
 */
import { readFileSync } from 'node:fs';
import { parseEquation } from '../src/utils/equationParser.ts';

const CANDIDATES = JSON.parse(readFileSync(process.argv[2], 'utf8').replace(/^﻿/, ''));

/** Mean |a - (±b)| over mirrored samples, normalised by the y range. */
function symmetry(ys, sign) {
  const n = ys.length;
  const mid = (n - 1) / 2;
  let err = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const j = Math.round(2 * mid - i);
    if (j < 0 || j >= n || j <= i) continue;
    err += Math.abs(ys[i] - sign * ys[j]);
    count++;
  }
  if (!count) return 1;
  const range = Math.max(...ys) - Math.min(...ys) || 1;
  return 1 - Math.min(1, err / count / range);
}

const rows = [];
for (const c of CANDIDATES) {
  const res = parseEquation(c.eq);
  if (!res.success || !res.sample) {
    rows.push({ name: c.name, note: 'PARSE FAILED' });
    continue;
  }
  const pts = res.sample(c.minX, c.maxX, 2000);
  const valid = pts.filter((p) => p.isValid);
  const ys = valid.map((p) => p.y);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);

  // Local extrema (with a small deadband so float noise is not counted).
  const deadband = (hi - lo) * 0.02;
  let turns = 0;
  let dir = 0;
  for (let i = 1; i < ys.length; i++) {
    const d = Math.sign(ys[i] - ys[i - 1]);
    if (d === 0 || Math.abs(ys[i] - ys[i - 1]) < deadband) continue;
    if (dir !== 0 && d !== dir) turns++;
    dir = d;
  }

  const even = symmetry(ys, 1);
  const odd = symmetry(ys, -1);
  rows.push({
    name: c.name,
    valid: Math.round((valid.length / pts.length) * 100),
    yRange: +(hi - lo).toFixed(2),
    turns,
    evenSym: +even.toFixed(2),
    oddSym: +odd.toFixed(2),
    asym: +(1 - Math.max(even, odd)).toFixed(2),
  });
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('shape', 22) + pad('valid%', 8) + pad('yRange', 9) + pad('turns', 8) +
  pad('evenSym', 9) + pad('oddSym', 9) + 'asym',
);
for (const r of rows) {
  if (r.note) { console.log(pad(r.name, 22) + r.note); continue; }
  const flag = r.asym > 0.35 ? '  <- lopsided' : '';
  console.log(
    pad(r.name, 22) + pad(r.valid + '%', 8) + pad(r.yRange, 9) + pad(r.turns, 8) +
    pad(r.evenSym, 9) + pad(r.oddSym, 9) + r.asym + flag,
  );
}
