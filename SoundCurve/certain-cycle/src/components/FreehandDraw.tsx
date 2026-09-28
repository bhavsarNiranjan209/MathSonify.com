import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DEFAULT_BRUSH_SIZE, DEFAULT_SWEEP_SECONDS, DRAW_PALETTE, DRAW_THEME_STORAGE_KEY,
  EMPTY_DRAW_HISTORY, MAX_BRUSH_SIZE, MAX_SWEEP_SECONDS, MAX_TRANSPOSE,
  MIN_BRUSH_SIZE, MIN_SWEEP_SECONDS, MIN_TRANSPOSE, clearSession, loadSession,
  pushDrawAction, redoDrawAction, saveSession, undoDrawAction,
  type DrawAction, type DrawHistory, type FreehandPoint, type FreehandStroke,
} from '../utils/freehandDraw';
import { getThemeMode, onThemeChange } from '../utils/theme';
import {
  advanceRecordingScan, densifySegment, findStrokesAlongSegment, scanStrokes,
  type ScanReading,
} from '../utils/freehandScanner';
import { freehandAudio } from '../utils/freehandAudio';

interface ActiveStroke extends FreehandStroke { lastMidpoint: FreehandPoint; }

function midpoint(a: FreehandPoint, b: FreehandPoint): FreehandPoint {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, t: (a.t + b.t) / 2 };
}

function pointFromClient(clientX: number, clientY: number, rect: DOMRect, t: number): FreehandPoint {
  return {
    x: Math.min(1, Math.max(0, (clientX - rect.left) / Math.max(1, rect.width))),
    y: Math.min(1, Math.max(0, (clientY - rect.top) / Math.max(1, rect.height))),
    t,
  };
}

function prepareCanvas(canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);
  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { width, height, dpr };
}

