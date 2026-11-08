/**
 * Geometry tests for the video export renderer.
 *
 * These cover the claims that are easy to get wrong and hard to eyeball in a
 * 1280x720 clip: that the ticker never jumps at its loop point, that the
 * watermark stays fixed in one place, that the watermark stays clear of the
 * ticker, and that the two export modes are selected from metadata rather
 * than from the equation text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bouncePosition,
  tickerOffset,
  watermarkPosition,
  prepareVideoScene,
  phaseAt,
  drawExportFrame,
  drawStaticLayer,
  totalDurationMs,
  videoSize,
  WATERMARK_TEXT,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_RIGHT,
  INTRO_MS,
  FPS,
  VIDEO_W,
  VIDEO_H,
  type ExportMode,
  type VideoOrientation,
  type VideoQuality,
} from './videoScene';
import { resolveActiveCurve, paddedYRange } from './activeCurve';
import { sampleEquationToControlPoints } from './curveSpline';
import { targetBitrate, videoBitrateForQuality, pickVideoMimeType, videoExtensionForMimeType, VIDEO_MIME_PREFERENCE } from './videoExporter';
import { equationLabel, EQUATION_LABEL_PREFIX } from './equationLabel';

/** Minimal ctx stub: prepareVideoScene only needs measureText. */
function stubCtx(): CanvasRenderingContext2D {
  return {
    font: '',
    measureText: (t: string) => ({ width: t.length * 11 }),
  } as unknown as CanvasRenderingContext2D;
}

const SCIENTIST = {
  id: 'euler',
  name: 'Leonhard Euler',
  initials: 'LE',
  color: '#7FB2E5',
  category: 'mathematician' as const,
  lifespan: '1707–1783',
  tagline: 'Made mathematics alive',
  bio: '',
  equations: [],
};

/* ── ticker: seamless loop ───────────────────────────────────────── */

test('tickerOffset stays inside [0, period) and never jumps', () => {
  const period = 640;
  const dtSec = 1 / FPS;          // seconds between frames
  const dtMs = dtSec * 1000;      // the loop's timestamp step
  const maxStep = 66 * dtSec + 1e-6; // 66 px/s
  let prev = tickerOffset(0, period);
  for (let t = dtMs; t < 60_000; t += dtMs) {
    const cur = tickerOffset(t, period);
    assert.ok(cur >= 0 && cur < period, `offset ${cur} out of range at t=${t}`);

    // `tickerOffset` returns how far the tile has advanced; the strip is drawn
    // at x = -offset, so the offset GROWS steadily as the strip scrolls left.
    // A normal step therefore makes `backward` (cur - prev) a small positive
    // number equal to one frame's drift. At the wrap it returns from ~period
    // to ~0, making `backward` large and NEGATIVE, of magnitude
    // (period - step). Anything else would mean a skipped tile / visible seam.
    const backward = cur - prev;
    // A tiny tolerance absorbs float drift: the wrap lands exactly on
    // -(period - step), but accumulated 1/60s float error can push it a few
    // ulps past the bound.
    const isNormalStep = backward >= -1e-6 && backward <= maxStep + 1e-6;
    const isWrap = backward < -1e-6 && backward >= -(period - maxStep) - 1e-3;
    assert.ok(
      isNormalStep || isWrap,
      `discontinuity at t=${t}: ${backward.toFixed(3)}px (step ${maxStep.toFixed(3)}, period ${period})`,
    );
    prev = cur;
  }
});

test('ticker offset is periodic and drift is constant', () => {
  const period = 500;
  const oneTileMs = (period / 66) * 1000; // 66 px/s
  assert.ok(Math.abs(tickerOffset(oneTileMs, period) - 0) < 1e-6);
  const half = tickerOffset(oneTileMs / 2, period);
  assert.ok(Math.abs(half - period / 2) < 1e-6, `expected ${period / 2}, got ${half}`);
});

test('tickerOffset degrades safely when there is no ticker', () => {
  assert.equal(tickerOffset(1234, 0), 0);
});

