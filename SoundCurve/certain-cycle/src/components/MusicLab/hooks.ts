/**
 * Music Lab — shared hooks.
 *
 * The important one is `useTransportFrame`: the playhead is drawn by writing to
 * the DOM from an animation frame, never by setting React state. That keeps a
 * 60 fps playhead from re-rendering the whole studio.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { musicLabTransport, type TransportSnapshot } from '../../utils/musicLabEngine';

export interface FrameOptions {
  /** Skip the loop entirely when false — e.g. suspended panels. */
  enabled?: boolean;
  /** Only fire on this many frames per second. 0 = every frame. */
  throttleFps?: number;
}

/**
 * Runs `onFrame` once per animation frame with the current transport snapshot.
 * `onFrame` is held in a ref, so callers do not need to memoise it.
 */
export function useTransportFrame(
  onFrame: (snapshot: TransportSnapshot) => void,
  { enabled = true, throttleFps = 0 }: FrameOptions = {},
): void {
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  useEffect(() => {
    if (!enabled) {
      // Still report the parked position once, so the UI is correct when idle.
      callbackRef.current(musicLabTransport.snapshot());
      return;
    }
    let frame = 0;
    let last = 0;
    const minDelta = throttleFps > 0 ? 1000 / throttleFps : 0;
    const loop = (now: number) => {
      if (minDelta === 0 || now - last >= minDelta) {
        last = now;
        callbackRef.current(musicLabTransport.snapshot());
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled, throttleFps]);
}

/** Subscribes to transport state changes (play / pause / stop / seek). */
export function useTransportState(): { state: TransportSnapshot['state']; loop: boolean } {
  const [state, setState] = useState<TransportSnapshot['state']>(musicLabTransport.getState());
  const [loop, setLoop] = useState(musicLabTransport.isLooping());

  useEffect(() => musicLabTransport.subscribe(() => {
    setState(musicLabTransport.getState());
    setLoop(musicLabTransport.isLooping());
  }), []);

  return { state, loop };
}

/**
 * Peak level of an analyser, sampled on an animation frame and pushed straight
 * into a ref'd element's style — never through React state.
 */
export function usePeakMeter(
  selector: () => AnalyserNode | null,
  target: React.RefObject<HTMLElement | null>,
  { enabled = true } = {},
): void {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let buffer = new Uint8Array(0);
    let smoothed = 0;
    const loop = () => {
      const analyser = selector();
      const element = target.current;
      if (analyser) {
        if (buffer.length !== analyser.fftSize) buffer = new Uint8Array(analyser.fftSize);
        analyser.getByteTimeDomainData(buffer);
        let peak = 0;
        for (let index = 0; index < buffer.length; index += 1) {
          const deviation = Math.abs(buffer[index] - 128) / 128;
          if (deviation > peak) peak = deviation;
        }
        // Fast attack, slow release — how a real meter behaves.
        smoothed = peak > smoothed ? peak : smoothed * 0.86;
      } else {
        smoothed *= 0.86;
      }
      if (element) {
        element.style.transform = `scaleY(${Math.max(0.01, Math.min(1, smoothed))})`;
        element.style.opacity = smoothed < 0.01 ? '0.25' : '1';
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [selector, target, enabled]);
}

/** True when the user has asked for reduced motion. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);
  return reduced;
}

/** Matches a media query, evaluated on resize. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

/**
 * Tracks an element's pixel width. Used by the piano roll and timeline so their
 * grid can be measured without guesswork.
 */
export function useElementWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * A stable "escape hatch" callback identity for drag handlers, so pointermove
 * listeners are not re-bound on every render.
 */
export function useStableCallback<T extends (...args: never[]) => unknown>(callback: T): T {
  const ref = useRef(callback);
  ref.current = callback;
  return useCallback(((...args: never[]) => ref.current(...args)) as T, []);
}