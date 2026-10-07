/**
 * Frame compositor for the video export.
 *
 * Every drawing routine here is a pure function of (scene, elapsedMs) against a
 * supplied 2D context. There is no module-level animation state, no DOM and no
 * MediaRecorder: the exporter drives the clock, the tests drive it with fake
 * timestamps. That is what makes "does the ticker loop seamlessly" and "does
 * the watermark actually reach every edge" checkable rather than a vibe.
 */

import { paddedYRange, type ActiveCurve } from './activeCurve';
import { equationLabel } from './equationLabel';
import type { SamplePoint } from './equationParser';
import type { Scientist } from '../data/scientists';

export const VIDEO_W = 1280;
export const VIDEO_H = 720;
export const FPS = 60;

export const INTRO_MS = 1100;
export const OUTRO_MS = 1100;

/** Panel inset — matches the reference renderer. */
const PAD_TOP = 118;
const PAD_BOTTOM = 96;
const PAD_X = 64;
const PANEL_RADIUS = 18;

/** Ticker strip occupies the bottom of the frame in scientist mode. */
const TICKER_CENTER_Y = VIDEO_H - 40;
const TICKER_H = 52;
export const TICKER_TOP = TICKER_CENTER_Y - TICKER_H / 2;

const WATERMARK_H = 44;
const WATERMARK_START = { x: 120, y: 60 };
// The reference renderer integrated 1.3/0.9 *pixels per rendered frame* at
// 60fps. Expressing that as px/second keeps the identical path while making it
// frame-rate independent: 1.3 * 60 = 78, 0.9 * 60 = 54.
const WATERMARK_VEL = { x: 78, y: 54 };
const WATERMARK_MARGIN_X = 70;
const WATERMARK_TOP = 34;
const WATERMARK_BOTTOM_PADDING = 30;

/** Ticker drift, px/second. The mock moved 1.1px per frame at 60fps. */
const TICKER_SPEED_PX_PER_SEC = 66;

/** Fraction of the panel height the padded data range occupies. */
const DATA_HEIGHT_FRACTION = 0.72;

const COLORS = {
  bg: '#0B0B0D',
  panelFill: 'rgba(255,255,255,0.02)',
  panelStroke: 'rgba(255,255,255,0.06)',
  grid: '#FFFFFF',
  gridAlpha: 0.05,
  gridSpacing: 56,
  gridParallaxPxPerSec: 4,
  text: '#F5F5F2',
  muted: '#9A9AA2',
  dim: '#7A7A82',
  scientist: '#7FB2E5',
  scientistText: '#DCEBFB',
  scientistGlow: 'rgba(127,178,229,0.65)',
  scientistGlowBg: 'rgba(127,178,229,0.07)',
  scientistPillBg: 'rgba(127,178,229,0.14)',
  scientistPillBorder: 'rgba(127,178,229,0.35)',
  scientistCurve: '#BFDBFA',
  userGlowBg: 'rgba(255,255,255,0.055)',
  userCurve: '#FFFFFF',
  userGlow: 'rgba(255,255,255,0.55)',
  faintCurve: 'rgba(255,255,255,0.14)',
  axis: 'rgba(255,255,255,0.22)',
  tick: 'rgba(255,255,255,0.38)',
  tickerBg: 'rgba(127,178,229,0.07)',
  tickerBorder: 'rgba(127,178,229,0.2)',
  watermarkBg: 'rgba(255,255,255,0.07)',
  watermarkAlpha: 0.5,
};

