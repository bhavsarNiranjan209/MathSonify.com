/**
 * ControlPointLayer — the draggable mathematical handles drawn over the graph.
 *
 * The curve itself lives on the <canvas> in Visualizer. This component draws
 * the parameter handles as real DOM buttons on top of it, because DOM gives us
 * keyboard focus, ARIA semantics and reliable touch targets for free — all
 * three of which a canvas-drawn dot would have to reimplement by hand.
 *
 * Interaction rules (the whole point of the feature):
 *  * dragging a handle writes to the SAME parameter model that produces the
 *    equation string, so graph, equation and audio can never disagree;
 *  * pointer capture keeps the drag alive even if the finger leaves the handle;
 *  * `touch-action: none` is set on the handle only, so a drag never scrolls
 *    the page but scrolling everywhere else still works normally.
 *
 * Positions arrive already converted to pixels by the parent, which is the
 * only place that knows the graph's padded y-range.
 *
 * © 2026 MathSonify
 */

import { useCallback, useRef, useState } from 'react';
import type { ControlHandle, ParamKey } from '../../utils/equationParams';

export interface HandlePixel {
  key: ParamKey;
  label: string;
  display: string;
  /** Pixel position within the overlay box. */
  x: number;
  y: number;
}

interface Props {
  handles: HandlePixel[];
  /** Fired continuously while dragging. */
  onDrag: (key: ParamKey, dxPx: number, dyPx: number) => void;
  /** Fired once on release so the caller can commit + restart audio. */
  onCommit: () => void;
  /** Pixels per unit, so a drag distance becomes a parameter delta. */
  scaleX: number;
  scaleY: number;
  disabled?: boolean;
}

const HIT_RADIUS = 22; // 44px touch target, per the accessibility target

export default function ControlPointLayer({
  handles,
  onDrag,
  onCommit,
  scaleX,
  scaleY,
  disabled = false,
}: Props) {
  const [activeKey, setActiveKey] = useState<ParamKey | null>(null);
  // Refs, not state: these change on every pointermove and must not trigger a
  // React re-render of the whole layer mid-drag.
  const originRef = useRef<{ x: number; y: number } | null>(null);

  const handleDown = useCallback((event: React.PointerEvent<HTMLButtonElement>, key: ParamKey) => {
    if (disabled) return;
    // Stop the canvas from also handling this gesture as a curve drag.
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as HTMLButtonElement).setPointerCapture(event.pointerId);
    originRef.current = { x: event.clientX, y: event.clientY };
    setActiveKey(key);
  }, [disabled]);

  const handleMove = useCallback((event: React.PointerEvent<HTMLButtonElement>, key: ParamKey) => {
    if (activeKey !== key || !originRef.current) return;
    event.stopPropagation();
    event.preventDefault();
    onDrag(
      key,
      (event.clientX - originRef.current.x) / (scaleX || 1),
      (event.clientY - originRef.current.y) / (scaleY || 1),
    );
  }, [activeKey, onDrag, scaleX, scaleY]);

  const handleUp = useCallback((event: React.PointerEvent<HTMLButtonElement>, key: ParamKey) => {
    if (activeKey !== key) return;
    event.stopPropagation();
    try {
      (event.currentTarget as HTMLButtonElement).releasePointerCapture(event.pointerId);
    } catch {
      // Capture may already be gone; nothing to release.
    }
    originRef.current = null;
    setActiveKey(null);
    onCommit();
  }, [activeKey, onCommit]);

  if (disabled || handles.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden={false}>
      {handles.map((handle) => {
        const active = activeKey === handle.key;
        return (
          <button
            key={handle.key}
            type="button"
            // A generous invisible target so the handle is easy to grab on a
            // phone, while the visible dot stays small and precise.
            className="pointer-events-auto absolute flex cursor-grab touch-none select-none items-center justify-center rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-sc-accent focus-visible:ring-offset-2 focus-visible:ring-offset-sc-bg active:cursor-grabbing"
            style={{
              left: handle.x,
              top: handle.y,
              width: HIT_RADIUS * 2,
              height: HIT_RADIUS * 2,
              transform: 'translate(-50%, -50%)',
            }}
            onPointerDown={(event) => handleDown(event, handle.key)}
            onPointerMove={(event) => handleMove(event, handle.key)}
            onPointerUp={(event) => handleUp(event, handle.key)}
            onPointerCancel={(event) => handleUp(event, handle.key)}
            aria-label={`${handle.label}: ${handle.display}`}
            aria-valuetext={handle.display}
            title={`${handle.label} — ${handle.display}`}
          >
            <span
              className={`block rounded-full border-2 transition-[transform,background-color,border-color] ${
                active
                  ? 'scale-125 border-sc-accent bg-sc-accent'
                  : 'border-sc-accent bg-sc-bg'
              }`}
              style={{ width: active ? 16 : 12, height: active ? 16 : 12 }}
            />
            {/* Value readout: only while dragging, so it never clutters the graph. */}
            {active && (
              <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded-sm border border-sc-line/25 bg-sc-bg/95 px-1.5 py-0.5 font-mono text-[10px] text-sc-text shadow-sm">
                {handle.label} {handle.display}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type { ControlHandle };
