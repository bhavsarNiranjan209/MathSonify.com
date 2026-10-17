/**
 * plot2d.ts — 2D graph renderer where the tick numbers CANNOT vanish during playback.
 *
 * Root cause of "readings disappear when I press play": the per-frame redraw clears the
 * canvas and repaints only the curve + playhead, so anything drawn once (axes, tick numbers)
 * is wiped on the first animation frame.
 *
 * Fix: grid + axes + ghost curve + tick numbers are painted ONCE into an offscreen layer
 * (only when data / theme / size changes). Every frame does clear -> drawImage(layer) ->
 * bright curve -> head dot. No code path clears the canvas without compositing the layer back.
 */
import { computeView, formatTick, type View, type XY } from './plotMath';

export type PlotTheme = 'light' | 'dark';
const FONT = '11px "JetBrains Mono", ui-monospace, Menlo, monospace';
const PALETTE = {
  dark: { grid: 'rgba(255,255,255,0.07)', frame: 'rgba(255,255,255,0.14)', axis: 'rgba(255,255,255,0.55)', text: '#C3C6CD', curve: '#FFFFFF', ghost: 'rgba(255,255,255,0.16)', glow: 'rgba(255,255,255,0.55)' },
  light: { grid: 'rgba(20,22,26,0.10)', frame: 'rgba(20,22,26,0.22)', axis: 'rgba(20,22,26,0.75)', text: '#2b2e35', curve: '#14161A', ghost: 'rgba(20,22,26,0.16)', glow: 'rgba(20,22,26,0.22)' },
} as const;

export interface Plot2D {
  setPoints(points: XY[]): void;
  setTheme(theme: PlotTheme): void;
  /** call from a ResizeObserver */
  resize(): void;
  /** null = idle (whole curve); 0..1 = playing (curve draws in up to that fraction) */
  draw(progress: number | null): void;
  destroy(): void;
}