/* ── watermark: true bounce, every edge, no ticker overlap ─────────── */

test('bouncePosition is continuous and reflects at both bounds', () => {
  const lo = 70;
  const hi = 1210;
  const speed = 1.3;
  const span = hi - lo;
  const cycleSec = (2 * span) / speed;
  const dt = 1 / 60;

  let min = Infinity;
  let max = -Infinity;
  let prev = bouncePosition(0, lo, lo, hi, speed);
  for (let t = dt; t < cycleSec; t += dt) {
    const cur = bouncePosition(t, lo, lo, hi, speed);
    // No teleporting (the mock's integrator stalled on the edge).
    assert.ok(Math.abs(cur - prev) < speed * dt + 1e-6, `jump at t=${t}`);
    assert.ok(cur >= lo - 1e-6 && cur <= hi + 1e-6, `escaped bounds at t=${t}`);
    min = Math.min(min, cur);
    max = Math.max(max, cur);
    prev = cur;
  }
  assert.ok(min < lo + 1, 'never reached the low bound');
  assert.ok(max > hi - 1, 'never reached the high bound');
});

/* ── watermark: the domain, below the graph, never on the curve ─── */

test('the watermark text is exactly "mathsonify.com"', () => {
  // The old label read "MathSonify  ·  mathsonify.com"; the owner wants the
  // domain only. Both modes, same check.
  for (const scientist of [null, SCIENTIST]) {
    const scene = sceneFor('sin(x)', scientist);
    const { ctx, texts } = recordingCtx();
    drawExportFrame(ctx, scene, INTRO_MS + 500); // main phase
    assert.ok(texts.includes(WATERMARK_TEXT), `watermark missing (got ${JSON.stringify(texts)})`);
    assert.ok(
      !texts.some((t) => t.includes('MathSonify') && t.includes('mathsonify.com')),
      `the old two-part watermark label is back (got ${JSON.stringify(texts)})`,
    );
  }
});

test('the watermark strip sits below the graph and never overlaps it', () => {
  const orientations: VideoOrientation[] = ['landscape', 'portrait'];
  const modes: ExportMode[] = ['user', 'scientist'];
  for (const orientation of orientations) {
    for (const mode of modes) {
      const scene = sceneFor('sin(x)', mode === 'scientist' ? SCIENTIST : null, orientation);
      const strip = scene.watermarkStrip;
      assert.ok(strip.y >= scene.panel.y + scene.panel.h, `${orientation}/${mode}: strip starts inside the panel`);
      const floor = scene.ticker ? scene.ticker.top : scene.height;
      assert.ok(strip.y + strip.h <= floor, `${orientation}/${mode}: watermark strip reaches the ticker/bottom edge`);
      // Fixed at the right end of the strip: the text's right edge hugs the
      // strip's right edge, its centre sits on the strip's midline.
      const { x, y } = watermarkPosition(scene);
      assert.ok(
        Math.abs(x + scene.watermarkW / 2 - (strip.x + strip.w)) < 1,
        `${orientation}/${mode}: watermark is not right-anchored in its strip`,
      );
      assert.ok(Math.abs(y - (strip.y + strip.h / 2)) < 1, `${orientation}/${mode}: watermark is not centred on its strip`);
      assert.ok(y - 8 * scene.uiScale >= scene.panel.y + scene.panel.h, `${orientation}/${mode}: watermark overlaps the graph`);
    }
  }
});

test('the watermark never moves during a clip', () => {
  // The owner wants it in one place: fixed at the right end of its strip.
  // The position is a pure function of the scene — time does not enter it,
  // so the same position comes back at every timestamp of a 6s clip.
  const orientations: VideoOrientation[] = ['landscape', 'portrait'];
  for (const orientation of orientations) {
    const scene = sceneFor('sin(x)', null, orientation);
    const first = watermarkPosition(scene);
    const total = totalDurationMs(6000);
    for (let t = 0; t <= total; t += 16) {
      const p = watermarkPosition(scene);
      assert.equal(p.x, first.x, `${orientation}: watermark x moved at t=${t}`);
      assert.equal(p.y, first.y, `${orientation}: watermark y moved at t=${t}`);
    }
  }
});

