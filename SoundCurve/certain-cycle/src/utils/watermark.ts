/**
 * Watermark utility for MathSonify canvas exports.
 * Draws ghosted "MathSonify.com" text onto any Canvas2D context — a real
 * watermark: faint text, no pill, no badge, no shadow. It sits in one fixed
 * place (bottom-right by default) and never moves.
 */

import { getThemeMode } from './theme';

export interface WatermarkOptions {
  /** Position of the watermark text. Default: 'bottom-right' */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center';
  /** Overall opacity 0–1. Default: 0.5 */
  opacity?: number;
  /** Explicit font size in px. Default: auto from the canvas size */
  fontSize?: number;
  /** Override text color. Default: theme-aware */
  color?: string;
  /** Margin from the chosen corner in px. Default: 16 */
  padding?: number;
}

/**
 * Draw the MathSonify watermark onto a canvas context.
 * Ghosted text only — "MathSonify.com", fixed in one place.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  opts?: WatermarkOptions,
): void {
  const {
    position = 'bottom-right',
    opacity = 0.5,
    fontSize: explicitFontSize,
    color,
    padding = 16,
  } = opts ?? {};

  const theme = getThemeMode();
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const fontSize =
    explicitFontSize ??
    Math.max(10, Math.min(16, Math.round(Math.min(canvasWidth, canvasHeight) * 0.022)));

  ctx.save();

  // Measure text
  ctx.font = `600 ${fontSize}px "Inter", system-ui, sans-serif`;
  const wmText = 'MathSonify.com';
  const textWidth = ctx.measureText(wmText).width;

  let x: number;
  let y: number;
  switch (position) {
    case 'bottom-right':
      x = canvasWidth - padding - textWidth;
      y = canvasHeight - padding - fontSize;
      break;
    case 'bottom-left':
      x = padding;
      y = canvasHeight - padding - fontSize;
      break;
    case 'top-right':
      x = canvasWidth - padding - textWidth;
      y = padding;
      break;
    case 'top-left':
      x = padding;
      y = padding;
      break;
    case 'center':
    default:
      x = (canvasWidth - textWidth) / 2;
      y = (canvasHeight - fontSize) / 2;
  }

  x = Math.max(4, Math.min(canvasWidth - textWidth - 4, x));
  y = Math.max(4, Math.min(canvasHeight - fontSize - 4, y));

  // Ghosted text only — no pill, no border, no shadow.
  ctx.globalAlpha = opacity;
  ctx.fillStyle =
    color ?? (isLight ? 'rgba(0,0,0,0.58)' : isDark ? 'rgba(255,255,255,0.74)' : '#C9A24B');
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText(wmText, x, y);

  ctx.restore();
}
