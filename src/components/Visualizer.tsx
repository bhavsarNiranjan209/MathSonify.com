import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStudioStore, type VisualizerMode } from '../store/studioStore';
import { parseEquation, type SamplePoint } from '../utils/equationParser';
import { audioEngine } from '../utils/audioEngine';
import { getCanvasPalette, onThemeChange, type CanvasPalette } from '../utils/theme';

/** Converts a #RRGGBB color into an rgba() string at given alpha. */
function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ── Freeform curve editing helpers ─────────────────────────────────────── */

interface GraphHandle {
  x: number;
  y: number;
}

const EDIT_KNOTS = 7;
const FOURIER_TERMS = 8;

/** Padded y-range shared by the graph renderer and the edit overlay. */
function paddedYRange(pts: SamplePoint[]): { paddedMinY: number; paddedMaxY: number } {
  const yVals = pts.map((p) => p.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const yPad = Math.max(0.5, (maxY - minY) * 0.18);
  return { paddedMinY: minY - yPad, paddedMaxY: maxY + yPad };
}

/** Catmull-Rom curve through the handles, evaluated as y(x). */
function splineY(handles: GraphHandle[], x: number): number {
  const n = handles.length;
  if (n === 0) return 0;
  if (n === 1) return handles[0].y;
  let seg = n - 2;
  for (let i = 0; i < n - 1; i++) {
    if (x >= handles[i].x && x <= handles[i + 1].x) {
      seg = i;
      break;
    }
  }
  const p0 = handles[Math.max(0, seg - 1)];
  const p1 = handles[seg];
  const p2 = handles[seg + 1];
  const p3 = handles[Math.min(n - 1, seg + 2)];
  const span = p2.x - p1.x || 1;
  const t = (x - p1.x) / span;
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
  );
}

/** Sample the spline uniformly across the domain. */
function sampleSpline(handles: GraphHandle[], minX: number, maxX: number, count = 800): SamplePoint[] {
  const pts: SamplePoint[] = [];
  for (let i = 0; i <= count; i++) {
    const x = minX + (i / count) * (maxX - minX);
    pts.push({ x, y: splineY(handles, x), dy: 0, curvature: 0, isValid: true });
  }
  return pts;
}

interface FourierTerm {
  amp: number;
  freq: number; // harmonic index (1..K)
  phase: number;
}

/** Least-squares Fourier series fit (amplitude–phase form). */
function fourierFit(points: SamplePoint[], minX: number, maxX: number, harmonics: number): FourierTerm[] {
  const W = maxX - minX || 1;
  const M = points.length;
  const sinC = new Array(harmonics + 1).fill(0);
  const cosC = new Array(harmonics + 1).fill(0);
  for (const pt of points) {
    const th = ((pt.x - minX) / W) * 2 * Math.PI;
    for (let k = 1; k <= harmonics; k++) {
      sinC[k] += pt.y * Math.sin(k * th);
      cosC[k] += pt.y * Math.cos(k * th);
    }
  }
  const terms: FourierTerm[] = [];
  for (let k = 1; k <= harmonics; k++) {
    const a = (2 / M) * sinC[k];
    const b = (2 / M) * cosC[k];
    terms.push({ amp: Math.hypot(a, b), freq: k, phase: Math.atan2(b, a) });
  }
  return terms;
}

/** Format the Fourier fit as a legible mathjs expression string. */
function buildEquationString(
  a0: number,
  terms: FourierTerm[],
  minX: number,
  maxX: number,
): string {
  const W = maxX - minX || 1;
  const r2 = (v: number) => {
    const r = Math.round(v * 100) / 100;
    return Object.is(r, -0) ? 0 : r;
  };
  const parts: string[] = [];
  if (Math.abs(a0) >= 0.005) parts.push(String(r2(a0)));
  let kept = 0;
  for (const t of terms) {
    if (t.amp < 0.005) continue;
    kept++;
    const freq = r2((t.freq * 2 * Math.PI) / W);
    const ph = r2(t.phase);
    let term = `${r2(t.amp)}*sin(${freq}*x`;
    if (Math.abs(ph) >= 0.001) term += ph < 0 ? ` - ${r2(-ph)}` : ` + ${r2(ph)}`;
    term += ')';
    parts.push(term);
  }
  // Fallback: if every term was below the threshold, keep the dominant one.
  if (kept === 0 && terms.length > 0) {
    const t = terms[0];
    parts.push(`${r2(t.amp)}*sin(${r2((t.freq * 2 * Math.PI) / W)}*x)`);
  }
  return parts.join(' + ');
}

