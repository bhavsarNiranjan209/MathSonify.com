/**
 * Frame compositor for the video export — v2 (Prompt B).
 *
 * Every drawing routine here is a pure function of (scene, elapsedMs) against a
 * supplied 2D context. There is no module-level animation state, no DOM and no
 * MediaRecorder: the exporter drives the clock, the tests drive it with fake
 * timestamps. That is what makes "does the ticker loop seamlessly" and "does
 * the watermark stay below the graph" checkable rather than a vibe.
 *
 * THE LOOK (v21b — the @lingualin reference, corrected per the owner):
 *   - Pure black #000 background. NO grid — the owner wants the background
 *     clean, like the reference.
 *   - Axes are solid white, thicker than before, with arrowheads at their
 *     ends. Tick numbers stay exactly as they were: small grey JetBrains
 *     Mono text (~2.7% of the short side), plain — never in pills, never
 *     recoloured. The owner was explicit: only the background, the axis and
 *     the curve colour change.
 *   - The curve is the chosen theme colour (White / Blue / Green / Purple),
 *     thick and glowing, drawn as stacked strokes. There is NO per-frame
 *     shadowBlur or gradient anywhere in the frame loop — that is what made
 *     the old clips stutter (labelled 60fps, really ~28–52fps).
 *   - No faint full curve: the trace reveals the curve, like the reference.
 *   - The static layer (background, axes, numbers, top labels, watermark,
 *     ticker band) is drawn ONCE into an offscreen canvas and reused; each
 *     frame only paints the traced curve, the playhead and the scrolling
 *     ticker text.
 *   - The watermark is exactly "mathsonify.com", fixed at the right end of
 *     a strip BELOW the graph. One place, never moving — it never crosses
 *     the curve. It is NOT a pill and it does NOT say "MathSonify.com".
 *   - The top label pill ("Equation: …" / scientist name) is unchanged.
 *   - The same scene renders the image export (drawExportGraph): background
 *     + axes + numbers + the full curve, with no top pill, no ticker and no
 *     watermark — the image's info bar and watermark are added by
 *     graphExporter, so this must not draw them.
 *   - Landscape 16:9 (default) and portrait 9:16, each at 720p or 1080p.
 *     Portrait keeps the graph out of the top 12% and bottom 20% (and the
 *     right 14% mid-height) that Reels / Shorts / TikTok cover with buttons.
 *   - Intro and outro cards are unchanged: "MathSonify / Equation: …" in,
 *     "Made with MathSonify.com / Turn math into sound" out.
 */

import { paddedYRange, type ActiveCurve } from './activeCurve';
import { equationLabel } from './equationLabel';
import type { SamplePoint } from './equationParser';
import type { Scientist } from '../data/scientists';

/** Default export: landscape 720p. */
export const VIDEO_W = 1280;
export const VIDEO_H = 720;
export const FPS = 60;

export const INTRO_MS = 1100;
export const OUTRO_MS = 1100;

export type VideoOrientation = 'landscape' | 'portrait';
export type VideoQuality = '720p' | '1080p';

/** The four export sizes. Landscape is the default; portrait is 9:16. */
export function videoSize(
  orientation: VideoOrientation,
  quality: VideoQuality,
): { width: number; height: number } {
  if (orientation === 'portrait') {
    return quality === '1080p' ? { width: 1080, height: 1920 } : { width: 720, height: 1280 };
  }
  return quality === '1080p' ? { width: 1920, height: 1080 } : { width: 1280, height: 720 };
}

/** The watermark is the domain only — never "MathSonify · mathsonify.com". */
export const WATERMARK_TEXT = 'mathsonify.com';

/** Tick numbers are ~2.7% of the short side (19px at 720p, 29px at 1080p). */
export const TICK_FRACTION_OF_SHORT_SIDE = 0.027;

/** Phone safe zones (fractions of the frame) that Reels/Shorts/TikTok cover. */
export const SAFE_TOP = 0.12;
export const SAFE_BOTTOM = 0.2;
export const SAFE_RIGHT = 0.14;

