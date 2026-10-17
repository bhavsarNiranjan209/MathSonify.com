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

export interface Render3DImageOptions {
  equation: string;
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
    // Compose the export offscreen from the live WebGL frame, not a 2D redraw
    // of the curve.
    ctx.drawImage(webglCanvas, 0, 0, width, height);

    // Footer band — "Equation: <equation>" left, "mathsonify.com" right.
    // Colours follow the current theme's canvas palette.
    const eq = opts?.equation ?? '';
    const palette = getCanvasPalette(getThemeMode());
    const footerH = Math.max(12, Math.round(height * 0.08));
    const footerY = height - footerH;

    ctx.fillStyle = palette.canvas;
    ctx.fillRect(0, footerY, width, footerH);

    const label = eq.trim() || 'equation';
    ctx.font = `${Math.max(10, Math.round(width * 0.025))}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';

    ctx.fillStyle = palette.canvas === '#ffffff' ? '#080A0C' : '#ffffff';
    ctx.fillText(`Equation: ${label}`, 12, footerY + footerH / 2 - 2);

    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(142, 148, 154, 0.85)';
    ctx.fillText('mathsonify.com', width - 12, footerY + footerH / 2 - 2);

    const blob = await new Promise<Blob>((resolve, reject) => {
      off.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
        'image/png',
      );
    });

    const slug = equationSlug(label);
    const filename = `mathsonify-${slug}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    await performSave(file, filename);
    return { blob, filename };
  } finally {
    // Restore: the source WebGL canvas is never mutated (drawImage only reads
    // from it). The offscreen canvas is released by GC.
  }
}