function paintPaper(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, color: string, size: number): void {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

function paintDot(ctx: CanvasRenderingContext2D, point: FreehandPoint, w: number, h: number, color: string, size: number): void {
  applyStrokeStyle(ctx, color, size);
  ctx.beginPath();
  ctx.arc(point.x * w, point.y * h, Math.max(0.5, size / 2), 0, Math.PI * 2);
  ctx.fill();
}

/** Synchronous segment painting. It never clears or repaints the paper. */
function paintSegment(ctx: CanvasRenderingContext2D, from: FreehandPoint, through: FreehandPoint, to: FreehandPoint, w: number, h: number, color: string, size: number): void {
  applyStrokeStyle(ctx, color, size);
  ctx.beginPath();
  ctx.moveTo(from.x * w, from.y * h);
  ctx.quadraticCurveTo(through.x * w, through.y * h, to.x * w, to.y * h);
  ctx.stroke();
}

function paintStroke(ctx: CanvasRenderingContext2D, stroke: FreehandStroke, w: number, h: number): void {
  const points = stroke.points;
  if (points.length === 0) return;
  if (points.length === 1) return paintDot(ctx, points[0], w, h, stroke.color, stroke.brushSize);
  applyStrokeStyle(ctx, stroke.color, stroke.brushSize);
  ctx.beginPath();
  ctx.moveTo(points[0].x * w, points[0].y * h);
  for (let i = 1; i < points.length - 1; i++) {
    const mid = midpoint(points[i], points[i + 1]);
    ctx.quadraticCurveTo(points[i].x * w, points[i].y * h, mid.x * w, mid.y * h);
  }
  const last = points[points.length - 1];
  ctx.lineTo(last.x * w, last.y * h);
  ctx.stroke();
}

function renderOverlay(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  scanX: number,
  readings: ScanReading[],
  paused: boolean,
): void {
  ctx.clearRect(0, 0, width, height);
  const x = Math.round(scanX * width) + 0.5;
  ctx.save();
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.58)';
  ctx.lineWidth = 1;
  ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
  ctx.shadowBlur = 4;
  ctx.beginPath();
  ctx.moveTo(x, 0);
  ctx.lineTo(x, height);
  ctx.stroke();
  ctx.restore();

  if (paused) return;
  for (const reading of readings) {
    for (const y of reading.ys) {
      ctx.save();
      ctx.fillStyle = reading.color;
      ctx.shadowColor = reading.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(x, y * height, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function LabeledRange({ id, label, value, min, max, step, display, onChange, disabled = false }: {
  id: string; label: string; value: number; min: number; max: number; step: number;
  display: string; onChange: (value: number) => void; disabled?: boolean;
}) {
  return <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs font-semibold text-sc-text-soft">{label}</label>
      <output htmlFor={id} className="font-mono text-xs tabular-nums text-sc-text">{display}</output>
    </div>
    <input id={id} name={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled}
      onChange={(event) => onChange(Number(event.target.value))}
      autoComplete="off"
      className="w-full accent-[var(--sc-accent)] focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-40" aria-valuetext={display} />
  </div>;
}

export default function FreehandDraw() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const strokesRef = useRef<FreehandStroke[]>([]);
  const activeRef = useRef<ActiveStroke | null>(null);
  const sizeRef = useRef({ width: 1, height: 1, dpr: 1 });
  const timelineOriginRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);
  const resizePendingRef = useRef(false);
  const selectedRef = useRef(DRAW_PALETTE[0]);
  const brushRef = useRef(DEFAULT_BRUSH_SIZE);
  const transposeRef = useRef(0);
  const sweepSecondsRef = useRef(DEFAULT_SWEEP_SECONDS);
  const pausedRef = useRef(false);
  const scanXRef = useRef(0);
  const recordingRef = useRef(false);
  const compositeRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const tapCleanupRef = useRef<(() => void) | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingElapsedMsRef = useRef(0);
  const recordingStopRequestedRef = useRef(false);
  const recordingStopIssuedRef = useRef(false);
  const recordingFailedRef = useRef(false);
  const restorePauseAfterRecordingRef = useRef(false);
  const historyRef = useRef<DrawHistory>(EMPTY_DRAW_HISTORY);
  const eraserPointRef = useRef<FreehandPoint | null>(null);
  const isErasingRef = useRef(false);
  const toolRef = useRef<'draw' | 'erase'>('draw');
  const snapToScaleRef = useRef(true);
  // Draw follows the single GLOBAL MathSonify theme. It used to keep its own
  // `mathsonify-draw-theme` / `data-draw-theme` state, which let the page drift
  // out of sync with the rest of the site. The canvas still needs to know the
  // mode, so it subscribes to the shared theme event instead of owning one.
  const initialTheme = getThemeMode();
  const themeRef = useRef<'dark' | 'light'>(initialTheme);

  const [strokes, setStrokes] = useState<FreehandStroke[]>([]);
  const [history, setHistory] = useState<DrawHistory>(EMPTY_DRAW_HISTORY);
  const [tool, setTool] = useState<'draw' | 'erase'>('draw');
  const [snapToScale, setSnapToScale] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light'>(initialTheme);
  const [isErasing, setIsErasing] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [brushSize, setBrushSize] = useState(DEFAULT_BRUSH_SIZE);
  const [sweepSeconds, setSweepSeconds] = useState(DEFAULT_SWEEP_SECONDS);
  const [transpose, setTranspose] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [isPaused, setIsPaused] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [exportError, setExportError] = useState('');
  const [notice, setNotice] = useState('The scan line is running silently. Draw or use Pause/Resume to enable sound.');

  useEffect(() => () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  }, [videoUrl]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    const ctx = canvas?.getContext('2d');
    const overlayCtx = overlay?.getContext('2d');
    if (!canvas || !overlay || !ctx || !overlayCtx) return;
    const size = prepareCanvas(canvas, ctx);
    prepareCanvas(overlay, overlayCtx);
    sizeRef.current = size;
    resizePendingRef.current = false;
    paintPaper(ctx, size.width, size.height);
    for (const stroke of strokesRef.current) paintStroke(ctx, stroke, size.width, size.height);
    if (activeRef.current) paintStroke(ctx, activeRef.current, size.width, size.height);
    overlayCtx.clearRect(0, 0, size.width, size.height);
  }, []);

  const persist = useCallback((next: FreehandStroke[]) => {
    try {
      saveSession(next, window.localStorage);
      setNotice('Saved on this device.');
    } catch {
      setNotice('Drawing works, but this browser blocked autosave.');
    }
  }, []);

  const syncStrokeState = useCallback((next: FreehandStroke[]) => {
    strokesRef.current = next;
    setStrokes(next);
    redraw();
    const present = new Map<string, { color: string; instrument: FreehandStroke['instrument'] }>();
    for (const stroke of next) present.set(stroke.color, { color: stroke.color, instrument: stroke.instrument });
    const colors = [...present.values()];
    freehandAudio.reconcileVoices(colors);
    if (!pausedRef.current) {
      freehandAudio.update(
        scanStrokes(next, scanXRef.current),
        transposeRef.current,
        colors,
        snapToScaleRef.current,
      );
    }
  }, [redraw]);

  const commitHistoryAction = useCallback((action: DrawAction, next: FreehandStroke[], message: string) => {
    const nextHistory = pushDrawAction(historyRef.current, action);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    syncStrokeState(next);
    persist(next);
    setNotice(message);
  }, [persist, syncStrokeState]);


  const handleUndo = useCallback(() => {
    if (activeRef.current || isErasingRef.current || recordingRef.current) return;
    const result = undoDrawAction(strokesRef.current, historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setHistory(result.history);
    syncStrokeState(result.strokes);
    persist(result.strokes);
    setNotice('Undid the last action.');
  }, [persist, syncStrokeState]);

  const handleRedo = useCallback(() => {
    if (activeRef.current || isErasingRef.current || recordingRef.current) return;
    const result = redoDrawAction(strokesRef.current, historyRef.current);
    if (!result) return;
    historyRef.current = result.history;
    setHistory(result.history);
    syncStrokeState(result.strokes);
    persist(result.strokes);
    setNotice('Redid the next action.');
  }, [persist, syncStrokeState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isTextInput = target instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit', 'reset'].includes(target.type);
      if (isTextInput || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); handleUndo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); handleRedo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleRedo, handleUndo]);
  const unlockAudio = useCallback(async () => {
    const ready = await freehandAudio.unlock();
    setAudioReady(ready);
    if (!ready) setNotice('Sound is unavailable; the visual scanner and drawing still work.');
    return ready;
  }, []);

  const copyRecordingFrame = useCallback(() => {
    if (!recordingRef.current) return;
    const source = canvasRef.current;
    const overlay = overlayRef.current;
    const composite = compositeRef.current;
    const ctx = composite?.getContext('2d');
    if (!source || !overlay || !composite || !ctx) return;
    ctx.clearRect(0, 0, composite.width, composite.height);
    ctx.drawImage(source, 0, 0, composite.width, composite.height);
    ctx.drawImage(overlay, 0, 0, composite.width, composite.height);
  }, []);

  const finishStroke = useCallback((event?: React.PointerEvent<HTMLCanvasElement>) => {
    if (isErasingRef.current) {
      if (event && pointerIdRef.current !== event.pointerId) return;
      isErasingRef.current = false;
      eraserPointRef.current = null;
      pointerIdRef.current = null;
      setIsErasing(false);
      setIsDrawing(false);
      return;
    }
    const active = activeRef.current;
    if (!active || (event && pointerIdRef.current !== event.pointerId)) return;
    if (event) {
      const canvas = event.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const point = pointFromClient(event.clientX, event.clientY, rect, performance.now() - timelineOriginRef.current);
      const previous = active.points[active.points.length - 1];
      const { width, height } = sizeRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) paintSegment(ctx, active.lastMidpoint, previous, point, width, height, active.color, active.brushSize);
      active.points.push(...densifySegment(previous, point, rect.width, rect.height));
    }
    activeRef.current = null;
    pointerIdRef.current = null;
    setIsDrawing(false);
    const { lastMidpoint: _lastMidpoint, ...stroke } = active;
    const index = strokesRef.current.length;
    const next = [...strokesRef.current, stroke];
    commitHistoryAction({ type: 'draw', index, stroke }, next, 'Stroke added.');
    if (resizePendingRef.current) requestAnimationFrame(redraw);
  }, [commitHistoryAction, redraw]);

  useEffect(() => {
    try {
      const restored = loadSession(window.localStorage);
      timelineOriginRef.current = performance.now();
      strokesRef.current = restored;
      setStrokes(restored);
      historyRef.current = EMPTY_DRAW_HISTORY;
      setHistory(EMPTY_DRAW_HISTORY);
      setNotice(restored.length > 0 ? 'Restored your last drawing. The scanner is already running.' : 'The scan line is running silently. Draw or use Pause/Resume to enable sound.');
    } catch {
      timelineOriginRef.current = performance.now();
      setNotice('Autosave is unavailable; drawing and scanning still work.');
    }
    redraw();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      if (activeRef.current) resizePendingRef.current = true;
      else redraw();
    });
    observer.observe(canvas);
    return () => {
      observer.disconnect();
      const recorder = recorderRef.current;
      recorderRef.current = null;
      if (recorder && recorder.state !== 'inactive') {
        recorder.onstop = null;
        recorder.stop();
      }
      for (const track of recordingStreamRef.current?.getTracks() ?? []) track.stop();
      recordingStreamRef.current = null;
      tapCleanupRef.current?.();
      tapCleanupRef.current = null;
      freehandAudio.dispose();
    };
  }, [redraw]);

  // Follow the global theme. The theme toggle itself lives in the shared
  // navigation, so this only mirrors the mode for the canvas palette.
  useEffect(() => {
    // Discard the retired Draw-specific theme value so it can never resurface
    // and disagree with the global theme.
    try { window.localStorage.removeItem(DRAW_THEME_STORAGE_KEY); } catch { /* storage may be blocked */ }
    delete document.documentElement.dataset.drawTheme;

    return onThemeChange((mode) => {
      themeRef.current = mode;
      setTheme(mode);
    });
  }, []);

  useEffect(() => {
    let animationFrame = 0;
    let previousTime = performance.now();
    const scan = (time: number) => {
      const elapsedSinceFrame = Math.max(0, time - previousTime);
      previousTime = time;
      const paused = pausedRef.current;
      if (!paused) {
        if (recordingRef.current) {
          const periodMs = sweepSecondsRef.current * 1000;
          const step = advanceRecordingScan(scanXRef.current, recordingElapsedMsRef.current, elapsedSinceFrame, periodMs);
          recordingElapsedMsRef.current = step.elapsedMs;
          scanXRef.current = step.x;
          if (step.complete) recordingStopRequestedRef.current = true;
        } else {
          scanXRef.current = (scanXRef.current + Math.min(50, elapsedSinceFrame) / (sweepSecondsRef.current * 1000)) % 1;
        }
      }
      const readings = paused ? [] : scanStrokes(strokesRef.current, scanXRef.current);
      if (!paused) {
        const present = new Map<string, { color: string; instrument: FreehandStroke['instrument'] }>();
        for (const stroke of strokesRef.current) present.set(stroke.color, { color: stroke.color, instrument: stroke.instrument });
        freehandAudio.update(readings, transposeRef.current, [...present.values()], snapToScaleRef.current);
      }
      const overlay = overlayRef.current;
      const ctx = overlay?.getContext('2d');
      if (ctx) renderOverlay(ctx, sizeRef.current.width, sizeRef.current.height, scanXRef.current, readings, paused);
      copyRecordingFrame();
      if (recordingStopRequestedRef.current && !recordingStopIssuedRef.current) {
        recordingStopIssuedRef.current = true;
        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') recorder.stop();
      }
      animationFrame = requestAnimationFrame(scan);
    };
    animationFrame = requestAnimationFrame(scan);
    return () => cancelAnimationFrame(animationFrame);
  }, [copyRecordingFrame]);

  const eraseAlong = useCallback((start: FreehandPoint, end: FreehandPoint, widthPx: number, heightPx: number) => {
    const current = strokesRef.current;
    const targets = findStrokesAlongSegment(current, start, end, widthPx, heightPx, 10)
      .map((index) => ({ index, stroke: current[index] }))
      .filter((entry) => Boolean(entry.stroke));
    if (targets.length === 0) return;

    let next = [...current];
    let nextHistory = historyRef.current;
    for (const target of targets) {
      const currentIndex = next.findIndex((stroke) => stroke.id === target.stroke.id);
      if (currentIndex < 0) continue;
      const action: DrawAction = { type: 'erase', index: currentIndex, stroke: target.stroke };
      nextHistory = pushDrawAction(nextHistory, action);
      next = next.filter((stroke) => stroke.id !== target.stroke.id);
    }
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    syncStrokeState(next);
    persist(next);
    setNotice(targets.length === 1 ? 'Stroke erased. Undo restores it.' : `${targets.length} strokes erased.`);
  }, [persist, syncStrokeState]);

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || activeRef.current || isErasingRef.current) return;
    event.preventDefault();
    void unlockAudio();
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointerIdRef.current = event.pointerId;
    const rect = canvas.getBoundingClientRect();
    const point = pointFromClient(event.clientX, event.clientY, rect, performance.now() - timelineOriginRef.current);
    if (toolRef.current === 'erase') {
      isErasingRef.current = true;
      setIsErasing(true);
      eraserPointRef.current = point;
      eraseAlong(point, point, rect.width, rect.height);
      return;
    }
    if (strokesRef.current.length === 0) timelineOriginRef.current = performance.now();
    const selected = selectedRef.current;
    activeRef.current = {
      id: `stroke-${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`,
      color: selected.color,
      instrument: selected.instrument,
      brushSize: brushRef.current,
      points: [point],
      lastMidpoint: point,
    };
    const { width, height } = sizeRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) paintDot(ctx, point, width, height, selected.color, brushRef.current);
    setIsDrawing(true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (pointerIdRef.current !== event.pointerId) return;
    event.preventDefault();
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    const point = pointFromClient(event.clientX, event.clientY, rect, performance.now() - timelineOriginRef.current);
    if (isErasingRef.current) {
      const previous = eraserPointRef.current ?? point;
      eraseAlong(previous, point, rect.width, rect.height);
      eraserPointRef.current = point;
      return;
    }
    const active = activeRef.current;
    if (!active) return;
    const previous = active.points[active.points.length - 1];
    const mid = midpoint(previous, point);
    const { width, height } = sizeRef.current;
    const ctx = canvas.getContext('2d');
    if (ctx) paintSegment(ctx, active.lastMidpoint, previous, mid, width, height, active.color, active.brushSize);
    active.points.push(...densifySegment(previous, point, rect.width, rect.height));
    active.lastMidpoint = mid;
  };

  const handleTogglePause = async () => {
    if (recordingRef.current) return;
    void unlockAudio();
    const nextPaused = !pausedRef.current;
    pausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    if (nextPaused) freehandAudio.pauseAll();
    else await unlockAudio();
  };

  const handleReset = () => {
    if (recordingRef.current) return;
    if (strokesRef.current.length > 0 && !window.confirm('Reset the drawing, saved copy, and every active scan voice?')) return;
    freehandAudio.resetVoices();
    const pointerId = pointerIdRef.current;
    activeRef.current = null;
    pointerIdRef.current = null;
    if (pointerId !== null && canvasRef.current?.hasPointerCapture(pointerId)) {
      try { canvasRef.current.releasePointerCapture(pointerId); } catch { /* already released */ }
    }
    strokesRef.current = [];
    setStrokes([]);
    historyRef.current = EMPTY_DRAW_HISTORY;
    setHistory(EMPTY_DRAW_HISTORY);
    isErasingRef.current = false;
    eraserPointRef.current = null;
    setIsErasing(false);
    setIsDrawing(false);
    scanXRef.current = 0;
    timelineOriginRef.current = performance.now();
    try { clearSession(window.localStorage); } catch { /* storage may be blocked */ }
    redraw();
    setNotice('Canvas reset. The scan line is positioned at the left edge.');
  };

  const chooseColor = (index: number) => {
    selectedRef.current = DRAW_PALETTE[index];
    setSelectedIndex(index);
  };
  const chooseTool = (next: 'draw' | 'erase') => {
    toolRef.current = next;
    setTool(next);
    setNotice(next === 'erase' ? 'Eraser active. Drag across whole strokes to remove them.' : 'Draw tool active.');
  };
  const toggleSnapToScale = () => {
    const next = !snapToScaleRef.current;
    snapToScaleRef.current = next;
    setSnapToScale(next);
    setNotice(next ? 'Pitch snapped to C minor pentatonic.' : 'Free pitch enabled.');
  };

  const finishStrokeWithoutEvent = () => finishStroke();
  const chooseBrush = (value: number) => { brushRef.current = value; setBrushSize(value); };
  const chooseSweep = (value: number) => { sweepSecondsRef.current = value; setSweepSeconds(value); };
  const chooseTranspose = (value: number) => { transposeRef.current = value; setTranspose(value); };
  const chooseVolume = (value: number) => { setVolume(value); freehandAudio.setVolume(value); };

  const cleanupRecording = useCallback(() => {
    for (const track of recordingStreamRef.current?.getTracks() ?? []) track.stop();
    recordingStreamRef.current = null;
    tapCleanupRef.current?.();
    tapCleanupRef.current = null;
    compositeRef.current = null;
    recorderRef.current = null;
  }, []);

  const handleExportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas || recordingRef.current) return;
    setExportError('');
    canvas.toBlob((blob) => {
      if (!blob) {
        setExportError('Image export failed. Try drawing again and retry.');
        return;
      }
      downloadBlob(blob, 'mathsonify-drawing.png');
      setNotice('PNG exported without the scan line or intersection dots.');
    }, 'image/png');
  };

  const handleExportVideo = async () => {
    if (recordingRef.current) return;
    const source = canvasRef.current;
    const overlay = overlayRef.current;
    if (!source || !overlay) return;

    setExportError('');
    setVideoUrl(null);
    if (!(await unlockAudio())) {
      setExportError('Audio could not initialize. Start sound, then retry video export.');
      return;
    }
    if (typeof MediaRecorder === 'undefined' || typeof source.captureStream !== 'function') {
      setExportError('This browser does not support canvas video recording. Chrome or Edge is recommended.');
      return;
    }

    const wasPaused = pausedRef.current;
    restorePauseAfterRecordingRef.current = wasPaused;
    if (wasPaused) {
      pausedRef.current = false;
      setIsPaused(false);
    }

    try {
      const composite = document.createElement('canvas');
      composite.width = source.width;
      composite.height = source.height;
      compositeRef.current = composite;
      const videoStream = composite.captureStream(30);
      recordingStreamRef.current = videoStream;
      const tap = freehandAudio.createRecordingTap();
      if (!tap) throw new Error('Audio recording tap is unavailable');
      tapCleanupRef.current = tap.cleanup;
      const combined = new MediaStream([...videoStream.getVideoTracks(), ...tap.stream.getAudioTracks()]);
      recordingStreamRef.current = combined;
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
      const recorder = new MediaRecorder(combined, { mimeType, videoBitsPerSecond: 3_000_000 });
      const chunks: Blob[] = [];

      recorderRef.current = recorder;
      recordingRef.current = true;
      recordingElapsedMsRef.current = 0;
      recordingStopRequestedRef.current = false;
      recordingStopIssuedRef.current = false;
      recordingFailedRef.current = false;
      setIsRecording(true);
      setNotice('Recording exactly one full scan loop with live audio…');

      copyRecordingFrame(); // The always-on scan rAF copies every later frame too.
      recorder.ondataavailable = (event) => { if (event.data.size > 0) chunks.push(event.data); };
      recorder.onerror = () => {
        recordingFailedRef.current = true;
        setExportError('Video recording failed in this browser. Try Chrome or Edge, then retry.');
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.onstop = () => {
        const wasInterruptedPaused = restorePauseAfterRecordingRef.current;
        cleanupRecording();
        recordingRef.current = false;
        setIsRecording(false);
        if (wasInterruptedPaused) {
          pausedRef.current = true;
          setIsPaused(true);
          freehandAudio.pauseAll();
        }
        if (recordingFailedRef.current) {
          setNotice('Video recording failed; the scanner is still running.');
          return;
        }
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setVideoUrl(url);
        downloadBlob(blob, 'mathsonify-scan-loop.webm');
        setNotice('One-loop WebM with synchronized audio is ready.');
      };

      recorder.start(250);
    } catch (error) {
      cleanupRecording();
      recordingRef.current = false;
      setIsRecording(false);
      if (wasPaused) {
        pausedRef.current = true;
        setIsPaused(true);
        freehandAudio.pauseAll();
      }
      setExportError(error instanceof Error ? error.message : 'Video export failed.');
    }
  };

  const selected = DRAW_PALETTE[selectedIndex];
  return (
    <>
      <a href="#main-content" className="sr-only z-[100] rounded-md bg-sc-accent px-4 py-3 font-semibold text-sc-on-accent focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to Drawing</a>
      <main id="main-content" className="min-h-screen bg-sc-bg px-3 pb-6 pt-[4.5rem] text-sc-text sm:px-5">
        <div className="mx-auto flex min-h-[calc(100dvh-6.5rem)] max-w-[1900px] flex-col gap-4">
          <header className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sc-accent">Always-on scan instrument</p>
              <h1 className="text-balance mt-1 font-serif text-2xl font-semibold sm:text-3xl">Draw &amp; Perform</h1>
              <p className="mt-1 text-xs text-sc-text-soft">The line loops silently until your first interaction unlocks sound.</p>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={handleUndo} disabled={history.undo.length === 0 || isRecording || isDrawing || isErasing}
                aria-label="Undo last action" aria-keyshortcuts="Control+Z Meta+Z" title="Undo (Ctrl/⌘+Z)"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-md border border-sc-line/30 text-sc-text-soft transition-colors hover:border-sc-accent hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-35">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></svg>
              </button>
              <button type="button" onClick={handleRedo} disabled={history.redo.length === 0 || isRecording || isDrawing || isErasing}
                aria-label="Redo next action" aria-keyshortcuts="Control+Shift+Z Control+Y Meta+Shift+Z" title="Redo (Ctrl/⌘+Shift+Z or Ctrl+Y)"
                className="grid min-h-[44px] min-w-[44px] place-items-center rounded-md border border-sc-line/30 text-sc-text-soft transition-colors hover:border-sc-accent hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-35">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 14 5-5-5-5" /><path d="M20 9H10a6 6 0 0 0 0 12h2" /></svg>
              </button>
              {/* No theme toggle here on purpose: Draw follows the single global,                  MathSonify theme, toggled in the shared navigation. */}
              <button type="button" onClick={handleReset} disabled={isRecording}
                className="min-h-[44px] touch-manipulation rounded-md border border-sc-line/30 px-4 text-sm font-semibold text-sc-text-soft transition-colors hover:border-sc-live/60 hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-40">Reset</button>
              <button type="button" onPointerDown={() => void unlockAudio()} onClick={() => void handleTogglePause()} disabled={isRecording}
                aria-label={isPaused ? 'Resume scan' : 'Pause scan'} title={isPaused ? 'Resume scan' : 'Pause scan'}
                className="grid min-h-[44px] min-w-[44px] touch-manipulation place-items-center rounded-md bg-sc-accent text-sc-on-accent transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sc-bg disabled:cursor-not-allowed disabled:opacity-40">
                {isPaused ? <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg> : <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z" /></svg>}
              </button>
            </div>
          </header>

          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)_260px]">
            <aside className="panel min-w-0 overflow-y-auto p-4 lg:max-h-[calc(100dvh-10rem)]" aria-labelledby="palette-heading">
              <div className="mb-4 grid grid-cols-2 gap-2" role="group" aria-label="Drawing tool">
                <button type="button" onClick={() => chooseTool('draw')} aria-pressed={tool === 'draw'}
                  className={`min-h-[44px] touch-manipulation rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-sc-accent ${tool === 'draw' ? 'border-sc-accent bg-sc-accent/10 text-sc-text' : 'border-sc-line/20 text-sc-text-soft hover:border-sc-accent/50'}`}>Draw</button>
                <button type="button" onClick={() => chooseTool('erase')} aria-pressed={tool === 'erase'}
                  className={`min-h-[44px] touch-manipulation rounded-md border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-sc-accent ${tool === 'erase' ? 'border-sc-accent bg-sc-accent/10 text-sc-text' : 'border-sc-line/20 text-sc-text-soft hover:border-sc-accent/50'}`}>Eraser</button>
              </div>
              <h2 id="palette-heading" className="text-sm font-semibold">14 Gentle Voices</h2>
              <p className="mt-1 text-[11px] leading-relaxed text-sc-text-soft">Color selects the next stroke’s persistent scan voice.</p>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DRAW_PALETTE.map((entry, index) => {
                  const active = index === selectedIndex;
                  return <button key={entry.color} type="button" onClick={() => chooseColor(index)} aria-pressed={active}
                    className={`flex min-h-[54px] min-w-0 touch-manipulation items-center gap-2 rounded-md border px-2.5 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-sc-accent ${active ? 'border-sc-accent bg-sc-accent/10' : 'border-sc-line/20 hover:border-sc-accent/50'}`}>
                    <span className="h-6 w-6 shrink-0 rounded-full border border-black/15" style={{ background: entry.color }} aria-hidden="true" />
                    <span className="min-w-0"><strong className="block truncate text-[11px]">{entry.name}</strong><small className="block truncate text-[9px] text-sc-text-soft">{entry.waveform}</small></span>
                  </button>;
                })}
              </div>
              <div className="mt-5 border-t border-sc-line/15 pt-4">
                <LabeledRange id="brush-size" label="Brush Size" value={brushSize} min={MIN_BRUSH_SIZE} max={MAX_BRUSH_SIZE} step={1} display={`${brushSize} px`} onChange={chooseBrush} />
              </div>
            </aside>

            <section className="min-w-0" aria-label="Drawing paper and scan overlay">
              <div className="relative h-[clamp(420px,calc(100dvh-12rem),900px)] min-h-[420px] overflow-hidden overscroll-contain rounded-md border border-sc-line/25 bg-white shadow-2xl">
                <canvas ref={canvasRef} width={1200} height={800}
                  onPointerDown={handlePointerDown} onPointerMove={handlePointerMove}
                  onPointerUp={finishStroke} onPointerCancel={finishStrokeWithoutEvent}
                  onPointerLeave={finishStrokeWithoutEvent} onLostPointerCapture={finishStrokeWithoutEvent}
                  className={`relative z-0 block h-full w-full touch-none select-none ${tool === 'erase' ? 'cursor-cell' : 'cursor-crosshair'}`}
                  style={{ touchAction: 'none' }} aria-label={tool === 'erase' ? 'Whole-stroke eraser. Drag across strokes to remove them.' : 'Blank drawing paper. Draw with a mouse, pen, or finger.'}>
                  Your browser does not support canvas drawing.
                </canvas>
                <canvas ref={overlayRef} width={1200} height={800} aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 block h-full w-full" />
                {strokes.length === 0 && !isDrawing && (
                  <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center p-6 text-center text-neutral-400" aria-hidden="true">
                    <div><p className="font-serif text-2xl">{tool === 'erase' ? 'Eraser Mode' : 'Draw Anywhere'}</p><p className="mt-1 text-sm">{tool === 'erase' ? 'Drag across whole strokes to remove them.' : 'The moving line reads every color it crosses.'}</p></div>
                  </div>
                )}
              </div>
              <p className="mt-2 text-center font-mono text-[11px] text-sc-text-faint" aria-live="polite">{notice}</p>
            </section>

            <aside className="panel min-w-0 space-y-5 overflow-y-auto p-4 lg:max-h-[calc(100dvh-10rem)]" aria-labelledby="sound-heading">
              <div>
                <h2 id="sound-heading" className="text-sm font-semibold">Sound &amp; Scan</h2>
                <p className="mt-1 text-[11px] leading-relaxed text-sc-text-soft">The line loops continuously. New strokes are picked up on the next natural pass.</p>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-md border border-sc-line/15 px-3 py-2 text-[11px]">
                <span className="text-sc-text-soft">Audio status</span>
                <span className={`font-mono ${audioReady ? 'text-sc-live' : 'text-sc-text-faint'}`}>{audioReady ? 'Unlocked' : 'Silent until interaction'}</span>
              </div>
              <LabeledRange id="sweep-time" label="Sweep Time" value={sweepSeconds} min={MIN_SWEEP_SECONDS} max={MAX_SWEEP_SECONDS} step={0.5}
                display={`${sweepSeconds.toFixed(1)} s / loop`} onChange={chooseSweep} disabled={isRecording} />
              <LabeledRange id="pitch-range" label="Pitch Range" value={transpose} min={MIN_TRANSPOSE} max={MAX_TRANSPOSE} step={1}
                display={`${transpose > 0 ? '+' : ''}${transpose} st`} onChange={chooseTranspose} />
              <LabeledRange id="master-volume" label="Volume" value={volume} min={0} max={1} step={0.01}
                display={`${Math.round(volume * 100)}%`} onChange={chooseVolume} />
              <div className="flex items-center justify-between gap-3 rounded-md border border-sc-line/15 px-3 py-2.5">
                <div><span className="block text-xs font-semibold">Snap to Scale</span><span className="mt-0.5 block text-[10px] text-sc-text-soft">{snapToScale ? 'C minor pentatonic' : 'Free continuous pitch'}</span></div>
                <button type="button" role="switch" aria-checked={snapToScale} onClick={toggleSnapToScale}
                  className="grid min-h-[44px] min-w-[44px] place-items-center rounded-md focus-visible:ring-2 focus-visible:ring-sc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sc-surface">
                  <span className={`relative block h-7 w-12 rounded-full border transition-colors ${snapToScale ? 'border-sc-accent bg-sc-accent' : 'border-sc-line/40 bg-sc-sunken'}`} aria-hidden="true">
                    <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${snapToScale ? 'translate-x-6' : 'translate-x-1'}`} />
                  </span>
                  <span className="sr-only">{snapToScale ? 'Disable scale snapping' : 'Enable scale snapping'}</span>
                </button>
              </div>
              <div className="rounded-md border border-sc-accent/20 bg-sc-accent/[0.06] p-3 text-[11px] leading-relaxed text-sc-text-soft">
                {snapToScale ? <>Pitch uses <strong className="text-sc-text">C minor pentatonic</strong>.</> : <>Pitch follows <strong className="text-sc-text">continuous frequency</strong>.</>} Colors share only sine and triangle voices.
              </div>
              <button type="button" onClick={handleReset} disabled={isRecording}
                className="min-h-[44px] w-full touch-manipulation rounded-md border border-sc-line/30 px-4 text-sm font-semibold text-sc-text-soft transition-colors hover:border-sc-live/60 hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-40">Reset Drawing</button>

              <div className="border-t border-sc-line/15 pt-4">
                <h3 className="text-xs font-semibold">Export</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleExportImage} disabled={isRecording}
                    className="min-h-[44px] touch-manipulation rounded-md border border-sc-line/30 px-3 text-xs font-semibold transition-colors hover:border-sc-accent/60 hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-40">Export PNG</button>
                  <button type="button" onClick={() => void handleExportVideo()} disabled={isRecording}
                    className="min-h-[44px] touch-manipulation rounded-md border border-sc-line/30 px-3 text-xs font-semibold transition-colors hover:border-sc-accent/60 hover:text-sc-text focus-visible:ring-2 focus-visible:ring-sc-accent disabled:cursor-not-allowed disabled:opacity-40">{isRecording ? 'Recording…' : 'Export Video'}</button>
                </div>
                {videoUrl && <a href={videoUrl} download="mathsonify-scan-loop.webm"
                  className="mt-2 flex min-h-[44px] items-center justify-center rounded-md bg-sc-accent px-3 text-xs font-bold text-sc-on-accent transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sc-accent">Download Video</a>}
                {exportError && <p role="alert" className="draw-export-error mt-2 rounded-md border border-red-400/30 bg-red-500/10 p-2 text-[11px] leading-relaxed text-red-200">{exportError}</p>}
              </div>

              <div className="border-t border-sc-line/15 pt-4">
                <h3 className="text-xs font-semibold">Palette Legend</h3>
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2">
                  {DRAW_PALETTE.map((entry) => <li key={entry.color} className="flex min-w-0 items-center gap-2 text-[10px] text-sc-text-soft" title={`${entry.color} · ${entry.waveform}`}>
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: entry.color }} aria-hidden="true" />
                    <span className="truncate">{entry.name} · {entry.instrument}</span>
                  </li>)}
                </ul>
              </div>
              <p className="rounded-md border border-sc-accent/20 bg-sc-accent/[0.06] p-3 text-[11px] leading-relaxed text-sc-text-soft">{tool === 'erase' ? <><strong className="text-sc-text">Whole-stroke eraser active.</strong> Drag across strokes; each deletion is separately undoable.</> : <>Current brush: <strong className="text-sc-text">{selected.name}, {brushSize} px</strong>. Palette changes apply to the next stroke.</>}</p>
            </aside>
          </div>
        </div>
      </main>
    </>
  );
}