test('portrait keeps the graph out of the phone safe zones', () => {
  // Reels / Shorts / TikTok cover the top 12%, the bottom 20% and the right
  // 14% mid-height with buttons. Nothing that matters may sit under them.
  for (const mode of ['user', 'scientist'] as const) {
    const scene = sceneFor('sin(x)', mode === 'scientist' ? SCIENTIST : null, 'portrait');
    const p = scene.panel;
    assert.ok(p.y >= SAFE_TOP * scene.height, `${mode}: graph starts inside the top safe zone`);
    assert.ok(p.y + p.h <= (1 - SAFE_BOTTOM) * scene.height, `${mode}: graph runs into the bottom safe zone`);
    assert.ok(p.x + p.w <= (1 - SAFE_RIGHT) * scene.width, `${mode}: graph runs into the right safe zone`);
    assert.ok(scene.labelY >= SAFE_TOP * scene.height, `${mode}: label pill inside the top safe zone`);
    const strip = scene.watermarkStrip;
    assert.ok(strip.y + strip.h <= (1 - SAFE_BOTTOM) * scene.height, `${mode}: watermark strip inside the bottom safe zone`);
    if (scene.ticker) {
      assert.ok(scene.ticker.top + scene.ticker.height <= (1 - SAFE_BOTTOM) * scene.height, `${mode}: ticker inside the bottom safe zone`);
    }
  }
});

test('tick numbers are about 2.7% of the short side', () => {
  const combos: [VideoOrientation, VideoQuality][] = [
    ['landscape', '720p'],
    ['landscape', '1080p'],
    ['portrait', '720p'],
    ['portrait', '1080p'],
  ];
  for (const [orientation, quality] of combos) {
    const scene = sceneFor('sin(x)', null, orientation, quality);
    assert.equal(scene.tickFontPx, Math.round(0.027 * scene.shortSide), `${orientation} ${quality}`);
  }
});

