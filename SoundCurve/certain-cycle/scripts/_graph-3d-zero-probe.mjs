/**
 * GRAPH FIX step 1 — PROVE THE BUG (no app code changes).
 *
 * Question: in the CURRENT 3D viewer, do these three scene-Y values agree?
 *
 *   A. the X-axis LINE            (the horizontal line the curve should sit on)
 *   B. the curve at data y = 0    (where the curve crosses y = 0)
 *   C. the "0" TICK               (the label that says 0)
 *
 * They must be equal. If the axis line is at the floor while the curve's zero is
 * up in the middle of the box, the picture is lying about the maths.
 *
 * The probe reads the LIVE three.js scene (not a re-implementation): the page's
 * own `three` module instance is located from the transformed source of
 * Curve3DViewer.tsx, so `WebGLRenderer.prototype.render` is patched on the very
 * prototype the app uses and the next frame hands us the real scene.
 *
 * Within that scene we read:
 *   A. the widest horizontal 2-point LineSegments  -> the X-axis line
 *   C. the tick dash (2-point Line) that matches the live label sprite for the
 *      value 0, plus that sprite's own Y
 *   B. the curve's centreline Y at data y = 0, from the app's own layoutCurve,
 *      CROSS-CHECKED against the live tube's vertex cloud.
 *
 * Usage: node scripts/_graph-3d-zero-probe.mjs [--outdir <dir>]
 */
import { openCdp, sleep } from './_graph-gap-lib.mjs';
import fs from 'node:fs';

const BASE = 'http://localhost:4321';
const outDirIdx = process.argv.indexOf('--outdir');
const OUT = outDirIdx > -1 ? process.argv[outDirIdx + 1] : 'screenshots/graph';
fs.mkdirSync(OUT, { recursive: true });

/** The four cases from the brief. Domains are chosen so each one exercises a
 *  different y-range shape: symmetric, all-positive, all-negative, straddling. */
const CASES = [
  { name: 'sin(x)', eq: 'sin(x)', minX: -6.28, maxX: 6.28 },
  { name: 'x^3', eq: 'x^3', minX: -10, maxX: 10 },
  { name: 'e^x', eq: 'e^x', minX: -3, maxX: 3 },
  { name: '-x^2-1', eq: '-x^2-1', minX: -6, maxX: 6 },
];
const THEMES = ['dark', 'light'];

/**
 * The in-page probe. Runs in the browser, reads the live scene.
 * Returns plain JSON so it survives CDP's returnByValue.
 */
