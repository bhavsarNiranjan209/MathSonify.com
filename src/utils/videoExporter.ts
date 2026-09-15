import { parseEquation, type SamplePoint } from './equationParser';
import { getCanvasPalette, getThemeMode } from './theme';
import { renderEquationToWavBlob } from './audioExporter';

export interface VideoExportOptions {
  equation: string;
  equationName: string | null;
  founderName: string | null;
  minX: number;
  maxX: number;
  minFreq: number;
  maxFreq: number;
  duration: number;
  volume: number;
  instrument: string;
  sonificationMode: string;
  scale?: string;
}

const VIDEO_W = 1280;
const VIDEO_H = 720;
const FPS = 30;

/**
 * Export a video (WebM, VP9 if available) that matches the studio graph exactly:
 *  - Same grid, axes, ruler ticks, smoothed curve, fill-under-curve
 *  - Animated playhead with scanner beam
 *  - Header with equation name + scientist name + equation pill
 *  - Centered "MathSonify.com" watermark pill
 *  - Synthesized audio synced frame-by-frame
 */
export async function exportEquationVideo(opts: VideoExportOptions): Promise<void> {
  const { equation, equationName, founderName, minX, maxX, duration } = opts;

  const parsed = parseEquation(equation);
  if (!parsed.success || !parsed.sample) {
    throw new Error(parsed.error || 'Cannot export video: invalid equation');
  }
  const points: SamplePoint[] = parsed.sample(minX, maxX, 800);
  const valid = points.filter((p) => p.isValid);
  if (valid.length === 0) throw new Error('Equation produced no valid values');

  const canvas = document.createElement('canvas');
  canvas.width = VIDEO_W;
  canvas.height = VIDEO_H;
  const ctx = canvas.getContext('2d')!;

  ctx.imageSmoothingEnabled = true;
  if ('imageSmoothingQuality' in ctx) (ctx as unknown as { imageSmoothingQuality: string }).imageSmoothingQuality = 'high';

  // Pre-render audio blob
  const audioBlob = await renderAudioBlob(opts);
  const audioEl = document.createElement('audio');
  const audioBlobUrl = URL.createObjectURL(audioBlob);
  audioEl.src = audioBlobUrl;

  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;
  let videoUrl: string | null = null;

  try {
    await new Promise<void>((resolve, reject) => {
      audioEl.oncanplaythrough = () => resolve();
      audioEl.onerror = () => reject(new Error('Failed to decode audio for video'));
      audioEl.load();
      setTimeout(() => resolve(), 3000);
    });

    const canvasStream = canvas.captureStream(FPS);

    audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const source = audioCtx.createMediaElementSource(audioEl);
    const dest = audioCtx.createMediaStreamDestination();
    source.connect(dest);
    source.connect(audioCtx.destination);

    const combined = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...dest.stream.getAudioTracks(),
    ]);

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
      ? 'video/webm;codecs=vp9,opus'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
        ? 'video/webm;codecs=vp8,opus'
        : 'video/webm';

    recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

    const done = new Promise<Blob>((resolve, reject) => {
      recorder!.onstop = () => {
        if (chunks.length === 0) reject(new Error('Video recording produced no data'));
        else resolve(new Blob(chunks, { type: mimeType }));
      };
      recorder!.onerror = () => reject(new Error('MediaRecorder error'));
    });

    recorder.start(100);
    audioEl.currentTime = 0;
    await audioEl.play().catch(() => {});

    const totalFrames = Math.ceil(duration * FPS);
    let frame = 0;

    await new Promise<void>((resolve) => {
      const tick = () => {
        const progress = Math.min(1, frame / totalFrames);
        drawVideoFrame(ctx, {
          points,
          minX, maxX,
          equation, equationName, founderName,
          progress,
          frame,
          totalFrames,
        });
        frame++;
        if (frame <= totalFrames) {
          setTimeout(tick, 1000 / FPS);
        } else {
          resolve();
        }
      };
      tick();
    });

    await new Promise((r) => setTimeout(r, 200));

    recorder.stop();
    audioEl.pause();

    const blob = await done;
    videoUrl = URL.createObjectURL(blob);
    const safeName = (equationName || equation).replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = `mathsonify.com-${safeName}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(videoUrl!), 10000);
  } finally {
    URL.revokeObjectURL(audioBlobUrl);
    audioCtx?.close().catch(() => {});
  }
}

interface FrameOpts {
  points: SamplePoint[];
  minX: number;
  maxX: number;
  equation: string;
  equationName: string | null;
  founderName: string | null;
  progress: number;
  frame: number;
  totalFrames: number;
}

function drawVideoFrame(ctx: CanvasRenderingContext2D, o: FrameOpts) {
  const { points, minX, maxX, equation, equationName, founderName, progress, frame, totalFrames } = o;

  const palette = getCanvasPalette();
  const isDigital = getThemeMode() === 'digital';
  const isMono = getThemeMode() === 'mono';

  // ── Paper canvas background (same as studio) ──
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);

  // ── Coordinate mapping (same as studio) ──
  const validPoints = points.filter((p) => p.isValid);
  const yVals = validPoints.map((p) => p.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const yPad = Math.max(0.5, (maxY - minY) * 0.18);
  const paddedMinY = minY - yPad;
  const paddedMaxY = maxY + yPad;

  const toScreenX = (x: number) => ((x - minX) / (maxX - minX)) * VIDEO_W;
  const toScreenY = (y: number) => VIDEO_H - ((y - paddedMinY) / (paddedMaxY - paddedMinY)) * VIDEO_H;

  // ── Ruled grid (12 vertical × 8 horizontal, same as studio) ──
  ctx.strokeStyle = palette.grid;
  ctx.lineWidth = 1;
  const vSteps = 12;
  for (let i = 0; i <= vSteps; i++) {
    const sx = (VIDEO_W / vSteps) * i;
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx, VIDEO_H); ctx.stroke();
  }
  const hSteps = 8;
  for (let j = 0; j <= hSteps; j++) {
    const sy = (VIDEO_H / hSteps) * j;
    ctx.beginPath(); ctx.moveTo(0, sy); ctx.lineTo(VIDEO_W, sy); ctx.stroke();
  }

  // ── Axes at y=0 and x=0 ──
  ctx.strokeStyle = palette.axis;
  ctx.lineWidth = 1.25;
  if (paddedMinY <= 0 && paddedMaxY >= 0) {
    const y0 = toScreenY(0);
    ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(VIDEO_W, y0); ctx.stroke();
  }
  if (minX <= 0 && maxX >= 0) {
    const x0 = toScreenX(0);
    ctx.beginPath(); ctx.moveTo(x0, 0); ctx.lineTo(x0, VIDEO_H); ctx.stroke();
  }

  // ── Ruler ticks with labels ──
  ctx.fillStyle = palette.label;
  ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
  const fmt = (v: number) => String(Math.round(v * 10) / 10);

  const y0 = toScreenY(0);
  const xAxisVisible = y0 > 0 && y0 < VIDEO_H;
  const tickBaseY = xAxisVisible ? y0 : VIDEO_H - 4;
  for (let i = 0; i <= 6; i++) {
    const xVal = minX + (i / 6) * (maxX - minX);
    const sx = toScreenX(xVal);
    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(sx, tickBaseY - 3); ctx.lineTo(sx, tickBaseY + 3); ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillText(fmt(xVal), sx, xAxisVisible ? tickBaseY + 11 : VIDEO_H - 8);
  }

  const x0 = toScreenX(0);
  const yAxisVisible = x0 > 0 && x0 < VIDEO_W;
  const tickBaseX = yAxisVisible ? x0 : 7;
  for (let i = 0; i <= 6; i++) {
    const yVal = paddedMaxY - (i / 6) * (paddedMaxY - paddedMinY);
    const sy = toScreenY(yVal);
    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(tickBaseX - 3, sy); ctx.lineTo(tickBaseX + 3, sy); ctx.stroke();
    ctx.textAlign = yAxisVisible ? 'right' : 'left';
    ctx.fillText(fmt(yVal), yAxisVisible ? tickBaseX - 5 : tickBaseX + 5, sy + 3);
  }

  // ── Smooth segment stroker (quadratic midpoints, same as studio) ──
  const strokeSegment = (
    color: string,
    width: number,
    glow: string,
    blur: number,
    from: number,
    to: number,
    smooth = false,
  ) => {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) { run = []; return; }
      ctx.moveTo(toScreenX(points[run[0]].x), toScreenY(points[run[0]].y));
      if (smooth) {
        for (let i = 1; i < run.length - 1; i++) {
          const a = points[run[i]];
          const b = points[run[i + 1]];
          const ax = toScreenX(a.x);
          const ay = toScreenY(a.y);
          ctx.quadraticCurveTo(ax, ay, (ax + toScreenX(b.x)) / 2, (ay + toScreenY(b.y)) / 2);
        }
        const last = points[run[run.length - 1]];
        ctx.lineTo(toScreenX(last.x), toScreenY(last.y));
      } else {
        for (let i = 1; i < run.length; i++) {
          ctx.lineTo(toScreenX(points[run[i]].x), toScreenY(points[run[i]].y));
        }
      }
      run = [];
    };

    for (let i = from; i <= to; i++) {
      if (!points[i].isValid) { flush(); continue; }
      run.push(i);
    }
    flush();
    ctx.stroke();
    ctx.restore();
  };

  // ── Fill under curve gradient ──
  const fillUnderCurve = () => {
    const runs: number[][] = [];
    let run: number[] = [];
    for (let i = 0; i < points.length; i++) {
      if (!points[i].isValid) { if (run.length) runs.push(run); run = []; continue; }
      run.push(i);
    }
    if (run.length) runs.push(run);

    const curveColor = isMono ? '#FFFFFF' : isDigital ? '#000000' : palette.curve;
    const baseY = Math.max(4, Math.min(VIDEO_H - 4, toScreenY(0)));
    let topY = baseY;
    for (const r of runs) {
      for (const i of r) {
        const sy = toScreenY(points[i].y);
        if (sy < topY) topY = sy;
      }
    }
    if (topY >= baseY - 1) return;

    const grad = ctx.createLinearGradient(0, topY, 0, baseY);
    grad.addColorStop(0, alpha(curveColor, 0.12));
    grad.addColorStop(1, alpha(curveColor, 0.02));
    ctx.fillStyle = grad;

    for (const r of runs) {
      if (r.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(toScreenX(points[r[0]].x), toScreenY(points[r[0]].y));
      for (let k = 1; k < r.length - 1; k++) {
        const a = points[r[k]];
        const b = points[r[k + 1]];
        const ax = toScreenX(a.x);
        const ay = toScreenY(a.y);
        ctx.quadraticCurveTo(ax, ay, (ax + toScreenX(b.x)) / 2, (ay + toScreenY(b.y)) / 2);
      }
      const last = points[r[r.length - 1]];
      ctx.lineTo(toScreenX(last.x), toScreenY(last.y));
      ctx.lineTo(toScreenX(last.x), baseY);
      ctx.lineTo(toScreenX(points[r[0]].x), baseY);
      ctx.closePath();
      ctx.fill();
    }
  };

  // ── Equation watermark centered in graph (faint, like studio) ──
  if (equation) {
    ctx.save();
    const fontSize = Math.max(11, Math.min(15, VIDEO_W / 55));
    ctx.font = `500 ${fontSize}px "JetBrains Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = alpha(palette.label, 0.12);
    ctx.fillText(equation, VIDEO_W / 2, VIDEO_H / 2);
    ctx.restore();
  }

  // ── Curve rendering with animated playhead ──
  const strokeWidth = 3;
  const liveColor = isMono ? '#FFFFFF' : isDigital ? '#000000' : '#E85D3F';
  const liveGlow = isMono ? '#FFFFFF' : isDigital ? '#000000' : '#E85D3F';
  const liveCore = isMono ? '#FFFFFF' : isDigital ? '#000000' : '#FFAE8B';
  const curveColor = isMono ? '#FFFFFF' : isDigital ? '#000000' : palette.curve;
  const curveGlow = isMono ? '#FFFFFF' : isDigital ? '#000000' : palette.curveGlow;
  const coreColor = isMono ? '#FFFFFF' : isDigital ? '#000000' : palette.curveCore;

  const activeIdx = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));

  if (progress > 0) {
    // Pass A — entire curve dimmed
    strokeSegment(alpha(palette.curve, 0.3), strokeWidth * 0.75, alpha(palette.curve, 0.15), 4, 0, points.length - 1, true);

    // Pass B — live coloured tail with glow
    strokeSegment(liveColor, strokeWidth * 1.05, liveGlow, 14, 0, activeIdx, true);

    // Locate last valid tip
    let tipIdx = -1;
    for (let i = activeIdx; i >= 0; i--) {
      if (points[i].isValid) { tipIdx = i; break; }
    }
    if (tipIdx >= 0) {
      const tipPt = points[tipIdx];
      const px = toScreenX(tipPt.x);
      const py = toScreenY(tipPt.y);

      // Pass C — incandescent filament near tip
      let startIdx = tipIdx;
      for (let i = tipIdx; i >= 0; i--) {
        if (!points[i].isValid) continue;
        if (toScreenX(points[i].x) < px - 52) { startIdx = i; break; }
      }
      strokeSegment(liveCore, Math.max(1.8, strokeWidth * 0.55), liveColor, 20, startIdx, tipIdx, true);

      // Scanner beam
      const beamGrad = ctx.createLinearGradient(0, 0, 0, VIDEO_H);
      beamGrad.addColorStop(0, alpha(liveColor, 0.04));
      beamGrad.addColorStop(Math.max(0, Math.min(1, py / VIDEO_H)), alpha(liveColor, 0.55));
      beamGrad.addColorStop(1, alpha(liveColor, 0.04));
      ctx.fillStyle = beamGrad;
      ctx.fillRect(px - 1.5, 0, 3, VIDEO_H);

      // Beam caps
      ctx.fillStyle = alpha(liveColor, 0.85);
      ctx.fillRect(px - 7, 0, 14, 2);
      ctx.fillRect(px - 7, VIDEO_H - 2, 14, 2);

      // Comet playhead dot
      ctx.save();
      ctx.shadowColor = liveColor;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = alpha(liveColor, 0.35);
      ctx.fill();
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = liveColor;
      ctx.fill();
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = liveCore;
      ctx.fill();
      ctx.restore();

      // Progress label beside dot
      const label = `${Math.round(progress * 100)}%`;
      ctx.font = 'bold 11px "JetBrains Mono", ui-monospace, monospace';
      const tw = ctx.measureText(label).width;
      const labelLeft = px + 13;
      const labelTop = Math.max(12, Math.min(VIDEO_H - 30, py - 14));
      ctx.fillStyle = alpha(palette.canvas, 0.88);
      ctx.fillRect(labelLeft - 4, labelTop - 10, tw + 8, 16);
      ctx.strokeStyle = alpha(liveColor, 0.55);
      ctx.lineWidth = 1;
      ctx.strokeRect(labelLeft - 4.5, labelTop - 10.5, tw + 9, 17);
      ctx.fillStyle = liveColor;
      ctx.fillText(label, labelLeft, labelTop);
    }
  } else {
    // Idle state
    fillUnderCurve();
    strokeSegment(curveColor, strokeWidth, curveGlow, 16, 0, points.length - 1, true);
    strokeSegment(coreColor, Math.max(1.1, strokeWidth * 0.35), 'transparent', 0, 0, points.length - 1, true);
  }

  // ── Vignette ──
  const rad = Math.hypot(VIDEO_W, VIDEO_H) / 2;
  const vignette = ctx.createRadialGradient(
    VIDEO_W / 2, VIDEO_H / 2, rad * 0.55,
    VIDEO_W / 2, VIDEO_H / 2, rad,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, VIDEO_W, VIDEO_H);

  // ── Header: equation name + scientist + equation pill ──
  if (equationName || founderName) {
    ctx.save();
    const headerH = (equationName && founderName ? 92 : 64);
    ctx.fillStyle = isDigital ? 'rgba(0,0,0,0.045)' : isMono ? 'rgba(255,255,255,0.05)' : 'rgba(201,162,75,0.07)';
    ctx.fillRect(0, 0, VIDEO_W, headerH);
    ctx.strokeStyle = isDigital ? 'rgba(0,0,0,0.06)' : isMono ? 'rgba(255,255,255,0.06)' : 'rgba(201,162,75,0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, headerH + 0.5); ctx.lineTo(VIDEO_W, headerH + 0.5); ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    if (equationName) {
      ctx.font = 'bold 28px "Fraunces", serif';
      ctx.fillStyle = isDigital ? '#1A1A1A' : isMono ? '#FFFFFF' : '#EDE7D9';
      ctx.shadowColor = isMono ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.10)';
      ctx.shadowBlur = 6;
      ctx.fillText(equationName, VIDEO_W / 2, 16);
      ctx.shadowBlur = 0;
    }

    if (founderName) {
      ctx.font = '600 13px "Inter", sans-serif';
      ctx.fillStyle = isDigital ? 'rgba(0,0,0,0.55)' : isMono ? 'rgba(255,255,255,0.60)' : 'rgba(237,231,217,0.72)';
      ctx.fillText(`by ${founderName}`, VIDEO_W / 2, equationName ? 50 : 24);
    }

    // Equation pill in header
    const pillFontSize = 13;
    ctx.font = `600 ${pillFontSize}px "JetBrains Mono", monospace`;
    const textW = ctx.measureText(equation).width;
    const pillPadH = 16;
    const pillPadV = 7;
    const pillW = textW + pillPadH * 2;
    const pillH = pillFontSize + pillPadV * 2 + 3;
    const eqY = founderName ? 68 : equationName ? 54 : 38;
    const pillX = (VIDEO_W - pillW) / 2;
    const pillY = eqY - pillPadV + 1;
    const pillR = pillH / 2;

    const eqPillBg = isMono ? 'rgba(255,255,255,0.09)' : isDigital ? 'rgba(0,0,0,0.065)' : 'rgba(27,36,48,0.52)';
    ctx.fillStyle = eqPillBg;
    ctx.strokeStyle = isMono ? 'rgba(255,255,255,0.10)' : isDigital ? 'rgba(0,0,0,0.07)' : 'rgba(237,231,217,0.13)';
    ctx.lineWidth = 1;
    roundRect(ctx, pillX, pillY, pillW, pillH, pillR);
    ctx.fill(); ctx.stroke();

    ctx.font = `600 ${pillFontSize}px "JetBrains Mono", monospace`;
    ctx.fillStyle = isMono ? '#F2F2F0' : isDigital ? '#1A1A1A' : '#EDE7D9';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = isMono ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.12)';
    ctx.shadowBlur = 3;
    ctx.fillText(equation, VIDEO_W / 2, pillY + pillH / 2 + 0.5);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Centered "MathSonify.com" watermark pill ──
  const wmText = 'MathSonify.com';
  const wmFontSize = 13;
  ctx.font = `600 ${wmFontSize}px "Inter", sans-serif`;
  const wmW = ctx.measureText(wmText).width + 32;
  const wmH = 28;
  const wmX = (VIDEO_W - wmW) / 2;
  const wmY = VIDEO_H - wmH - 16;

  // Pill shadow
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 3;
  const wmBg = isDigital ? 'rgba(255,255,255,0.82)' : isMono ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.32)';
  ctx.fillStyle = wmBg;
  roundRect(ctx, wmX, wmY, wmW, wmH, wmH / 2);
  ctx.fill();
  ctx.restore();

  // Pill border
  ctx.fillStyle = wmBg;
  ctx.strokeStyle = isDigital ? 'rgba(0,0,0,0.07)' : isMono ? 'rgba(255,255,255,0.12)' : 'rgba(237,231,217,0.12)';
  ctx.lineWidth = 1;
  roundRect(ctx, wmX, wmY, wmW, wmH, wmH / 2);
  ctx.fill(); ctx.stroke();

  // Text
  ctx.fillStyle = isDigital ? 'rgba(0,0,0,0.58)' : isMono ? 'rgba(255,255,255,0.74)' : 'rgba(255,255,255,0.88)';
  ctx.font = '600 12px "Inter", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = isDigital ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.3)';
  ctx.shadowBlur = 2;
  ctx.fillText(wmText, wmX + wmW / 2, wmY + wmH / 2 + 0.5);
  ctx.shadowBlur = 0;
}

function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

async function renderAudioBlob(opts: VideoExportOptions): Promise<Blob> {
  return renderEquationToWavBlob({
    equation: opts.equation,
    minX: opts.minX,
    maxX: opts.maxX,
    minFreq: opts.minFreq,
    maxFreq: opts.maxFreq,
    duration: opts.duration,
    volume: opts.volume,
    instrument: opts.instrument as never,
    sonificationMode: opts.sonificationMode as never,
    scale: (opts.scale as never) ?? 'major',
  });
}