test('videoSize covers the four export sizes', () => {
  assert.deepEqual(videoSize('landscape', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(videoSize('landscape', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(videoSize('portrait', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(videoSize('portrait', '1080p'), { width: 1080, height: 1920 });
});

test('the static layer holds the equation label, tick numbers — and the fixed watermark', () => {
  const scene = sceneFor('sin(x)', null);
  const { ctx, texts } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(texts.includes('Equation: sin(x)'), `static layer missing the equation label (got ${JSON.stringify(texts)})`);
  assert.ok(texts.some((t) => /^-?\d/.test(t)), `static layer missing tick numbers (got ${JSON.stringify(texts)})`);
  // The watermark is fixed in one place now, so it belongs in the static
  // layer — drawn once, not repainted every frame.
  assert.ok(texts.includes(WATERMARK_TEXT), `static layer missing the watermark (got ${JSON.stringify(texts)})`);
});

test('the watermark is drawn once per frame, from the static layer', () => {
  const scene = sceneFor('sin(x)', null);
  const { ctx, texts } = recordingCtx();
  drawExportFrame(ctx, scene, INTRO_MS + 500);
  const count = texts.filter((t) => t === WATERMARK_TEXT).length;
  assert.equal(count, 1, `watermark drawn ${count} times in one frame (got ${JSON.stringify(texts)})`);
});

test('intro and outro cards are unchanged', () => {
  const scene = sceneFor('sin(x)', null);
  const a = recordingCtx();
  drawExportFrame(a.ctx, scene, INTRO_MS / 2);
  assert.ok(a.texts.includes('MathSonify'), `intro lost its title (got ${JSON.stringify(a.texts)})`);
  assert.ok(a.texts.includes('Equation: sin(x)'), `intro lost the equation (got ${JSON.stringify(a.texts)})`);
  const b = recordingCtx();
  drawExportFrame(b.ctx, scene, totalDurationMs(4000) - 100);
  assert.ok(b.texts.includes('Made with MathSonify.com'), `outro lost its line (got ${JSON.stringify(b.texts)})`);
  assert.ok(b.texts.includes('Turn math into sound'), `outro lost its tagline (got ${JSON.stringify(b.texts)})`);
});

test('bitrate is 8 Mbps at 720p and 14 Mbps at 1080p', () => {
  assert.equal(videoBitrateForQuality('720p'), 8_000_000);
  assert.equal(videoBitrateForQuality('1080p'), 14_000_000);
});


/* ── mode selection ──────────────────────────────────────────────── */

test('no scientist metadata selects user mode with no ticker', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'sin(x)', curve, minX: -6.28, maxX: 6.28,
    mainMs: 4000, scientist: null, scientistName: null,
  });
  assert.equal(scene.mode, 'user');
  assert.equal(scene.tickerText, null);
  assert.equal(scene.tickerPeriod, 0);
  assert.equal(scene.scientistName, null);
});

test('scientist metadata selects scientist mode and builds a ticker', () => {
  const curve = resolveActiveCurve({
    equation: 'e^x', minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'e^x', curve, minX: -6.28, maxX: 6.28,
    mainMs: 4000, scientist: SCIENTIST,
  });
  assert.equal(scene.mode, 'scientist');
  assert.equal(scene.scientistName, 'Leonhard Euler');
  // name · field/context · full equation
  assert.match(scene.tickerText!, /Leonhard Euler/);
  assert.match(scene.tickerText!, /mathematician 1707–1783/);
  assert.match(scene.tickerText!, /e\^x/);
  assert.ok(scene.tickerPeriod > 0);
});

test('a user-typed equation is not mistaken for a scientist one', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x) + 0.5sin(3x)', minX: -9, maxX: 9, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'sin(x) + 0.5sin(3x)', curve, minX: -9, maxX: 9,
    mainMs: 6000, scientist: null,
  });
  assert.equal(scene.mode, 'user');
  assert.equal(scene.tickerText, null);
});

/* ── cards and timeline ──────────────────────────────────────────── */

test('intro and outro occupy the documented slices of the clip', () => {
  const mainMs = 5000;
  assert.equal(phaseAt(0, mainMs).phase, 'intro');
  assert.equal(phaseAt(INTRO_MS - 1, mainMs).phase, 'intro');
  assert.equal(phaseAt(INTRO_MS, mainMs).phase, 'main');
  assert.equal(phaseAt(INTRO_MS + mainMs - 1, mainMs).phase, 'main');
  assert.equal(phaseAt(INTRO_MS + mainMs, mainMs).phase, 'outro');
  assert.equal(phaseAt(totalDurationMs(mainMs), mainMs).phase, 'outro');
});

test('card fades start and end at the right opacities', () => {
  const mainMs = 5000;
  assert.equal(phaseAt(0, mainMs).alpha, 0, 'intro must begin fully transparent');
  assert.equal(phaseAt(400, mainMs).alpha, 1, 'intro must reach full opacity');
  assert.ok(phaseAt(INTRO_MS - 1, mainMs).alpha < 0.05, 'intro must fade out before the curve');
  assert.equal(phaseAt(INTRO_MS + mainMs, mainMs).alpha, 0, 'outro must fade in from transparent');
  assert.equal(phaseAt(totalDurationMs(mainMs), mainMs).alpha, 1, 'outro must end fully opaque');
});

test('progress runs 0..1 across the main segment only', () => {
  const mainMs = 5000;
  assert.equal(phaseAt(INTRO_MS, mainMs).mainElapsed, 0);
  assert.equal(phaseAt(INTRO_MS + mainMs / 2, mainMs).mainElapsed, mainMs / 2);
  assert.equal(phaseAt(INTRO_MS + mainMs, mainMs).mainElapsed, mainMs);
});
/* ── single source of truth ──────────────────────────────────────── */