const PROBE = String.raw`
(async (equation, minX, maxX) => {
  const out = { equation, minX, maxX, errors: [] };
  try {
    // ── the app's OWN modules (served by the Vite dev server) ──
    const c3d    = await import('/src/utils/curve3d.ts');
    const c3dAx  = await import('/src/utils/curve3dAxes.ts');
    const parser = await import('/src/utils/equationParser.ts');

    // ── the app's OWN three instance ──
    // The component's transformed source names the resolved dep; importing that
    // exact URL yields the same module instance the viewer uses, so patching
    // WebGLRenderer.prototype.render really does capture the live frame.
    const src = await (await fetch('/src/components/Studio/Curve3DViewer.tsx')).text();
    const threeUrl = src.match(/from\s*["']([^"']*three[^"']*)["']/)[1];
    const THREE = await import(threeUrl);

    // ── capture the live scene on the next rendered frame ──
    let captured = null;
    const orig = THREE.WebGLRenderer.prototype.render;
    THREE.WebGLRenderer.prototype.render = function (scene, camera) {
      captured = { scene, camera };
      return orig.call(this, scene, camera);
    };
    const t0 = Date.now();
    while (!captured && Date.now() - t0 < 8000) await new Promise((r) => requestAnimationFrame(r));
    THREE.WebGLRenderer.prototype.render = orig;
    if (!captured) { out.errors.push('no frame captured'); return out; }
    const scene = captured.scene;

    // ── the layout the viewer used (same pure function it calls) ──
    const pr = parser.parseEquation(equation);
    if (!pr.success) { out.errors.push('parse failed: ' + pr.error); return out; }
    const points = pr.sample(minX, maxX, 800);
    const layout = c3d.layoutCurve(points);
    const b = layout.bounds;          // WORLD bounds
    const d = layout.dataBounds;      // DATA bounds (the units the user typed)
    const axes = c3d.buildAxes(layout);
    const yTop = Math.max(b.maxY + 1.5, layout.floorY + 4);

    // ── A. the X-axis LINE, read from the live scene ──
    // The viewer draws three axes as 2-point LineSegments. The X axis is the one
    // whose two points share a Y and span the widest X.
    const segs = [];
    scene.traverse((o) => {
      if (o.isLineSegments && o.geometry?.getAttribute?.('position')) {
        const a = o.geometry.getAttribute('position');
        if (a.count === 2) {
          segs.push({
            x1: a.getX(0), y1: a.getY(0), x2: a.getX(1), y2: a.getY(1),
          });
        }
      }
    });
    const horizontal = segs.filter((s) => Math.abs(s.y1 - s.y2) < 1e-6);
    horizontal.sort((p, q) => (Math.abs(q.x2 - q.x1)) - (Math.abs(p.x2 - p.x1)));
    const axisLine = horizontal[0] || null;
    out.axisLineY = axisLine ? (axisLine.y1 + axisLine.y2) / 2 : null;
    out.axisLineLive = axisLine;
    out.horizontalSegCount = horizontal.length;

    // ── C. the "0" TICK, read from the live scene ──
    // The viewer places Y-axis ticks with lerpAxis(y.start, y.end, b.minY, b.maxY)
    // — the WORLD range — but takes the tick VALUES from the DATA range. So the
    // label "0" is drawn wherever the world-range lerp puts 0.
    const yTickValues = c3dAx.referenceTickValues(d.minY, d.maxY, 5, 0.1);
    const lerpAxis = (from, to, min, max) => (v) => {
      const span = max - min;
      const t = span === 0 ? 0.5 : (v - min) / span;
      return { y: from.y + (to.y - from.y) * t, t };
    };
    const yAt = lerpAxis(axes.y.start, axes.y.end, b.minY, b.maxY);
    const zeroTick = yTickValues.find((v) => v === 0);
    out.yTickValues = yTickValues;
    out.hasZeroTick = zeroTick !== undefined;
    if (zeroTick !== undefined) {
      const expect = yAt(0);
      out.tickZeroY = expect.y;
      out.tickZeroT = expect.t;   // t=0.5 would mean "0 maps to the middle"
      // Cross-check against the live scene: find the 2-point tick dash whose
      // midpoint is at that world position.
      const dashes = [];
      scene.traverse((o) => {
        if (o.isLine && !o.isLineSegments && o.geometry?.getAttribute?.('position')) {
          const a = o.geometry.getAttribute('position');
          if (a.count === 2) dashes.push({ x1: a.getX(0), y1: a.getY(0), x2: a.getX(1), y2: a.getY(1) });
        }
      });
      let best = null, bestD = Infinity;
      for (const dsh of dashes) {
        const my = (dsh.y1 + dsh.y2) / 2;
        const dist = Math.abs(my - expect.y);
        if (dist < bestD) { bestD = dist; best = { ...dsh, midY: my }; }
      }
      out.tickZeroLive = best;
      out.tickZeroLiveDelta = best ? best.midY - expect.y : null;
      // And the live LABEL sprite: it sits at the dash + labelOffset(-0.46,0,0.02).
      let bestSprite = null, bestSD = Infinity;
      scene.traverse((o) => {
        if (o.isSprite) {
          const dist = Math.abs(o.position.y - expect.y);
          if (dist < bestSD) { bestSD = dist; bestSprite = { x: o.position.x, y: o.position.y, z: o.position.z }; }
        }
      });
      out.tickZeroSprite = bestSprite;
      out.tickZeroSpriteDelta = bestSprite ? bestSprite.y - expect.y : null;
    }

    // ── B. the CURVE at data y = 0 ──
    // Exact centreline Y from the app's own layoutCurve, then CROSS-CHECKED
    // against the live tube: the tube's vertices at that x must bracket it.
    const zeroCentre = layout.centerline.find((v) => {
      const back = v.x / layout.scale + (d.minX + d.maxX) / 2;
      return Math.abs(back) < 1e-9;
    });
    // Find the centreline point whose DATA y is closest to 0.
    let bestC = null, bestErr = Infinity;
    const midY = (d.minY + d.maxY) / 2;
    for (let i = 0; i < layout.centerline.length; i++) {
      const v = layout.centerline[i];
      const dataY = (v.y - 2.4) / layout.scale + midY;
      const err = Math.abs(dataY);
      if (err < bestErr) { bestErr = err; bestC = { i, y: v.y, dataY, x: v.x }; }
    }
    out.curveZeroY = bestC ? bestC.y : null;
    out.curveZeroDataY = bestC ? bestC.dataY : null;
    out.curveZeroX = bestC ? bestC.x : null;

    // Live cross-check: gather the tube's vertex Y values near that x.
    let lo = Infinity, hi = -Infinity, nV = 0;
    scene.traverse((o) => {
      if (o.isMesh && o.geometry?.getAttribute?.('position') && o.geometry.getAttribute('position').count > 200) {
        const a = o.geometry.getAttribute('position');
        for (let i = 0; i < a.count; i++) {
          const px = a.getX(i), py = a.getY(i);
          if (bestC && Math.abs(px - bestC.x) < 0.35) { lo = Math.min(lo, py); hi = Math.max(hi, py); nV++; }
        }
      }
    });
    out.tubeBracket = nV ? { lo, hi, n: nV } : null;
    out.curveZeroInTube = out.tubeBracket
      ? (out.curveZeroY >= out.tubeBracket.lo - 1e-6 && out.curveZeroY <= out.tubeBracket.hi + 1e-6)
      : null;

    out.floorY = layout.floorY;
    out.bounds = b;
    out.dataBounds = d;
    out.yTop = yTop;
    return out;
  } catch (e) {
    out.errors.push(String(e && e.stack || e));
    return out;
  }
})
`;

