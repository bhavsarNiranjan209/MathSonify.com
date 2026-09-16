/**
 * Graph image export for MathSonify.
 *
 * Layout — top to bottom, strictly in order:
 *   1. Gradient background + subtle grid
 *   2. Source canvas (the graph itself)
 *   3. Blank accent line (thin horizontal rule in accent colour)
 *   4. Info bar — equation name + equation + scientist on a solid band
 *   5. Centered "MathSonify.com" watermark pill
 *
 * The graph interior is never obstructed: no pill or text sits on it.
 * Only the watermark pill sits centered over the graph.
 */

import { drawWatermark } from './watermark';
import { getThemeMode, getCanvasPalette } from './theme';

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

  // ── 1. Gradient background ────────────────────────────────────────
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

  // ── 2. Subtle grid only over the graph area ───────────────────────
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

  // ── 3. Source canvas (graph only, no overlay) ─────────────────────
  ctx.save();
  ctx.scale(scaleFactor, scaleFactor);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, displayWidth, displayHeight);
  ctx.restore();

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

  // ── 6. Watermark — centered over the graph area only ──────────────
  if (showWatermark) {
    // Position centered inside the graph rect (not the whole export)
    // so the info bar below never gets covered.
    // We achieve this by asking drawWatermark to center in a virtual
    // canvas that is graphH tall.
    ctx.save();
    // Clip the watermark draw to keep its logic simple — just override
    // the centering math by translating.
    // Easiest: call a local centered pill directly sized to the graph.
    const wmText = 'MathSonify.com';
    const wmFontSize = Math.max(10, Math.min(15, Math.round(Math.min(displayWidth, displayHeight) * 0.022 * scaleFactor * 0.95)));
    ctx.font = `600 ${wmFontSize}px "Inter", system-ui, sans-serif`;
    const tw = ctx.measureText(wmText).width;
    const padH = Math.round(wmFontSize * 0.7);
    const padV = Math.round(wmFontSize * 0.38);
    const pillW = tw + padH * 2;
    const pillH = wmFontSize + padV * 2 + 2;
    const pillX = (exportWidth - pillW) / 2;
    const pillY = (graphH - pillH) / 2;
    const pillR = pillH / 2;

    const wmBg = isLight ? 'rgba(255,255,255,0.88)' : isDark ? 'rgba(255,255,255,0.10)' : 'rgba(27,36,48,0.62)';
    const wmBorder = isLight ? 'rgba(0,0,0,0.08)' : isDark ? 'rgba(255,255,255,0.14)' : 'rgba(237,231,217,0.14)';
    const wmTextColor = isLight ? 'rgba(0,0,0,0.58)' : isDark ? 'rgba(255,255,255,0.74)' : '#C9A24B';

    const opacity = 0.55;
    ctx.globalAlpha = opacity;

    // Shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = wmBg;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill();
    ctx.restore();

    // Pill
    ctx.fillStyle = wmBg;
    ctx.strokeStyle = wmBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill();
    ctx.globalAlpha = opacity * 0.9;
    ctx.stroke();

    // Text
    ctx.globalAlpha = opacity;
    ctx.shadowColor = isLight ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 3;
    ctx.font = `600 ${wmFontSize}px "Inter", system-ui, sans-serif`;
    ctx.fillStyle = wmTextColor;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText(wmText, pillX + padH, pillY + padV);
    ctx.shadowBlur = 0;

    ctx.restore();
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.lineTo(x + w - rad, y);
  ctx.arcTo(x + w, y, x + w, y + rad, rad);
  ctx.lineTo(x + w, y + h - rad);
  ctx.arcTo(x + w, y + h, x + w - rad, y + h, rad);
  ctx.lineTo(x + rad, y + h);
  ctx.arcTo(x, y + h, x, y + h - rad, rad);
  ctx.lineTo(x, y + rad);
  ctx.arcTo(x, y, x + rad, y, rad);
  ctx.closePath();
}
