import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { useStudioStore, type VisualizerMode } from '../store/studioStore';
import { buildVerticalShiftEquation, parseEquation, type SamplePoint } from '../utils/equationParser';
import {
  applyParameter,
  clampParamValue,
  handlePositions,
  parseParameters,
  readParameter,
  serializeParameters,
  type EquationParams,
  type ParamKey,
} from '../utils/equationParams';
import ControlPointLayer, { type HandlePixel } from './Studio/ControlPointLayer';
import { audioEngine } from '../utils/audioEngine';
import { getCanvasPalette, onThemeChange, type CanvasPalette } from '../utils/theme';

/** Converts a #RRGGBB color into an rgba() string at given alpha. */
function alpha(hex: string, a: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/* ── Curve editing helpers ─────────────────────────────────────── */

/** Padded y-range shared by the graph renderer and the edit overlay. */
function paddedYRange(pts: SamplePoint[]): { paddedMinY: number; paddedMaxY: number } {
  const yVals = pts.map((p) => p.y);
  const minY = Math.min(...yVals);
  const maxY = Math.max(...yVals);
  const yPad = Math.max(0.5, (maxY - minY) * 0.18);
  return { paddedMinY: minY - yPad, paddedMaxY: maxY + yPad };
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
  const setHasPendingChanges = useStudioStore((s) => s.setHasPendingChanges);

  const hasEquationChanges = equation !== originalEquation;

  const [editMode, setEditMode] = useState(false);
  const [hoverCoord, setHoverCoord] = useState<{ x: number; y: number; px: number; py: number } | null>(null);
  const [renderError, setRenderError] = useState<string>('');

  const reduceMotion = !!useReducedMotion();

  const cachedPointsRef = useRef<SamplePoint[]>([]);

  // Live values the rAF loop reads every frame WITHOUT restarting.
  const progressRef = useRef(progress);
  const isPlayingRef = useRef(isPlaying);
  progressRef.current = progress;
  isPlayingRef.current = isPlaying;

  // ── Whole-curve vertical shift editing ──────────────────────────
  // In edit mode the user drags up/down on the graph to shift the
  // entire curve vertically — no individual handles, no Fourier fit.
  const editModeRef = useRef(false);
  const freeformRef = useRef<SamplePoint[] | null>(null);
  const dragRef = useRef<{ lastY: number; lastCommit: number } | null>(null);
  const yOffsetRef = useRef(0); // accumulated vertical offset in math coords
  const baseEquationRef = useRef(equation); // equation before any shift
  const chipRef = useRef<HTMLDivElement>(null);
  const lastCommitRef = useRef(0);
  const equationRef = useRef(equation);
  equationRef.current = equation;

  const applyYOffset = useCallback((points: SamplePoint[], offset: number): SamplePoint[] => {
    return points.map((p) => ({ ...p, y: p.y + offset }));
  }, []);

  const writeChip = (eq: string) => {
    if (chipRef.current) chipRef.current.textContent = eq;
  };

  const toggleEditMode = useCallback(() => {
    if (editModeRef.current) {
      // Exit — commit any offset that has not already been committed on release.
      if (Math.abs(yOffsetRef.current) > 0.001) {
        const newEq = buildVerticalShiftEquation(baseEquationRef.current, yOffsetRef.current);
        setEquation(newEq);
        if (isPlayingRef.current) setHasPendingChanges(true);
      }
      editModeRef.current = false;
      setEditMode(false);
      freeformRef.current = null;
      yOffsetRef.current = 0;
      dragRef.current = null;
      const parseResult = parseEquation(equationRef.current);
      if (parseResult.success && parseResult.sample) {
        cachedPointsRef.current = parseResult.sample(minX, maxX, 800);
      }
    } else {
      // Enter — anchor the base equation and start fresh with zero offset.
      baseEquationRef.current = equationRef.current;
      yOffsetRef.current = 0;
      editModeRef.current = true;
      setEditMode(true);
      freeformRef.current = null;
      const parseResult = parseEquation(equationRef.current);
      if (parseResult.success && parseResult.sample) {
        cachedPointsRef.current = parseResult.sample(minX, maxX, 800);
      }
      // Show the base equation in the chip
      requestAnimationFrame(() => writeChip(equationRef.current));
    }
  }, [minX, maxX]);

  // Follow the active theme so the curve is re-inked on switch.
  // Bumping a nonce makes the on-demand repaint effect below run, which is
  // required now that the render loop is no longer running while idle.
  const [themeNonce, setThemeNonce] = useState(0);
  useEffect(() => {
    return onThemeChange(() => {
      paletteRef.current = getCanvasPalette();
      setThemeNonce((n) => n + 1);
    });
  }, []);

  // Update cached sample points whenever equation or bounds change.
  // While a freeform drag is in flight the freeform owns the canvas.
  useEffect(() => {
    const parseResult = parseEquation(equation);
    if (parseResult.success && parseResult.sample) {
      const pts = parseResult.sample(minX, maxX, 800);
      if (freeformRef.current) return;
      cachedPointsRef.current = pts;
      setRenderError('');
    } else {
      cachedPointsRef.current = [];
      setRenderError(parseResult.error || 'Cannot render equation');
    }
  }, [equation, minX, maxX]);

  // Main Canvas Render Loop — mounted ONCE, reads live state via refs.
  //
  // Performance: this only needs to run continuously while something is
  // actually moving. With a static equation and no audio the graph is
  // completely still, so a permanent 60fps loop would burn a core and a
  // battery for an identical frame. `draw()` is exposed so that any state
  // change (new equation, resize, theme switch, mode change) can request
  // exactly one repaint instead.
  const drawRef = useRef<() => void>(() => {});

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

      ctx.fillStyle = paletteRef.current.canvas;
      ctx.fillRect(0, 0, displayWidth, displayHeight);

      const analyser = audioEngine.getAnalyser();
      const prog = progressRef.current;
      const playing = isPlayingRef.current;
      const hasAudio = playing && analyser;

      // The freeform (offset) curve supersedes the committed equation while editing.
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

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    drawRef.current = render;

    // Only animate when something is actually moving. With a static equation
    // and no audio the graph is completely still, so a permanent 60fps loop
    // would burn a core and a battery redrawing an identical frame.
    // The playhead and audio-reactive modes still animate during playback.
    if (isPlayingRef.current || visualizerMode !== '2d-graph') {
      animationFrameId = requestAnimationFrame(render);
    } else {
      render(); // idle: one frame, then stop
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
    // `isPlaying` is a deliberate dependency: playback is what switches this
    // graph from a single static frame to an animated playhead. Without it the
    // playhead would freeze the moment the user pressed play.
  }, [visualizerMode, minX, maxX, showGrid, isPlaying]);

  // Repaint on demand whenever the static frame could have gone stale.
  useEffect(() => {
    drawRef.current();
  }, [equation, showGrid, minX, maxX, visualizerMode, themeNonce]);

  // Resize / orientation changes must not leave a stretched or blank canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  // ── Pointer interaction (whole-curve vertical shift + hover) ──

  const canvasMath = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const pts = cachedPointsRef.current.filter((p) => p.isValid);
    if (pts.length === 0) return null;
    const { paddedMinY, paddedMaxY } = paddedYRange(pts);
    const mathX = minX + (mx / rect.width) * (maxX - minX);
    const mathY = paddedMaxY - (my / rect.height) * (paddedMaxY - paddedMinY);
    return { mx, my, mathX, mathY, paddedMinY, paddedMaxY, rect };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!editModeRef.current || visualizerMode !== '2d-graph') return;
    e.preventDefault();
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const m = canvasMath(e.clientX, e.clientY);
    if (!m) return;
    dragRef.current = { lastY: m.mathY, lastCommit: performance.now() };
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
      // Vertical shift: compute delta from the drag start position.
      const deltaY = m.mathY - dragRef.current.lastY;
      const newOffset = yOffsetRef.current + deltaY;
      yOffsetRef.current = newOffset;
      dragRef.current.lastY = m.mathY;

      // Apply offset to cached points and show the freeform curve.
      const basePts = cachedPointsRef.current;
      if (basePts.length > 0) {
        const offsetPts = applyYOffset(basePts, newOffset);
        freeformRef.current = offsetPts;

        // Build a modified equation string showing the offset.
        const displayEq = buildVerticalShiftEquation(baseEquationRef.current, newOffset);
        writeChip(displayEq);

        // Throttle store commits.
        const now = performance.now();
        if (now - lastCommitRef.current > 300) {
          lastCommitRef.current = now;
          setEquation(displayEq);
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (dragRef.current) {
      dragRef.current = null;
      if (Math.abs(yOffsetRef.current) > 0.001) {
        // Apply the offset permanently to the equation.
        const newEq = buildVerticalShiftEquation(baseEquationRef.current, yOffsetRef.current);
        setEquation(newEq);
        if (isPlayingRef.current) setHasPendingChanges(true);
      }
      freeformRef.current = null;
      yOffsetRef.current = 0;
    }
  };

  const handlePointerLeave = () => {
    setHoverCoord(null);
  };

  // ── Parameterised equation editing (control points) ──────────────────
  //
  // The equation string is the single source of truth. When it parses into a
  // known family we expose draggable handles for its parameters; dragging a
  // handle mutates the parameter set, which is then serialised back into the
  // equation. Because the canvas, the text field and the audio engine all read
  // that same equation, they can never drift apart.
  const [params, setParams] = useState<EquationParams | null>(null);
  // Live during a drag so the graph follows the finger at 60fps without
  // re-serialising the equation (and re-parsing it) on every pointermove.
  const paramsRef = useRef<EquationParams | null>(null);
  const draggingRef = useRef(false);

  // Re-derive handles whenever the equation text changes from anywhere
  // (typing, presets, scientists) or the view window moves.
  useEffect(() => {
    if (draggingRef.current) return; // never fight the user's own drag
    const next = parseParameters(equation);
    paramsRef.current = next;
    setParams(next);
  }, [equation, minX, maxX]);

  /** Convert a handle's math-space position to overlay pixels. */
  const toPixels = useCallback((at: { x: number; y: number }): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const pts = cachedPointsRef.current.filter((p) => p.isValid);
    if (pts.length === 0) return null;
    const { paddedMinY, paddedMaxY } = paddedYRange(pts);
    const x = ((at.x - minX) / (maxX - minX)) * rect.width;
    const y = rect.height - ((at.y - paddedMinY) / (paddedMaxY - paddedMinY)) * rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    return { x, y };
  }, [minX, maxX]);

  /** Pixels-per-unit, so a drag distance in px converts into a parameter delta. */
  const scales = useCallback((): { scaleX: number; scaleY: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { scaleX: 1, scaleY: 1 };
    const rect = canvas.getBoundingClientRect();
    const pts = cachedPointsRef.current.filter((p) => p.isValid);
    if (pts.length === 0) return { scaleX: 1, scaleY: 1 };
    const { paddedMinY, paddedMaxY } = paddedYRange(pts);
    return {
      scaleX: rect.width / (maxX - minX || 1),
      scaleY: rect.height / ((paddedMaxY - paddedMinY) || 1),
    };
  }, [minX, maxX]);

  const handleParamDrag = useCallback((key: ParamKey, dxPx: number, dyPx: number) => {
    const current = paramsRef.current;
    if (!current) return;
    draggingRef.current = true;

    // Horizontal drags move the x-axis parameters (frequency, phase, the
    // constant inside a radical); vertical drags move amplitude/offset.
    const horizontal = key === 'frequency' || key === 'phase'
      || key === 'rootConstant' || key === 'rate';
    const delta = horizontal ? dxPx : -dyPx;
    const currentValue = readParameter(current, key);
    const next = applyParameter(current, key, clampParamValue(key, currentValue + delta));
    paramsRef.current = next;
    setParams(next);

    // Repaint immediately so the curve tracks the finger.
    drawRef.current();
  }, []);

  const handleParamCommit = useCallback(() => {
    const next = paramsRef.current;
    draggingRef.current = false;
    if (!next) return;
    // Publish the parameters back into the equation, which is the source of
    // truth. This re-runs the existing parse -> graph -> audio path.
    setEquation(serializeParameters(next));
    if (isPlayingRef.current) setHasPendingChanges(true);
  }, [setEquation, setHasPendingChanges]);

  const handleReset = useCallback(() => {
    dragRef.current = null;
    if (editModeRef.current) {
      editModeRef.current = false;
      setEditMode(false);
      freeformRef.current = null;
      yOffsetRef.current = 0;
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
      {/* Toolbar strip */}
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

          {/* Edit — drag to shift the curve vertically */}
          <motion.button
            onClick={toggleEditMode}
            className={`px-2.5 py-1.5 min-h-[44px] text-xs rounded-md border transition-colors flex items-center gap-1.5 ` +
              (editMode
                ? 'bg-sc-accent text-sc-on-accent border-sc-accent'
                : 'text-sc-text-soft border-sc-line/25 hover:text-sc-text hover:border-sc-accent')}
            title={editMode ? 'Exit curve editing' : 'Drag up/down to shift the curve'}
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

        {/*
          Draggable parameter handles. Only rendered for equations we can
          parameterise exactly; anything else keeps plain text editing rather
          than showing handles that would lie about the mathematics.
        */}
        {params && (
          <ControlPointLayer
            handles={handlePositions(params, minX, maxX)
              .map((handle) => {
                const pixel = toPixels(handle.at);
                if (!pixel) return null;
                return {
                  key: handle.key,
                  label: handle.label,
                  display: handle.display,
                  x: pixel.x,
                  y: pixel.y,
                } satisfies HandlePixel;
              })
              .filter((handle): handle is HandlePixel => handle !== null)}
            onDrag={handleParamDrag}
            onCommit={handleParamCommit}
            {...scales()}
            disabled={visualizerMode !== '2d-graph'}
          />
        )}

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

      {/* Bottom readout strip */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-sc-ink/10 bg-sc-surface/70 text-[11px] font-mono text-sc-text-faint">
        {editMode ? (
          <>
            <div className="min-w-0 flex-1 truncate">
              <span className="text-sc-accent">Drag to shift curve</span>
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

  // Segment stroker
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

  // Soft wash under curve
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

  // Ruler ticks
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

  // Vignette
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

  /* ---------- Reading animation ---------- */
  if (isPlaying && progress > 0) {
    const activeIdx = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));

    strokeSegment(alpha(p.curve, 0.3), strokeWidth * 0.75, alpha(p.curve, 0.15), 4, 0, points.length - 1, true);
    strokeSegment(p.live, strokeWidth * 1.05, p.liveGlow, 14, 0, activeIdx, true);

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

      let startIdx = tipIdx;
      for (let i = tipIdx; i >= 0; i--) {
        if (!points[i].isValid) continue;
        if (toScreenX(points[i].x) < px - 52) {
          startIdx = i;
          break;
        }
      }
      strokeSegment(p.liveCore, Math.max(1.8, strokeWidth * 0.55), p.live, 20, startIdx, tipIdx, true);

      const beamGrad = ctx.createLinearGradient(0, 0, 0, height);
      beamGrad.addColorStop(0, alpha(p.live, 0.04));
      beamGrad.addColorStop(Math.max(0, Math.min(1, py / height)), alpha(p.live, 0.55));
      beamGrad.addColorStop(1, alpha(p.live, 0.04));
      ctx.fillStyle = beamGrad;
      ctx.fillRect(px - 1.5, 0, 3, height);

      ctx.fillStyle = alpha(p.live, 0.85);
      ctx.fillRect(px - 7, 0, 14, 2);
      ctx.fillRect(px - 7, height - 2, 14, 2);

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
    return;
  }

  // Idle
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
    let maxVal = 0;
    for (let i = 0; i < dataArray.length; i++) {
      if (dataArray[i] > maxVal) { maxVal = dataArray[i]; audioPhaseShift = i * 0.15; }
    }
  }

  const strokeColor = isPlaying ? p.live : p.curve;
  const curveCore = isPlaying ? p.liveCore : p.curveCore;
  const time = performance.now() * 0.001;

  let ratioA = 3;
  let ratioB = 2;
  if (points.length > 2) {
    let crossings = 0;
    for (let i = 1; i < points.length; i++) {
      if ((points[i - 1].y >= 0 && points[i].y < 0) || (points[i - 1].y < 0 && points[i].y >= 0)) {
        crossings++;
      }
    }
    ratioA = Math.max(1, Math.min(9, Math.round(crossings / 8)));
    ratioB = Math.max(1, Math.min(9, ratioA - 1 + (crossings % 3)));
  }

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

      const audioMod = isPlaying ? 1 + audioEnergy * 0.15 * Math.sin(t * 3 + time) : 1;
      const modX = centerX + (x - centerX) * audioMod;
      const modY = centerY + (y - centerY) * audioMod;

      if (i === 0) ctx.moveTo(modX, modY);
      else ctx.lineTo(modX, modY);
    }

    ctx.closePath();
    ctx.stroke();
  }

  ctx.globalAlpha = 0.8;
  ctx.shadowColor = curveCore;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(centerX, centerY, isPlaying ? 3 + audioEnergy * 5 : 3, 0, Math.PI * 2);
  ctx.fillStyle = curveCore;
  ctx.fill();

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