test('a sculpted curve exports as the spline, not the equation', () => {
  const points = sampleEquationToControlPoints('sin(x)', -Math.PI, Math.PI, 16);
  // Sculpt: lift the middle of the curve well away from sin(x).
  const sculpted = points.map((p, i) => (i === 8 ? { ...p, y: p.y + 3 } : p));

  const fromEquation = resolveActiveCurve({
    equation: 'sin(x)', minX: -Math.PI, maxX: Math.PI,
    isCustomCurve: false, splineControlPoints: points,
  });
  const fromSpline = resolveActiveCurve({
    equation: 'sin(x)', minX: -Math.PI, maxX: Math.PI,
    isCustomCurve: true, splineControlPoints: sculpted,
  });

  assert.equal(fromEquation.source, 'equation');
  assert.equal(fromSpline.source, 'spline');
  // The two must genuinely differ — this is the preview/export drift bug.
  const midOf = (c: { points: { y: number }[] }) => c.points[Math.floor(c.points.length / 2)].y;
  assert.ok(
    Math.abs(midOf(fromSpline) - midOf(fromEquation)) > 1,
    'sculpted curve did not diverge from the equation',
  );
});

test('isCustomCurve with no control points falls back to the equation', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -6.28, maxX: 6.28, isCustomCurve: true, splineControlPoints: [],
  });
  assert.equal(curve.source, 'equation');
});

test('resolving different equations in sequence yields different curves', () => {
  const base = { minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [] };
  const a = resolveActiveCurve({ ...base, equation: 'sin(x)' });
  const b = resolveActiveCurve({ ...base, equation: 'x^2' });
  const c = resolveActiveCurve({ ...base, equation: 'cos(2x)' });

  const mid = (x: { points: { y: number }[] }) => x.points[Math.floor(x.points.length / 2)].y;
  assert.notEqual(mid(a), mid(b));
  assert.notEqual(mid(b), mid(c));

  // Re-resolving the first must give identical points (no hidden mutation).
  const aAgain = resolveActiveCurve({ ...base, equation: 'sin(x)' });
  assert.equal(mid(aAgain), mid(a));
});

test('an unparseable equation throws rather than exporting junk', () => {
  assert.throws(() =>
    resolveActiveCurve({
      equation: '(((', minX: -1, maxX: 1, isCustomCurve: false, splineControlPoints: [],
    }),
  );
});

/**
 * Guards a regression that was actually shipped once: `resolveActiveCurve`
 * throws synchronously on a bad equation, whereas the code it replaced
 * (`audioEngine.play`) signalled failure via a rejected promise. A caller that
 * only wrapped the *returned promise* in .catch() therefore let the throw
 * escape — in the spacebar handler that meant an uncaught error inside a
 * window event listener, which tears down the listener for the session.
 *
 * The contract callers depend on: a throwing resolver must be safe to call
 * from an async boundary that catches, and must never leave partial state.
 */
test('the resolver throws SYNCHRONOUSLY, so callers must catch it explicitly', () => {
  const bad = {
    equation: '(((', minX: -1, maxX: 1, isCustomCurve: false, splineControlPoints: [],
  };
  // Synchronous: no promise is involved, so `.catch()` on a return value would
  // never see this.
  assert.throws(() => resolveActiveCurve(bad));

  // Safe when the call is placed inside an async boundary, which is what the
  // Studio spacebar handler and the AudioControls play button now do.
  return (async () => {
    let caught: unknown = null;
    try {
      const curve = resolveActiveCurve(bad);
      // Must not reach here.
      assert.fail(`expected a throw, got ${curve.points.length} points`);
    } catch (err) {
      caught = err;
    }
    assert.ok(caught instanceof Error);
    assert.match((caught as Error).message, /understand|cannot|invalid/i);
  })();
});

