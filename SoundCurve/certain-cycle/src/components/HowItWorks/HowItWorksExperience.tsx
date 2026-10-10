/**
 * The interactive "How it works" experience.
 *
 * DESIGN CONSTRAINT, and the reason this file is shaped the way it is:
 * MathSonify has a history of lag on /create, and the brief for this page is
 * explicitly "do not make it heavy". So the rules are:
 *
 *   ONE canvas. ONE requestAnimationFrame loop. For the entire page.
 *   Playback progress NEVER becomes React state — it is written to a ref and
 *   read by the frame loop, so a 60Hz audio tick costs zero renders.
 *   Geometry is rebuilt only when the equation changes, never per frame.
 *   Canvas drawing reads the shared canvas palette, so it follows the site
 *   theme instead of duplicating the theme system.
 *   The audio is the site's own `audioEngine`. There is no second engine here.
 *
 * Everything drawn is either a real number from `howItWorksMath` (which itself
 * calls the real parser and the real sonification mapping) or a style token.
 * Nothing on this page is decorative noise pretending to be mathematics.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { audioEngine } from '../../utils/audioEngine';
import { onThemeChange, type ThemeMode } from '../../utils/theme';
import type { SonificationMode } from '../../utils/sonificationMapping';
import type { SamplePoint } from '../../utils/equationParser';
import {
  buildDemoCurve,
  HOW_IT_WORKS_PRESETS,
  noteName,
  pitchFor,
  SONIFICATION_MAP,
  type DemoCurve,
} from '../../utils/howItWorksMath';
import { useStudioStore } from '../../store/studioStore';

/**
 * Studio's 3D viewer, loaded on demand.
 *
 * This is still the ONE shared component — the same orbit/zoom, arrowhead axes
 * and bounding box the Studio draws — not a reduced copy. But it pulls in
 * three.js (~578 kB), and this page's contract is that a reader who only reads
 * pays for nothing: the static sections ship zero JavaScript and the island owns
 * one canvas. Deferring the chunk means the 2D demo costs what it always did,
 * and 3D is a cost paid only by the visitor who presses 3D.
 */
const Curve3DViewer = lazy(() => import('../Studio/Curve3DViewer'));

/** Playback length. Long enough to hear the shape, short enough not to bore. */
const PLAY_SECONDS = 6;
/** The frequency span the demo sweeps, matching the Studio's default range. */
const MIN_HZ = 220;
const MAX_HZ = 880;
/** Samples per waveform column. Cheap, and enough for a readable waveform. */
const WAVE_BARS = 72;

/** Luminous-but-restrained palette, layered over the site's own tokens. */
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

/** What the frame loop needs, all held in refs so playback causes no renders. */
interface LiveState {
  /** 0..1 along the curve, from the engine's own progress callback. */
  progress: number;
  playing: boolean;
  /** Index into the current sample array, for the scanner position. */
  headIndex: number;
  /** Analyser buffer for the live waveform, reused to avoid per-frame allocs. */
  wave: Uint8Array<ArrayBuffer> | null;
  /** Level 0..1 measured from the analyser, for the waveform's height. */
  level: number;
  /** Hover position in curve-index space, or -1 when not hovering. */
  hoverIndex: number;
}

/**
 * Mirrors the demo's transport into the studio store.
 *
 * The store is the channel the shared 3D viewer reads: `Curve3DViewer` takes no
 * progress prop (a 60Hz prop would re-render React on every tick) and instead
 * subscribes to the store and writes the value straight into a ref. The 2D face
 * reads `liveRef` directly. Publishing the SAME numbers to both is what makes
 * ONE Play state drive both faces — flipping 2D -> 3D mid-playback lands on an
 * identical playhead rather than restarting it or leaving the faces disagreeing.
 *
 * Written straight into the store rather than through `setPlaying` /
 * `setProgress`: those actions carry the Studio's own transport policy
 * (`setPlaying(false)` zeroes progress), while this card mirrors whatever the
 * engine reports — including the `1` left behind when a run finishes, which the
 * 2D face still draws.
 */
function publishTransport(live: LiveState): void {
  useStudioStore.setState({ progress: live.progress, isPlaying: live.playing });
}

