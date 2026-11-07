import { useRef, useEffect, useMemo } from 'react';
import { useStudioStore } from '../../store/studioStore';
import { lazy, Suspense } from 'react';
import { buildDemoCurve, type DemoCurve, type SamplePoint } from '../../utils/howItWorksMath';
import { onThemeChange, type ThemeMode } from '../../utils/theme';
import { audioEngine } from '../../utils/audioEngine';

const Curve3DViewer = lazy(() => import('../Studio/Curve3DViewer'));

/** Luminous palette, layered over the site's own tokens. */
interface SceneInk {
  glow: string;
  accent: string;
  accentSoft: string;
  head: string;
  trail: string;
  ink: string;
  faint: string;
  panel: string;
}

const SCENE_INK: Record<ThemeMode, SceneInk> = {
  dark: {
    glow: 'rgba(232, 232, 230, 0.10)',
    accent: '#E8E8E6',
    accentSoft: 'rgba(232, 232, 230, 0.55)',
    head: '#FFFFFF',
    trail: 'rgba(232, 232, 230, 0.38)',
    ink: '#F2F2F0',
    faint: 'rgba(167, 171, 176, 0.75)',
    panel: '#101316',
  },
  light: {
    glow: 'rgba(27, 36, 48, 0.07)',
    accent: '#1B2430',
    accentSoft: 'rgba(27, 36, 48, 0.55)',
    head: '#1B2430',
    trail: 'rgba(27, 36, 48, 0.34)',
    ink: '#1B2430',
    faint: 'rgba(64, 64, 64, 0.78)',
    panel: '#F4F4F4',
  },
};

interface LiveState {
  progress: number;
  playing: boolean;
  headIndex: number;
  wave: Uint8Array<ArrayBuffer> | null;
  level: number;
  hoverIndex: number;
}

interface RightCardProps {
  equation: string;
  curve: DemoCurve;
  mode: 'frequency' | 'note' | 'rhythm' | 'chord';
  view: '2d' | '3d';
  canDraw3D: boolean;
  playing: boolean;
  liveRef: React.MutableRefObject<LiveState>;
  onViewChange: (v: '2d' | '3d') => void;
  onPlay: () => void;
  onStop: () => void;
  hoverLabel: string | null;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
}

/**
 * Right card (H3): 2D/3D tabs, graph with waveform strip, Play/Reset wired to the existing engine.
 * The 3D viewer is the Studio's own Curve3DViewer (loaded on demand).
 */