export type ExportMode = 'user' | 'scientist';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Bounds {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface VideoScene {
  mode: ExportMode;
  /** Equation exactly as typed / selected — never a re-derived string. */
  equation: string;
  scientistName: string | null;
  /** `${name} · ${field} · Equation: ${equation}` or null in user mode. */
  tickerText: string | null;
  /** Valid sample points from the live Create-tab state. */
  points: SamplePoint[];
  minX: number;
  maxX: number;
  paddedMinY: number;
  paddedMaxY: number;
  /** Length of the animated middle segment, ms. */
  mainMs: number;
  panel: Rect;
  watermarkBounds: Bounds;
  /** Pixel width of one ticker repetition; 0 when there is no ticker. */
  tickerPeriod: number;
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
}

/** Human-readable field/context for the scientist ticker. */
export function scientistField(scientist: Scientist): string {
  return `${scientist.category} ${scientist.lifespan}`;
}

/**
 * Watermark travel rectangle.
 *
 * The vertical bound is derived from the ticker strip rather than hard-coded:
 * the pill's lower edge must stay above TICKER_TOP, so the centre can never
 * travel further than TICKER_TOP minus the pill's half-height minus a gap.
 */
export function watermarkBounds(mode: ExportMode): Bounds {
  const y1 =
    mode === 'scientist'
      ? Math.min(VIDEO_H - 90, TICKER_TOP - WATERMARK_H / 2 - 4)
      : VIDEO_H - WATERMARK_BOTTOM_PADDING;
  return {
    x0: WATERMARK_MARGIN_X,
    x1: VIDEO_W - WATERMARK_MARGIN_X,
    y0: WATERMARK_TOP,
    y1,
  };
}

export function prepareVideoScene(input: PrepareSceneInput): VideoScene {
  const { ctx, equation, curve, minX, maxX, mainMs, scientist, scientistName } = input;

  const valid = curve.points.filter((p) => p.isValid);
  if (valid.length === 0) throw new Error('Cannot export video: equation produced no valid values');

  const name = scientist?.name ?? scientistName ?? null;
  const mode: ExportMode = scientist || scientistName ? 'scientist' : 'user';

  let tickerText: string | null = null;
  let tickerPeriod = 0;
  if (mode === 'scientist' && name) {
    const field = scientist ? scientistField(scientist) : '';
    // Trailing spaces are the gap between repetitions — the strip is a single
    // tile repeated, which is what makes the wrap point seamless. The
    // equation goes through the same label helper as the pill and the intro
    // card, so all three read identically.
    tickerText = `${name}  ·  ${field}  ·  ${equationLabel(equation)}      `;
    ctx.font = '500 18px "JetBrains Mono", ui-monospace, monospace';
    tickerPeriod = ctx.measureText(tickerText).width;
  }

  const { paddedMinY, paddedMaxY } = paddedYRange(valid);

  return {
    mode,
    equation,
    scientistName: name,
    tickerText,
    points: valid,
    minX,
    maxX,
    paddedMinY,
    paddedMaxY,
    mainMs,
    panel: {
      x: PAD_X,
      y: PAD_TOP,
      w: VIDEO_W - PAD_X * 2,
      h: VIDEO_H - PAD_BOTTOM - PAD_TOP,
    },
    watermarkBounds: watermarkBounds(mode),
    tickerPeriod,
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

function drawBackground(ctx: CanvasRenderingContext2D, scene: VideoScene, tSeconds: number): void {
  const W = VIDEO_W;
  const H = VIDEO_H;
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, W, H);

  // Soft, slowly drifting glow — monochrome in user mode, barely-tinted in
  // scientist mode. Kept at a low alpha so it never competes with the curve.
  const gx = W * 0.5 + Math.sin(tSeconds * 0.06) * W * 0.22;
  const gy = H * 0.45 + Math.cos(tSeconds * 0.05) * H * 0.18;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, Math.max(W, H) * 0.55);
  glow.addColorStop(0, scene.mode === 'scientist' ? COLORS.scientistGlowBg : COLORS.userGlowBg);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Fine parallax grid — a few px/second of continuous drift, not static.
  const spacing = COLORS.gridSpacing;
  const off = (tSeconds * COLORS.gridParallaxPxPerSec) % spacing;
  ctx.save();
  ctx.globalAlpha = COLORS.gridAlpha;
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = -spacing + off; x < W; x += spacing) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, H);
  }
  for (let y = 0; y < H; y += spacing) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(W, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();

  // Vignette so the panel reads with depth instead of sitting on a flat plane.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
function drawAxes(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  const p = scene.panel;
  const zeroY = mapY(scene, 0);
  const zeroX = mapX(scene, 0);

  ctx.lineWidth = 1;
  ctx.strokeStyle = COLORS.axis;
  if (zeroY > p.y && zeroY < p.y + p.h) {
    ctx.beginPath();
    ctx.moveTo(p.x, zeroY);
    ctx.lineTo(p.x + p.w, zeroY);
    ctx.stroke();
  }
  if (zeroX > p.x && zeroX < p.x + p.w) {
    ctx.beginPath();
    ctx.moveTo(zeroX, p.y);
    ctx.lineTo(zeroX, p.y + p.h);
    ctx.stroke();
  }

  // Ruler ticks, kept faint so the curve stays the brightest element.
  const fmt = (v: number) => String(Math.round(v * 10) / 10);
  ctx.fillStyle = COLORS.dim;
  ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
  ctx.strokeStyle = COLORS.tick;

  const xTickBase = zeroY > p.y && zeroY < p.y + p.h ? zeroY : p.y + p.h;
  for (let i = 0; i <= 6; i++) {
    const xVal = scene.minX + (i / 6) * (scene.maxX - scene.minX);
    const sx = mapX(scene, xVal);
    ctx.beginPath();
    ctx.moveTo(sx, xTickBase - 3);
    ctx.lineTo(sx, xTickBase + 3);
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(fmt(xVal), sx, xTickBase + 16);
  }

  const yAxisVisible = zeroX > p.x && zeroX < p.x + p.w;
  const yTickBase = yAxisVisible ? zeroX : p.x;
  ctx.textAlign = yAxisVisible ? 'right' : 'left';
  for (let i = 0; i <= 6; i++) {
    const yVal = scene.paddedMinY + (i / 6) * (scene.paddedMaxY - scene.paddedMinY);
    const sy = mapY(scene, yVal);
    ctx.beginPath();
    ctx.moveTo(yTickBase - 3, sy);
    ctx.lineTo(yTickBase + 3, sy);
    ctx.stroke();
    ctx.fillText(fmt(yVal), yAxisVisible ? yTickBase - 7 : yTickBase + 7, sy + 4);
  }
}

function drawCurve(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  progress: number,
): void {
  const p = scene.panel;
  const isSci = scene.mode === 'scientist';
  const pts = scene.points;

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, p.x, p.y, p.w, p.h, PANEL_RADIUS);
  ctx.clip();

  // Faint full curve for context.
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const px = mapX(scene, pts[i].x);
    const py = mapY(scene, pts[i].y);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = COLORS.faintCurve;
  ctx.lineWidth = 1.4;
  ctx.stroke();

  // Bright traced segment up to the playhead.
  const headX = p.x + p.w * progress;
  const headIdx = Math.max(0, Math.min(pts.length - 1, Math.floor(progress * (pts.length - 1))));
  ctx.beginPath();
  let started = false;
  for (let i = 0; i < pts.length; i++) {
    const px = mapX(scene, pts[i].x);
    if (px > headX) break;
    const py = mapY(scene, pts[i].y);
    if (started) ctx.lineTo(px, py);
    else {
      ctx.moveTo(px, py);
      started = true;
    }
  }
  ctx.strokeStyle = isSci ? COLORS.scientistCurve : COLORS.userCurve;
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = isSci ? COLORS.scientistGlow : COLORS.userGlow;
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Glowing playhead dot.
  const hx = mapX(scene, pts[headIdx].x);
  const hy = mapY(scene, pts[headIdx].y);
  const headColor = isSci ? COLORS.scientistCurve : COLORS.userCurve;
  ctx.beginPath();
  ctx.arc(hx, hy, 6, 0, Math.PI * 2);
  ctx.fillStyle = headColor;
  ctx.shadowColor = headColor;
  ctx.shadowBlur = 18;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawTopLabels(ctx: CanvasRenderingContext2D, scene: VideoScene): void {
  if (scene.mode === 'user') {
    pill(ctx, equationLabel(scene.equation), VIDEO_W / 2, 62, {
      font: '500 22px "JetBrains Mono", ui-monospace, monospace',
    });
  } else {
    // Scientist mode: serif italic + tinted pill so the name reads as a name,
    // not as another equation.
    pill(ctx, `— ${scene.scientistName} —`, VIDEO_W / 2, 62, {
      font: 'italic 500 22px "Instrument Serif", Georgia, serif',
      bg: COLORS.scientistPillBg,
      border: COLORS.scientistPillBorder,
      color: COLORS.scientistText,
    });
  }
}

function drawTicker(ctx: CanvasRenderingContext2D, scene: VideoScene, tMs: number): void {
  if (!scene.tickerText || scene.tickerPeriod <= 0) return;

  const top = TICKER_CENTER_Y - TICKER_H / 2;
  ctx.fillStyle = COLORS.tickerBg;
  ctx.fillRect(0, top, VIDEO_W, TICKER_H);
  ctx.strokeStyle = COLORS.tickerBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, top + 0.5);
  ctx.lineTo(VIDEO_W, top + 0.5);
  ctx.stroke();

  ctx.font = '500 18px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = COLORS.scientistText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  // Start part-way into a tile and step by exactly one period. Because the
  // strip is one tile repeated, every frame is a pure translation of the last
  // and the wrap point is pixel-identical to any other frame — no seam.
  const period = scene.tickerPeriod;
  let x = -tickerOffset(tMs, period);
  for (let guard = 0; x < VIDEO_W + period && guard < 64; guard++) {
    ctx.fillText(scene.tickerText, x, TICKER_CENTER_Y);
    x += period;
  }
}

