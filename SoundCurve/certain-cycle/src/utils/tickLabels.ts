/**
 * tickLabels.ts — keep canvas tick labels inside the graph frame.
 *
 * The ruler draws its outermost labels exactly on the canvas edge (top tick
 * at y = 0, bottom tick at y = height, first/last x tick at x = 0 / width).
 * Canvas text is drawn from a baseline with the glyphs extending above it,
 * so those edge labels were half-clipped by the panel — the top "1.2" and the
 * bottom "-18.6" / "-25.4" in the light-mode Studio screenshot were cut in
 * half. These two pure helpers clamp a label's anchor point so the whole
 * glyph box stays on-canvas. No DOM, no canvas: unit-testable in isolation.
 *
 * © 2026 MathSonify
 */

/** Clamp a y-axis label's baseline so the ~9px glyph box stays on-canvas. */
export function clampTickLabelY(baselineY: number, height: number): number {
  // Glyphs extend ~7px above the baseline and ~2px below it.
  return Math.max(9, Math.min(height - 2, baselineY));
}

/**
 * Clamp a centre-aligned x-axis label's x so the text (halfWidth either side
 * of the anchor) stays on-canvas.
 */
export function clampTickLabelX(x: number, halfTextWidth: number, width: number): number {
  return Math.max(halfTextWidth + 2, Math.min(width - halfTextWidth - 2, x));
}
