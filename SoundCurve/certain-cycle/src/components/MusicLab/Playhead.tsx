/**
 * Music Lab — the single playhead.
 *
 * CONTAINMENT: this element is absolutely positioned inside the timeline
 * container (`.ml-tracks`, which is `position: relative`). It is never `fixed`,
 * never a portal, and it unmounts with the Music Lab component tree, so it can
 * never leak onto another page. Its position is written straight to the DOM
 * from the transport frame — no React renders, no drift: the beats→percent
 * conversion uses the same audio-clock snapshot everything else reads.
 */

import { useRef } from 'react';
import { useTransportFrame } from './hooks';

interface Props {
  /** Total timeline length in beats, for the percent conversion. */
  loopLength: number;
}

export default function Playhead({ loopLength }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useTransportFrame((snapshot) => {
    const element = ref.current;
    if (!element) return;
    const percent = (snapshot.positionBeats / Math.max(1, loopLength)) * 100;
    element.style.left = `${Math.max(0, Math.min(100, percent))}%`;
    element.style.opacity = snapshot.state === 'playing' ? '1' : '0.35';
  });

  return <div ref={ref} className="ml-playhead" aria-hidden="true" />;
}
