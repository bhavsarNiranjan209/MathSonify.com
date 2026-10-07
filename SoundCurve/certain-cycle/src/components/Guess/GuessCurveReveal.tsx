import { useEffect, useRef } from 'react';
import { sampleEquationDetailed } from '../../utils/equationParser';
import { CURVE_SAMPLE_COUNT } from '../../utils/activeCurve';
import { getCanvasPalette, onThemeChange } from '../../utils/theme';
import type { GuessEquation } from '../../data/guessLibrary';

/**
 * The reveal graph — drawn only after a round is answered.
 *
 * This component is NOT rendered at all while the question is open. That is the
 * whole point of it being a separate component rather than a conditional branch
 * inside the game: an absent element has no pixels, so there is nothing to see,
 * inspect in devtools, or screenshot. A faded or outlined curve would leak the
 * answer.
 *
 * The stroke uses the family's accent colour rather than the theme's neutral
 * curve colour, so the revealed shape is drawn in the colour that has been
 * labelling the family all along. Axes and the surrounding chrome still use the
 * shared palette so the graph follows the light/dark theme.
 */
export default function GuessCurveReveal({
  equation,
  accent,
}: {
  equation: GuessEquation;
  /** Family accent hex. Falls back to the theme curve colour when omitted. */
  accent?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const paletteRef = useRef(getCanvasPalette());
  /**
   * The draw routine itself, kept in a ref so the theme/resize subscribers can
   * repaint without re-subscribing on every render.
   */
  const drawRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const draw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const points = sampleEquationDetailed(equation.plot, equation.minX, equation.maxX, CURVE_SAMPLE_COUNT);
    const valid = points.filter((p) => p.isValid);
    if (valid.length === 0) return;

    const ys = valid.map((p) => p.y);
    // Padded range is shared with the rest of the site so the reveal frames the
    // curve the same way the Studio graph does.
    const yMin = Math.min(...ys);
    const yMax = Math.max(...ys);
    const pad = Math.max(0.5, (yMax - yMin) * 0.18);
    const drawMinY = yMin - pad;
    const drawMaxY = yMax + pad;

    const dpr = window.devicePixelRatio || 1;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (width === 0 || height === 0) return; // hidden / not laid out yet

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const palette = paletteRef.current;
    ctx.clearRect(0, 0, width, height);

    // Axes — only when they fall inside the window, so we never draw a stray
    // line at the edge for a curve that lives entirely above zero.
    const toX = (x: number) => ((x - equation.minX) / (equation.maxX - equation.minX)) * width;
    const toY = (y: number) =>
      height - ((y - drawMinY) / (drawMaxY - drawMinY)) * height;

    if (drawMinY < 0 && drawMaxY > 0) {
      ctx.strokeStyle = palette.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, toY(0));
      ctx.lineTo(width, toY(0));
      ctx.stroke();
    }
    if (equation.minX < 0 && equation.maxX > 0) {
      ctx.strokeStyle = palette.axis;
      ctx.beginPath();
      ctx.moveTo(toX(0), 0);
      ctx.lineTo(toX(0), height);
      ctx.stroke();
    }

    // The curve itself. Invalid samples break the path rather than being
    // bridged, so a singularity reads as a gap instead of a vertical cliff.
    const strokeColor = accent ?? palette.curve;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let pen = false;
    for (const point of points) {
      if (!point.isValid) {
        pen = false;
        continue;
      }
      const px = toX(point.x);
      const py = toY(point.y);
      if (!pen) {
        ctx.moveTo(px, py);
        pen = true;
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.stroke();

    // A soft halo under the stroke, matching the Studio graph's treatment.
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 12;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
    };

    drawRef.current = draw;
    draw();

    return () => {
      drawRef.current = null;
    };
  }, [equation, accent]);

  // Redraw on theme change and on resize, so the reveal is correct in both modes.
  // A canvas keeps its pixels until something repaints it, so refreshing the
  // palette alone would leave the previous theme's colours on screen.
  useEffect(() => {
    const redraw = () => {
      paletteRef.current = getCanvasPalette();
      drawRef.current?.();
    };
    const unsubscribe = onThemeChange(redraw);

    const canvas = canvasRef.current;
    let observer: ResizeObserver | null = null;
    if (canvas && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => drawRef.current?.());
      observer.observe(canvas);
    }
    window.addEventListener('resize', redraw);

    return () => {
      unsubscribe();
      observer?.disconnect();
      window.removeEventListener('resize', redraw);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="w-full h-56 sm:h-72 block"
      role="img"
      aria-label={`Revealed curve for the equation ${equation.display}`}
    />
  );
}
