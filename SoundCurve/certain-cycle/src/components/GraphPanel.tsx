import { useMemo, useState } from 'react';

import { useStudioStore } from '../store/studioStore';
import { useActiveCurve } from '../utils/useActiveCurve';
import { analyzeEquation } from '../utils/surface3d';
import Curve3DViewer from './Studio/Curve3DViewer';

/**
 * The shared 2D/3D graph panel — ONE component, used wherever a curve renders.
 *
 * This exists so "every graph on the site can go 3D" is satisfied by
 * construction. There is deliberately no per-page copy of the toggle, the scene,
 * or the playhead logic: every instance renders this and reads the same store,
 * so a second implementation cannot drift from the first.
 *
 * Structure, matching the brief:
 *   - 3D is a MODE of this panel, not a new card or page. It swaps what is drawn
 *     inside the same frame and navigates nowhere.
 *   - The 2D/3D toggle sits in the panel header, matching the existing
 *     toolbar-button pattern.
 *   - Both modes read the SAME `useActiveCurve()` result, so they cannot show
 *     different curves, and the same `progress`, so switching modes mid-playback
 *     neither resets nor desyncs the playhead.
 *
 * `children` is the caller's 2D renderer. That keeps this component reusable for
 * both the full interactive Visualizer and a simpler read-only preview.
 */
export interface GraphPanelProps {
  /** The caller's 2D canvas/content, shown in 2D mode. */
  children: React.ReactNode;
  /** Accessible name for the region, e.g. the equation being plotted. */
  label: string;
  /** Hides the toggle for surfaces that only ever want the 2D preview. */
  allow3D?: boolean;
  className?: string;
}

