import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

import HowItWorksLeftCard from './HowItWorksLeftCard';
import HowItWorksRightCard from './HowItWorksRightCard';
import { buildDemoCurve, HOW_IT_WORKS_PRESETS, type DemoCurve } from '../../utils/howItWorksMath';
import { audioEngine } from '../../utils/audioEngine';
import { onThemeChange } from '../../utils/theme';
import type { SonificationMode } from '../../utils/sonificationMapping';
import type { SamplePoint } from '../../utils/equationParser';
import { useStudioStore } from '../../store/studioStore';

/**
 * The combined demo: Left card (controls) + Right card (2D/3D graph + audio).
 * State is owned here and passed down. Only ONE canvas + ONE rAF for the page.
 */
export default function HowItWorksDemo() {
  const [equation, setEquation] = useState('sin(x)');
  const [draft, setDraft] = useState('sin(x)');
  const [mode, setMode] = useState<SonificationMode>('frequency');
  const [playing, setPlaying] = useState(false);
  const [view, setView] = useState<'2d' | '3d'>('2d');

  const curve = useMemo<DemoCurve>(() => buildDemoCurve(equation), [equation]);

  const canDraw3D = curve.points.length > 1 && !curve.error;

  // Shared transport state for 2D/3D sync (same pattern as Studio's GraphPanel)
  const liveRef = useRef({
    progress: 0,
    playing: false,
    headIndex: 0,
    wave: null as Uint8Array<ArrayBuffer> | null,
    level: 0,
    hoverIndex: -1,
  });

  const wantsPlayRef = useRef(false);
  const reducedRef = useRef(false);
  const themeRef = useRef<'light' | 'dark'>('dark');

  // Theme sync
  useEffect(() => onThemeChange((t) => { themeRef.current = t; }), []);

  // Reduced motion
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => { reducedRef.current = q.matches; };
    apply(); q.addEventListener('change', apply);
    return () => q.removeEventListener('change', apply);
  }, []);

  // Stop on equation change
  useEffect(() => {
    audioEngine.stop();
    const live = liveRef.current;
    live.playing = false;
    live.progress = 0;
    live.headIndex = 0;
    useStudioStore.setState({ progress: 0, isPlaying: false });
    setPlaying(false);
  }, [equation]);

  // Auto-restart if user wanted playback
  useEffect(() => {
    if (!wantsPlayRef.current) return;
    if (curve.error) return;
    play();
  }, [curve, mode]);

  const play = useCallback(async () => {
    if (playing) {
      audioEngine.stop();
      liveRef.current.playing = false;
      useStudioStore.setState({ isPlaying: false });
      setPlaying(false);
      return;
    }
    if (curve.error) return;

    const points = curve.points;
    await audioEngine.playPoints(
      points, -6, 6, 220, 880, 6, 0.7, 'sine', mode,
      true, 'major',
      (progress) => {
        const live = liveRef.current;
        live.progress = progress;
        live.playing = true;
        live.headIndex = Math.min(points.length - 1, Math.floor(progress * (points.length - 1)));
        useStudioStore.setState({ progress, isPlaying: true });
      },
      () => {
        const live = liveRef.current;
        live.playing = false;
        live.progress = 1;
        live.headIndex = points.length - 1;
        useStudioStore.setState({ progress: 1, isPlaying: false });
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
    useStudioStore.setState({ progress: 0, isPlaying: false });
    wantsPlayRef.current = false;
    setPlaying(false);
  }, []);

  const chooseEquation = useCallback((next: string) => {
    setDraft(next);
    setEquation(next);
  }, []);

  const submitDraft = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed) setEquation(trimmed);
  }, [draft]);

  // Hover on canvas → tooltip
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);
  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || curve.points.length < 2) return;
    const fraction = (event.clientX - rect.left) / rect.width;
    const index = Math.round(fraction * (curve.points.length - 1));
    if (index < 0 || index >= curve.points.length) return;
    const point = curve.points[index];
    if (!point.isValid) return;

    liveRef.current.hoverIndex = index;
    const hz = (() => {
      const { pitchFor } = require('../../utils/howItWorksMath');
      return pitchFor(curve, point.y, mode, 220, 880);
    })();
    setHoverLabel(
      `x = ${point.x.toFixed(2)}  y = ${point.y.toFixed(2)}  dy/dx = ${point.dy.toFixed(2)}` +
        (hz ? `  ${Math.round(hz)} Hz` : ''),
    );
  }, [curve, mode]);

  const onPointerLeave = useCallback(() => {
    liveRef.current.hoverIndex = -1;
    setHoverLabel(null);
  }, []);

  return (
    <div className="w-full grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 items-start">
      {/* LEFT: controls (H2) */}
      <HowItWorksLeftCard
        equation={equation}
        draft={draft}
        mode={mode}
        curve={curve}
        onDraftChange={setDraft}
        onSubmit={submitDraft}
        onPresetChoose={chooseEquation}
        onModeChange={setMode}
      />

      {/* RIGHT: 2D/3D graph + audio (H3) */}
      <HowItWorksRightCard
        equation={equation}
        curve={curve}
        mode={mode}
        view={view}
        canDraw3D={canDraw3D}
        playing={playing}
        liveRef={liveRef}
        onViewChange={setView}
        onPlay={playing ? stop : play}
        onStop={stop}
        hoverLabel={hoverLabel}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      />
    </div>
  );
}