test('a degenerate custom curve still resolves rather than throwing', () => {
  // All control points identical: the spline is degenerate, and the resolver
  // must fall through to the equation instead of throwing or returning junk.
  const flat = Array.from({ length: 12 }, (_, i) => ({ x: -3 + i * 0.5, y: 2, id: `cp-${i}` }));
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -3, maxX: 3, isCustomCurve: true, splineControlPoints: flat,
  });
  assert.ok(curve.points.length > 0);
  assert.ok(curve.points.some((p) => p.isValid));
});

test('paddedYRange adds headroom above and below the data', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [],
  });
  const valid = curve.points.filter((p) => p.isValid);
  const { paddedMinY, paddedMaxY } = paddedYRange(valid);
  const ys = valid.map((p) => p.y);
  assert.ok(paddedMinY < Math.min(...ys));
  assert.ok(paddedMaxY > Math.max(...ys));
});

test('scene carries the live domain so the curve fills the panel', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -Math.PI, maxX: Math.PI, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'sin(x)', curve, minX: -Math.PI, maxX: Math.PI,
    mainMs: 4000, scientist: null,
  });
  assert.equal(scene.minX, -Math.PI);
  assert.equal(scene.maxX, Math.PI);
  assert.ok(scene.panel.h > 0 && scene.panel.w > 0);
  assert.ok(scene.paddedMaxY > scene.paddedMinY);
});


/* ── encoder settings ────────────────────────────────────────────── */

test('bitrate is at least 8 Mbps at 720p and scales up for 1080p', () => {
  assert.ok(targetBitrate(VIDEO_W, VIDEO_H) >= 8_000_000);
  assert.ok(targetBitrate(1920, 1080) > targetBitrate(1280, 720));
  // A tiny canvas must never drop below the floor.
  assert.ok(targetBitrate(640, 360) >= 8_000_000);
});

test('capture is 60fps at 1280x720', () => {
  assert.equal(FPS, 60);
  assert.equal(VIDEO_W, 1280);
  assert.equal(VIDEO_H, 720);
});

/* ── the shared equation label ───────────────────────────────────── */

/**
 * Records every fillText so a test can assert on the *rendered* string rather
 * than on an intermediate value. The old `stubCtx` only needed measureText;
 * drawing the real frame needs the whole surface.
 */
function recordingCtx(): { ctx: CanvasRenderingContext2D; texts: string[] } {
  const texts: string[] = [];
  const ctx = {
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    globalAlpha: 1,
    textAlign: 'left',
    textBaseline: 'alphabetic',
    shadowColor: '',
    shadowBlur: 0,
    measureText: (t: string) => ({ width: t.length * 11 }),
    fillText: (t: string) => { texts.push(t); },
    save() {}, restore() {}, beginPath() {}, closePath() {},
    moveTo() {}, lineTo() {}, stroke() {}, fill() {}, arc() {},
    // `roundRect` is built from arcTo, so the stub must provide it.
    arcTo() {}, quadraticCurveTo() {}, bezierCurveTo() {},
    fillRect() {}, strokeRect() {}, clearRect() {}, clip() {}, rect() {}, drawImage() {},
    translate() {}, scale() {}, rotate() {}, setLineDash() {},
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createPattern: () => null,
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
  } as unknown as CanvasRenderingContext2D;
  return { ctx, texts };
}

/** Structural stand-in for the Scientist record the scene builder needs. */
type ScientistStub = Parameters<typeof prepareVideoScene>[0]['scientist'];

function sceneFor(
  equation: string,
  scientist: ScientistStub,
  orientation: VideoOrientation = 'landscape',
  quality: VideoQuality = '720p',
) {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -Math.PI, maxX: Math.PI, isCustomCurve: false, splineControlPoints: [],
  });
  return prepareVideoScene({
    ctx: stubCtx(), equation, curve, minX: -Math.PI, maxX: Math.PI,
    mainMs: 4000, scientist, orientation, quality,
  });
}

test('equationLabel prefixes the formula exactly once', () => {
  assert.equal(equationLabel('sin(x)'), 'Equation: sin(x)');
  assert.equal(equationLabel('  x^2 - 1  '), 'Equation: x^2 - 1', 'surrounding whitespace is trimmed');
  assert.equal(equationLabel(''), EQUATION_LABEL_PREFIX, 'a blank equation still yields the prefix');
});