function drawWatermark(ctx: CanvasRenderingContext2D, scene: VideoScene, tMs: number): void {
  const { x, y } = watermarkPosition(tMs, scene.mode);
  ctx.save();
  ctx.globalAlpha = COLORS.watermarkAlpha;
  pill(ctx, 'MathSonify  ·  mathsonify.com', x, y, {
    font: '500 15px "JetBrains Mono", ui-monospace, monospace',
    bg: COLORS.watermarkBg,
  });
  ctx.restore();
}

function drawIntro(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  alpha: number,
  tMs: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBackground(ctx, scene, tMs / 1000);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 400 56px "Instrument Serif", Georgia, serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText(
    scene.mode === 'scientist' ? (scene.scientistName ?? '') : 'MathSonify',
    VIDEO_W / 2,
    VIDEO_H / 2 - 24,
  );
  ctx.font = '500 20px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(equationLabel(scene.equation), VIDEO_W / 2, VIDEO_H / 2 + 30);
  ctx.restore();
}

function drawOutro(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  alpha: number,
  tMs: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  drawBackground(ctx, scene, tMs / 1000);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '400 26px "Instrument Serif", Georgia, serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('Made with MathSonify.com', VIDEO_W / 2, VIDEO_H / 2 - 10);
  ctx.font = '500 14px "JetBrains Mono", ui-monospace, monospace';
  ctx.fillStyle = COLORS.dim;
  ctx.fillText('Turn math into sound', VIDEO_W / 2, VIDEO_H / 2 + 26);
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
 */
export function drawExportFrame(
  ctx: CanvasRenderingContext2D,
  scene: VideoScene,
  tMs: number,
): void {
  const { phase, alpha, mainElapsed } = phaseAt(tMs, scene.mainMs);

  if (phase === 'intro') {
    drawIntro(ctx, scene, alpha, tMs);
    return;
  }
  if (phase === 'outro') {
    drawOutro(ctx, scene, alpha, tMs);
    return;
  }

  drawBackground(ctx, scene, tMs / 1000);
  drawPanel(ctx, scene.panel);
  drawAxes(ctx, scene);
  drawCurve(ctx, scene, Math.max(0, Math.min(1, mainElapsed / scene.mainMs)));
  drawTopLabels(ctx, scene);
  if (scene.mode === 'scientist') drawTicker(ctx, scene, tMs);
  drawWatermark(ctx, scene, tMs);
}

function pill(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  opts: { font?: string; bg?: string; border?: string; color?: string } = {},
): void {
  ctx.font = opts.font || '500 20px "JetBrains Mono", ui-monospace, monospace';
  const tw = ctx.measureText(text).width;
  const padX = 20;
  const h = 44;
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



function drawPanel(ctx: CanvasRenderingContext2D, p: Rect): void {
  ctx.fillStyle = COLORS.panelFill;
  roundRect(ctx, p.x, p.y, p.w, p.h, PANEL_RADIUS);
  ctx.fill();
  ctx.strokeStyle = COLORS.panelStroke;
  ctx.lineWidth = 1;
  roundRect(ctx, p.x, p.y, p.w, p.h, PANEL_RADIUS);
  ctx.stroke();
}

function mapX(scene: VideoScene, x: number): number {
  const span = scene.maxX - scene.minX;
  if (span === 0) return scene.panel.x + scene.panel.w / 2;
  return scene.panel.x + ((x - scene.minX) / span) * scene.panel.w;
}

function mapY(scene: VideoScene, y: number): number {
  const midY = scene.panel.y + scene.panel.h / 2;
  const range = scene.paddedMaxY - scene.paddedMinY || 1;
  const t = (y - scene.paddedMinY) / range;
  return midY - (t - 0.5) * scene.panel.h * DATA_HEIGHT_FRACTION;
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

export function watermarkPosition(tMs: number, mode: ExportMode): { x: number; y: number } {
  const b = watermarkBounds(mode);
  const t = tMs / 1000;
  return {
    x: bouncePosition(t, WATERMARK_START.x, b.x0, b.x1, WATERMARK_VEL.x),
    y: bouncePosition(t, WATERMARK_START.y, b.y0, b.y1, WATERMARK_VEL.y),
  };
}

/**
 * Ticker scroll offset for a given time. Always inside [0, period), so the
 * strip never jumps by a whole tile and the loop point is invisible.
 */
export function tickerOffset(tMs: number, period: number): number {
  if (period <= 0) return 0;
  const travelled = (tMs / 1000) * TICKER_SPEED_PX_PER_SEC;
  return ((travelled % period) + period) % period;
}