const COLORS = {
  bg: '#000000',
  text: '#F5F5F2',
  muted: '#9A9AA2',
  dim: '#7A7A82',
  scientist: '#7FB2E5',
  scientistText: '#DCEBFB',
  scientistPillBg: 'rgba(127,178,229,0.14)',
  scientistPillBorder: 'rgba(127,178,229,0.35)',
  /** Axes are solid white (v21b) — the reference look. Was a faint 0.25 alpha. */
  axis: '#FFFFFF',
  /** Tick numbers stay plain grey text, exactly as before (v21b). */
  tick: 'rgba(255,255,255,0.45)',
  tickerBg: 'rgba(127,178,229,0.07)',
  tickerBorder: 'rgba(127,178,229,0.2)',
  watermarkAlpha: 0.55,
};

/**
 * The four export curve colours (v21b). White is the black-and-white look;
 * the other three are the glowing colours from the reference. The picker in
 * the Export modal offers all four, for image and video together.
 */
export type VideoColorTheme = 'white' | 'blue' | 'green' | 'purple';

export const VIDEO_COLOR_THEMES: Record<VideoColorTheme, { label: string; hex: string }> = {
  white: { label: 'White', hex: '#FFFFFF' },
  blue: { label: 'Blue', hex: '#7C6CFF' },
  green: { label: 'Green', hex: '#22FF88' },
  purple: { label: 'Purple', hex: '#E879F9' },
};

export const DEFAULT_VIDEO_COLOR_THEME: VideoColorTheme = 'white';

/** True only for one of the four theme ids — anything else falls back to white. */
export function isVideoColorTheme(v: unknown): v is VideoColorTheme {
  return typeof v === 'string' && v in VIDEO_COLOR_THEMES;
}

/** The curve colour for a theme. The background stays black in every theme. */
export function videoColorThemeHex(theme: VideoColorTheme): string {
  return VIDEO_COLOR_THEMES[theme].hex;
}

export type ExportMode = 'user' | 'scientist';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VideoScene {
  mode: ExportMode;
  orientation: VideoOrientation;
  quality: VideoQuality;
  /** The chosen curve colour (v21b). The background is black in every theme. */
  colorTheme: VideoColorTheme;
  width: number;
  height: number;
  /** min(width, height) — every size in the scene derives from this. */
  shortSide: number;
  /** shortSide / 720 — fonts and pills scale with the frame, not the pixels. */
  uiScale: number;
  /** Tick-number font size in px (~2.7% of the short side). */
  tickFontPx: number;
  /** Equation exactly as typed / selected — never a re-derived string. */
  equation: string;
  scientistName: string | null;
  /** `${name} · ${field} · Equation: ${equation}` or null in user mode. */
  tickerText: string | null;
  /** Valid sample points from the live Create-tab state. */
  points: SamplePoint[];
  /** The same points, pre-mapped to screen pixels once — the frame loop never
   *  re-projects and never allocates. */
  screenPoints: { x: number; y: number }[];
  minX: number;
  maxX: number;
  paddedMinY: number;
  paddedMaxY: number;
  /** Length of the animated middle segment, ms. */
  mainMs: number;
  /** The graph area. No panel is drawn — this is just the mapping region. */
  panel: Rect;
  /** Vertical centre of the top label pill ("Equation: …" / scientist name). */
  labelY: number;
  /** The horizontal strip below the graph the watermark sits in, fixed at its right end. */
  watermarkStrip: Rect;
  /** Measured pixel width of the watermark text (for the right-end anchor). */
  watermarkW: number;
  /** Scientist ticker band, or null in user mode. */
  ticker: { top: number; centerY: number; height: number } | null;
  /** Pixel width of one ticker repetition; 0 when there is no ticker. */
  tickerPeriod: number;
  /** The static layer, drawn once and reused; null until first use (and null
   *  in Node, where there is no document — the caller then draws it inline). */
  staticLayer: HTMLCanvasElement | null;
}