/**
 * The viewer chunk, pulled in ahead of the click.
 *
 * It carries three.js (~578 kB). Loading it lazily keeps the page light, but a
 * visitor who presses 3D should not then watch a spinner for a second — so the
 * import is warmed the moment the card is near the viewport, during idle time,
 * and again the moment the pointer or keyboard heads for the 3D button. The
 * module is cached, so every call after the first is free.
 */
function warmViewer(): void {
  void import('../Studio/Curve3DViewer');
}

/**
 * What the 3D face shows while its chunk arrives.
 *
 * A skeleton rather than a blank box: the frame keeps its shape and reads as
 * "still loading" instead of as a failure. The sweep is `motion-safe` because
 * an indefinite shimmer is exactly the sort of thing motion sensitivity is
 * about; under reduced motion it becomes a static rule with the label.
 */
function GraphSkeleton({ label }: { label: string }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4"
      aria-hidden="true"
    >
      <span className="block h-px w-3/5 overflow-hidden bg-sc-line/25">
        <span className="block h-px w-1/3 bg-sc-accent/70 motion-safe:animate-pulse" />
      </span>
      <span className="block max-w-full truncate font-mono text-[10px] tracking-wide text-sc-text-faint">
        {label}
      </span>
    </div>
  );
}

export default function HowItWorksExperience() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [equation, setEquation] = useState<string>('sin(x)');
  const [draft, setDraft] = useState<string>('sin(x)');
  const [playing, setPlaying] = useState(false);
  const [mode, setMode] = useState<SonificationMode>('frequency');
  /**
   * Which face of the demo card is showing.
   *
   * Local state, exactly as in the Studio's `GraphPanel`: which way one panel is
   * looking is a property of that panel, so this card can sit on 3D without
   * changing any other graph on the site. Playback is the opposite case and
   * deliberately IS shared — see `publishTransport`.
   */
  const [view, setView] = useState<'2d' | '3d'>('2d');
  /** The card, so the 3D chunk can be warmed as soon as it is near the viewport. */
  const cardRef = useRef<HTMLDivElement | null>(null);

  /** The sampled curve. Recomputed only when the equation changes. */
  const curve = useMemo<DemoCurve>(() => buildDemoCurve(equation), [equation]);

  // The same gate the Studio's panel applies: 3D needs a curve it can honestly
  // represent. Both the toggle and the flip read this, so the card can never
  // show an empty box for a bare constant or a broken expression.
  const canDraw3D = curve.points.length > 1 && !curve.error;
  const show3D = view === '3d' && canDraw3D;

  const themeRef = useRef<ThemeMode>('dark');
  const inkRef = useRef<SceneInk>(SCENE_INK.dark);
  /** Live playback state, read by the frame loop and never by React. */
  const liveRef = useRef<LiveState>({
    progress: 0,
    playing: false,
    headIndex: 0,
    wave: null,
    level: 0,
    hoverIndex: -1,
  });
  /**
   * True when the visitor has asked for reduced motion.
   *
   * Read by the frame loop and by the equation-change effect, both of which must
   * react to it without re-subscribing.
   */
  const reducedRef = useRef(false);

  // ── theme: follow the site's own switch, redraw on change ────────
  useEffect(
    () =>
      onThemeChange((theme) => {
        themeRef.current = theme;
        inkRef.current = SCENE_INK[theme];
      }),
    [],
  );

  // ── reduced motion: keep everything usable, drop the ambient movement ──
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => {
      reducedRef.current = query.matches;
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);

  /**
   * Warm the 3D chunk while the visitor is still reading.
   *
   * Deferring the import kept the page light but made the first press of 3D
   * pay for three.js in full view. Observing the card and deferring to an idle
   * callback splits that cost across the scroll instead — the click then finds
   * the module already cached.
   */
  useEffect(() => {
    const host = cardRef.current;
    if (!host || typeof IntersectionObserver === 'undefined') return;

    const idle = (cb: () => void) => {
      const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
      if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 2000 });
      else setTimeout(cb, 1200);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        idle(warmViewer);
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  /** Latest curve, readable from the frame loop without re-subscribing. */
  const curveRef = useRef(curve);
  curveRef.current = curve;

  /**
   * Whether the visitor wants the loop running, as distinct from whether it is
   * running right now.
   *
   * These come apart in exactly one case worth handling: a preset is clicked
   * mid-loop. Plain playback state would read that as "stop", so the loop would
   * die on every preset change and the visitor would have to press play again
   * each time. Keeping the intent separate lets the restart effect below bring
   * the new curve back up automatically.
   */
  const wantsPlayRef = useRef(false);

  // A new equation invalidates the old head, so stop rather than leaving a
  // playhead pointing at a coordinate that means nothing now.
  useEffect(() => {
    audioEngine.stop();
    const live = liveRef.current;
    live.playing = false;
    live.progress = 0;
    live.headIndex = 0;
    publishTransport(live);
    setPlaying(false);
  }, [equation]);

  // ── the one and only animation loop for this entire page ─────────
  //
  // ONE rAF for the whole experience. It reads live playback from refs, so it
  // draws at 60fps while React renders exactly zero times during playback.
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;

    /**
     * Sizes the backing store to the element.
     *
     * Skips rather than clamps a zero-size host: clamping would "fix" a hidden
     * or unlaid-out container to 1x1 and it would never recover, which is the
     * blank-canvas failure mode the 3D viewer once had.
     */
    const resize = () => {
      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      if (w <= 0 || h <= 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = w;
      height = h;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);

    /**
     * Maps curve space to pixels.
     *
     * The vertical scale is clamped against the width as well as the height: a
     * gentle sine over a wide domain is very short vertically, and an
     * unclamped fit renders it as a barely-visible ripple across a mostly
     * empty panel. The clamp lets a flat curve grow vertically to stay legible.
     */
    const makeProjection = (pts: SamplePoint[], minY: number, maxY: number) => {
      const padX = 30;
      const padY = 24;
      const waveH = 62;
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

    /** Strokes one sample array, breaking the path at singularities. */
    const strokeCurve = (
      pts: SamplePoint[],
      project: (x: number, y: number) => { sx: number; sy: number },
      stroke: string,
      lineWidth: number,
      alpha: number,
      upTo = Infinity,
    ) => {
      ctx.beginPath();
      let pen = false;
      for (let i = 0; i < pts.length && i <= upTo; i++) {
        const p = pts[i];
        // Break at an invalid point rather than drawing a line across the pole:
        // bridging a discontinuity would be a lie about the mathematics.
        if (!p.isValid) {
          pen = false;
          continue;
        }
        const { sx, sy } = project(p.x, p.y);
        if (pen) ctx.lineTo(sx, sy);
        else {
          ctx.moveTo(sx, sy);
          pen = true;
        }
      }
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.globalAlpha = alpha;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.globalAlpha = 1;
    };

    /** The live waveform strip beneath the curve, read from the real analyser. */
    const drawWaveform = () => {
      const ink = inkRef.current;
      const live = liveRef.current;
      const stripH = 54;
      const top = height - stripH;
      const mid = top + stripH / 2;

      // Baseline.
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(width, mid);
      ctx.strokeStyle = ink.faint;
      ctx.globalAlpha = 0.2;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      const analyser = audioEngine.getAnalyser();
      if (!analyser) return;
      // Allocated once per size change, not per frame: a fresh Uint8Array every
      // frame would be ~44k allocations a second for no reason.
      if (!live.wave || live.wave.length !== analyser.fftSize) {
        live.wave = new Uint8Array(analyser.fftSize);
      }
      analyser.getByteTimeDomainData(live.wave);

      const bars = WAVE_BARS;
      const gap = 2;
      const barW = Math.max(1, width / bars - gap);
      const perBar = live.wave.length / bars;
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

      const live = liveRef.current;
      const ink = inkRef.current;
      const current = curveRef.current;
      const pts = current.points;

      ctx.clearRect(0, 0, width, height);

      // A soft pool of light so the curve sits in light rather than on flat
      // colour. Two stops only — a gradient per pixel would be a cost.
      const glow = ctx.createRadialGradient(
        width / 2,
        height * 0.42,
        0,
        width / 2,
        height * 0.42,
        Math.max(width, height) * 0.72,
      );
      glow.addColorStop(0, ink.glow);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, width, height);

      if (pts.length < 2) return;
      const project = makeProjection(pts, current.minY, current.maxY);

      // The midline, at the height of y = 0 rather than the data's centre, so
      // the axis means something.
      const zero = project(0, 0);
      ctx.beginPath();
      ctx.moveTo(0, zero.sy);
      ctx.lineTo(width, zero.sy);
      ctx.strokeStyle = ink.faint;
      ctx.globalAlpha = 0.16;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // The whole curve, faint.
      strokeCurve(pts, project, ink.faint, 1.6, 0.55);
      // The travelled part, brighter.
      strokeCurve(pts, project, ink.accent, 2.2, 0.95, live.headIndex);

      // ── the scanner ──
      const headPoint = pts[live.headIndex];
      if (headPoint?.isValid && (live.playing || live.progress > 0)) {
        const trailStart = Math.max(0, live.headIndex - 44);
        for (let i = trailStart; i < live.headIndex; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          if (!a?.isValid || !b?.isValid) continue;
          const p1 = project(a.x, a.y);
          const p2 = project(b.x, b.y);
          const age = (i - trailStart) / Math.max(1, live.headIndex - trailStart);
          ctx.beginPath();
          ctx.moveTo(p1.sx, p1.sy);
          ctx.lineTo(p2.sx, p2.sy);
          ctx.strokeStyle = ink.trail;
          ctx.globalAlpha = 0.55 * (1 - age);
          ctx.lineWidth = 3.4;
          ctx.stroke();
        }
        ctx.globalAlpha = 1;

        const head = project(headPoint.x, headPoint.y);
        ctx.beginPath();
        ctx.arc(head.sx, head.sy, 10, 0, Math.PI * 2);
        ctx.fillStyle = ink.glow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(head.sx, head.sy, 3.4, 0, Math.PI * 2);
        ctx.fillStyle = ink.head;
        ctx.fill();
      }

      // Hover marker.
      const hovered = live.hoverIndex >= 0 ? pts[live.hoverIndex] : null;
      if (hovered?.isValid) {
        const h = project(hovered.x, hovered.y);
        ctx.beginPath();
        ctx.arc(h.sx, h.sy, 5, 0, Math.PI * 2);
        ctx.strokeStyle = ink.accentSoft;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      drawWaveform();
    };

    raf = requestAnimationFrame(frame);

    // A hidden tab must not keep synthesising into an audience of nobody.
    const onVisibility = () => {
      if (document.hidden) audioEngine.stop();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      audioEngine.stop();
    };
    // Re-created only when the curve changes; everything else is read by ref.
  }, [curve]);

  // ── PLAYBACK: the site's own engine, no second engine here ──────
  const play = useCallback(async () => {
    if (playing) {
      audioEngine.stop();
      // `stop()` reports 0 through the same callback the 2D face reads, so the
      // mirror only needs the fact that we are no longer running. Progress is
      // left exactly where the engine put it, which is what keeps the 2D and 3D
      // faces agreeing when the visitor pauses.
      liveRef.current.playing = false;
      publishTransport(liveRef.current);
      setPlaying(false);
      return;
    }
    if (curve.error) return;

    const points = curve.points;
    await audioEngine.playPoints(
      points,
      -6,
      6,
      MIN_HZ,
      MAX_HZ,
      PLAY_SECONDS,
      0.7,
      'sine',
      mode,
      // Loop: the engine already owns repeat scheduling internally (it
      // re-enters `executeSonification` on a timer guarded by playGeneration),
      // so looping costs one flag rather than a second timer in this
      // component. It also means `onFinish` never fires while looping, so the
      // single stop path below stays the only way playback ends.
      true,
      'major',
      (progress) => {
        // Written to a ref, deliberately NOT to state: this fires up to 60x a
        // second, and a setState here would re-render the page 60 times a
        // second — the exact lag /create has suffered from before.
        const live = liveRef.current;
        live.progress = progress;
        live.playing = true;
        live.headIndex = Math.min(
          points.length - 1,
          Math.floor(progress * (points.length - 1)),
        );
        // Mirrored on every tick so the 3D face reveals in lockstep with the
        // scanner above it — one Play state, two faces.
        publishTransport(live);
      },
      () => {
        const live = liveRef.current;
        live.playing = false;
        live.progress = 1;
        live.headIndex = points.length - 1;
        publishTransport(live);
        setPlaying(false);
      },
    );
    setPlaying(true);
    wantsPlayRef.current = true;
  }, [curve, mode, playing]);

  const stop = useCallback(() => {
    audioEngine.stop();
    const live = liveRef.current;
    live.progress = 0;
    live.playing = false;
    live.headIndex = 0;
    publishTransport(live);
    wantsPlayRef.current = false;
    setPlaying(false);
  }, []);

  /*
    Restarts the loop when the curve changes underneath it.

    The equation-change effect above deliberately tears playback down on every
    preset click — the old playhead points at a coordinate that means nothing on
    the new curve. This effect is the other half: if the visitor still wants to
    hear something, it starts the new curve straight away, so switching presets
    mid-loop keeps looping rather than going silent.

    `wantsPlayRef` is a ref, so this does not re-run just because playback state
    ticked; it only fires when the curve or the reading mode actually changes.
  */
  useEffect(() => {
    if (!wantsPlayRef.current) return;
    if (curve.error) return;
    void play();
    // `play` is intentionally omitted: it closes over `playing`, and including it
    // would restart the loop every time playback state flipped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curve, mode]);

  const chooseEquation = useCallback((next: string) => {
    setDraft(next);
    setEquation(next);
  }, []);

  const submitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) setEquation(trimmed);
  }, [draft]);

  /**
   * Maps a pointer position to the nearest sample index.
   *
   * Inverted from the same projection the canvas uses, so the marker and the
   * cursor agree exactly. Writes to a ref; the tooltip itself is React state,
   * because a tooltip must re-render to move.
   */
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || curve.points.length < 2) return;
      const fraction = (event.clientX - rect.left) / rect.width;
      const index = Math.round(fraction * (curve.points.length - 1));
      if (index < 0 || index >= curve.points.length) return;
      const point = curve.points[index];
      if (!point.isValid) return;

      liveRef.current.hoverIndex = index;
      const hz = pitchFor(curve, point.y, mode, MIN_HZ, MAX_HZ);
      setHoverLabel(
        `x = ${point.x.toFixed(2)}   y = ${point.y.toFixed(2)}   dy/dx = ${point.dy.toFixed(2)}` +
          (hz ? `   ${Math.round(hz)} Hz` : ''),
      );
    },
    [curve, mode],
  );

  const onPointerLeave = useCallback(() => {
    liveRef.current.hoverIndex = -1;
    setHoverLabel(null);
  }, []);

  const topHz = pitchFor(curve, curve.maxY, mode, MIN_HZ, MAX_HZ);
  const lowHz = pitchFor(curve, curve.minY, mode, MIN_HZ, MAX_HZ);

  /*
    HERO LAYOUT — two columns on desktop, stacked on mobile.

    Left: the controls (equation input, presets). Right: a SMALL contained demo
    card. The demo used to be a full-width, Studio-sized panel — a 420px-tall
    canvas plus a four-up stat strip — which read as a feature page rather than
    as a supporting demo beside a headline. It is now ~340px wide and holds only
    what a first-time visitor needs: which equation, the shape, and a way to
    hear it.
  */
  return (
    <>
    <div className="w-full grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-12 items-start">
      {/* ── LEFT: the controls ── */}
      <div className="min-w-0">
        {/* ── the equation picker ── */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-3 min-w-0">
            <span className="font-mono text-sm text-sc-text-soft shrink-0">f(x) =</span>
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitDraft();
              }}
              spellCheck={false}
              autoComplete="off"
              aria-label="Equation to play"
              className="font-mono text-base sm:text-lg text-sc-text bg-transparent border-b border-sc-line/30 focus:border-sc-accent outline-none transition-colors py-1 w-full min-w-0 sm:w-64"
            />
          </label>
        </div>

      {/* ── presets ── */}
      <div className="flex flex-wrap gap-2 mt-4">
        {HOW_IT_WORKS_PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => chooseEquation(preset)}
            aria-pressed={equation === preset}
            className={`font-mono text-xs px-3 min-h-[36px] rounded border transition-all ${
              equation === preset
                ? 'border-sc-accent text-sc-text bg-sc-accent/10'
                : 'border-sc-line/20 text-sc-text-soft hover:border-sc-line/45 hover:text-sc-text'
            }`}
          >
            {preset}
          </button>
        ))}
      </div>

      {/*
        The pitch readout and the mode selector live HERE, directly under the
        preset chips, rather than below the hero pair.

        WHY: the hero is a two-column grid, so its row is as tall as the taller
        column — the demo card. The left column held only the input and the
        chips, so it ended roughly 150px above the card's bottom edge and left a
        band of dead space between the chips and whatever followed. Putting this
        content in the left column fills that band with something that belongs
        there, rather than shrinking it with a margin hack: the selector now sits
        immediately beneath the chips it modifies.
      */}
      {topHz && (
        <p className="mt-4 font-mono text-xs text-sc-text-soft">
          Highest point of the curve plays {noteName(topHz)} ({Math.round(topHz)} Hz).
        </p>
      )}

      {/* ── sonification modes: the same curve, read differently ── */}
      <div className="mt-4">
        <div className="font-mono text-[10px] uppercase tracking-wider text-sc-text-faint mb-2">
          How the curve is read
        </div>
        <div className="flex flex-wrap gap-2">
          {(['frequency', 'note', 'rhythm', 'chord'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`px-3 min-h-[40px] rounded text-xs capitalize transition-all ${
                mode === m
                  ? 'bg-sc-accent text-sc-on-accent'
                  : 'border border-sc-line/20 text-sc-text-soft hover:border-sc-line/45 hover:text-sc-text'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-sc-text-soft leading-relaxed">
          {mode === 'frequency' && 'Height maps straight onto pitch, continuously.'}
          {mode === 'note' && 'Height is snapped to a scale, so it sounds musical rather than glissando.'}
          {mode === 'rhythm' && 'Height drives loudness and triggering instead — there is no pitch here.'}
          {mode === 'chord' && 'Height decides how much of the voicing sounds at each point.'}
        </p>
      </div>

      {curve.error && (
        <p className="mt-4 text-sm text-sc-text-soft" role="status">
          {curve.error}
        </p>
      )}
      </div>

      {/* ── RIGHT: the small contained demo card ── */}
      <div ref={cardRef} className="panel p-3 sm:p-4 w-full min-w-0">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-sc-text-faint shrink-0">
            Now playing
          </span>
          {/*
            The 2D / 3D toggle: the same segmented control the Studio's
            GraphPanel puts in its panel header, scaled to this card. `view` is
            panel-local, so which way THIS card is looking never changes what any
            other graph does — but the Play button below drives both of its faces,
            because both read the one transport.
          */}
          <div
            className="flex rounded-md p-0.5 gap-0.5"
            style={{ background: 'rgb(var(--sc-sunken))' }}
            role="group"
            aria-label="Demo graph view mode"
          >
            {(['2d', '3d'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                onMouseEnter={v === '3d' ? warmViewer : undefined}
                onFocus={v === '3d' ? warmViewer : undefined}
                aria-pressed={view === v}
                // 3D needs a drawable curve; if there is not one, say so rather
                // than offering a button that can only fail.
                disabled={v === '3d' && !canDraw3D}
                className="px-2.5 min-h-[40px] rounded text-xs font-semibold whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                style={
                  view === v
                    ? { background: 'rgb(var(--sc-accent))', color: 'rgb(var(--sc-on-accent))' }
                    : { color: 'rgb(var(--sc-text-soft))' }
                }
              >
                {v === '2d' ? '2D Graph' : '3D Graph'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="font-mono text-xs text-sc-text truncate" title={equation}>
            {equation}
          </span>
        </div>

        {/*
          ONE frame, TWO faces — the same flip the Studio's GraphPanel does.

          Both faces stay mounted and the whole frame rotates on Y, because
          `backface-visibility: hidden` hides the far face from the viewer while
          leaving it laid out. That matters twice here: the 2D canvas keeps its
          backing store instead of being blanked by a `display: none` (which
          AGENTS.md forbids for exactly that reason), and the 3D scene is handed a
          box that already has a size, so it can never paint into a zero-height
          host.

          Nothing navigates, nothing unmounts, and the Play button below stays in
          charge of both faces.
        */}
        <div
          className="relative w-full h-[200px] rounded-md overflow-hidden border border-sc-line/15"
          style={{ perspective: '1600px' }}
        >
          <div
            className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
            style={{
              transformStyle: 'preserve-3d',
              transform: `rotateY(${show3D ? 180 : 0}deg)`,
            }}
          >
            {/* The 2D face: curve above, live waveform below. Hidden by backface
                culling, never by display:none. */}
            <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
              <div ref={wrapRef} className="relative w-full h-full overflow-hidden">
                <canvas
                  ref={canvasRef}
                  onPointerMove={onPointerMove}
                  onPointerLeave={onPointerLeave}
                  className="block w-full h-full touch-pan-y"
                  role="img"
                  aria-label={`Graph of ${equation}, with the waveform MathSonify produces from it.`}
                />
                {hoverLabel && (
                  <div className="absolute left-2 top-2 pointer-events-none font-mono text-[10px] sm:text-[11px] text-sc-text bg-sc-surface/90 border border-sc-line/20 rounded px-2 py-1">
                    {hoverLabel}
                  </div>
                )}
                <div className="absolute right-2 bottom-1.5 font-mono text-[9px] text-sc-text-faint pointer-events-none">
                  waveform
                </div>
              </div>
            </div>

            {/* The 3D face: Studio's own viewer — the same orbit/zoom, arrowhead
                axes and bounding box the Studio shows, not a reduced variant.
                Pre-rotated so it lands facing the viewer when the frame turns,
                and mounted only in 3D: a WebGL context held open for a hidden
                view is a cost with no upside. */}
            <div
              className="absolute inset-0"
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              {show3D && (
                <Suspense fallback={<GraphSkeleton label={equation} />}>
                  <Curve3DViewer points={curve.points} label={equation} touchAction="pan-y" />
                </Suspense>
              )}
            </div>
          </div>

          {/*
            Graceful fallback: 3D was asked for but this equation cannot honestly
            be shown in it. Deliberately a small message inside the graph frame —
            the 2D graph and the audio keep working, so this must never take the
            page down.
          */}
          {view === '3d' && !canDraw3D && (
            <div className="absolute inset-0 flex items-center justify-center px-6">
              <p className="text-center text-xs leading-relaxed text-sc-text-soft">
                3D visualization unavailable for this equation.
                {curve.error && (
                  <span className="block mt-1 text-sc-text-faint">{curve.error}</span>
                )}
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => (playing ? stop() : play())}
            disabled={!!curve.error}
            aria-pressed={playing}
            className="btn-primary inline-flex flex-1 items-center justify-center gap-2 px-4 min-h-[44px] text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">{playing ? '❚❚' : '▶'}</span>
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={stop}
            aria-label="Reset to the start"
            className="px-3 min-h-[44px] rounded border border-sc-line/25 text-sc-text-soft hover:text-sc-text hover:border-sc-line/50 transition-colors"
          >
            ↺
          </button>
        </div>
      </div>
    </div>

    {/*
      Full-width detail BELOW the hero pair. The pitch readout and the mode
      selector used to live here too, but they moved up into the left column
      directly under the preset chips — leaving them here stranded a band of
      dead space between the chips and this section.
    */}
    <div className="mt-10">
      {/*
        The Amplitude / Oscillations / Steepness / Pitch-range strip used to sit
        here, directly under the graph. It was the heaviest thing in the hero
        and it belongs with the parameter controls further down the page — those
        sliders are what actually CHANGE these numbers, so showing the readouts
        before the dials exist makes them look like decoration.

        They return as live readouts inside the "What changes?" section, where
        they sit next to the sliders that drive them.
      */}

    {/* ── the property → sound map ── */}
      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {SONIFICATION_MAP.map((fact) => (
          <li key={fact.property} className="panel px-4 py-4 rounded">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-mono text-sm text-sc-text">{fact.property}</span>
              <span className="text-sc-text-faint" aria-hidden="true">
                →
              </span>
              <span className="font-mono text-sm text-sc-accent">{fact.becomes}</span>
            </div>
            <p className="mt-2 text-xs text-sc-text-soft leading-relaxed">{fact.detail}</p>
          </li>
        ))}
      </ul>
    </div>
    </>
  );
}