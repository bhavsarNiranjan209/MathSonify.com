import { useEffect, useRef, useState } from 'react';
import { musicLabTransport } from '../../utils/musicLabEngine';

export interface TransportSnapshot {
  state: 'idle' | 'playing' | 'paused';
  positionBeats: number;
  positionSeconds: number;
  bar: number;
  beat: number;
}

export function useTransportFrame(
  onFrame: (snapshot: TransportSnapshot) => void,
  enabled = true
): void {
  const callbackRef = useRef(onFrame);
  callbackRef.current = onFrame;

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    const loop = () => {
      callbackRef.current(musicLabTransport.snapshot());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [enabled]);
}

export function useTransportState(): { state: TransportSnapshot['state']; loop: boolean } {
  const [state, setState] = useState<TransportSnapshot['state']>(musicLabTransport.getState());
  const [loop, setLoop] = useState(musicLabTransport.isLooping());

  useEffect(() => musicLabTransport.subscribe(() => {
    setState(musicLabTransport.getState());
    setLoop(musicLabTransport.isLooping());
  }), []);

  return { state, loop };
}

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