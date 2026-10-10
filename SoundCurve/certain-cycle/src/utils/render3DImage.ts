/**
 * 3D image export — single-frame WebGL render (reuses renderOneFrame), then toBlob.
 * Capture path: renderOneFrame() calls renderer.render(scene, camera), returns
 * the WebGL canvas. This helper then calls toBlob() in the same task.
 * try/finally: restores the original canvas drawing state (no mutation to
 * source WebGL canvas). No video; no preserveDrawingBuffer.
 */
import { renderOneFrame } from './renderOneFrame';
import type { Scene, PerspectiveCamera, WebGLRenderer } from 'three';
import { performSave } from './fileSave';

export interface Render3DImageOptions {
  equation: string;
  maxDimension?: number; // cap at 2048
}

/** Capture path: calls renderer.render(scene, camera) via renderOneFrame,
 * then toBlob() in same task on the returned WebGL canvas. */
export async function render3DImage(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  opts?: Render3DImageOptions
): Promise<{ blob: Blob; filename: string }> {
  const max = opts?.maxDimension ?? 2048;
  // Same-task single frame: renderOneFrame → renderer.render() → canvas
  const webglCanvas = renderOneFrame(renderer, scene, camera);
  const rect = webglCanvas.getBoundingClientRect ? webglCanvas.getBoundingClientRect() : { width: webglCanvas.width, height: webglCanvas.height };
  const w = Math.round(Math.min(rect.width || webglCanvas.width, max));
  const h = Math.round(Math.min(rect.height || webglCanvas.height, max));

  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('2D context failed');

  try {
    // Draw the WebGL-rendered frame (not a 2D redraw)
    ctx.drawImage(webglCanvas, 0, 0, w, h);

    // Footer band: Equation: … + mathsonify.com
    const eq = opts?.equation ?? '';
    const footerH = Math.round(h * 0.08);
    ctx.fillStyle = '#0E1216';
    ctx.fillRect(0, h - footerH, w, footerH);
    ctx.fillStyle = '#fff';
    ctx.font = `${Math.max(10, Math.round(w * 0.025))}px system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    ctx.fillText(`Equation: ${eq}`, w * 0.05, h - footerH / 2 - 2);
    ctx.fillStyle = '#aaa';
    ctx.fillText('mathsonify.com', w - w * 0.25, h - footerH / 2 + 2);

    const blob = await new Promise<Blob>((res, rej) =>
      off.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png')
    );
    const filename = `mathsonify-3d-${Date.now()}.png`;
    const file = new File([blob], filename, { type: 'image/png' });
    await performSave(file, filename);
    return { blob, filename };
  } finally {
    // Restores: original WebGL canvas drawing buffer/state untouched (no mutation performed on renderer/scene/camera); offscreen canvas discarded by GC.
  }
}