export default function HowItWorksRightCard({
  equation,
  curve,
  mode,
  view,
  canDraw3D,
  playing,
  liveRef,
  onViewChange,
  onPlay,
  onStop,
  hoverLabel,
  onPointerMove,
  onPointerLeave,
}: RightCardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const themeRef = useRef<ThemeMode>('dark');
  const inkRef = useRef<SceneInk>(SCENE_INK.dark);
  const reducedRef = useRef(false);
  const curveRef = useRef(curve);

  // Warm 3D viewer when card is near viewport
  useEffect(() => {
    const host = cardRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;
    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 2000 });
      else setTimeout(cb, 1200);
    };
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some(e => e.isIntersecting)) { observer.disconnect(); idle(() => import('../Studio/Curve3DViewer')); } },
      { rootMargin: '300px 0px' }
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  useEffect(() => { onThemeChange((t) => { themeRef.current = t; inkRef.current = SCENE_INK[t]; }); }, []);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { reducedRef.current = q.matches; };
    apply(); q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, []);

  curveRef.current = curve;

  const show3D = view === '3d' && canDraw3D;

  // 2D Canvas animation loop (only frame loop on the page)
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = 0, height = 0, dpr = 1;

    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = w; height = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const makeProjection = (pts: SamplePoint[], minY: number, maxY: number) => {
      const padX = 30, padY = 24, waveH = 62;
      const usableW = Math.max(1, width - padX * 2);
      const usableH = Math.max(1, height - padY * 2 - waveH);
      const spanY = Math.max(maxY - minY, 0.25);
      const midY = (minY + maxY) / 2;
      const scale = Math.min(usableH / (spanY * 1.3), usableW / 14);
      return (x: number, y: number) => ({
        sx: padX + ((x + 6) / 12) * usableW,
        sy: padY + usableH / 2 - (y - midY) * scale,
      });
    };

    const strokeCurve = (
      pts: SamplePoint[],
      project: (x: number, y: number) => { sx: number; sy: number },
      stroke: string, lineWidth: number, alpha: number, upTo = Infinity
    ) => {
      ctx.beginPath(); let pen = false;
      for (let i = 0; i < pts.length && i <= upTo; i++) {
        const p = pts[i];
        if (!p.isValid) { pen = false; continue; }
        const { sx, sy } = project(p.x, p.y);
        if (pen) ctx.lineTo(sx, sy); else { ctx.moveTo(sx, sy); pen = true; }
      }
      ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
      ctx.globalAlpha = 1;
    };

    const WAVE_BARS = 72;
    const drawWaveform = () => {
      const ink = inkRef.current;
      const live = liveRef.current;
      const stripH = 54; const top = height - stripH; const mid = top + stripH / 2;
      ctx.beginPath(); ctx.moveTo(0, mid); ctx.lineTo(width, mid);
      ctx.strokeStyle = ink.faint; ctx.globalAlpha = 0.2; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
      const analyser = audioEngine.getAnalyser();
      if (!analyser) return;
      if (!live.wave || live.wave.length !== analyser.fftSize) live.wave = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(live.wave);
      const bars = WAVE_BARS, gap = 2, barW = Math.max(1, width / bars - gap), perBar = live.wave.length / bars;
      for (let i = 0; i < bars; i++) {
        let peak = 0;
        for (let s = 0; s < perBar; s++) {
          const v = live.wave[Math.min(live.wave.length - 1, Math.floor(i * perBar + s))];
          peak = Math.max(peak, Math.abs(v - 128) / 128);
        }
        const h = Math.max(1.5, peak * stripH * 0.46);
        const played = i / bars <= live.progress;
        ctx.fillStyle = played ? ink.accentSoft : ink.faint;
        ctx.globalAlpha = played ? 0.85 : 0.18;
        ctx.fillRect(i * (barW + gap), mid - h / 2, barW, h);
      }
      ctx.globalAlpha = 1;
    };

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (width <= 0 || height <= 0) return;
      const live = liveRef.current; const ink = inkRef.current; const current = curveRef.current;
      const pts = current.points;
      ctx.clearRect(0, 0, width, height);

      // Soft glow
      const glow = ctx.createRadialGradient(width / 2, height * 0.42, 0, width / 2, height * 0.42, Math.max(width, height) * 0.72);
      glow.addColorStop(0, ink.glow); glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);

      if (pts.length < 2) return;
      const project = makeProjection(pts, current.minY, current.maxY);

      // Zero line
      const zero = project(0, 0);
      ctx.beginPath(); ctx.moveTo(0, zero.sy); ctx.lineTo(width, zero.sy);
      ctx.strokeStyle = ink.faint; ctx.globalAlpha = 0.16; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;

      // Full curve faint
      strokeCurve(pts, project, ink.faint, 1.6, 0.55);
      // Travelled part
      strokeCurve(pts, project, ink.accent, 2.2, 0.95, live.headIndex);

      // Scanner head + trail
      const headPoint = pts[live.headIndex];
      if (headPoint?.isValid && (live.playing || live.progress > 0)) {
        const trailStart = Math.max(0, live.headIndex - 44);
        for (let i = trailStart; i < live.headIndex; i++) {
          const a = pts[i], b = pts[i + 1];
          if (!a?.isValid || !b?.isValid) continue;
          const p1 = project(a.x, a.y), p2 = project(b.x, b.y);
          const age = (i - trailStart) / Math.max(1, live.headIndex - trailStart);
          ctx.beginPath(); ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy);
          ctx.strokeStyle = ink.trail; ctx.globalAlpha = 0.55 * (1 - age); ctx.lineWidth = 3.4; ctx.stroke();
        }
        ctx.globalAlpha = 1;
        const head = project(headPoint.x, headPoint.y);
        ctx.beginPath(); ctx.arc(head.sx, head.sy, 10, 0, Math.PI * 2); ctx.fillStyle = ink.glow; ctx.fill();
        ctx.beginPath(); ctx.arc(head.sx, head.sy, 3.4, 0, Math.PI * 2); ctx.fillStyle = ink.head; ctx.fill();
      }

      // Hover marker
      const hovered = live.hoverIndex >= 0 ? pts[live.hoverIndex] : null;
      if (hovered?.isValid) {
        const h = project(hovered.x, hovered.y);
        ctx.beginPath(); ctx.arc(h.sx, h.sy, 5, 0, Math.PI * 2);
        ctx.strokeStyle = ink.accentSoft; ctx.lineWidth = 1.5; ctx.stroke();
      }

      drawWaveform();
    };

    raf = requestAnimationFrame(frame);
    const onVis = () => { if (document.hidden) audioEngine.stop(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); audioEngine.stop(); };
  }, []);

  const GraphSkeleton = ({ label }: { label: string }) => (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4" aria-hidden="true">
      <span className="block h-px w-3/5 overflow-hidden bg-sc-line/25">
        <span className="block h-px w-1/3 bg-sc-accent/70 motion-safe:animate-pulse" />
      </span>
      <span className="block max-w-full truncate font-mono text-[10px] tracking-wide text-sc-text-faint">{label}</span>
    </div>
  );

  return (
    <div ref={cardRef} className="panel p-3 sm:p-4 w-full min-w-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex rounded-[10px] p-0.5 gap-1 bg-sc-sunken border border-sc-line/20" role="group" aria-label="Demo graph view mode">
          {(['2d', '3d'] as const).map((v) => (
            <button
              key={v} type="button" onClick={() => onViewChange(v)}
              onMouseEnter={v === '3d' ? () => import('../Studio/Curve3DViewer') : undefined}
              onFocus={v === '3d' ? () => import('../Studio/Curve3DViewer') : undefined}
              aria-pressed={view === v}
              disabled={v === '3d' && !canDraw3D}
              className={`px-3.5 py-2 rounded-lg text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                view === v ? 'bg-sc-accent text-sc-on-accent font-semibold' : 'text-sc-text-soft hover:text-sc-text'
              }`}
            >
              {v === '2d' ? '2D Graph' : '3D Graph'}
            </button>
          ))}
        </div>
        <span className="font-mono text-[10px] uppercase tracking-wider text-sc-text-faint shrink-0">
          {view === '3d' ? '3D view' : 'Waveform view'}
        </span>
      </div>

      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="font-mono text-xs text-sc-text truncate" title={equation}>{equation}</span>
      </div>

      <div className="relative w-full h-[200px] rounded-md overflow-hidden border border-sc-line/15" style={{ perspective: '1600px' }}>
        <div className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none" style={{ transformStyle: 'preserve-3d', transform: `rotateY(${show3D ? 180 : 0}deg)` }}>
          {/* 2D face */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            <div ref={wrapRef} className="relative w-full h-full overflow-hidden">
              <canvas ref={canvasRef} onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} className="block w-full h-full touch-pan-y" role="img" aria-label={`Graph of ${equation}`} />
              {hoverLabel && (
                <div className="absolute left-2 top-2 pointer-events-none font-mono text-[10px] sm:text-[11px] text-sc-text bg-sc-surface/90 border border-sc-line/20 rounded px-2 py-1">{hoverLabel}</div>
              )}
              <div className="absolute right-2 bottom-1.5 font-mono text-[9px] text-sc-text-faint pointer-events-none">waveform</div>
            </div>
          </div>

          {/* 3D face */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
            {show3D && <Suspense fallback={<GraphSkeleton label={equation} />}> <Curve3DViewer points={curve.points} label={equation} touchAction="pan-y" /> </Suspense>}
          </div>
        </div>

        {view === '3d' && !canDraw3D && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="text-center text-xs leading-relaxed text-sc-text-soft">
              3D visualization unavailable for this equation.{curve.error && <span className="block mt-1 text-sc-text-faint">{curve.error}</span>}
            </p>
          </div>
        )}

        {/* Equation chip over the graph + drag hint in 3D (redesign mockup) */}
        <div className="absolute right-2.5 top-2.5 pointer-events-none font-mono text-[11.5px] border border-sc-line/40 bg-sc-bg/80 rounded-lg px-2.5 py-1.5">
          f(x) = {equation}
        </div>
        {view === '3d' && canDraw3D && (
          <div className="absolute left-2.5 bottom-2 font-mono text-[10px] text-sc-text-faint pointer-events-none">
            drag to rotate
          </div>
        )}
      </div>

      <div className="mt-3.5 grid grid-cols-[1fr_auto] gap-3">
        <button type="button" onClick={onPlay} disabled={!!curve.error} aria-pressed={playing} className="btn-primary inline-flex items-center justify-center gap-2.5 px-4 py-4 text-[15px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed">
          <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span> {playing ? 'Pause' : 'Play'}
        </button>
        <button type="button" onClick={onStop} aria-label="Reset to the start" className="inline-flex items-center justify-center gap-2 px-5 rounded-[11px] border border-sc-line/40 text-[13px] text-sc-text hover:bg-sc-sunken transition-colors">
          <span aria-hidden="true">↺</span> Reset
        </button>
      </div>
    </div>
  );
}