export interface PrepareSceneInput {
  ctx: CanvasRenderingContext2D;
  equation: string;
  curve: ActiveCurve;
  minX: number;
  maxX: number;
  mainMs: number;
  scientist: Scientist | null;
  /** Falls back to this when the store has no full scientist object. */
  scientistName?: string | null;
  orientation?: VideoOrientation;
  quality?: VideoQuality;
  /** Curve colour (v21b). Unknown values fall back to white. */
  colorTheme?: VideoColorTheme;
  /**
   * Exact frame size, for callers that render at a size videoSize() does not
   * cover (the image export renders at the live canvas size). When omitted
   * the size comes from orientation + quality, as before.
   */
  width?: number;
  height?: number;
  /**
   * Exact graph panel, for callers that want the graph to fill more of the
   * frame than the video layout does (the image export has no top pill or
   * watermark strip inside the graph area). When omitted the panel comes
   * from layoutFor(), as before.
   */
  panel?: Rect;
}

/** Human-readable field/context for the scientist ticker. */
export function scientistField(scientist: Scientist): string {
  return `${scientist.category} ${scientist.lifespan}`;
}

interface Layout {
  panel: Rect;
  labelY: number;
  watermarkStrip: Rect;
  ticker: { top: number; centerY: number; height: number } | null;
}

/**
 * The frame layout for an orientation and mode.
 *
 * Landscape: label at the top, graph in the middle, watermark strip below the
 * graph, ticker (scientist mode) along the very bottom.
 *
 * Portrait: the graph sits between the 12% top safe zone and the 20% bottom
 * one, its right edge stops at the 14% right safe zone, the watermark strip
 * sits below the graph, and the ticker sits just above the bottom safe zone.
 */
export function layoutFor(
  width: number,
  height: number,
  orientation: VideoOrientation,
  mode: ExportMode,
  pillH: number,
): Layout {
  if (orientation === 'portrait') {
    const panel: Rect = { x: 0.05 * width, y: 0.19 * height, w: 0.8 * width, h: 0.43 * height };
    const wmCenterY = 0.7 * height;
    const watermarkStrip: Rect = {
      x: panel.x,
      y: wmCenterY - pillH / 2 - 4,
      w: panel.w,
      h: pillH + 8,
    };
    const ticker =
      mode === 'scientist'
        ? { centerY: 0.765 * height, height: 0.045 * height, top: 0.765 * height - 0.0225 * height }
        : null;
    return { panel, labelY: 0.15 * height, watermarkStrip, ticker };
  }

  const panel: Rect = { x: 0.05 * width, y: 0.16 * height, w: 0.9 * width, h: 0.64 * height };
  const wmCenterY = mode === 'scientist' ? 0.855 * height : 0.9 * height;
  const watermarkStrip: Rect = {
    x: panel.x,
    y: wmCenterY - pillH / 2 - 4,
    w: panel.w,
    h: pillH + 8,
  };
  const ticker =
    mode === 'scientist'
      ? { centerY: 0.955 * height, height: 0.072 * height, top: 0.955 * height - 0.036 * height }
      : null;
  return { panel, labelY: 0.086 * height, watermarkStrip, ticker };
}

