/**
 * Graph image export for MathSonify.
 *
 * Layout — top to bottom, strictly in order:
 *   1. Graph — rendered through the shared video scene (v21b): pure black
 *      background with no grid, solid white axes with arrowheads, small grey
 *      tick numbers, and the full curve in the chosen theme colour. This is
 *      the same look as the video export, so image and video match. If the
 *      scene cannot be built (missing curve inputs, or an equation that
 *      produces no valid values) it falls back to the live-canvas capture:
 *      gradient background + subtle grid + the Studio canvas as-is.
 *   2. Blank accent line (thin horizontal rule in accent colour)
 *   3. Info bar — equation name + equation + scientist on a solid band
 *   4. Ghosted "MathSonify.com" text, bottom-right
 *
 * The graph interior is never obstructed: no pill or text sits on it.
 * The watermark text sits in the bottom-right corner of the graph area,
 * small and quiet, so the curve stays the subject.
 */

import { drawWatermark } from './watermark';
import { getThemeMode, getCanvasPalette } from './theme';
import { resolveActiveCurve } from './activeCurve';
import {
  prepareVideoScene,
  drawExportGraph,
  isVideoColorTheme,
  DEFAULT_VIDEO_COLOR_THEME,
  type VideoColorTheme,
} from './videoScene';
import type { SplineControlPoint } from './curveSpline';
import type { Scientist } from '../data/scientists';

export interface GraphExportOptions {
  format?: 'png' | 'jpeg';
  quality?: number;
  /** Always true — watermark cannot be disabled. */
  watermark?: boolean;
  /** Resolution multiplier. Default: 2 */
  scaleFactor?: number;
  canvasSelector?: string;
  equationText?: string;
  equationName?: string;
  scientistName?: string;
  /** Curve colour (v21b). White is the black-and-white look. */
  colorTheme?: VideoColorTheme;
  /** Full scientist record when the equation came from the library. */
  scientist?: Scientist | null;
  /** Live domain, so the scene renders the same curve as the Studio. */
  minX?: number;
  maxX?: number;
  /** Sculpted/freehand curve state — decides equation vs. spline. */
  isCustomCurve?: boolean;
  splineControlPoints?: SplineControlPoint[];
  /** Clip length in seconds (only used to build the scene). */
  duration?: number;
}

/**
 * Geometry of the image-export watermark text.
 *
 * The text sits in the BOTTOM-RIGHT corner of the graph area — never in the
 * middle of the curve, never over the axes. It is deliberately small
 * (~11px font at 1x) and quiet (opacity 0.5) so the graph stays the subject
 * and the watermark stays the signature.
 */
export function imageWatermarkRect(
  exportWidth: number,
  graphH: number,
  scaleFactor: number,
): { x: number; y: number; w: number; h: number; fontSize: number } {
  const fontSize = Math.round(11 * scaleFactor);
  // Width is measured against the real font at draw time; this estimate only
  // positions the rect for tests and for the pre-measure layout. The draw
  // code re-measures and re-anchors to the same corner.
  const estTextW = 'MathSonify.com'.length * fontSize * 0.58;
  const w = Math.round(estTextW);
  const h = fontSize;
  const margin = Math.round(16 * scaleFactor);
  return {
    x: exportWidth - margin - w,
    y: graphH - margin - h,
    w,
    h,
    fontSize,
  };
}

/**
 * Renders the graph through the shared video scene (v21b) — the same look as
 * the video export: pure black, no grid, white axes with arrowheads, small
 * grey tick numbers, and the full curve in the chosen theme colour.
 *
 * Returns false when the scene cannot be built (the caller did not pass the
 * curve inputs, or the equation produces no valid values) so the caller falls
 * back to the live-canvas capture instead of failing the export.
 */
