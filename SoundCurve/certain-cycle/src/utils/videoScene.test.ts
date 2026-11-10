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
  watermarkPosition,
  prepareVideoScene,
  phaseAt,
  drawExportFrame,
  drawStaticLayer,
  drawExportGraph,
  arrowheadPoints,
  equationDisplay,
  layoutFor,
  totalDurationMs,
  videoSize,
  WATERMARK_TEXT,
  VIDEO_COLOR_THEMES,
  DEFAULT_VIDEO_COLOR_THEME,
  isVideoColorTheme,
  videoColorThemeHex,
  SAFE_TOP,
  SAFE_BOTTOM,
  SAFE_RIGHT,
  INTRO_MS,
  FPS,
  VIDEO_W,
  VIDEO_H,
  type ExportMode,
  type VideoColorTheme,
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

/* ── watermark: the domain, below the equation, never on the curve ─── */

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

test('the watermark sits centred below the equation, never on the graph', () => {
  // v22: the watermark is centred just below the bottom equation — not
  // right-anchored in a strip, and never overlapping the graph.
  const orientations: VideoOrientation[] = ['landscape', 'portrait'];
  const modes: ExportMode[] = ['user', 'scientist'];
  for (const orientation of orientations) {
    for (const mode of modes) {
      const scene = sceneFor('sin(x)', mode === 'scientist' ? SCIENTIST : null, orientation);
      // Order down the frame: name(s), then the graph, then the equation,
      // then the watermark.
      assert.ok(scene.watermarkY > scene.equationY, `${orientation}/${mode}: watermark is not below the equation`);
      assert.ok(scene.equationY > scene.panel.y + scene.panel.h, `${orientation}/${mode}: equation sits inside the graph`);
      assert.ok(scene.watermarkY > scene.panel.y + scene.panel.h, `${orientation}/${mode}: watermark overlaps the graph`);
      assert.ok(scene.watermarkY < scene.height, `${orientation}/${mode}: watermark runs off the bottom of the frame`);
      // Centred: the watermark's x is the frame's midpoint.
      const { x, y } = watermarkPosition(scene);
      assert.ok(Math.abs(x - scene.width / 2) < 1, `${orientation}/${mode}: watermark is not centred`);
      assert.ok(Math.abs(y - scene.watermarkY) < 1, `${orientation}/${mode}: watermark is not on its line`);
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
    assert.ok(scene.equationNameY >= SAFE_TOP * scene.height, `${mode}: equation name inside the top safe zone`);
    assert.ok(scene.equationY <= (1 - SAFE_BOTTOM) * scene.height, `${mode}: equation inside the bottom safe zone`);
    assert.ok(scene.watermarkY <= (1 - SAFE_BOTTOM) * scene.height, `${mode}: watermark inside the bottom safe zone`);
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

test('videoSize covers the export sizes, including 480p', () => {
  assert.deepEqual(videoSize('landscape', '480p'), { width: 854, height: 480 });
  assert.deepEqual(videoSize('landscape', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(videoSize('landscape', '1080p'), { width: 1920, height: 1080 });
  assert.deepEqual(videoSize('portrait', '480p'), { width: 480, height: 854 });
  assert.deepEqual(videoSize('portrait', '720p'), { width: 720, height: 1280 });
  assert.deepEqual(videoSize('portrait', '1080p'), { width: 1080, height: 1920 });
});

test('the static layer holds tick numbers, bottom equation — and the fixed watermark', () => {
  // v24: a user equation has NO name at the top — the top line is gone.
  // The bottom line is "f(x) = …" in the theme colour, and the watermark
  // sits centred just below it.
  const scene = sceneFor('sin(x)', null);
  const { ctx, texts } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(!texts.includes('sin(x)'), `user equation leaked a top title (got ${JSON.stringify(texts)})`);
  assert.ok(texts.some((t) => /^-?\d/.test(t)), `static layer missing tick numbers (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes('f(x) = sin(x)'), `static layer missing the bottom equation (got ${JSON.stringify(texts)})`);
  // The watermark is fixed in one place now, so it belongs in the static
  // layer — drawn once, not repainted every frame.
  assert.ok(texts.includes(WATERMARK_TEXT), `static layer missing the watermark (got ${JSON.stringify(texts)})`);

  // Scientist mode still has the name at the top, above the graph.
  const sci = sceneFor('sin(x)', SCIENTIST, 'landscape', '720p', 'white', 'Sine Wave');
  const s = recordingCtx();
  drawStaticLayer(s.ctx, sci);
  assert.ok(s.texts.includes('Leonhard Euler'), `scientist name missing (got ${JSON.stringify(s.texts)})`);
  assert.ok(s.texts.includes('Sine Wave'), `equation name missing (got ${JSON.stringify(s.texts)})`);
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

test('bitrate is 4 Mbps at 480p, 8 Mbps at 720p and 14 Mbps at 1080p', () => {
  assert.equal(videoBitrateForQuality('480p'), 4_000_000);
  assert.equal(videoBitrateForQuality('720p'), 8_000_000);
  assert.equal(videoBitrateForQuality('1080p'), 14_000_000);
});


/* ── mode selection ──────────────────────────────────────────────── */

test('no scientist metadata selects user mode with no scientist line', () => {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'sin(x)', curve, minX: -6.28, maxX: 6.28,
    mainMs: 4000, scientist: null, scientistName: null,
  });
  assert.equal(scene.mode, 'user');
  assert.equal(scene.scientistName, null);
  assert.equal(scene.scientistNameY, null);
});

test('scientist metadata selects scientist mode and puts the name first', () => {
  const curve = resolveActiveCurve({
    equation: 'e^x', minX: -6.28, maxX: 6.28, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'e^x', curve, minX: -6.28, maxX: 6.28,
    mainMs: 4000, scientist: SCIENTIST,
  });
  assert.equal(scene.mode, 'scientist');
  assert.equal(scene.scientistName, 'Leonhard Euler');
  // v22 order: scientist name first, then the equation name, then the
  // graph, then the equation, then the watermark.
  assert.ok(scene.scientistNameY !== null, 'scientist mode has no scientist name line');
  assert.ok(scene.scientistNameY < scene.equationNameY, 'scientist name is not above the equation name');
  assert.ok(scene.equationNameY < scene.panel.y, 'equation name is not above the graph');
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
  assert.equal(scene.scientistNameY, null);
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
function recordingCtx(): { ctx: CanvasRenderingContext2D; texts: string[]; drawn: { text: string; font: string }[]; globalAlphas: number[]; strokeStyles: string[]; fillStyles: string[] } {
  const texts: string[] = [];
  // (text, font) pairs, so tests can assert on the FONT a line was drawn
  // in (v24: the watermark and the outro tagline are Instrument Serif
  // italic, not JetBrains Mono). `font` is read at fillText time.
  const drawn: { text: string; font: string }[] = [];
  const globalAlphas: number[] = [];
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
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
    fillText: (t: string) => { texts.push(t); drawn.push({ text: t, font: ctx.font }); },
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
  // Track globalAlpha + strokeStyle assignments so tests can assert on the
  // look (no grid, white axes) without a real canvas. The drawing code only
  // ever sets these, never reads them back, so an accessor is safe.
  let _ga = 1;
  Object.defineProperty(ctx, 'globalAlpha', {
    configurable: true,
    get: () => _ga,
    set: (v: number) => { _ga = v; globalAlphas.push(v); },
  });
  let _ss = '';
  Object.defineProperty(ctx, 'strokeStyle', {
    configurable: true,
    get: () => _ss,
    set: (v: string) => { _ss = v; strokeStyles.push(v); },
  });
  let _fs = '';
  Object.defineProperty(ctx, 'fillStyle', {
    configurable: true,
    get: () => _fs,
    set: (v: string) => { _fs = v; fillStyles.push(v); },
  });
  return { ctx, texts, drawn, globalAlphas, strokeStyles, fillStyles };
}

/** Structural stand-in for the Scientist record the scene builder needs. */
type ScientistStub = Parameters<typeof prepareVideoScene>[0]['scientist'];

function sceneFor(
  equation: string,
  scientist: ScientistStub,
  orientation: VideoOrientation = 'landscape',
  quality: VideoQuality = '720p',
  colorTheme?: VideoColorTheme,
  equationName?: string | null,
) {
  const curve = resolveActiveCurve({
    equation: 'sin(x)', minX: -Math.PI, maxX: Math.PI, isCustomCurve: false, splineControlPoints: [],
  });
  return prepareVideoScene({
    ctx: stubCtx(), equation, equationName, curve, minX: -Math.PI, maxX: Math.PI,
    mainMs: 4000, scientist, orientation, quality, colorTheme,
  });
}

test('equationLabel prefixes the formula exactly once', () => {
  assert.equal(equationLabel('sin(x)'), 'Equation: sin(x)');
  assert.equal(equationLabel('  x^2 - 1  '), 'Equation: x^2 - 1', 'surrounding whitespace is trimmed');
  assert.equal(equationLabel(''), EQUATION_LABEL_PREFIX, 'a blank equation still yields the prefix');
});

test('the equation reads the same on every surface', () => {
  // The places the equation appears: the intro card subtitle, and the
  // bottom line. They must not drift apart. (v24: a user equation has no
  // top title any more, so the main frame has no bare "sin(x)".)
  const user = sceneFor('sin(x)', null);
  const a = recordingCtx();
  drawExportFrame(a.ctx, user, INTRO_MS + 500); // main phase
  assert.ok(!a.texts.includes('sin(x)'), `user equation leaked a top title (got ${JSON.stringify(a.texts)})`);
  assert.ok(a.texts.includes('f(x) = sin(x)'), `bottom line missing "f(x) = sin(x)" (got ${JSON.stringify(a.texts)})`);

  // Intro card subtitle.
  const b = recordingCtx();
  drawExportFrame(b.ctx, user, INTRO_MS / 2);
  assert.ok(b.texts.includes('Equation: sin(x)'), `intro card missing "Equation: sin(x)" (got ${JSON.stringify(b.texts)})`);
});

test('the bottom equation is always function notation, never a bare formula', () => {
  // v22: the bottom line is "f(x) = …" — the formula never appears on its
  // own down there. (In scientist mode the top title IS the bare formula
  // when the equation has no name; that is the title, not a floating
  // label. In user mode there is no top title at all in v24.)
  const sci = sceneFor('sin(x)', SCIENTIST);
  const { ctx, texts } = recordingCtx();
  drawExportFrame(ctx, sci, INTRO_MS + 500);
  assert.ok(texts.includes('f(x) = sin(x)'), `bottom line is not "f(x) = sin(x)" (got ${JSON.stringify(texts)})`);
  const bare = texts.filter((t) => t === 'sin(x)');
  // Exactly one bare copy: the top title. The bottom line is "f(x) = …".
  assert.equal(bare.length, 1, `expected one bare title, got ${bare.length} (got ${JSON.stringify(texts)})`);
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

/* ── v21b: the corrected export look ─────────────────────────────────
 *
 * The owner rejected the first v21 (white pill tick numbers, a white pill
 * watermark, the equation moved to the bottom in big coloured serif) and
 * sent a screenshot of the current image export as the reference for what
 * to KEEP: numbers small and grey, watermark small bottom-right. Only the
 * background, the axis and the curve colour change. These tests pin exactly
 * that boundary, for video and (via drawExportGraph) for the image.
 */

test('the four colour themes exist, are distinct, and white is the default', () => {
  const ids = Object.keys(VIDEO_COLOR_THEMES) as VideoColorTheme[];
  assert.deepEqual([...ids].sort(), ['blue', 'green', 'purple', 'white']);
  const hexes = ids.map((id) => videoColorThemeHex(id));
  assert.equal(new Set(hexes).size, 4, 'two themes share a colour');
  assert.equal(DEFAULT_VIDEO_COLOR_THEME, 'white');
  assert.equal(videoColorThemeHex('white'), '#FFFFFF');
  // Every theme has a human label for the picker.
  for (const id of ids) assert.ok(VIDEO_COLOR_THEMES[id].label.length > 0, `${id} has no label`);
});

test('isVideoColorTheme accepts only the four theme ids', () => {
  assert.ok(isVideoColorTheme('blue'));
  assert.ok(isVideoColorTheme('green'));
  assert.ok(isVideoColorTheme('purple'));
  assert.ok(isVideoColorTheme('white'));
  assert.ok(!isVideoColorTheme('red'));
  assert.ok(!isVideoColorTheme(''));
  assert.ok(!isVideoColorTheme(undefined));
  assert.ok(!isVideoColorTheme(null));
  assert.ok(!isVideoColorTheme(42));
});

test('the scene stores the chosen theme and falls back to white', () => {
  const purple = sceneFor('sin(x)', null, 'landscape', '720p', 'purple');
  assert.equal(purple.colorTheme, 'purple');
  assert.equal(videoColorThemeHex(purple.colorTheme), '#E879F9');
  const def = sceneFor('sin(x)', null);
  assert.equal(def.colorTheme, 'white');
  // An unknown stored value must not break the export — it falls back.
  const unknown = sceneFor('sin(x)', null, 'landscape', '720p', 'red' as VideoColorTheme);
  assert.equal(unknown.colorTheme, 'white');
});

test('arrowheadPoints puts the tip beyond the panel and the base on its edge', () => {
  // Right-pointing: tip at (100, 50), base on x=86.
  const [tip, a, b] = arrowheadPoints({ x: 100, y: 50 }, { x: 1, y: 0 }, 14, 5);
  assert.deepEqual(tip, { x: 100, y: 50 });
  assert.deepEqual(a, { x: 86, y: 55 });
  assert.deepEqual(b, { x: 86, y: 45 });
  // Up-pointing: tip at (30, 20), base on y=34.
  const [tip2, a2, b2] = arrowheadPoints({ x: 30, y: 20 }, { x: 0, y: -1 }, 14, 5);
  assert.deepEqual(tip2, { x: 30, y: 20 });
  assert.deepEqual(a2, { x: 35, y: 34 });
  assert.deepEqual(b2, { x: 25, y: 34 });
});

test('the static layer has no grid (the background is pure black)', () => {
  // The old grid was drawn with globalAlpha 0.03. The watermark is the only
  // other static-layer element that touches globalAlpha (0.55), so if 0.03
  // never appears, the grid is gone.
  const scene = sceneFor('sin(x)', null);
  const { ctx, globalAlphas } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(!globalAlphas.includes(0.03), `the grid is back (globalAlpha values: ${globalAlphas})`);
  assert.ok(globalAlphas.includes(0.55), 'the watermark lost its 0.55 alpha');
});

test('the axes are solid white (not the old faint 0.25 alpha)', () => {
  const scene = sceneFor('sin(x)', null);
  const { ctx, strokeStyles } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(strokeStyles.includes('#FFFFFF'), `no solid-white axis stroke (got ${JSON.stringify(strokeStyles)})`);
  assert.ok(!strokeStyles.includes('rgba(255,255,255,0.25)'), 'the old faint axis colour is back');
});

test('the y-axis is drawn when the domain starts at 0 (it sits on the panel edge)', () => {
  // The Equation of the Day has domain 0..8, so its y-axis sits exactly on
  // the panel's left edge. The old strict inequality dropped it entirely.
  const curve = resolveActiveCurve({
    equation: 'exp(-0.5*x)', minX: 0, maxX: 8, isCustomCurve: false, splineControlPoints: [],
  });
  const scene = prepareVideoScene({
    ctx: stubCtx(), equation: 'exp(-0.5*x)', curve, minX: 0, maxX: 8,
    mainMs: 4000, scientist: null,
  });
  // x=0 maps exactly onto the panel's left edge — the axis sits on the edge,
  // so only the inclusive bound (>=) keeps it visible.
  assert.equal(scene.screenPoints[0].x, scene.panel.x);
  const { ctx, strokeStyles } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(strokeStyles.includes('#FFFFFF'), 'no white axis stroke for a domain starting at 0');
});

test('drawExportGraph carries the same labels as the video frame', () => {
  // v22: the image is the video frame with the full curve — the bottom
  // equation and the watermark are drawn here, so image and video match
  // exactly. (v21b drew none of them here; the info bar did.) v24: a
  // user equation has no top title, so the image has none either.
  const scene = sceneFor('sin(x)', null);
  const { ctx, texts } = recordingCtx();
  drawExportGraph(ctx, scene);
  assert.ok(texts.some((t) => /^-?\d/.test(t)), `image graph missing tick numbers (got ${JSON.stringify(texts)})`);
  assert.ok(!texts.includes('sin(x)'), `image graph leaked a top title (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes('f(x) = sin(x)'), `image graph missing the bottom equation (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes(WATERMARK_TEXT), `image graph missing the watermark (got ${JSON.stringify(texts)})`);
});

test('the image graph draws the full curve in the theme colour', () => {
  // The curve is strokes, not text, so assert on the stroke colour: the
  // theme colour must appear as a strokeStyle when the graph is drawn.
  const scene = sceneFor('sin(x)', null, 'landscape', '720p', 'purple');
  const { ctx, strokeStyles } = recordingCtx();
  drawExportGraph(ctx, scene);
  assert.ok(strokeStyles.includes('#E879F9'), `purple curve never stroked (got ${JSON.stringify(strokeStyles)})`);
});

/* ── v22: the owner's layout — graph in the middle, name at the top,
 * equation at the bottom in the theme colour, watermark below it ─────────
 *
 * The owner liked v21b but the graph covered the whole image. v22 shrinks
 * it to the middle with blank space around it, puts the equation name at
 * the top, the equation ("f(x) = …") at the bottom middle in the theme
 * colour, and the watermark centred just below it. For scientist equations
 * the scientist name comes first, then the name, then the equation, then
 * the watermark. The scrolling ticker is gone — it was redundant once the
 * name is at the top and the equation is at the bottom.
 */

test('equationDisplay formats the bottom line as function notation', () => {
  assert.equal(equationDisplay('sin(x)'), 'f(x) = sin(x)');
  assert.equal(equationDisplay('  x^2 - 1  '), 'f(x) = x^2 - 1', 'surrounding whitespace is trimmed');
});

test('the graph sits in the middle with blank space on every side', () => {
  // v22: the panel no longer covers the frame. There is clear black space
  // to the left, right, above and below it, in both orientations.
  for (const orientation of ['landscape', 'portrait'] as const) {
    const scene = sceneFor('sin(x)', null, orientation);
    const p = scene.panel;
    assert.ok(p.x > 0.05 * scene.width, `${orientation}: no blank space on the left`);
    assert.ok(p.x + p.w < 0.95 * scene.width, `${orientation}: no blank space on the right`);
    assert.ok(p.y > 0.1 * scene.height, `${orientation}: no blank space above the graph`);
    assert.ok(p.y + p.h < scene.equationY, `${orientation}: no blank space below the graph before the equation`);
    // Smaller than the v21b panel: it covered 90% of the width in
    // landscape and 80% in portrait.
    assert.ok(p.w < 0.8 * scene.width, `${orientation}: graph still covers the whole width`);
  }
  // Landscape is centred horizontally. Portrait is shifted left on purpose:
  // its right edge stops at the 14% right safe zone, so the left margin
  // (10%) is smaller than the right one (14%).
  const land = sceneFor('sin(x)', null, 'landscape');
  const lp = land.panel;
  assert.ok(
    Math.abs(lp.x - (land.width - (lp.x + lp.w))) < 2,
    `landscape graph is not centred (left ${lp.x}, right ${land.width - (lp.x + lp.w)})`,
  );
  const port = sceneFor('sin(x)', null, 'portrait');
  const pp = port.panel;
  assert.ok(Math.abs(pp.x + pp.w - (1 - SAFE_RIGHT) * port.width) < 1, 'portrait graph does not stop at the right safe zone');
});

test('the layout order is scientist name, name, graph, equation, watermark', () => {
  // Scientist mode: every line in the owner's order, top to bottom.
  const sci = sceneFor('sin(x)', SCIENTIST, 'landscape', '720p', 'purple', 'Sine Wave');
  assert.ok(sci.scientistNameY !== null);
  assert.ok(sci.scientistNameY < sci.equationNameY, 'scientist name is not first');
  assert.ok(sci.equationNameY < sci.panel.y, 'equation name is not above the graph');
  assert.ok(sci.panel.y + sci.panel.h < sci.equationY, 'equation is not below the graph');
  assert.ok(sci.equationY < sci.watermarkY, 'watermark is not below the equation');

  // The top title is the equation NAME when there is one.
  const { ctx, texts } = recordingCtx();
  drawStaticLayer(ctx, sci);
  assert.ok(texts.includes('Leonhard Euler'), `scientist name missing (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes('Sine Wave'), `equation name missing (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes('f(x) = sin(x)'), `bottom equation missing (got ${JSON.stringify(texts)})`);
  assert.ok(texts.includes(WATERMARK_TEXT), `watermark missing (got ${JSON.stringify(texts)})`);
});

test('the equation name is the top title only for scientist equations', () => {
  // v24: the top title exists only in scientist mode. A user equation has
  // no name at the top — not the name, not the formula — even when it has
  // a name. The formula appears only in the bottom "f(x) = …" line.
  const namedUser = sceneFor('sin(x)', null, 'landscape', '720p', 'white', 'Sine Wave');
  assert.equal(namedUser.equationName, 'Sine Wave');
  const a = recordingCtx();
  drawStaticLayer(a.ctx, namedUser);
  assert.ok(!a.texts.includes('Sine Wave'), `user equation leaked its name to the top (got ${JSON.stringify(a.texts)})`);
  assert.ok(!a.texts.includes('sin(x)'), `user equation leaked a top title (got ${JSON.stringify(a.texts)})`);
  assert.ok(a.texts.includes('f(x) = sin(x)'), `bottom equation missing (got ${JSON.stringify(a.texts)})`);

  // Scientist mode: with a name, the top line is the name.
  const namedSci = sceneFor('sin(x)', SCIENTIST, 'landscape', '720p', 'white', 'Sine Wave');
  const b = recordingCtx();
  drawStaticLayer(b.ctx, namedSci);
  assert.ok(b.texts.includes('Sine Wave'), `top title is not the name (got ${JSON.stringify(b.texts)})`);
  assert.ok(!b.texts.includes('sin(x)'), `formula leaked into the top title (got ${JSON.stringify(b.texts)})`);

  // Scientist mode without a name: the formula itself is the title line.
  const unnamedSci = sceneFor('sin(x)', SCIENTIST);
  assert.equal(unnamedSci.equationName, null);
  const c = recordingCtx();
  drawStaticLayer(c.ctx, unnamedSci);
  assert.ok(c.texts.includes('sin(x)'), `top title missing the formula (got ${JSON.stringify(c.texts)})`);
});

test('the bottom equation is drawn in the theme colour', () => {
  // The equation text is a fill, not a stroke, so assert on fillStyle:
  // the purple theme hex must appear when the scene is purple.
  const scene = sceneFor('sin(x)', null, 'landscape', '720p', 'purple');
  const { ctx, fillStyles, texts } = recordingCtx();
  drawStaticLayer(ctx, scene);
  assert.ok(texts.includes('f(x) = sin(x)'), `bottom equation missing (got ${JSON.stringify(texts)})`);
  assert.ok(fillStyles.includes('#E879F9'), `bottom equation is not purple (fillStyles ${JSON.stringify(fillStyles)})`);
});

test('the scientist name appears only for scientist equations', () => {
  // Scientist mode: the name is the first line.
  const sci = sceneFor('sin(x)', SCIENTIST);
  const a = recordingCtx();
  drawStaticLayer(a.ctx, sci);
  assert.ok(a.texts.includes('Leonhard Euler'), `scientist name missing (got ${JSON.stringify(a.texts)})`);

  // User mode: no scientist name anywhere in the frame.
  const user = sceneFor('sin(x)', null);
  const b = recordingCtx();
  drawStaticLayer(b.ctx, user);
  assert.ok(!b.texts.includes('Leonhard Euler'), `scientist name leaked into a normal equation (got ${JSON.stringify(b.texts)})`);
  assert.ok(b.texts.includes('f(x) = sin(x)'), `bottom equation missing (got ${JSON.stringify(b.texts)})`);
});

/* ── v24: no name at the top for user equations, Instrument Serif italic
 * for the watermark and the outro tagline, small x/y axis letters ─────── */

test('the watermark is in the same Instrument Serif italic as the intro title', () => {
  // v24: the watermark "mathsonify.com" uses the intro "MathSonify" font —
  // italic Instrument Serif — not the JetBrains Mono of the tick numbers.
  for (const scientist of [null, SCIENTIST]) {
    const scene = sceneFor('sin(x)', scientist);
    const { ctx, drawn } = recordingCtx();
    drawStaticLayer(ctx, scene);
    const wm = drawn.find((d) => d.text === WATERMARK_TEXT);
    assert.ok(wm, `watermark not drawn (got ${JSON.stringify(drawn.map((d) => d.text))})`);
    assert.ok(wm.font.includes('Instrument Serif'), `watermark font is not Instrument Serif (got ${wm.font})`);
    assert.ok(wm.font.includes('italic'), `watermark font is not italic (got ${wm.font})`);
    assert.ok(!wm.font.includes('JetBrains Mono'), `watermark still uses JetBrains Mono (got ${wm.font})`);
  }
});

test('the outro tagline is in Instrument Serif italic, not JetBrains Mono', () => {
  // v24: "Turn math into sound" matches the intro title font. The intro
  // title itself is unchanged (still Instrument Serif italic).
  const scene = sceneFor('sin(x)', null);
  const { ctx, drawn } = recordingCtx();
  drawExportFrame(ctx, scene, totalDurationMs(4000) - 100); // outro phase
  const tag = drawn.find((d) => d.text === 'Turn math into sound');
  assert.ok(tag, `outro tagline not drawn (got ${JSON.stringify(drawn.map((d) => d.text))})`);
  assert.ok(tag.font.includes('Instrument Serif'), `outro tagline font is not Instrument Serif (got ${tag.font})`);
  assert.ok(tag.font.includes('italic'), `outro tagline font is not italic (got ${tag.font})`);
  assert.ok(!tag.font.includes('JetBrains Mono'), `outro tagline still uses JetBrains Mono (got ${tag.font})`);
});

test('small x and y letters sit at the axis arrowheads', () => {
  // v24: a small italic "x" just past the x-axis arrowhead and a small
  // italic "y" just above the y-axis arrowhead, in both modes and both
  // orientations (the axes are visible for sin(x) in both).
  for (const scientist of [null, SCIENTIST]) {
    for (const orientation of ['landscape', 'portrait'] as const) {
      const scene = sceneFor('sin(x)', scientist, orientation);
      const { ctx, drawn } = recordingCtx();
      drawStaticLayer(ctx, scene);
      const x = drawn.find((d) => d.text === 'x');
      const y = drawn.find((d) => d.text === 'y');
      assert.ok(x, `x axis letter missing (${orientation}, ${scientist ? 'scientist' : 'user'})`);
      assert.ok(y, `y axis letter missing (${orientation}, ${scientist ? 'scientist' : 'user'})`);
      assert.ok(x.font.includes('Instrument Serif'), `x letter font is not Instrument Serif (got ${x.font})`);
      assert.ok(y.font.includes('Instrument Serif'), `y letter font is not Instrument Serif (got ${y.font})`);
    }
  }
});

test('layoutFor gives the v22 panel and line positions', () => {
  // Landscape 720p: panel 64% wide, 44% tall, centred.
  const land = layoutFor(1280, 720, 'landscape', 'user');
  assert.deepEqual(land.panel, { x: 0.18 * 1280, y: 0.2 * 720, w: 0.64 * 1280, h: 0.44 * 720 });
  assert.equal(land.scientistNameY, null);
  assert.equal(land.equationNameY, 0.08 * 720);
  assert.equal(land.equationY, 0.72 * 720);
  assert.equal(land.watermarkY, 0.8 * 720);

  // Portrait 720p: panel 76% wide, 40% tall, right edge at the safe zone.
  const port = layoutFor(720, 1280, 'portrait', 'scientist');
  assert.deepEqual(port.panel, { x: 0.1 * 720, y: 0.22 * 1280, w: 0.76 * 720, h: 0.4 * 1280 });
  assert.equal(port.scientistNameY, 0.13 * 1280);
  assert.equal(port.equationNameY, 0.175 * 1280);
  assert.equal(port.equationY, 0.68 * 1280);
  assert.equal(port.watermarkY, 0.75 * 1280);
});