/** Reads the live scene Y of the three things, in a page that already has the viewer. */
async function probe(send, probeFn, equation, minX, maxX) {
  const expression = `(${probeFn})(${JSON.stringify(equation)}, ${Number(minX)}, ${Number(maxX)})`;
  const r = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails) throw new Error('probe failed: ' + JSON.stringify(r.exceptionDetails));
  return r.result?.value;
}

/** Flips the panel to 3D by clicking the real toggle button. */
async function flipTo3d(send) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const b = btns.find(x => /3D Graph/i.test(x.textContent || ''));
      if (!b) return 'no-3d-button';
      b.click();
      return 'clicked';
    })()`,
    returnByValue: true,
  });
  return r.result?.value;
}

/** Bounding box of the graph frame, so the screenshot is the graph and not the page. */
async function graphRect(send) {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
    })()`,
    returnByValue: true,
  });
  return r.result?.value;
}

async function main() {
  const { send, evalJs, consoleErrors, ws } = await openCdp();
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  const results = [];

  for (const theme of THEMES) {
    for (const c of CASES) {
      const url = `${BASE}/studio?eq=${encodeURIComponent(c.eq)}&minX=${c.minX}&maxX=${c.maxX}&dur=8`;
      await send('Page.navigate', { url });
      // theme before the app boots
      await send('Runtime.evaluate', {
        expression: `try { localStorage.setItem('mathsonify-theme', ${JSON.stringify(theme)}); } catch(e){}`,
      });
      await send('Page.reload', {});
      await sleep(3200);
      await send('Runtime.evaluate', {
        expression: `(() => { document.documentElement.dataset.theme = ${JSON.stringify(theme)};
          try { localStorage.setItem('mathsonify-theme', ${JSON.stringify(theme)}); } catch(e){} return document.documentElement.dataset.theme; })()`,
        returnByValue: true,
      });
      await sleep(600);

      const flipped = await flipTo3d(send);
      await sleep(2600);

      const data = await probe(send, PROBE, c.eq, c.minX, c.maxX);
      const rect = await graphRect(send);
      const file = `${OUT}/before-${c.name.replace(/[^a-z0-9]+/gi, '-')}-${theme}.png`;
      const shot = await send('Page.captureScreenshot', {
        format: 'png',
        ...(rect ? { clip: { ...rect, scale: 1 } } : {}),
      });
      fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

      const equal =
        data.axisLineY != null && data.curveZeroY != null && data.tickZeroY != null &&
        Math.abs(data.axisLineY - data.curveZeroY) < 1e-6 &&
        Math.abs(data.axisLineY - data.tickZeroY) < 1e-6;

      results.push({ ...c, theme, flipped, file, ...data, equal });
      console.log(
        `${theme.padEnd(5)} ${c.name.padEnd(9)} axisLineY=${fmt(data.axisLineY)}  curveY@0=${fmt(data.curveZeroY)}  tick0Y=${fmt(data.tickZeroY)}  ` +
        `equal=${equal ? 'YES' : 'NO ' + fmt(Math.max(Math.abs((data.axisLineY ?? 0) - (data.curveZeroY ?? 0)), Math.abs((data.axisLineY ?? 0) - (data.tickZeroY ?? 0))))}  ${file}`,
      );
      if (data.errors?.length) console.log('   errors:', data.errors.join(' | '));
      if (data.tickZeroLiveDelta != null) console.log(`   live tick dash delta vs computed = ${data.tickZeroLiveDelta.toExponential(2)}`);
      if (data.curveZeroInTube !== null) console.log(`   curve y=0 inside live tube bracket: ${data.curveZeroInTube}`);
    }
  }

  fs.writeFileSync(`${OUT}/before-probe.json`, JSON.stringify(results, null, 2));
  console.log(`\nSaved ${results.length} results to ${OUT}/before-probe.json`);
  if (consoleErrors.length) console.log('\nconsole errors:', consoleErrors.slice(0, 5));
  const allEqual = results.every((r) => r.equal);
  console.log(`\nVERDICT: the three scene Y values are ${allEqual ? 'EQUAL (bug NOT reproduced)' : 'NOT EQUAL (bug reproduced)'}`);
  ws.close();
}

function fmt(v) {
  if (v == null || !Number.isFinite(v)) return '   n/a ';
  return v.toFixed(3).padStart(8);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