test('all three equation surfaces render the same "Equation: …" label', () => {
  // The three places the equation appears: the user-mode top pill, the intro
  // card subtitle, and the scientist-mode ticker. They must not drift apart.
  const expected = 'Equation: sin(x)';

  // 1. Top pill, user mode.
  const user = sceneFor('sin(x)', null);
  const a = recordingCtx();
  drawExportFrame(a.ctx, user, INTRO_MS + 500); // main phase
  assert.ok(a.texts.includes(expected), `user-mode pill missing "${expected}" (got ${JSON.stringify(a.texts)})`);

  // 2. Intro card subtitle.
  const b = recordingCtx();
  drawExportFrame(b.ctx, user, INTRO_MS / 2);
  assert.ok(b.texts.includes(expected), `intro card missing "${expected}" (got ${JSON.stringify(b.texts)})`);

  // 3. Ticker, scientist mode.
  const sci = sceneFor('sin(x)', SCIENTIST);
  const c = recordingCtx();
  drawExportFrame(c.ctx, sci, INTRO_MS + 500);
  assert.ok(
    c.texts.some((t) => t.includes(expected)),
    `scientist ticker missing "${expected}" (got ${JSON.stringify(c.texts)})`,
  );
});

test('the bare equation never appears unprefixed on its own surface', () => {
  // Guards against a future edit reintroducing the raw formula in one place.
  const sci = sceneFor('sin(x)', SCIENTIST);
  const { ctx, texts } = recordingCtx();
  drawExportFrame(ctx, sci, INTRO_MS + 500);
  const bare = texts.filter((t) => t === 'sin(x)');
  assert.deepEqual(bare, [], 'the equation was drawn without its "Equation:" prefix');
});

/* ── recording format support ────────────────────────────────────── */

test('H.264/mp4 is preferred over every webm variant', () => {
  // The whole point: Safari can record neither webm nor play it back, so a
  // hardcoded webm produced a file iOS refused to open.
  const supportsAll = () => true;
  const picked = pickVideoMimeType(supportsAll);
  assert.ok(picked!.includes('mp4'), `expected an mp4 first, got ${picked}`);
  assert.equal(videoExtensionForMimeType(picked), 'mp4');
});

test('falls back through vp9, vp8, then bare webm', () => {
  const vp9 = VIDEO_MIME_PREFERENCE.find((m) => m.includes('vp9'))!;
  assert.equal(pickVideoMimeType((m) => m === vp9), vp9);

  const vp8 = VIDEO_MIME_PREFERENCE.find((m) => m.includes('vp8'))!;
  assert.equal(pickVideoMimeType((m) => m === vp8), vp8);

  assert.equal(pickVideoMimeType((m) => m === 'video/webm'), 'video/webm');
});

test('a webm-only browser gets webm, never a silent mp4 fallback', () => {
  const webmOnly = (m: string) => m.startsWith('video/webm');
  const picked = pickVideoMimeType(webmOnly);
  assert.ok(picked!.startsWith('video/webm'));
  assert.equal(videoExtensionForMimeType(picked), 'webm');
});

test('returns null when nothing is supported, so the export can be refused', () => {
  assert.equal(pickVideoMimeType(() => false), null);
  assert.equal(pickVideoMimeType(() => { throw new Error('boom'); }), null,
    'a throwing isTypeSupported must not be treated as support');
});

test('the extension always matches the container it came from', () => {
  assert.equal(videoExtensionForMimeType('video/mp4;codecs=avc1.42E01E,mp4a.40.2'), 'mp4');
  assert.equal(videoExtensionForMimeType('video/mp4'), 'mp4');
  assert.equal(videoExtensionForMimeType('video/webm;codecs=vp9,opus'), 'webm');
  assert.equal(videoExtensionForMimeType(null), 'webm', 'unknown falls back to webm');
});
