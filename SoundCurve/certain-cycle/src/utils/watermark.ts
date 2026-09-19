/**
 * Watermark utility for MathSonify canvas exports.
 * Draws a simple centered "MathSonify.com" pill onto any Canvas2D context.
 */

import { getThemeMode } from './theme';

export interface WatermarkOptions {
  /** Position of the watermark pill. Default: 'center' */
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'diagonal';
  /** Overall opacity 0–1. Default: 0.55 */
  opacity?: number;
  /** Scale multiplier relative to canvas size. Default: auto */
  scale?: number;
  /** Override text color. Default: theme accent */
  color?: string;
  /** Margin from the chosen corner in px. Default: 16 */
  padding?: number;
  /** Time parameter 0–1 for diagonal flow animation. Default: 0 */
  time?: number;
}

/**
 * Draw the MathSonify watermark onto a canvas context.
 * Simple centered pill with "MathSonify.com" text only.
 */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  opts?: WatermarkOptions,
): void {
  const {
    position = 'center',
    opacity,
    scale,
    padding = 16,
    time = 0,
  } = opts ?? {};

  const resolvedOpacity = opacity ?? (position === 'center' ? 0.55 : 0.48);

  const theme = getThemeMode();
  const isLight = theme === 'light';
  const isDark = theme === 'dark';

  const baseFontSize = scale
    ? Math.round(13 * scale)
    : Math.max(10, Math.min(16, Math.round(Math.min(canvasWidth, canvasHeight) * 0.022)));

  ctx.save();

  // Measure text
  ctx.font = `600 ${baseFontSize}px "Inter", system-ui, sans-serif`;
  const wmText = 'MathSonify.com';
  const textWidth = ctx.measureText(wmText).width;

  const pillPadH = Math.round(baseFontSize * 0.7);
  const pillPadV = Math.round(baseFontSize * 0.38);
  const pillWidth = textWidth + pillPadH * 2;
  const pillHeight = baseFontSize + pillPadV * 2 + 2;

  let x: number;
  let y: number;
  switch (position) {
    case 'center':
      x = (canvasWidth - pillWidth) / 2;
      y = (canvasHeight - pillHeight) / 2;
      break;
    case 'bottom-right':
      x = canvasWidth - padding - pillWidth;
      y = canvasHeight - padding - pillHeight;
      break;
    case 'bottom-left':
      x = padding;
      y = canvasHeight - padding - pillHeight;
      break;
    case 'top-right':
      x = canvasWidth - padding - pillWidth;
      y = padding;
      break;
    case 'top-left':
      x = padding;
      y = padding;
      break;
    case 'diagonal':
      x = canvasWidth - pillWidth - 16 - time * (canvasWidth - pillWidth - 32);
      y = time * (canvasHeight - pillHeight - 32);
      break;
    default:
      x = (canvasWidth - pillWidth) / 2;
      y = (canvasHeight - pillHeight) / 2;
  }

  x = Math.max(4, Math.min(canvasWidth - pillWidth - 4, x));
  y = Math.max(4, Math.min(canvasHeight - pillHeight - 4, y));

  const pillRadius = pillHeight / 2;

  // Drop shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.22)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  const shadowBg = isLight
    ? 'rgba(255,255,255,0.82)'
    : isDark
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(27,36,48,0.58)';
  ctx.fillStyle = shadowBg;
  ctx.globalAlpha = resolvedOpacity;
  roundRect(ctx, x, y, pillWidth, pillHeight, pillRadius);
  ctx.fill();
  ctx.restore();

  // Pill background
  ctx.globalAlpha = resolvedOpacity;
  const pillBg = isLight
    ? 'rgba(255,255,255,0.88)'
    : isDark
      ? 'rgba(255,255,255,0.10)'
      : 'rgba(27,36,48,0.62)';
  ctx.fillStyle = pillBg;
  ctx.strokeStyle = isLight
    ? 'rgba(0,0,0,0.08)'
    : isDark
      ? 'rgba(255,255,255,0.14)'
      : 'rgba(237,231,217,0.14)';
  ctx.lineWidth = 1;
  roundRect(ctx, x, y, pillWidth, pillHeight, pillRadius);
  ctx.fill();
  ctx.globalAlpha = resolvedOpacity * 0.9;
  ctx.stroke();

  // "MathSonify.com" text only
  ctx.globalAlpha = resolvedOpacity;
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.font = `600 ${baseFontSize}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = isLight
    ? 'rgba(0,0,0,0.58)'
    : isDark
      ? 'rgba(255,255,255,0.74)'
      : '#C9A24B';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.shadowColor = isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 3;
  ctx.fillText(wmText, x + pillPadH, y + pillPadV);
  ctx.shadowBlur = 0;

  ctx.restore();
}

/** Draw a rounded rectangle path (no fill/stroke). */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}
