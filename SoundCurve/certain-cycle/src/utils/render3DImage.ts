/**
 * 3D image export — single-frame WebGL capture, then a composited footer.
 *
 * Capture path: renderOneFrame() calls renderer.render(scene, camera), returns
 * the WebGL canvas. This helper then calls toBlob() in the same task on the
 * returned canvas.
 *
 * Resolution: the offscreen composer is 2x the on-screen render; the longest
 * side is capped at 2048 px. Footer colours follow the current theme's canvas
 * palette (the site is one of light/dark, so the export always reads as part of
 * the live graph).
 *
 * try/finally: restores the original canvas drawing state (no mutation of the
 * source WebGL canvas). No video; no preserveDrawingBuffer.
 */
import { renderOneFrame } from './renderOneFrame';
import type { Scene, PerspectiveCamera, WebGLRenderer } from 'three';
import { performSave } from './fileSave';
import { getCanvasPalette, getThemeMode } from './theme';
import { drawExport3DLabels } from './export3DLabels';
import type { VideoColorTheme } from './videoScene';

export interface Render3DImageOptions {
  equation: string;
  /** Display name of the equation (preset / scientist equation), if any. */
  equationName?: string | null;
  /** Scientist name — present only for a scientist equation. */
  scientistName?: string | null;
  /** Curve colour theme; the bottom equation is drawn in this colour. */
  colorTheme?: VideoColorTheme;
  maxDimension?: number; // cap at 2048
}

/** Longest side of the exported PNG, in pixels. */
export const DEFAULT_MAX_DIMENSION = 2048;

/** Extra magnification of the offscreen composition (longest side preserved). */
export const CAPTURE_SCALE = 2;

/** Slugify an equation into a safe, readable file name. */
export function equationSlug(equation: string): string {
  return (
    equation
      .trim()
      .replace(/\s+/g, '-')
      // Drop everything that is not a letter, digit, underscore, dot or hyphen
      // (letters include unicode, so pi, sigma and omega survive).
      .replace(/[^\p{L}\p{N}_.-]/gu, '')
      .replace(/-+/g, '-')
      .replace(/^-/, '')
      .replace(/-$/, '')
      .toLowerCase() || 'untitled'
  );
}

/** Capture path: calls renderer.render(scene, camera) via renderOneFrame,
 * then toBlob() in the same task on the returned WebGL canvas. */
export async function render3DImage(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  opts?: Render3DImageOptions,
): Promise<{ blob: Blob; filename: string }> {
  const max = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  if (max <= 0) throw new Error('maxDimension must be positive');

  const webglCanvas = renderOneFrame(renderer, scene, camera);

  const rawWidth = webglCanvas.getBoundingClientRect
    ? webglCanvas.getBoundingClientRect().width
    : webglCanvas.width;
  const rawHeight = webglCanvas.getBoundingClientRect
    ? webglCanvas.getBoundingClientRect().height
    : webglCanvas.height;

  // 2x the on-screen size, with the longest side capped at max.
  const maxScreen = Math.max(1, Math.round(max / CAPTURE_SCALE));
  const width = Math.min(Math.round(rawWidth), maxScreen) * CAPTURE_SCALE;
  const height = Math.min(Math.round(rawHeight), maxScreen) * CAPTURE_SCALE;
  if (width <= 0 || height <= 0) {
    throw new Error('Viewer is not visible; cannot export a 3D image.');
  }

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('2D context failed');

  try {
    // The WebGL canvas is transparent; fill the theme's canvas colour
    // first, so the picture has a solid background in both modes. (Light
    // mode used to come out with a black surround — v30 fix. The video
    // exporter and the turntable composer already filled first.)
    const palette = getCanvasPalette(getThemeMode());
    ctx.fillStyle = palette.canvas;
    ctx.fillRect(0, 0, width, height);

    // Compose the export offscreen from the live WebGL frame, not a 2D redraw
    // of the curve.
    ctx.drawImage(webglCanvas, 0, 0, width, height);

    // v32: names + bottom equation (shared 3D labels helper). Scientist
    // equations get the scientist name + equation name at the top; user
    // equations get no top name. The bottom equation is in the theme
    // colour, Instrument Serif italic, like the 2D export.
    const label = (opts?.equation ?? '').trim() || 'equation';
    drawExport3DLabels(ctx, width, height, {
      equation: label,
      equationName: opts?.equationName ?? null,
      scientistName: opts?.scientistName ?? null,
      colorTheme: opts?.colorTheme,
      canvasColor: palette.canvas,
    });

    const blob = await new Promise<Blob>((resolve, reject) => {
      off.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png',
      );
    });

    const slug = equationSlug(label);
    const filename = `mathsonify-${slug}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    // v32: a real download, not the share sheet. The 3D picture used to
    // open the native share sheet on phones (performSave prefers share);
    // the user asked for a download.
    await performSave(file, filename, { forceDownload: true });
    return { blob, filename };
  } finally {
    // Restore: the source WebGL canvas is never mutated (drawImage only reads
    // from it). The offscreen canvas is released by GC.
  }
}
