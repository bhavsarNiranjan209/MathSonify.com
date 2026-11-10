/**
 * equationWave — sine-wave SVG geometry for the equation player card (v28).
 * Pure geometry, so the tests can pin it without a canvas or audio.
 */

/**
 * An SVG path for a smooth sine wave across a `width` × `height` box,
 * with `cycles` full periods. Starts and ends on the mid-line.
 */
export function sineWavePath(width: number, height: number, cycles = 3): string {
  const midY = height / 2;
  const amp = height * 0.42;
  const steps = 96;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * width;
    const y = midY - amp * Math.sin((i / steps) * cycles * Math.PI * 2);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

/**
 * The point on the sine wave at fraction `t` (0..1) across the box.
 * Used for the playhead dot that travels along the wave while it plays.
 */
export function sineWavePoint(
  width: number,
  height: number,
  cycles: number,
  t: number,
): { x: number; y: number } {
  const midY = height / 2;
  const amp = height * 0.42;
  return {
    x: t * width,
    y: midY - amp * Math.sin(t * cycles * Math.PI * 2),
  };
}