function renderGraphViaScene(
  ctx: CanvasRenderingContext2D,
  opts: GraphExportOptions,
  exportWidth: number,
  graphH: number,
): boolean {
  const {
    colorTheme,
    minX,
    maxX,
    isCustomCurve,
    splineControlPoints,
    scientist,
    scientistName,
    equationText,
    duration,
  } = opts;
  if (minX === undefined || maxX === undefined || !equationText) return false;
  try {
    const curve = resolveActiveCurve({
      equation: equationText,
      minX,
      maxX,
      isCustomCurve: isCustomCurve ?? false,
      splineControlPoints: splineControlPoints ?? [],
    });
    const scene = prepareVideoScene({
      ctx,
      equation: equationText,
      curve,
      minX,
      maxX,
      mainMs: (duration ?? 5) * 1000,
      scientist: scientist ?? null,
      scientistName: scientistName ?? null,
      colorTheme: isVideoColorTheme(colorTheme) ? colorTheme : DEFAULT_VIDEO_COLOR_THEME,
      width: exportWidth,
      height: graphH,
      // Fuller-bleed than the video layout: the image has no top pill or
      // watermark strip inside the graph area, so the graph fills it.
      panel: {
        x: 0.04 * exportWidth,
        y: 0.05 * graphH,
        w: 0.92 * exportWidth,
        h: 0.84 * graphH,
      },
    });
    drawExportGraph(ctx, scene);
    return true;
  } catch {
    return false;
  }
}