/** Draw the draggable handle dots on the canvas. */
function drawEditHandles(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  handles: GraphHandle[],
  activeIdx: number,
  minX: number,
  maxX: number,
  p: CanvasPalette,
  points: SamplePoint[],
) {
  const valid = points.filter((pt) => pt.isValid);
  if (valid.length === 0 || handles.length === 0) return;
  const { paddedMinY, paddedMaxY } = paddedYRange(valid);

  ctx.save();
  for (let i = 0; i < handles.length; i++) {
    const h = handles[i];
    const px = ((h.x - minX) / (maxX - minX)) * width;
    const py = height - ((h.y - paddedMinY) / (paddedMaxY - paddedMinY)) * height;
    const active = i === activeIdx;

    ctx.shadowColor = active ? p.live : p.curve;
    ctx.shadowBlur = active ? 14 : 6;
    ctx.beginPath();
    ctx.arc(px, py, active ? 7.5 : 6, 0, Math.PI * 2);
    ctx.fillStyle = active ? p.live : p.curve;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(px, py, active ? 3.5 : 2.5, 0, Math.PI * 2);
    ctx.fillStyle = p.canvas;
    ctx.fill();
  }
  ctx.restore();
}

export default function Visualizer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const paletteRef = useRef<CanvasPalette>(getCanvasPalette());

  const equation = useStudioStore((s) => s.equation);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);
  const isPlaying = useStudioStore((s) => s.isPlaying);
  const progress = useStudioStore((s) => s.progress);
  const visualizerMode = useStudioStore((s) => s.visualizerMode);
  const setVisualizerMode = useStudioStore((s) => s.setVisualizerMode);
  const showGrid = useStudioStore((s) => s.showGrid);
  const setShowGrid = useStudioStore((s) => s.setShowGrid);
  const setEquation = useStudioStore((s) => s.setEquation);
  const originalEquation = useStudioStore((s) => s.originalEquation);
  const resetEquation = useStudioStore((s) => s.resetEquation);

  const hasEquationChanges = equation !== originalEquation;

  const [editMode, setEditMode] = useState(false);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [renderError, setRenderError] = useState<string>('');

  const reduceMotion = !!useReducedMotion();

  const cachedPointsRef = useRef<SamplePoint[]>([]);

  // Live values the rAF loop reads every frame WITHOUT restarting.
  // `progress` churns ~60x/s during playback; holding it in a ref keeps the
  // render loop mounted continuously so the playhead sweeps smoothly.
  const progressRef = useRef(progress);
  const isPlayingRef = useRef(isPlaying);
  progressRef.current = progress;
  isPlayingRef.current = isPlaying;

  // ── Freeform curve editing ──────────────────────────────────────────────
  // `editMode` drives the toolbar button + hint strip; `editModeRef` is the
  // synchronous mirror the pointer handlers read on every event.
  const editModeRef = useRef(false);
  // Knots (fixed x) the user drags; the Catmull-Rom spline passes through them.
  const handlesRef = useRef<GraphHandle[]>([]);
  // Spline points while a shape is being dragged, so the canvas shows the
  // live curve (not the committed equation) mid-drag.
  const freeformRef = useRef<SamplePoint[] | null>(null);
  // Which handle is being dragged + last commit timestamp.
  const dragRef = useRef<{ idx: number; lastCommit: number } | null>(null);
  // Trimmed equation the fit produced; committed to the store on pointer-up.
  const liveEqRef = useRef<string>(equation);
  const chipRef = useRef<HTMLDivElement>(null);
  const lastCommitRef = useRef(0);
  const equationRef = useRef(equation);
  equationRef.current = equation;

  const rebuildHandles = useCallback(
    (points: SamplePoint[]) => {
      const pts = points.filter((pt) => pt.isValid);
      if (pts.length === 0) return;
      const handles: GraphHandle[] = [];
      for (let i = 0; i < EDIT_KNOTS; i++) {
        const x = minX + (i / (EDIT_KNOTS - 1)) * (maxX - minX);
        // Nearest sampled point anchors the knot (the cache is uniformly spaced in x).
        let best = pts[0];
        let bestD = Infinity;
        for (const pt of pts) {
          const d = Math.abs(pt.x - x);
          if (d < bestD) {
            bestD = d;
            best = pt;
          }
        }
        handles.push({ x, y: best.y });
      }
      handlesRef.current = handles;
    },
    [minX, maxX],
  );

  const writeChip = (eq: string) => {
    if (chipRef.current) chipRef.current.textContent = eq;
  };

  // Chip mount/state flip race: when entering edit mode the chip's DOM node
  // mounts on the *next* commit (after setEditMode), so the initial equation
  // text has to be set after the chip exists. We apply it via both a deferred
  // writeChip call and the chip's initial React children; the deferred write is
  // the safety net if the equation changed between frames.
  const toggleEditMode = useCallback(() => {
    if (editModeRef.current) {
      // Exit — release the freeform shape and re-ink from the committed equation.
      editModeRef.current = false;
      setEditMode(false);
      freeformRef.current = null;
      const parseResult = parseEquation(equationRef.current);
      if (parseResult.success && parseResult.sample) {
        cachedPointsRef.current = parseResult.sample(minX, maxX, 800);
      }
    } else {
      // Enter — anchor the knots to the current curve, clear any freeform residue.
      const eq = equationRef.current;
      editModeRef.current = true;
      setEditMode(true);
      freeformRef.current = null;
      rebuildHandles(cachedPointsRef.current);
      liveEqRef.current = eq;
      // The chip div mounts on the next render pass (driven by setEditMode),
      // so queue the initial write until after that commit.
      requestAnimationFrame(() => writeChip(eq));
    }
  }, [rebuildHandles, minX, maxX]);

  // Follow the active theme so the curve is re-inked on switch
  useEffect(() => {
    return onThemeChange(() => {
      paletteRef.current = getCanvasPalette();
    });
  }, []);

  // Update cached sample points whenever equation or bounds change. While a
  // freeform drag is in flight the spline owns the canvas, so the cache is left
  // untouched; the knots re-anchor so external edits re-shape the editable curve.
  useEffect(() => {
    const parseResult = parseEquation(equation);
    if (parseResult.success && parseResult.sample) {
      const pts = parseResult.sample(minX, maxX, 800);
      if (freeformRef.current) return;
      cachedPointsRef.current = pts;
      setRenderError('');
      if (editModeRef.current) rebuildHandles(pts);
    } else {
      cachedPointsRef.current = [];
      setRenderError(parseResult.error || 'Cannot render equation');
    }
  }, [equation, minX, maxX, rebuildHandles]);

  // Main Canvas Render Loop (60 FPS) — mounted ONCE, reads live state via refs.
  // progress/isPlaying deliberately excluded from the deps so playback frames
  // never tear down and restart the loop (that churn is what made the reading
  // sweep stutter).
  useEffect(() => {
    let animationFrameId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      const displayWidth = Math.floor(rect.width);
      const displayHeight = Math.floor(rect.height);

      if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);

      // Paper-toned backdrop — the graph reads as "inked onto the surface"
      ctx.fillStyle = paletteRef.current.canvas;
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      const analyser = audioEngine.getAnalyser();
      const prog = progressRef.current;
      const playing = isPlayingRef.current;
      const hasAudio = playing && analyser;

      // The spline the user is dragging supersedes the committed equation while editing.
      const graphPoints = freeformRef.current ?? cachedPointsRef.current;

      switch (visualizerMode) {
        case '2d-graph':
          draw2DGraph(ctx, displayWidth, displayHeight, graphPoints, minX, maxX, prog, playing, showGrid, paletteRef.current, equationRef.current);
          break;
        case 'waveform':
          drawWaveform(ctx, displayWidth, displayHeight, analyser, playing, paletteRef.current);
          break;
        case 'spectrum':
          drawSpectrum(ctx, displayWidth, displayHeight, analyser, playing, paletteRef.current);
          break;
        case 'particles':
          drawLissajous(ctx, displayWidth, displayHeight, analyser, playing, cachedPointsRef.current, minX, maxX, prog, paletteRef.current);
          break;
        case 'mandala':
          drawRadialMandala(ctx, displayWidth, displayHeight, analyser, playing, cachedPointsRef.current, paletteRef.current);
          break;
      }

      if (editModeRef.current && visualizerMode === '2d-graph') {
        drawEditHandles(ctx, displayWidth, displayHeight, handlesRef.current, dragRef.current?.idx ?? -1, minX, maxX, paletteRef.current, graphPoints);
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [visualizerMode, minX, maxX, showGrid]);

  // ── Pointer interaction (freeform drag + hover readout) ────────────────

  const canvasMath = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const pts = (freeformRef.current ?? cachedPointsRef.current).filter((p) => p.isValid);
    if (pts.length === 0) return null;
    const { paddedMinY, paddedMaxY } = paddedYRange(pts);
    const mathX = minX + (mx / rect.width) * (maxX - minX);
    const mathY = paddedMaxY - (my / rect.height) * (paddedMaxY - paddedMinY);
    return { mx, my, mathX, mathY, paddedMinY, paddedMaxY, rect };
  };

  const hitTest = (mx: number, my: number, pad: { paddedMinY: number; paddedMaxY: number }, rect: DOMRect) => {
    const handles = handlesRef.current;
    for (let i = handles.length - 1; i >= 0; i--) {
      const h = handles[i];
      const px = ((h.x - minX) / (maxX - minX)) * rect.width;
      const py = rect.height - ((h.y - pad.paddedMinY) / (pad.paddedMaxY - pad.paddedMinY)) * rect.height;
      if (Math.hypot(mx - px, my - py) <= 16) return i;
    }
    return -1;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editModeRef.current || visualizerMode !== '2d-graph') return;
    e.preventDefault();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const m = canvasMath(e.clientX, e.clientY);
    if (!m) return;
    const idx = hitTest(m.mx, m.my, m, m.rect);
    if (idx >= 0) {
      dragRef.current = { idx, lastCommit: performance.now() };
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (visualizerMode !== '2d-graph') return;
    const m = canvasMath(e.clientX, e.clientY);
    if (!m) return;

    if (!editModeRef.current) {
      setHoverCoord({ x: m.mathX, y: m.mathY, px: m.mx, py: m.my });
      return;
    }

    if (dragRef.current) {
      const idx = dragRef.current.idx;
      handlesRef.current[idx].y = Math.max(m.paddedMinY, Math.min(m.paddedMaxY, m.mathY));

      const pts = sampleSpline(handlesRef.current, minX, maxX, 800);
      freeformRef.current = pts;
      const terms = fourierFit(pts, minX, maxX, FOURIER_TERMS);
      const a0 = pts.reduce((s, p) => s + p.y, 0) / pts.length;
      const eq = buildEquationString(a0, terms, minX, maxX);
      liveEqRef.current = eq;
      writeChip(eq);

      // Throttle store commits so the graph waits for a beat as the shape settles.
      const now = performance.now();
      if (now - lastCommitRef.current > 600) {
        lastCommitRef.current = now;
        dragRef.current.lastCommit = now;
        setEquation(eq);
      }
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      setEquation(liveEqRef.current); // final commit — equation matches the released shape
    }
  };

  const handlePointerLeave = () => {
    setHoverCoord(null);
  };

  const handleReset = useCallback(() => {
    dragRef.current = null;
    if (editModeRef.current) {
      editModeRef.current = false;
      setEditMode(false);
      freeformRef.current = null;
    }
    resetEquation();
  }, [resetEquation]);

  const modeButtons: { id: VisualizerMode; label: string; icon: string }[] = [
    { id: '2d-graph', label: '2D curve', icon: '📈' },
    { id: 'waveform', label: 'Waveform', icon: '〰️' },
    { id: 'spectrum', label: 'Spectrum', icon: '📊' },
    { id: 'particles', label: 'Lissajous', icon: '◎' },
    { id: 'mandala', label: 'Mandala', icon: '🏵️' },
  ];

  return (
    <div className="relative w-full flex flex-col rounded-md border border-sc-ink/20 bg-sc-paper" style={{ contain: 'content' }}>
      {/* Toolbar strip — instrument bezel above the paper */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-sc-ink/10 bg-sc-surface text-sc-text-soft">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0 scrollbar-none">
          {modeButtons.map((btn) => (
            <motion.button
              key={btn.id}
              onClick={() => setVisualizerMode(btn.id)}
              className={`px-3 py-2 min-h-[44px] rounded-md text-xs font-medium flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                visualizerMode === btn.id
                  ? 'bg-sc-accent text-sc-on-accent'
                  : 'text-sc-text-soft hover:bg-sc-line/10 hover:text-sc-text'
              }`}
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
              whileHover={reduceMotion ? undefined : (visualizerMode === btn.id ? undefined : { y: -1 })}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
              aria-pressed={visualizerMode === btn.id}
            >
              <span>{btn.icon}</span>
              <span>{btn.label}</span>
            </motion.button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {visualizerMode === '2d-graph' && (
            <>
              <motion.button
                onClick={() => setShowGrid(!showGrid)}
                className={`px-2.5 py-1 text-xs rounded-sm border transition-colors min-h-[44px] min-w-[44px] ${
                  showGrid
                    ? 'bg-sc-accent/15 text-sc-accent border-sc-accent/50'
                    : 'text-sc-text-soft border-sc-line/25 hover:text-sc-text'
                }`}
                title="Toggle graph grid"
                whileTap={reduceMotion ? undefined : { scale: 0.93 }}
                transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
              >
                Grid
              </motion.button>
            </>
          )}

          <AnimatePresence>
            {isPlaying && (
              <motion.div
                className="flex items-center gap-1.5 px-2.5 py-1 bg-sc-live/15 border border-sc-live/40 rounded-md"
                initial={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.8 }}
              >
                <span className="w-2 h-2 rounded-full bg-sc-live animate-ping" />
                <span className="text-[11px] font-mono text-sc-live uppercase tracking-wider font-semibold">Live</span>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Freeform edit — drag the curve to reshape it, equation updates live */}
          <motion.button
            onClick={toggleEditMode}
            className={`px-2.5 py-1.5 min-h-[44px] text-xs rounded-md border transition-colors flex items-center gap-1.5 ` +
              (editMode
                ? 'bg-sc-accent text-sc-on-accent border-sc-accent'
                : 'text-sc-text-soft border-sc-line/25 hover:text-sc-text hover:border-sc-accent')}
            title={editMode ? 'Exit curve editing' : 'Drag the curve to reshape the equation'}
            whileTap={reduceMotion ? undefined : { scale: 0.93 }}
            transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
            aria-pressed={editMode}
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            <span>{editMode ? 'Editing' : 'Edit'}</span>
          </motion.button>

          {/* Reset — revert any edits back to the originally-picked equation */}
          {hasEquationChanges && (
            <motion.button
              onClick={handleReset}
              className="px-2.5 py-1.5 min-h-[44px] text-xs rounded-md border transition-colors flex items-center gap-1.5 text-sc-text-soft border-sc-line/25 hover:text-sc-text hover:border-sc-accent"
              title="Revert equation edits"
              whileTap={reduceMotion ? undefined : { scale: 0.93 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.1 }}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 10h7a5 5 0 015 5v1M6 10l3-3m-3 3l3 3"
                />
              </svg>
              <span>Reset</span>
            </motion.button>
          )}
        </div>
      </div>

      {/* Paper canvas */}
      <div className="relative w-full h-[400px] sm:h-[480px] lg:h-[520px] cursor-crosshair">
        <canvas
          ref={canvasRef}
          data-export-canvas="visualizer"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          className={`w-full h-full block ${editMode ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}`}
        />

        <AnimatePresence>
          {renderError && (
            <motion.div
              className="absolute inset-0 flex items-center justify-center p-6 bg-sc-bg/85"
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.3 }}
            >
              <motion.div
                className="max-w-md text-center p-4 rounded-md bg-red-500/10 border border-red-500/40 text-red-400"
                initial={reduceMotion ? { scale: 1, y: 0 } : { scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={reduceMotion ? { scale: 1, y: 0 } : { scale: 0.8, y: 20 }}
              >
                <p className="font-semibold text-sm mb-1">Cannot graph equation</p>
                <p className="text-xs opacity-80">{renderError}</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {hoverCoord && (
            <motion.div
              className="absolute pointer-events-none px-2.5 py-1.5 rounded-sm bg-sc-bg/90 border border-sc-line/25 text-xs font-mono text-sc-text transform -translate-x-1/2 -translate-y-full mb-2 z-20"
              style={{
                left: `${hoverCoord.px}px`,
                top: `${hoverCoord.py}px`,
              }}
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 5 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.2 }}
            >
              <span className="text-sc-accent">x:</span> {hoverCoord.x.toFixed(3)}{' '}
              <span className="ml-1.5 text-sc-accent">y:</span> {hoverCoord.y.toFixed(3)}
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editMode && (
            <motion.div
              className="absolute left-3 bottom-3 right-14 z-20 pointer-events-none"
              initial={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 6 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
            >
              <div
                ref={chipRef}
                className="inline-block max-w-full truncate rounded-md border px-2.5 py-1.5 text-xs font-mono leading-tight bg-sc-bg/92 border-sc-accent/45 text-sc-text shadow-[0_2px_12px_rgba(0,0,0,0.25)]"
              >
                {equation}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom readout strip — hint while editing, domain/progress otherwise */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-sc-ink/10 bg-sc-surface/70 text-[11px] font-mono text-sc-text-faint">
        {editMode ? (
          <>
            <div className="min-w-0 flex-1 truncate">
              <span className="text-sc-accent">Drag the dots</span>
              <span className="mx-1.5 text-sc-text-faint">·</span>
              <span className="truncate">equation updates live</span>
            </div>
            <button
              type="button"
              onClick={toggleEditMode}
              className="px-2.5 py-1.5 min-h-[44px] text-xs font-medium rounded-sm border border-sc-line/30 text-sc-text-soft hover:text-sc-text hover:border-sc-accent transition shrink-0"
            >
              Exit edit
            </button>
          </>
        ) : (
          <>
            <div>
              <span>Domain: [{minX.toFixed(2)}, {maxX.toFixed(2)}]</span>
            </div>
            <div className="flex items-center gap-2">
              {isPlaying ? (
                <>
                  <span className="text-sc-live font-semibold tabular-nums">
                    {(progress * 100).toFixed(0)}%
                  </span>
                  <div className="w-24 h-1.5 rounded-full bg-sc-line/15 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-sc-live"
                      animate={{ width: `${progress * 100}%` }}
                      transition={{ duration: 0.05, ease: 'linear' }}
                    />
                  </div>
                </>
              ) : (
                <span>Ready for playback</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ========================================================================= */
/* RENDERING ENGINES                                                        */
/* ========================================================================= */

function draw2DGraph(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  points: SamplePoint[],
  minX: number,
  maxX: number,
  progress: number,
  isPlaying: boolean,
  showGrid: boolean,
  p: CanvasPalette,
  equation: string,
) {
  const validPoints = points.filter((pt) => pt.isValid);
  if (validPoints.length === 0) return;

  const strokeWidth = 3;
  const curveColor = isPlaying ? p.live : p.curve;
  const curveGlow = isPlaying ? p.liveGlow : p.curveGlow;
  const coreColor = isPlaying ? p.liveCore : p.curveCore;

  const yVals = validPoints.map((pt) => pt.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const yPad = Math.max(0.5, (maxY - minY) * 0.18);
  const paddedMinY = minY - yPad;
  const paddedMaxY = maxY + yPad;

  const toScreenX = (x: number) => ((x - minX) / (maxX - minX)) * width;
  const toScreenY = (y: number) => height - ((y - paddedMinY) / (paddedMaxY - paddedMinY)) * height;

  // Ruled grid
  if (showGrid) {
    ctx.strokeStyle = p.grid;
    ctx.lineWidth = 1;

    const vSteps = 12;
    for (let i = 0; i <= vSteps; i++) {
      const sx = (width / vSteps) * i;
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx, height);
      ctx.stroke();
    }

    const hSteps = 8;
    for (let j = 0; j <= hSteps; j++) {
      const sy = (height / hSteps) * j;
      ctx.beginPath();
      ctx.moveTo(0, sy);
      ctx.lineTo(width, sy);
      ctx.stroke();
    }
  }

  // Axes
  ctx.strokeStyle = p.axis;
  ctx.lineWidth = 1.25;

  if (paddedMinY <= 0 && paddedMaxY >= 0) {
    const y0 = toScreenY(0);
    ctx.beginPath();
    ctx.moveTo(0, y0);
    ctx.lineTo(width, y0);
    ctx.stroke();
  }

  if (minX <= 0 && maxX >= 0) {
    const x0 = toScreenX(0);
    ctx.beginPath();
    ctx.moveTo(x0, 0);
    ctx.lineTo(x0, height);
    ctx.stroke();
  }

  // Segment stroker that skips invalid gaps (points with NaN/infinity).
  // `smooth` rebuilds each valid run with quadratic midpoints so the curve
  // reads as a flowing pen stroke rather than a polyline.
  const strokeSegment = (
    color: string,
    width: number,
    glow: string,
    blur: number,
    from: number,
    to: number,
    smooth = false
  ) => {
    ctx.save();
    ctx.shadowColor = glow;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();

    // Runs hold point indices (not coords) so smoothing can read both ends.
    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) {
        run = [];
        return;
      }
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
      if (!points[i].isValid) {
        flush();
        continue;
      }
      run.push(i);
    }
    flush();
    ctx.stroke();
    ctx.restore();
  };

  // Soft wash pooling under the curve, settling toward the x-axis. Drawn in
  // the interactive accent at a whisper, so the paper stays the hero.
  const fillUnderCurve = () => {
    const runs: number[][] = [];
    let run: number[] = [];
    for (let i = 0; i < points.length; i++) {
      if (!points[i].isValid) {
        if (run.length) runs.push(run);
        run = [];
        continue;
      }
      run.push(i);
    }
    if (run.length) runs.push(run);

    const baseY = Math.max(4, Math.min(height - 4, toScreenY(0)));
    let topY = baseY;
    for (const r of runs) {
      for (const i of r) {
        const sy = toScreenY(points[i].y);
        if (sy < topY) topY = sy;
      }
    }
    if (topY >= baseY - 1) return; // no room to fill

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

  // Ruler ticks with compact labels, pinned to whichever edge each axis lands
  // on (the graph edge when the zero axis scrolls out of view).
  const drawAxisTicks = () => {
    ctx.fillStyle = p.label;
    ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
    const fmt = (v: number) => String(Math.round(v * 10) / 10);

    const y0 = toScreenY(0);
    const xAxisVisible = y0 > 0 && y0 < height;
    const tickBaseY = xAxisVisible ? y0 : height - 4;
    for (let i = 0; i <= 6; i++) {
      const xVal = minX + (i / 6) * (maxX - minX);
      const sx = toScreenX(xVal);
      ctx.strokeStyle = p.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx, tickBaseY - 3);
      ctx.lineTo(sx, tickBaseY + 3);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillText(fmt(xVal), sx, xAxisVisible ? tickBaseY + 11 : height - 8);
    }

    const x0 = toScreenX(0);
    const yAxisVisible = x0 > 0 && x0 < width;
    const tickBaseX = yAxisVisible ? x0 : 7;
    for (let i = 0; i <= 6; i++) {
      const yVal = paddedMaxY - (i / 6) * (paddedMaxY - paddedMinY);
      const sy = toScreenY(yVal);
      ctx.strokeStyle = p.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tickBaseX - 3, sy);
      ctx.lineTo(tickBaseX + 3, sy);
      ctx.stroke();
      ctx.textAlign = yAxisVisible ? 'right' : 'left';
      ctx.fillText(fmt(yVal), yAxisVisible ? tickBaseX - 5 : tickBaseX + 5, sy + 3);
    }
  };

  // Faint instrument vignette so the paper reads as a glass bezel, not a flat block.
  const drawVignette = () => {
    const rad = Math.hypot(width, height) / 2;
    const grad = ctx.createRadialGradient(
      width / 2, height / 2, rad * 0.55,
      width / 2, height / 2, rad
    );
    grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.05)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);
  };

  /* ---------- Reading animation: the playhead visibly scans the curve ---------- */
  // While audio scans the equation, the curve is split in two: the already-read
  // tail glows in live teal (with an incandescent filament at the exact point
  // being read), while the not-yet-read section stays dimmed so the sweep is
  // unmistakable.
  if (isPlaying && progress > 0) {
    const activeIdx = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));

    // Pass A — entire curve dimmed, so the path ahead of the playhead remains visible
    strokeSegment(alpha(p.curve, 0.3), strokeWidth * 0.75, alpha(p.curve, 0.15), 4, 0, points.length - 1, true);

    // Pass B — the read tail, full live colour with a wide glow
    strokeSegment(p.live, strokeWidth * 1.05, p.liveGlow, 14, 0, activeIdx, true);

    // Locate the last valid point read so far (the reading tip)
    let tipIdx = -1;
    for (let i = activeIdx; i >= 0; i--) {
      if (points[i].isValid) {
        tipIdx = i;
        break;
      }
    }
    if (tipIdx >= 0) {
      const tipPt = points[tipIdx];
      const px = toScreenX(tipPt.x);
      const py = toScreenY(tipPt.y);

      // Pass C — incandescent filament hugging the curve just behind the tip
      let startIdx = tipIdx;
      for (let i = tipIdx; i >= 0; i--) {
        if (!points[i].isValid) continue;
        if (toScreenX(points[i].x) < px - 52) {
          startIdx = i;
          break;
        }
      }
      strokeSegment(p.liveCore, Math.max(1.8, strokeWidth * 0.55), p.live, 20, startIdx, tipIdx, true);

      // Scanner beam — luminous column sweeping across the paper sheet
      const beamGrad = ctx.createLinearGradient(0, 0, 0, height);
      beamGrad.addColorStop(0, alpha(p.live, 0.04));
      beamGrad.addColorStop(Math.max(0, Math.min(1, py / height)), alpha(p.live, 0.55));
      beamGrad.addColorStop(1, alpha(p.live, 0.04));
      ctx.fillStyle = beamGrad;
      ctx.fillRect(px - 1.5, 0, 3, height);

      // Beam top + bottom caps so the scanner edge is visible at the extremes
      ctx.fillStyle = alpha(p.live, 0.85);
      ctx.fillRect(px - 7, 0, 14, 2);
      ctx.fillRect(px - 7, height - 2, 14, 2);

      // Comet dot on the reading tip: soft halo -> live core -> paper-white seed
      ctx.save();
      ctx.shadowColor = p.live;
      ctx.shadowBlur = 30;
      ctx.beginPath();
      ctx.arc(px, py, 9, 0, Math.PI * 2);
      ctx.fillStyle = alpha(p.live, 0.35);
      ctx.fill();
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.arc(px, py, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = p.live;
      ctx.fill();
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.liveCore;
      ctx.fill();
      ctx.restore();

      // Read-ahead percentage label riding beside the dot
      const label = `${Math.round(progress * 100)}%`;
      ctx.font = 'bold 11px "JetBrains Mono", ui-monospace, monospace';
      const tw = ctx.measureText(label).width;
      const labelLeft = px + 13;
      const labelTop = Math.max(12, Math.min(height - 30, py - 14));
      ctx.fillStyle = alpha(p.canvas, 0.88);
      ctx.fillRect(labelLeft - 4, labelTop - 10, tw + 8, 16);
      ctx.strokeStyle = alpha(p.live, 0.55);
      ctx.lineWidth = 1;
      ctx.strokeRect(labelLeft - 4.5, labelTop - 10.5, tw + 9, 17);
      ctx.fillStyle = p.live;
      ctx.fillText(label, labelLeft, labelTop);
    }
    drawVignette();
    return; // the reading pass already inked the curve
  }

  // Idle: wash -> smoothed ink -> hairline core -> ruler ticks -> vignette
  // (also the first instant of playback before the sweep begins)
  fillUnderCurve();
  strokeSegment(curveColor, strokeWidth, curveGlow, 16, 0, points.length - 1, true);
  strokeSegment(coreColor, Math.max(1.1, strokeWidth * 0.35), 'transparent', 0, 0, points.length - 1, true);
  drawAxisTicks();
  drawVignette();
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analyser: AnalyserNode | null,
  isPlaying: boolean,
  p: CanvasPalette
) {
  const bufferLength = analyser ? analyser.fftSize : 1024;
  const dataArray = new Uint8Array(bufferLength);

  if (analyser) {
    analyser.getByteTimeDomainData(dataArray);
  } else {
    // Gentle idle wave — stays still unless the user pressed play
    const time = isPlaying ? performance.now() / 1000 : 0;
    for (let i = 0; i < bufferLength; i++) {
      dataArray[i] = 128 + Math.sin(i * 0.05 + time) * 20;
    }
  }

  const lineColor = isPlaying ? p.live : p.curve;
  const lineGlow = isPlaying ? p.liveGlow : p.curveGlow;

  ctx.strokeStyle = p.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height / 2);
  ctx.lineTo(width, height / 2);
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = lineGlow;
  ctx.shadowBlur = 16;
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  const sliceWidth = width / bufferLength;
  let x = 0;

  for (let i = 0; i < bufferLength; i++) {
    const v = dataArray[i] / 128.0;
    const y = (v * height) / 2;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();
  ctx.restore();
}

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analyser: AnalyserNode | null,
  isPlaying: boolean,
  p: CanvasPalette
) {
  const bufferLength = analyser ? analyser.frequencyBinCount : 512;
  const dataArray = new Uint8Array(bufferLength);

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
  }

  const barColor = isPlaying ? p.live : p.curve;
  const barCount = 64;
  const barWidth = (width / barCount) * 0.8;
  const step = Math.floor(bufferLength / barCount);

  for (let i = 0; i < barCount; i++) {
    let sum = 0;
    for (let j = 0; j < step; j++) {
      sum += dataArray[i * step + j] || 0;
    }
    const val = sum / step;
    const barHeight = (val / 255) * height * 0.85;

    const x = i * (width / barCount) + (width / barCount - barWidth) / 2;
    const y = height - barHeight;

    const grad = ctx.createLinearGradient(0, height, 0, y);
    grad.addColorStop(0, alpha(barColor, 0.2));
    grad.addColorStop(1, alpha(barColor, 0.9));

    ctx.fillStyle = grad;
    ctx.fillRect(x, y, barWidth, barHeight);

    ctx.fillStyle = alpha(barColor, 0.9);
    ctx.fillRect(x, y - 2, barWidth, 2);
  }
}

function drawLissajous(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analyser: AnalyserNode | null,
  isPlaying: boolean,
  points: SamplePoint[],
  minX: number,
  maxX: number,
  progress: number,
  p: CanvasPalette
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.32;

  const dataArray = new Uint8Array(64);
  let audioEnergy = 0;
  let audioPhaseShift = 0;

  if (analyser && isPlaying) {
    analyser.getByteFrequencyData(dataArray);
    const sum = dataArray.reduce((a, b) => a + b, 0);
    audioEnergy = sum / (dataArray.length * 255);
    // Map dominant frequency bin to a phase shift
    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > maxVal) { maxVal = dataArray[i]; audioPhaseShift = i * 0.15; }
    }
  }

  const strokeColor = isPlaying ? p.live : p.curve;
  const curveCore = isPlaying ? p.liveCore : p.curveCore;
  const time = performance.now() * 0.001;

  // Derive frequency ratios from equation sample data
  let ratioA = 3;
  let ratioB = 2;
  if (points.length > 2) {
    // Count zero crossings to estimate dominant frequency
    let crossings = 0;
    for (let i = 1; i < points.length; i++) {
      if ((points[i - 1].y >= 0 && points[i].y < 0) || (points[i - 1].y < 0 && points[i].y >= 0)) {
        crossings++;
      }
    }
    ratioA = Math.max(1, Math.min(9, Math.round(crossings / 8)));
    ratioB = Math.max(1, Math.min(9, ratioA - 1 + (crossings % 3)));
  }

  // Draw 1–3 overlapping Lissajous curves
  const curveCount = isPlaying ? 3 : 1;
  const totalPoints = 600;

  for (let layer = 0; layer < curveCount; layer++) {
    const layerPhase = audioPhaseShift + layer * 0.6;
    const layerRadius = baseRadius * (1 - layer * 0.15);
    const layerAlpha = isPlaying ? 0.7 - layer * 0.15 : 0.65;

    ctx.beginPath();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = isPlaying ? 2.5 - layer * 0.5 : 2;
    ctx.globalAlpha = layerAlpha;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = isPlaying ? 12 + audioEnergy * 20 : 8;

    for (let i = 0; i <= totalPoints; i++) {
      const t = (i / totalPoints) * Math.PI * 2;
      const phase = time * 0.3 + layerPhase;
      const x = centerX + Math.sin(ratioA * t + phase) * layerRadius;
      const y = centerY + Math.sin(ratioB * t) * layerRadius;

      // Modulate radius slightly with audio energy during playback
      const audioMod = isPlaying ? 1 + audioEnergy * 0.15 * Math.sin(t * 3 + time) : 1;
      const modX = centerX + (x - centerX) * audioMod;
      const modY = centerY + (y - centerY) * audioMod;

      if (i === 0) ctx.moveTo(modX, modY);
      else ctx.lineTo(modX, modY);
    }

    ctx.closePath();
    ctx.stroke();
  }

  // Central dot
  ctx.globalAlpha = 0.8;
  ctx.shadowColor = curveCore;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(centerX, centerY, isPlaying ? 3 + audioEnergy * 5 : 3, 0, Math.PI * 2);
  ctx.fillStyle = curveCore;
  ctx.fill();

  // Reset
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
}

function drawRadialMandala(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  analyser: AnalyserNode | null,
  isPlaying: boolean,
  points: SamplePoint[],
  p: CanvasPalette
) {
  const centerX = width / 2;
  const centerY = height / 2;
  const baseRadius = Math.min(width, height) * 0.28;

  const dataArray = new Uint8Array(128);
  if (analyser && isPlaying) {
    analyser.getByteFrequencyData(dataArray);
  }

  const strokeColor = isPlaying ? p.live : p.curve;

  ctx.save();
  ctx.translate(centerX, centerY);

  const numPoints = Math.min(128, points.length);
  const angleStep = (Math.PI * 2) / numPoints;

  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.shadowColor = strokeColor;
  ctx.shadowBlur = 16;

  ctx.beginPath();
  for (let i = 0; i < numPoints; i++) {
    const pt = points[i];
    const audioBoost = (dataArray[i % dataArray.length] || 0) * 0.4;
    const r = baseRadius + (pt && pt.isValid ? pt.y * 12 : 0) + audioBoost;
    const angle = i * angleStep;

    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}