export function createPlot2D(canvas: HTMLCanvasElement): Plot2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable');
  const g: CanvasRenderingContext2D = ctx;
  const layer = document.createElement('canvas');
  const lctx = layer.getContext('2d')!;
  const PAD = { l: 46, r: 14, t: 12, b: 28 };
  let points: XY[] = [];
  let theme: PlotTheme = 'dark';
  let view: View = computeView([], 1, 1);
  let cssW = 0, cssH = 0, dpr = 1, dirty = true;
  let lastProgress: number | null = null;

  const plotW = () => Math.max(1, cssW - PAD.l - PAD.r);
  const plotH = () => Math.max(1, cssH - PAD.t - PAD.b);
  const px = (x: number) => PAD.l + view.toX(x);
  const py = (y: number) => PAD.t + view.height - view.toY(y);

  function rebuild() {
    view = computeView(points, plotW(), plotH());
    lctx.font = FONT; // left padding grows with the widest y label, so big/negative numbers never clip
    let widest = 0;
    for (const t of view.yTicks.ticks) widest = Math.max(widest, lctx.measureText(formatTick(t, view.yTicks.step)).width);
    PAD.l = Math.max(36, Math.ceil(widest) + 14);
    view = computeView(points, plotW(), plotH());
    dirty = true;
  }

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w < 2 || h < 2) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cssW = w; cssH = h;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    layer.width = canvas.width; layer.height = canvas.height;
    rebuild();
    draw(lastProgress); // resizing wipes the canvas — repaint immediately
  }

  /** Trace all segments up to float sample index `upTo`; returns the head position if it sits on the curve. */
  function trace(c: CanvasRenderingContext2D, upTo: number): { x: number; y: number } | null {
    let head: { x: number; y: number } | null = null;
    for (const seg of view.segments) {
      if (upTo < seg.start) break;
      const last = Math.min(seg.end, Math.floor(upTo));
      c.moveTo(px(points[seg.start].x), py(points[seg.start].y));
      for (let i = seg.start + 1; i <= last; i++) c.lineTo(px(points[i].x), py(points[i].y));
      if (upTo > last && upTo <= seg.end) {
        const a = points[last], b = points[last + 1], f = upTo - last;
        const hx = px(a.x + (b.x - a.x) * f), hy = py(a.y + (b.y - a.y) * f);
        c.lineTo(hx, hy);
        head = { x: hx, y: hy };
      }
    }
    return head;
  }

  function renderLayer() {
    const p = PALETTE[theme];
    const x0 = PAD.l, y0 = PAD.t, w = plotW(), h = plotH();
    lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    lctx.clearRect(0, 0, cssW, cssH);
    lctx.lineWidth = 1; lctx.strokeStyle = p.grid; lctx.beginPath(); // gridlines sit exactly on tick values
    for (const t of view.xTicks.ticks) { const X = Math.round(px(t)) + 0.5; lctx.moveTo(X, y0); lctx.lineTo(X, y0 + h); }
    for (const t of view.yTicks.ticks) { const Y = Math.round(py(t)) + 0.5; lctx.moveTo(x0, Y); lctx.lineTo(x0 + w, Y); }
    lctx.stroke();
    lctx.strokeStyle = p.frame; lctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);
    lctx.strokeStyle = p.axis; lctx.lineWidth = 1.25; lctx.beginPath(); // axes through data zero
    const ax = Math.round(px(view.yAxisX)) + 0.5, ay = Math.round(py(view.xAxisY)) + 0.5;
    lctx.moveTo(ax, y0); lctx.lineTo(ax, y0 + h); lctx.moveTo(x0, ay); lctx.lineTo(x0 + w, ay);
    lctx.stroke();
    if (points.length > 1 && view.segments.length) { // faint full curve for context
      lctx.save(); lctx.beginPath(); lctx.rect(x0, y0, w, h); lctx.clip();
      lctx.beginPath(); trace(lctx, points.length - 1);
      lctx.strokeStyle = p.ghost; lctx.lineWidth = 1.4; lctx.lineJoin = 'round'; lctx.stroke();
      lctx.restore();
    }
    lctx.font = FONT; lctx.fillStyle = p.text; // tick numbers last, in the padding
    lctx.textAlign = 'center'; lctx.textBaseline = 'top';
    for (const t of view.xTicks.ticks) {
      const X = px(t), s = formatTick(t, view.xTicks.step), tw = lctx.measureText(s).width;
      if (X - tw / 2 < 2 || X + tw / 2 > cssW - 2) continue;
      lctx.fillText(s, X, y0 + h + 7);
    }
    lctx.textAlign = 'right'; lctx.textBaseline = 'middle';
    for (const t of view.yTicks.ticks) lctx.fillText(formatTick(t, view.yTicks.step), x0 - 7, py(t));
    lctx.textAlign = 'left'; lctx.textBaseline = 'alphabetic';
    lctx.fillText('x', x0 + w - 8, Math.min(y0 + h - 6, ay - 6));
    lctx.fillText('y', Math.min(x0 + w - 12, ax + 6), y0 + 11);
    dirty = false;
  }

  function draw(progress: number | null) {
    lastProgress = progress;
    if (!cssW) resize();
    if (!cssW) return;
    if (dirty) renderLayer();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cssW, cssH);
    g.drawImage(layer, 0, 0, cssW, cssH); // grid + axes + ghost + NUMBERS: composited on EVERY frame
    if (points.length < 2 || !view.segments.length) return;
    const p = PALETTE[theme];
    const upTo = progress == null ? points.length - 1 : Math.max(0, Math.min(1, progress)) * (points.length - 1);
    g.save(); g.beginPath(); g.rect(PAD.l, PAD.t, plotW(), plotH()); g.clip();
    g.beginPath();
    const head = trace(g, upTo);
    g.strokeStyle = p.curve; g.lineWidth = 2.4; g.lineJoin = 'round'; g.lineCap = 'round';
    g.shadowColor = p.glow; g.shadowBlur = 8; g.stroke();
    g.restore();
    if (progress != null && head) {
      g.beginPath(); g.arc(head.x, head.y, 4.5, 0, Math.PI * 2);
      g.fillStyle = p.curve; g.shadowColor = p.glow; g.shadowBlur = 12; g.fill(); g.shadowBlur = 0;
    }
  }

  return {
    setPoints(next) { points = next; if (cssW) rebuild(); else dirty = true; draw(lastProgress); },
    setTheme(t) { theme = t; dirty = true; draw(lastProgress); },
    resize, draw,
    destroy() { layer.width = layer.height = 0; points = []; },
  };
}