export async function captureCanvasAsBlob(
  opts?: GraphExportOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  const {
    format = 'png',
    quality = 0.92,
    watermark: showWatermark = true,
    scaleFactor = 2,
    canvasSelector = '[data-export-canvas]',
    equationText,
    equationName,
    scientistName,
  } = opts ?? {};

  const sourceCanvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
  if (!sourceCanvas) throw new Error('Canvas element not found for export');

  const displayWidth = sourceCanvas.getBoundingClientRect().width;
  const displayHeight = sourceCanvas.getBoundingClientRect().height;

  // Extra height reserved below the graph for the info bar (when present).
  const hasInfo = !!(equationName || equationText || scientistName);
  const infoBarH_px = hasInfo ? Math.round(64 * scaleFactor) : 0;
  const accentLineH_px = hasInfo ? Math.max(1, Math.round(3 * scaleFactor)) : 0;

  const exportWidth = Math.round(displayWidth * scaleFactor);
  const exportHeight = Math.round(displayHeight * scaleFactor) + infoBarH_px + accentLineH_px;

  const offscreen = document.createElement('canvas');
  offscreen.width = exportWidth;
  offscreen.height = exportHeight;

  const ctx = offscreen.getContext('2d');
  if (!ctx) throw new Error('Failed to create offscreen canvas context');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const theme = getThemeMode();
  const palette = getCanvasPalette(theme);
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const graphH = Math.round(displayHeight * scaleFactor);

  // ── 1. Graph ───────────────────────────────────────────────────────
  // v21b: render through the shared video scene (pure black, no grid, white
  // axes + arrowheads, theme curve) — the same look as the video export.
  // Falls back to the live-canvas capture when the scene cannot be built.
  const graphRendered = renderGraphViaScene(ctx, opts ?? {}, exportWidth, graphH);
  if (!graphRendered) {
    // Legacy path: gradient background + subtle grid + the live canvas.
    const gradient = ctx.createLinearGradient(0, 0, 0, exportHeight);
    if (isDark) {
      gradient.addColorStop(0, '#0E1216');
      gradient.addColorStop(1, palette.canvas);
    } else if (isLight) {
      gradient.addColorStop(0, '#FFFFFF');
      gradient.addColorStop(1, '#F2F2F2');
    } else {
      gradient.addColorStop(0, '#2D3A4E');
      gradient.addColorStop(1, '#1B2430');
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, exportWidth, exportHeight);

    // Subtle grid only over the graph area.
    ctx.save();
    ctx.strokeStyle = palette.grid;
    ctx.lineWidth = Math.max(1, scaleFactor * 0.6);
    const gridStep = Math.round(28 * scaleFactor);
    for (let x = gridStep; x < exportWidth; x += gridStep) {
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, graphH);
      ctx.stroke();
    }
    for (let y = gridStep; y < graphH; y += gridStep) {
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(exportWidth, y + 0.5);
      ctx.stroke();
    }
    ctx.restore();

    // Source canvas (graph only, no overlay).
    ctx.save();
    ctx.scale(scaleFactor, scaleFactor);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(sourceCanvas, 0, 0, displayWidth, displayHeight);
    ctx.restore();
  }

  // ── 4. Accent line — thin rule separating graph from info bar ─────
  if (hasInfo) {
    const accentColour = isDark ? '#FFFFFF' : isLight ? '#000000' : '#C9A24B';
    ctx.fillStyle = accentColour;
    ctx.fillRect(0, graphH, exportWidth, accentLineH_px);
  }

  // ── 5. Info bar below the graph ──────────────────────────────────
  //    Row: [Equation name  •  equation  —  by Scientist]
  //    Nothing is drawn inside the graph itself.
  if (hasInfo) {
    const barTop = graphH + accentLineH_px;
    const barBg = isLight
      ? '#0F0F0F'
      : isDark
        ? '#1A1D20'
        : '#111827';
    ctx.fillStyle = barBg;
    ctx.fillRect(0, barTop, exportWidth, infoBarH_px);

    // Compose single-row text: "Name  ·  equation  —  by Founder"
    // Fall back to whatever pieces are available.
    const parts: { text: string; font: string; color: string }[] = [];
    const accentCol = isDark ? '#E8E8E6' : isLight ? '#FFFFFF' : '#C9A24B';
    const mutedCol  = isDark ? 'rgba(242,242,240,0.65)' : isLight ? 'rgba(255,255,255,0.62)' : 'rgba(237,231,217,0.62)';
    const eqCol     = isDark ? '#FFFFFF' : '#FFFFFF';

    const nameFs = Math.round(11 * scaleFactor);
    const eqFs   = Math.round(13 * scaleFactor);

    if (equationName) {
      parts.push({ text: equationName, font: `700 ${nameFs}px "Fraunces", serif`, color: accentCol });
    }
    if (equationText) {
      if (parts.length) parts.push({ text: '  ·  ', font: `400 ${nameFs}px "Inter", sans-serif`, color: mutedCol });
      parts.push({ text: equationText, font: `600 ${eqFs}px "JetBrains Mono", monospace`, color: eqCol });
    }
    if (scientistName) {
      parts.push({ text: `  —  by ${scientistName}`, font: `400 ${nameFs}px "Inter", sans-serif`, color: mutedCol });
    }

    // Measure total width so we can center the row
    let totalW = 0;
    for (const p of parts) {
      ctx.font = p.font;
      totalW += ctx.measureText(p.text).width;
    }
    // If too wide, truncate equation text
    if (totalW > exportWidth - 24 * scaleFactor) {
      // Truncate the equation piece to fit
      const eqIdx = parts.findIndex((p) => p.font.includes('JetBrains'));
      if (eqIdx !== -1) {
        const available = exportWidth - 24 * scaleFactor - (totalW - ctx.measureText(parts[eqIdx].text).width);
        let t = parts[eqIdx].text;
        ctx.font = parts[eqIdx].font;
        while (t.length > 1 && ctx.measureText(t + '…').width > available) t = t.slice(0, -1);
        parts[eqIdx].text = t + (t.length < (equationText?.length ?? 0) ? '…' : '');
        totalW = 0;
        for (const p of parts) { ctx.font = p.font; totalW += ctx.measureText(p.text).width; }
      }
    }

    let cx = (exportWidth - totalW) / 2;
    const cy = barTop + infoBarH_px / 2;
    ctx.textBaseline = 'middle';
    for (const p of parts) {
      ctx.font = p.font;
      ctx.fillStyle = p.color;
      ctx.textAlign = 'left';
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.fillText(p.text, cx, cy);
      cx += ctx.measureText(p.text).width;
    }
  }

  // ── 6. Watermark — ghosted text, bottom-right corner of the graph area ──
  //    Never in the middle of the curve, never over the axes: the graph
  //    stays the subject and the watermark stays the signature. Faint text
  //    only — no pill, no badge — and it never moves.
  if (showWatermark) {
    drawWatermark(ctx, exportWidth, graphH, {
      position: 'bottom-right',
      fontSize: Math.round(11 * scaleFactor),
      opacity: 0.5,
      padding: Math.round(16 * scaleFactor),
    });
  }

  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  return new Promise((resolve, reject) => {
    offscreen.toBlob(
      (blob) => (blob ? resolve({ blob, width: exportWidth, height: exportHeight }) : reject(new Error('Failed to create image blob'))),
      mimeType,
      quality,
    );
  });
}

export async function exportGraphAsImage(
  equation: string,
  opts?: GraphExportOptions,
): Promise<void> {
  const { blob } = await captureCanvasAsBlob({
    ...opts,
    equationText: opts?.equationText ?? equation,
  });
  const sanitized = equation.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
  const fmt = opts?.format ?? 'png';
  const filename = `mathsonify.com-graph-${sanitized}.${fmt}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