export function prepareVideoScene(input: PrepareSceneInput): VideoScene {
  const {
    ctx,
    equation,
    curve,
    minX,
    maxX,
    mainMs,
    scientist,
    scientistName,
    orientation = 'landscape',
    quality = '720p',
    colorTheme: colorThemeInput,
    width: widthInput,
    height: heightInput,
    panel: panelInput,
  } = input;

  const valid = curve.points.filter((p) => p.isValid);
  if (valid.length === 0) throw new Error('Cannot export video: equation produced no valid values');

  const name = scientist?.name ?? scientistName ?? null;
  const mode: ExportMode = scientist || scientistName ? 'scientist' : 'user';
  const colorTheme = isVideoColorTheme(colorThemeInput) ? colorThemeInput : DEFAULT_VIDEO_COLOR_THEME;

  const { width, height } =
    widthInput !== undefined && heightInput !== undefined
      ? { width: widthInput, height: heightInput }
      : videoSize(orientation, quality);
  const shortSide = Math.min(width, height);
  const uiScale = shortSide / 720;
  const tickFontPx = Math.round(TICK_FRACTION_OF_SHORT_SIDE * shortSide);
  const pillH = Math.round(44 * uiScale);

  const layout = layoutFor(width, height, orientation, mode, pillH);
  // The image export passes its own panel (no top pill / watermark strip
  // inside the graph area); the video uses the layout panel, as before.
  const panel = panelInput ?? layout.panel;

  // The watermark text width is measured once here — the watermark is fixed,
  // so its position is a pure function of the scene afterwards.
  const wmFontPx = Math.round(15 * uiScale);
  ctx.font = `500 ${wmFontPx}px "JetBrains Mono", ui-monospace, monospace`;
  const watermarkW = ctx.measureText(WATERMARK_TEXT).width;

  let tickerText: string | null = null;
  let tickerPeriod = 0;
  if (mode === 'scientist' && name) {
    const field = scientist ? scientistField(scientist) : '';
    // Trailing spaces are the gap between repetitions — the strip is a single
    // tile repeated, which is what makes the wrap point seamless. The
    // equation goes through the same label helper as the pill and the intro
    // card, so all three read identically.
    tickerText = `${name}  ·  ${field}  ·  ${equationLabel(equation)}      `;
    ctx.font = `500 ${Math.round(18 * uiScale)}px "JetBrains Mono", ui-monospace, monospace`;
    tickerPeriod = ctx.measureText(tickerText).width;
  }

  const { paddedMinY, paddedMaxY } = paddedYRange(valid);

  // Pre-map every point to screen pixels once. The frame loop then only
  // walks this array — no projection math, no allocation per frame.
  const screenPoints = valid.map((p) => ({
    x: mapXInto(panel, minX, maxX, p.x),
    y: mapYInto(panel, paddedMinY, paddedMaxY, p.y),
  }));

  return {
    mode,
    orientation,
    quality,
    colorTheme,
    width,
    height,
    shortSide,
    uiScale,
    tickFontPx,
    equation,
    scientistName: name,
    tickerText,
    points: valid,
    screenPoints,
    minX,
    maxX,
    paddedMinY,
    paddedMaxY,
    mainMs,
    panel,
    labelY: layout.labelY,
    watermarkStrip: layout.watermarkStrip,
    watermarkW,
    ticker: layout.ticker,
    tickerPeriod,
    staticLayer: null,
  };
}

/* ── drawing ──────────────────────────────────────────────────────── */

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  opts: { font?: string; bg?: string; border?: string; color?: string; h?: number; padX?: number } = {},
): void {
  ctx.font = opts.font || '500 20px "JetBrains Mono", ui-monospace, monospace';
  const tw = ctx.measureText(text).width;
  const padX = opts.padX ?? 20;
  const h = opts.h ?? 44;
  const w = tw + padX * 2;
  const x = cx - w / 2;

  ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.08)';
  roundRect(ctx, x, cy - h / 2, w, h, h / 2);
  ctx.fill();
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 1;
    roundRect(ctx, x, cy - h / 2, w, h, h / 2);
    ctx.stroke();
  }

  ctx.fillStyle = opts.color || COLORS.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, cx, cy + 1);
}

/**
 * The graph itself, shared by the video's static layer and the image export:
 * pure black background, white axes with arrowheads, and plain grey tick
 * numbers. No grid, no top pill, no watermark — those belong to the caller.
 */
function drawGraphBase(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  // Pure black. No grid, no glow wash, no vignette, no panel.
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, scene.width, scene.height);
  drawAxes(ctx, scene);
}

/**
 * Everything that never moves in the video: the graph, the top label pill,
 * the watermark and (in scientist mode) the ticker band. Drawn once per
 * scene into the static layer.
 */
export function drawStaticLayer(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  drawGraphBase(ctx, scene);
  drawTopLabels(ctx, scene);
  drawWatermark(ctx, scene);
  if (scene.mode === 'scientist' && scene.ticker) drawTickerBackground(ctx, scene);
}

/**
 * The image export's graph (v21b): background + axes + numbers + the FULL
 * curve, with no top pill, no ticker and no watermark — the image's info bar
 * and watermark are added by graphExporter, so this must not draw them.
 * The curve is the theme colour, drawn whole (progress 1), with no playhead.
 */
