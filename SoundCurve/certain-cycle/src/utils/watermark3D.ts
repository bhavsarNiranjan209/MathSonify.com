/**
 * 3D billboard watermark (v30) — the "Mathsonify.com" mark as a floating
 * sprite in the 3D scene.
 *
 * WHY A BILLBOARD: the 2D watermark is a diagonal ghost across the graph
 * panel (Manrope regular 400, tilted -30°, 50% ghost). In 3D a flat overlay
 * would be a fixed sticker, and a floor decal would be unreadable from
 * behind. A THREE.Sprite always faces the camera, so the mark stays
 * readable from every angle as the camera orbits 360° — that is the whole
 * point. The sprite is drawn once on a canvas (same font, same -30° tilt,
 * same 50% ghost) and only shown while an export renders, so the live
 * Studio view stays clean.
 *
 * SIZING: the sprite uses sizeAttenuation:false (like the axis/tick label
 * sprites), so its on-screen size is constant at any zoom or orbit radius.
 * The scale below is derived so the text's cap height reads ~50px on a
 * 720px-tall view — the same size as the 2D watermark — and scales
 * proportionally with the view, so exports at any size keep the same
 * proportion. The derivation is pure math (see watermarkBillboardSpriteScale)
 * and unit-tested here; the canvas drawing itself is DOM-only and is
 * covered by the headless visual proof.
 */
import { WATERMARK_TEXT } from './videoScene';

/** Same text as the 2D watermark — the domain only, never a tagline. */
export const WATERMARK_3D_TEXT = WATERMARK_TEXT;

/** Same tilt as the 2D watermark: -30°. */
export const WATERMARK_3D_TILT = -Math.PI / 6;

/** Same ghost as the 2D watermark: 50% opacity. */
export const WATERMARK_3D_OPACITY = 0.5;

/** Target cap height of the watermark text on a 720px-tall view, in px. */
export const WATERMARK_3D_CAP_PX_AT_720 = 50;

/** Texture font size, in px — large so the sprite stays sharp when upscaled. */
export const WATERMARK_3D_FONT_PX = 200;

/**
 * Canvas size that fits the watermark text rotated by WATERMARK_3D_TILT.
 * The text's own box is `textWidthPx` wide and `fontPx` tall (em height);
 * rotating it by -30° gives a bounding box of
 *   w = tw·cos30 + fontPx·sin30, h = tw·sin30 + fontPx·cos30,
 * plus a small padding so antialiased edges are never clipped.
 */
export function watermarkBillboardCanvasSize(
  textWidthPx: number,
  fontPx: number,
): { width: number; height: number } {
  const c = Math.cos(Math.PI / 6);
  const s = Math.sin(Math.PI / 6);
  const pad = Math.ceil(fontPx * 0.08);
  return {
    width: Math.ceil(textWidthPx * c + fontPx * s) + pad * 2,
    height: Math.ceil(textWidthPx * s + fontPx * c) + pad * 2,
  };
}

/**
 * World-unit scale for a sizeAttenuation:false sprite so the text's cap
 * height reads `capPxAt720` px on a 720px-tall view (and proportionally on
 * any other view height).
 *
 * Derivation: with sizeAttenuation off, a sprite of world height S covers
 * S·cot(fov/2)/2 of the viewport height, i.e. S·cot(fov/2)/2·hpx screen px.
 * The cap height is `capHeightPx / canvasH` of the sprite height, and we
 * want it to be `capPxAt720 · hpx / 720` screen px. Solving for S (the hpx
 * cancels — the scale is view-height independent, which is why it can be
 * set once at creation):
 *   S = (capPxAt720 / 720) · (canvasH / capHeightPx) · 2·tan(fov/2).
 */
export function watermarkBillboardSpriteScale(
  canvasWidth: number,
  canvasHeight: number,
  capHeightPx: number,
  fovDeg: number,
  capPxAt720: number = WATERMARK_3D_CAP_PX_AT_720,
): { scaleX: number; scaleY: number } {
  const scaleY =
    (capPxAt720 / 720) * (canvasHeight / capHeightPx) * 2 * Math.tan((fovDeg * Math.PI) / 360);
  return { scaleX: scaleY * (canvasWidth / canvasHeight), scaleY };
}

/** Font string for the billboard texture — Manrope regular 400, like the 2D watermark. */
export function watermarkBillboardFont(fontPx: number): string {
  return `400 ${fontPx}px "Manrope", "Inter", sans-serif`;
}

/**
 * Draw the watermark text onto a 2D context, centred and tilted -30°.
 * The caller sizes the canvas with watermarkBillboardCanvasSize first.
 * `color` is the theme-aware ink (light text on dark, dark ink on light).
 */
export function drawWatermarkBillboard(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  fontPx: number,
  color: string,
): void {
  ctx.save();
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate(WATERMARK_3D_TILT);
  ctx.font = watermarkBillboardFont(fontPx);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WATERMARK_3D_TEXT, 0, 0);
  ctx.restore();
}

/**
 * Build the billboard texture canvas: measure the text, size the canvas to
 * the rotated bounding box, draw. Returns the canvas plus the measured cap
 * height (from 'M', falling back to 0.72× the font size) for the scale math.
 * DOM-only — call from the viewer, never from a node test.
 */
export function buildWatermarkBillboardCanvas(
  color: string,
  fontPx: number = WATERMARK_3D_FONT_PX,
): { canvas: HTMLCanvasElement; width: number; height: number; capHeightPx: number } {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D context failed for the 3D watermark');
  ctx.font = watermarkBillboardFont(fontPx);
  const textWidthPx = ctx.measureText(WATERMARK_3D_TEXT).width;
  const m = ctx.measureText('M');
  const capHeightPx =
    m.actualBoundingBoxAscent > 0 ? m.actualBoundingBoxAscent : Math.round(fontPx * 0.72);
  const { width, height } = watermarkBillboardCanvasSize(textWidthPx, fontPx);
  canvas.width = width;
  canvas.height = height;
  const g = canvas.getContext('2d');
  if (!g) throw new Error('2D context failed for the 3D watermark');
  drawWatermarkBillboard(g, width, height, fontPx, color);
  return { canvas, width, height, capHeightPx };
}