export default function GraphPanel({
  children,
  label,
  allow3D = true,
  className = '',
}: GraphPanelProps) {
  // Local state, not the shared store: which way one panel is looking is a
  // property of that panel. Two panels on the same page must be able to show 2D
  // and 3D side by side. The playback state it shares is the opposite case and
  // does live in the store.
  const [mode, setMode] = useState<'2d' | '3d'>('2d');

  // ONE source of truth for the curve. Both branches read this.
  const equation = useStudioStore((s) => s.equation);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);
  const isCustomCurve = useStudioStore((s) => s.isCustomCurve);
  const splineControlPoints = useStudioStore((s) => s.splineControlPoints);

  const curve = useActiveCurve({ equation, minX, maxX, isCustomCurve, splineControlPoints });

  const analysis = useMemo(
    () =>
      isCustomCurve
        ? { kind: 'curve' as const, variables: [], reason: undefined as string | undefined }
        : analyzeEquation(equation),
    [equation, isCustomCurve],
  );

  // Playback progress is deliberately NOT subscribed to here. It used to be, which
  // meant every audio tick (30-60x/second) re-rendered this panel AND its 2D
  // Visualizer subtree, on a page that has suffered from lag before. Instead
  // the 3D viewer reads progress through the `getProgress` callback below,
  // called from inside its own animation frame — so the playhead costs no
  // React work at all, and the 3D curve draws itself in live, exactly like
  // the 2D playhead. This panel only needs to know whether there is a curve
  // to draw.
  const canDraw3D = curve.points.length > 1 && !curve.error && analysis.kind !== 'unsupported';
  const show3D = allow3D && mode === '3d' && canDraw3D;

  return (
    <div className={`relative w-full flex flex-col ${className}`}>
      {/* ── panel header: the 2D / 3D toggle ───────────────────────── */}
      <div className="flex items-center justify-end gap-1.5 px-3 py-2 border-b border-sc-ink/10 bg-sc-surface">
        <div
          className="flex rounded-md p-0.5 gap-0.5"
          style={{ background: 'rgb(var(--sc-sunken))' }}
          role="group"
          aria-label={`${label} view mode`}
        >
          {(['2d', '3d'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              // 3D needs a drawable curve; if there is not one yet, say so
              // rather than offering a button that can only fail.
              disabled={m === '3d' && !canDraw3D}
              className="px-3 min-h-[44px] rounded text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style={
                mode === m
                  ? { background: 'rgb(var(--sc-accent))', color: 'rgb(var(--sc-on-accent))' }
                  : { color: 'rgb(var(--sc-text-soft))' }
              }
            >
              {m === '2d' ? '2D Graph' : '3D Graph'}
            </button>
          ))}
        </div>
      </div>

      {/* ── one frame; the contents swap, the panel does not ───────── */}
      {/*
        The frame carries the height, in BOTH modes, and both views fill it.
        This is the fix for the blank-3D bug: the frame used to be `flex-1`
        inside a root with no height of its own, so it resolved to 0px. The 2D
        Visualizer escaped that because it carries its own `h-[520px]` and simply
        overflowed the zero-height box, while the 3D viewer inherits `h-full` and
        was handed literally 0x0 — three then clamped it to a 1x1 buffer and drew
        nothing at all, axes included. Owning the height here gives both views a
        definite box, and keeps the canvas exactly as tall as before so the image
        and video exports are unaffected.
      */}
      <div
        className="relative w-full h-[400px] sm:h-[480px] lg:h-[520px]"
        style={{ perspective: '1600px' }}
      >
        {/*
          THE 2D -> 3D FLIP.

          Both faces stay mounted and the whole frame rotates on Y. This is a real
          card flip rather than a fade because `backface-visibility: hidden` hides
          the far face from the viewer while leaving it in the DOM — which is what
          lets the 2D canvas (expensive to rebuild) survive every toggle.

          It also replaces `display: none` on the 2D canvas, which AGENTS.md
          explicitly forbids: hiding a canvas that way takes it out of layout and
          its backing store stops tracking the container. Backface hiding keeps it
          laid out and merely invisible.

          `motion-reduce:transition-none` is honoured via CSS rather than JS so
          there is no reduced-motion branch to forget.
        */}
        <div
          className="absolute inset-0 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
          style={{
            transformStyle: 'preserve-3d',
            transform: `rotateY(${show3D ? 180 : 0}deg)`,
          }}
        >
          {/* The 2D view stays mounted and is hidden with CSS rather than
              unmounted: it owns a canvas whose backing store is expensive to
              rebuild, and unmounting it would blank the frame on every toggle. */}
          <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
            {children}
          </div>

          {/* The 3D face is pre-rotated so that once the frame turns 180 degrees
              it lands facing the viewer. Mounted only in 3D mode: a WebGL context
              held open for a hidden view is a cost with no upside. */}
          <div
            className="absolute inset-0"
            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
          >
            {show3D && (
              <Curve3DViewer
                points={curve.points}
                label={label}
                // Live playback in 3D, mirroring the 2D playhead: the viewer
                // calls this every animation frame and draws the curve in up
                // to the current position (ghost curve behind it). Reading
                // the store imperatively here costs no React re-renders.
                getProgress={() => {
                  const s = useStudioStore.getState();
                  return s.isPlaying ? s.progress : null;
                }}
                // Hand the live scene's export API to the store so the
                // ExportModal can offer 3D picture/video while this viewer
                // is mounted (and clear it when it unmounts / 2D mode).
                onReady={(api) => useStudioStore.getState().setThreeDApi(api)}
              />
            )}
          </div>
        </div>

        {/*
          Graceful fallback. Shown when the user has ASKED for 3D but the equation
          cannot be honestly represented in it — a bare constant, or three free
          variables that would need a fourth dimension. Deliberately a small
          message inside the graph frame: the 2D graph and the audio keep working,
          so this must never take the Studio down or block the page.
        */}
        {mode === '3d' && !canDraw3D && (
          <div className="absolute inset-0 flex items-center justify-center px-6">
            <p className="text-center text-xs leading-relaxed text-sc-text-soft">
              3D visualization unavailable for this equation.
              {analysis.reason && (
                <span className="block mt-1 text-sc-text-faint">{analysis.reason}</span>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