export function drawExportGraph(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  drawGraphBase(ctx, scene);
  drawTracedCurve(ctx, scene, 1);
}

/**
 * Builds (once) and returns the offscreen canvas holding the static layer,
 * or null where there is no document (Node/tests) — the caller then draws the
 * static layer inline on the frame context instead.
 */
export function ensureStaticLayer(scene: VideoScene): HTMLCanvasElement | null {
  if (scene.staticLayer) return scene.staticLayer;
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = scene.width;
  canvas.height = scene.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  drawStaticLayer(ctx, scene);
  scene.staticLayer = canvas;
  return canvas;
}

/**
 * The three corners of an arrowhead triangle: the tip, then the two base
 * corners. `dir` is the unit vector the arrow points along (e.g. (1, 0) for
 * right, (0, -1) for up); `len` is tip-to-base and `halfW` is half the base
 * width. Pure geometry, so the video tests can pin it without a canvas.
 */
export function arrowheadPoints(
  tip: { x: number; y: number },
  dir: { x: number; y: number },
  len: number,
  halfW: number,
): [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }] {
  const bx = tip.x - dir.x * len;
  const by = tip.y - dir.y * len;
  // Perpendicular to the direction: (-dir.y, dir.x).
  const px = -dir.y;
  const py = dir.x;
  return [
    { x: tip.x, y: tip.y },
    { x: bx + px * halfW, y: by + py * halfW },
    { x: bx - px * halfW, y: by - py * halfW },
  ];
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  tip: { x: number; y: number },
  dir: { x: number; y: number },
  len: number,
  halfW: number,
): void {
  const [t, a, b] = arrowheadPoints(tip, dir, len, halfW);
  ctx.beginPath();
  ctx.moveTo(t.x, t.y);
  ctx.lineTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.closePath();
  ctx.fillStyle = COLORS.axis;
  ctx.fill();
}

