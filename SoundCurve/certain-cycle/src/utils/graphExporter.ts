/**
 * Graph image export for MathSonify.
 *
 * Layout (v22) — top to bottom, strictly in order, the same as the video:
 *   1. Scientist name (scientist equations only)
 *   2. Equation name (or the formula itself when the equation has no name)
 *   3. Graph — rendered through the shared video scene: pure black
 *      background with no grid, solid white axes with arrowheads, small grey
 *      tick numbers, and the full curve in the chosen theme colour. The
 *      graph sits in the middle of the frame, smaller than before, with
 *      blank black space around it — it no longer covers the whole image.
 *   4. Equation — "f(x) = …" at the bottom middle, in the theme colour,
 *      in a free italic serif
 *   5. Watermark — a big diagonal "Mathsonify.com" across the graph
 *      itself (v27): regular Manrope (NOT bold), tilted -30°, ghosted
 *      50%, centred on the panel. It is the watermark now, in the picture
 *      AND the video, because it lives in the shared static layer.
 *
 * The watermark sits on the graph by design (it is a watermark, not a
 * label) — the curve is drawn over it. If the scene cannot be built
 * (missing curve inputs, or an equation that produces no valid values)
 * it falls back to the live-canvas capture: gradient background +
 * subtle grid + the Studio canvas as-is, with the name / equation /
 * watermark drawn in the same positions.
 */

import { getThemeMode, getCanvasPalette } from './theme';
import { resolveActiveCurve } from './activeCurve';
import {
  prepareVideoScene,
  drawExportGraph,
  layoutFor,
  isVideoColorTheme,
  DEFAULT_VIDEO_COLOR_THEME,
  videoColorThemeHex,
  WATERMARK_TEXT,
  type VideoColorTheme,
  type VideoOrientation,
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
  /** Landscape (default) or portrait — the file really is that shape. */
  orientation?: VideoOrientation;
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
 * Output size of the image export, from the live canvas size and the
 * chosen orientation. The long side of the display becomes the long side of
 * the file, so a portrait pick really is a portrait file and a landscape
 * pick really is landscape — whatever shape the Studio canvas happens to be.
 */
export function imageExportSize(
  displayWidth: number,
  displayHeight: number,
  scaleFactor: number,
  orientation: VideoOrientation,
): { exportWidth: number; graphH: number } {
  const longSide = Math.round(Math.max(displayWidth, displayHeight) * scaleFactor);
  const shortSide = Math.round(Math.min(displayWidth, displayHeight) * scaleFactor);
  if (orientation === 'portrait') return { exportWidth: shortSide, graphH: longSide };
  return { exportWidth: longSide, graphH: shortSide };
}

/**
 * Renders the graph through the shared video scene (v22) — the same look as
 * the video export, including the top names, the bottom equation and the
 * watermark, so image and video match exactly.
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
    equationName,
    orientation,
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
      equationName: equationName ?? null,
      curve,
      minX,
      maxX,
      mainMs: (duration ?? 5) * 1000,
      scientist: scientist ?? null,
      scientistName: scientistName ?? null,
      orientation: orientation ?? 'landscape',
      colorTheme: isVideoColorTheme(colorTheme) ? colorTheme : DEFAULT_VIDEO_COLOR_THEME,
      width: exportWidth,
      height: graphH,
      // No panel override: the image uses the video layout (centred graph
      // with space around it), so image and video match.
    });
    drawExportGraph(ctx, scene);
    return true;
  } catch {
    return false;
  }
}

/**
 * The name / equation / watermark for the fallback path (the scene could
 * not be built, so the live canvas is drawn instead). Same positions as the
 * video layout, so the fallback carries the same labels.
 */
function drawFallbackLabels(
  ctx: CanvasRenderingContext2D,
  opts: GraphExportOptions,
  exportWidth: number,
  graphH: number,
): void {
  const { equationText, equationName, scientistName, scientist, orientation, colorTheme } = opts;
  const mode = scientist || scientistName ? 'scientist' : 'user';
  const layout = layoutFor(exportWidth, graphH, orientation ?? 'landscape', mode);
  const uiScale = Math.min(exportWidth, graphH) / 720;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (mode === 'scientist' && scientistName && layout.scientistNameY !== null) {
    ctx.font = `italic 500 ${Math.round(22 * uiScale)}px "Instrument Serif", Georgia, serif`;
    ctx.fillStyle = '#DCEBFB';
    ctx.fillText(scientistName, exportWidth / 2, layout.scientistNameY);
  }
  const title = equationName ?? equationText ?? '';
  if (title) {
    ctx.font = `700 ${Math.round(28 * uiScale)}px "Fraunces", Georgia, serif`;
    ctx.fillStyle = '#F5F5F2';
    ctx.fillText(title, exportWidth / 2, layout.equationNameY);
  }
  if (equationText) {
    ctx.font = `italic 400 ${Math.round(34 * uiScale)}px "Instrument Serif", Georgia, serif`;
    ctx.fillStyle = videoColorThemeHex(
      isVideoColorTheme(colorTheme) ? colorTheme : DEFAULT_VIDEO_COLOR_THEME,
    );
    ctx.fillText(`f(x) = ${equationText.trim()}`, exportWidth / 2, layout.equationY);
  }
  // v27: the watermark is the big diagonal "Mathsonify.com" across the
  // graph (same as the video scene) — Manrope regular (NOT bold), tilted
  // -30°, ghosted 50%, centred on the panel. It replaces the small
  // footer line.
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.translate(layout.panel.x + layout.panel.w / 2, layout.panel.y + layout.panel.h / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.font = `400 ${Math.round(50 * uiScale)}px "Manrope", "Inter", sans-serif`;
  ctx.fillStyle = '#F5F5F2';
  ctx.fillText(WATERMARK_TEXT, 0, 0);
  ctx.restore();
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
    orientation = 'landscape',
  } = opts ?? {};

  const sourceCanvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
  if (!sourceCanvas) throw new Error('Canvas element not found for export');

  const displayWidth = sourceCanvas.getBoundingClientRect().width;
  const displayHeight = sourceCanvas.getBoundingClientRect().height;

  // v22: one graph area, no info bar. The size follows the chosen
  // orientation, so a portrait pick really is a portrait file.
  const { exportWidth, graphH } = imageExportSize(displayWidth, displayHeight, scaleFactor, orientation);
  const exportHeight = graphH;

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

  // ── Graph ───────────────────────────────────────────────────────
  // v22: render through the shared video scene (pure black, no grid, white
  // axes + arrowheads, theme curve, centred graph, name at top, equation
  // at the bottom middle, watermark below it) — the same look as the video
  // export. Falls back to the live-canvas capture when the scene cannot be
  // built.
  const graphRendered = renderGraphViaScene(ctx, opts ?? {}, exportWidth, graphH);
  if (!graphRendered) {
    // Legacy path: gradient background + subtle grid + the live canvas,
    // with the name / equation / watermark drawn in the v22 positions.
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

    if (showWatermark) drawFallbackLabels(ctx, opts ?? {}, exportWidth, graphH);
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
  const suffix = opts?.orientation === 'portrait' ? '-portrait' : '';
  const filename = `mathsonify.com-graph-${sanitized}${suffix}.${fmt}`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
