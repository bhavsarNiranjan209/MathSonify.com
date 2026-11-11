/**
 * 360° turntable picture (v30) — one PNG with four views of the 3D scene.
 *
 * FORM: a 2×2 contact sheet (front 0°, right 90°, back 180°, left 270°),
 * each cell labelled with its angle, with the same footer band as the
 * single 3D picture ("Equation: …" left, "mathsonify.com" right). A
 * contact sheet is the useful form here: it is a normal image anyone can
 * open or share, it shows the object from all four sides at a glance, and
 * it reuses the existing single-view render path (one renderFrame per
 * angle) instead of needing a panorama viewer. A single equirectangular
 * panorama would need a cube-map render and a 360° viewer to be useful,
 * so it is not built here.
 *
 * Capture path: the caller supplies `renderView(azimuthRad)`, which
 * renders the live 3D scene at that orbit angle and returns the WebGL
 * canvas. Each view is drawn onto the offscreen composer in the same task
 * as its render (the WebGL canvas is only valid until the next render),
 * exactly like render3DImage. The billboard watermark is in the scene
 * while each view renders, so every cell carries it.
 *
 * Resolution: same rule as render3DImage — 2× the on-screen render, with
 * the longest side capped at 2048px.
 */
import { getCanvasPalette, getThemeMode } from './theme';
import { equationSlug, DEFAULT_MAX_DIMENSION, CAPTURE_SCALE } from './render3DImage';
import { performSave } from './fileSave';

export interface Render3DTurntableOptions {
  equation: string;
  maxDimension?: number; // cap at 2048
}

/** The four turntable angles, in degrees, relative to the viewer's current orbit. */
export const TURNTABLE_ANGLES_DEG = [0, 90, 180, 270] as const;

/** Label drawn in the corner of each cell. */
export function turntableAngleLabel(angleDeg: number): string {
  return `${angleDeg}°`;
}

/**
 * Pure layout: a 2×2 grid of cells above the footer band (8% of the height,
 * same as render3DImage). Cells are in reading order: 0° top-left, 90°
 * top-right, 180° bottom-left, 270° bottom-right.
 */
export function turntableLayout(
  width: number,
  height: number,
): {
  cells: { x: number; y: number; w: number; h: number; angleDeg: number }[];
  footer: { y: number; h: number };
} {
  const footerH = Math.max(12, Math.round(height * 0.08));
  const footerY = height - footerH;
  const gridH = footerY;
  const cellW = width / 2;
  const cellH = gridH / 2;
  return {
    cells: TURNTABLE_ANGLES_DEG.map((angleDeg, i) => ({
      x: (i % 2) * cellW,
      y: Math.floor(i / 2) * cellH,
      w: cellW,
      h: cellH,
      angleDeg,
    })),
    footer: { y: footerY, h: footerH },
  };
}

export async function render3DTurntableImage(
  renderView: (azimuthRad: number) => HTMLCanvasElement,
  opts?: Render3DTurntableOptions,
): Promise<{ blob: Blob; filename: string }> {
  const max = opts?.maxDimension ?? DEFAULT_MAX_DIMENSION;
  if (max <= 0) throw new Error('maxDimension must be positive');

  // The first view also tells us the on-screen size (same rule as
  // render3DImage: 2× on-screen, longest side capped at max).
  const first = renderView(0);
  const rawWidth = first.getBoundingClientRect ? first.getBoundingClientRect().width : first.width;
  const rawHeight = first.getBoundingClientRect ? first.getBoundingClientRect().height : first.height;
  const maxScreen = Math.max(1, Math.round(max / CAPTURE_SCALE));
  const width = Math.min(Math.round(rawWidth), maxScreen) * CAPTURE_SCALE;
  const height = Math.min(Math.round(rawHeight), maxScreen) * CAPTURE_SCALE;
  if (width <= 0 || height <= 0) {
    throw new Error('Viewer is not visible; cannot export a 3D turntable image.');
  }

  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d');
  if (!ctx) throw new Error('2D context failed');

  // The WebGL canvas is transparent; fill the theme background first so no
  // cell has a transparent (black) corner.
  const palette = getCanvasPalette(getThemeMode());
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, width, height);

  const { cells, footer } = turntableLayout(width, height);
  // Draw the first view (already rendered above) into its cell, then render
  // and draw the other three — each drawImage in the same task as its
  // render, so the WebGL canvas cannot be overwritten in between.
  ctx.drawImage(first, cells[0].x, cells[0].y, cells[0].w, cells[0].h);
  for (let i = 1; i < cells.length; i++) {
    const view = renderView((cells[i].angleDeg * Math.PI) / 180);
    ctx.drawImage(view, cells[i].x, cells[i].y, cells[i].w, cells[i].h);
  }

  // Angle labels — small, top-left of each cell, in the theme's label colour.
  ctx.font = `${Math.max(10, Math.round(width * 0.014))}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = palette.label;
  for (const cell of cells) {
    ctx.globalAlpha = 0.75;
    ctx.fillText(turntableAngleLabel(cell.angleDeg), cell.x + 10, cell.y + 8);
  }
  ctx.globalAlpha = 1;

  // Thin dividers between the cells, so the four views read as four views.
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const midY = footer.y / 2;
  ctx.beginPath();
  ctx.moveTo(width / 2, 0);
  ctx.lineTo(width / 2, footer.y);
  ctx.moveTo(0, midY);
  ctx.lineTo(width, midY);
  ctx.stroke();

  // Footer band — same as the single 3D picture.
  const eq = opts?.equation ?? '';
  const footerH = footer.h;
  const footerY = footer.y;
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
    off.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png');
  });

  const slug = equationSlug(label);
  const filename = `mathsonify-${slug}-3d-360.png`;
  const file = new File([blob], filename, { type: 'image/png' });
  await performSave(file, filename);
  return { blob, filename };
}