function drawAxes(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  const p = scene.panel;
  const s = scene.uiScale;
  const zeroY = mapY(scene, 0);
  const zeroX = mapX(scene, 0);

  // Solid white axes (v21b), thicker than the old faint 1px lines. The
  // bounds are inclusive: an axis that sits exactly on the panel edge (e.g.
  // a domain starting at 0) is drawn, not dropped.
  const xAxisVisible = zeroY >= p.y && zeroY <= p.y + p.h;
  const yAxisVisible = zeroX >= p.x && zeroX <= p.x + p.w;
  ctx.lineWidth = 2.5 * s;
  ctx.strokeStyle = COLORS.axis;
  if (xAxisVisible) {
    ctx.beginPath();
    ctx.moveTo(p.x, zeroY);
    ctx.lineTo(p.x + p.w, zeroY);
    ctx.stroke();
  }
  if (yAxisVisible) {
    ctx.beginPath();
    ctx.moveTo(zeroX, p.y);
    ctx.lineTo(zeroX, p.y + p.h);
    ctx.stroke();
  }

  // Arrowheads at the ends, reaching into the margins past the panel edge
  // so the end tick numbers never cover them.
  const arrowLen = 14 * s;
  const arrowHalf = 5 * s;
  if (xAxisVisible) {
    drawArrowhead(ctx, { x: p.x + p.w + arrowLen, y: zeroY }, { x: 1, y: 0 }, arrowLen, arrowHalf);
  }
  if (yAxisVisible) {
    drawArrowhead(ctx, { x: zeroX, y: p.y - arrowLen }, { x: 0, y: -1 }, arrowLen, arrowHalf);
  }

  // Ruler ticks, kept faint so the curve stays the brightest element.
  // Numbers are ~2.7% of the short side — about 3x the old 11px at 720p.
  // UNCHANGED in v21b: plain grey text, no pills, same positions as before.
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  ctx.fillStyle = COLORS.tick;
  ctx.font = `500 ${scene.tickFontPx}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.strokeStyle = COLORS.tick;

  const xTickBase = xAxisVisible ? zeroY : p.y + p.h;
  for (let i = 0; i <= 6; i++) {
    const xVal = scene.minX + (i / 6) * (scene.maxX - scene.minX);
    const sx = mapX(scene, xVal);
    ctx.beginPath();
    ctx.moveTo(sx, xTickBase - 3);
    ctx.lineTo(sx, xTickBase + 3);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(fmt(xVal), sx, xTickBase + scene.tickFontPx + 4);
  }

  const yTickBase = yAxisVisible ? zeroX : p.x;
  ctx.textAlign = yAxisVisible ? 'right' : 'left';
  for (let i = 0; i <= 6; i++) {
    const yVal = scene.paddedMinY + (i / 6) * (scene.paddedMaxY - scene.paddedMinY);
    const sy = mapY(scene, yVal);
    ctx.beginPath();
    ctx.moveTo(yTickBase - 3, sy);
    ctx.lineTo(yTickBase + 3, sy);
    ctx.stroke();
    ctx.fillText(fmt(yVal), yAxisVisible ? yTickBase - 7 : yTickBase + 7, sy + scene.tickFontPx / 2 - 1);
  }
}

/**
 * The traced curve: soft glow + bright core + a brighter trail near the head.
 * Stacked strokes only — no shadowBlur, no gradients, so the frame loop stays
 * cheap enough for a real 60fps capture. The colour is the chosen theme
 * (v21b), in both modes; the widths scale with the frame so 1080p keeps the
 * same proportions as 720p.
 */
function drawTracedCurve(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  progress: number,
): void {
  const p = scene.panel;
  const pts = scene.screenPoints;
  if (pts.length === 0) return;
  const color = videoColorThemeHex(scene.colorTheme);
  const s = scene.uiScale;
  const headX = p.x + p.w * progress;

  // Last point index on or before the playhead.
  let headIdx = 0;
  while (headIdx < pts.length - 1 && pts[headIdx + 1].x <= headX) headIdx++;

  ctx.save();
  ctx.beginPath();
  ctx.rect(p.x, p.y, p.w, p.h);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const trace = (width: number, alpha: number, upto: number) => {
    ctx.beginPath();
    for (let i = 0; i <= upto; i++) {
      const pt = pts[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    }
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  trace(12 * s, 0.18, headIdx); // soft glow
  trace(7 * s, 0.4, headIdx); // mid body
  trace(4 * s, 1, headIdx); // bright core
  // Brighter trail: the last 8% of the traced length, drawn once more on top.
  const trailStart = Math.max(0, headIdx - Math.floor(pts.length * 0.08));
  ctx.beginPath();
  for (let i = trailStart; i <= headIdx; i++) {
    const pt = pts[i];
    if (i === trailStart) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.strokeStyle = color;
  ctx.globalAlpha = 1;
  ctx.lineWidth = 5 * s;
  ctx.stroke();

  ctx.restore();
}

/** Playhead: halo, bright core dot, and a slow pulse ring (clock-driven). */
function drawPlayhead(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  progress: number,
  tMs: number,
): void {
  const pts = scene.screenPoints;
  if (pts.length === 0) return;
  const headIdx = Math.max(0, Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1))));
  const hx = pts[headIdx].x;
  const hy = pts[headIdx].y;
  const color = videoColorThemeHex(scene.colorTheme);

  ctx.save();
  // Halo.
  ctx.beginPath();
  ctx.arc(hx, hy, 11, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Slow pulse ring: 1.6s period, expanding and fading.
  const phase = ((tMs % 1600) + 1600) % 1600 / 1600;
  ctx.beginPath();
  ctx.arc(hx, hy, 9 + 14 * phase, 0, Math.PI * 2);
  ctx.globalAlpha = 0.35 * (1 - phase);
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Core dot.
  ctx.beginPath();
  ctx.arc(hx, hy, 5.5, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.globalAlpha = 1;
  ctx.fill();
  ctx.restore();
}

function drawTopLabels(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  const s = scene.uiScale;
  if (scene.mode === 'user') {
    pill(ctx, equationLabel(scene.equation), scene.width / 2, scene.labelY, {
      font: `500 ${Math.round(22 * s)}px "JetBrains Mono", ui-monospace, monospace`,
      h: Math.round(44 * s),
      padX: Math.round(20 * s),
    });
  } else {
    // Scientist mode: serif italic + tinted pill so the name reads as a name,
    // not as another equation.
    pill(ctx, `— ${scene.scientistName} —`, scene.width / 2, scene.labelY, {
      font: `italic 500 ${Math.round(22 * s)}px "Instrument Serif", Georgia, serif`,
      bg: COLORS.scientistPillBg,
      border: COLORS.scientistPillBorder,
      color: COLORS.scientistText,
      h: Math.round(44 * s),
      padX: Math.round(20 * s),
    });
  }
}

function drawTickerBackground(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  if (!scene.ticker) return;
  ctx.fillStyle = COLORS.tickerBg;
  ctx.fillRect(0, scene.ticker.top, scene.width, scene.ticker.height);
  ctx.strokeStyle = COLORS.tickerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, scene.ticker.top + 0.5);
  ctx.lineTo(scene.width, scene.ticker.top + 0.5);
  ctx.stroke();
}

function drawTickerText(ctx: CanvasRenderingContext2D, scene: VideoScene, tMs: number): void {
  if (!scene.tickerText || scene.tickerPeriod <= 0 || !scene.ticker) return;

  ctx.font = `500 ${Math.round(18 * scene.uiScale)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = COLORS.scientistText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Start part-way into a tile and step by exactly one period. Because the
  // strip is one tile repeated, every frame is a pure translation of the last
  // and the wrap point is pixel-identical to any other frame — no seam.
  const period = scene.tickerPeriod;
  let x = -tickerOffset(tMs, period);
  for (let guard = 0; x < scene.width + period && guard < 64; guard++) {
    ctx.fillText(scene.tickerText, x, scene.ticker.centerY);
    x += period;
  }
}

/**
 * The watermark: exactly "mathsonify.com", fixed at the right end of the
 * strip below the graph. One place, never moving — its y never changes, so
 * it can never cross the curve, and it stays clear of the ticker band by
 * construction of the strip.
 */
export function watermarkPosition(scene: VideoScene): { x: number; y: number } {
  const strip = scene.watermarkStrip;
  return { x: strip.x + strip.w - scene.watermarkW / 2, y: strip.y + strip.h / 2 };
}

function drawWatermark(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  const { x, y } = watermarkPosition(scene);
  ctx.save();
  ctx.globalAlpha = COLORS.watermarkAlpha;
  ctx.font = `500 ${Math.round(15 * scene.uiScale)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = COLORS.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WATERMARK_TEXT, x, y);
  ctx.restore();
}

function drawIntro(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  alpha: number,
): void {
  const s = scene.uiScale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 400 ${Math.round(56 * s)}px "Instrument Serif", Georgia, serif`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText(
    scene.mode === 'scientist' ? (scene.scientistName ?? '') : 'MathSonify',
    scene.width / 2,
    scene.height / 2 - Math.round(24 * s),
  );
  ctx.font = `500 ${Math.round(20 * s)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(equationLabel(scene.equation), scene.width / 2, scene.height / 2 + Math.round(30 * s));
  ctx.restore();
}

function drawOutro(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  alpha: number,
): void {
  const s = scene.uiScale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, scene.width, scene.height);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `400 ${Math.round(26 * s)}px "Instrument Serif", Georgia, serif`;
  ctx.fillStyle = COLORS.text;
  ctx.fillText('Made with MathSonify.com', scene.width / 2, scene.height / 2 - Math.round(10 * s));
  ctx.font = `500 ${Math.round(14 * s)}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('Turn math into sound', scene.width / 2, scene.height / 2 + Math.round(26 * s));
  ctx.restore();
}

/** Smoothstep 0..1 ramp, used for both card fades. */
function fade(tMs: number, startMs: number, endMs: number): number {
  if (tMs <= startMs) return 0;
  if (tMs >= endMs) return 1;
  const t = (tMs - startMs) / (endMs - startMs);
  return t * t * (3 - 2 * t);
}

export type ExportPhase = 'intro' | 'main' | 'outro';

/** Which card (if any) is on screen at `t`, and at what opacity. */
export function phaseAt(
  tMs: number,
  mainMs: number,
): { phase: ExportPhase; alpha: number; mainElapsed: number } {
  if (tMs < INTRO_MS) {
    // Fade in over the first 300ms, hold, then fade out into the curve.
    const inA = fade(tMs, 0, 300);
    const outA = 1 - fade(tMs, INTRO_MS - 300, INTRO_MS);
    return { phase: 'intro', alpha: Math.min(inA, outA), mainElapsed: 0 };
  }
  const mainElapsed = tMs - INTRO_MS;
  if (mainElapsed < mainMs) return { phase: 'main', alpha: 1, mainElapsed };
  return {
    phase: 'outro',
    alpha: fade(tMs, INTRO_MS + mainMs, INTRO_MS + mainMs + OUTRO_MS),
    mainElapsed,
  };
}

/** Total clip length in ms. */
export function totalDurationMs(mainMs: number): number {
  return INTRO_MS + mainMs + OUTRO_MS;
}

/**
 * Draws one frame of the export. `tMs` is milliseconds since the first frame,
 * so the caller can render frame N at any rate and still get the same picture.
 *
 * The static layer is drawn once and reused (browser); where there is no
 * document it is drawn inline on the frame context instead, so the picture is
 * identical either way.
 */
export function drawExportFrame(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  tMs: number,
): void {
  const { phase, alpha, mainElapsed } = phaseAt(tMs, scene.mainMs);

  if (phase === 'intro') {
    drawIntro(ctx, scene, alpha);
    return;
  }
  if (phase === 'outro') {
    drawOutro(ctx, scene, alpha);
    return;
  }

  const layer = ensureStaticLayer(scene);
  if (layer) ctx.drawImage(layer, 0, 0);
  else drawStaticLayer(ctx, scene);

  const progress = Math.max(0, Math.min(1, mainElapsed / scene.mainMs));
  drawTracedCurve(ctx, scene, progress);
  drawPlayhead(ctx, scene, progress, tMs);
  if (scene.mode === 'scientist') drawTickerText(ctx, scene, tMs);
}

/** Fraction of the panel height the padded data range occupies. */
const DATA_HEIGHT_FRACTION = 0.72;

function mapXInto(panel: Rect, minX: number, maxX: number, x: number): number {
  const span = maxX - minX;
  if (span === 0) return panel.x + panel.w / 2;
  return panel.x + ((x - minX) / span) * panel.w;
}

function mapYInto(panel: Rect, paddedMinY: number, paddedMaxY: number, y: number): number {
  const midY = panel.y + panel.h / 2;
  const range = paddedMaxY - paddedMinY || 1;
  const t = (y - paddedMinY) / range;
  return midY - (t - 0.5) * panel.h * DATA_HEIGHT_FRACTION;
}

function mapX(scene: VideoScene, x: number): number {
  return mapXInto(scene.panel, scene.minX, scene.maxX, x);
}

function mapY(scene: VideoScene, y: number): number {
  return mapYInto(scene.panel, scene.paddedMinY, scene.paddedMaxY, y);
}

/**
 * Closed-form reflection of a travelling marker inside [lo, hi].
 *
 * A per-frame integrator has to guess how far it overshot and clamp, which
 * stalls the marker on the edge for a frame and reads as a stutter at every
 * bounce. A triangle wave is continuous, hits both bounds exactly, and is
 * deterministic for a given `t` — so the same export renders the same path
 * every time regardless of how many frames the browser actually painted.
 */
export function bouncePosition(
  tSeconds: number,
  start: number,
  lo: number,
  hi: number,
  speed: number,
): number {
  const span = hi - lo;
  if (span <= 0) return lo;
  const cycle = 2 * span;
  const travelled = start - lo + speed * tSeconds;
  const m = ((travelled % cycle) + cycle) % cycle;
  return lo + (m <= span ? m : cycle - m);
}

/**
 * Ticker scroll offset for a given time. Always inside [0, period), so the
 * strip never jumps by a whole tile and the loop point is invisible.
 */
export function tickerOffset(tMs: number, period: number): number {
  if (period <= 0) return 0;
  const travelled = (tMs / 1000) * 66; // px/second, matches the old mock drift
  return ((travelled % period) + period) % period;
}
