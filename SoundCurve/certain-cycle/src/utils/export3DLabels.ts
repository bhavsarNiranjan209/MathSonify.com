/**
 * 3D export labels (v32) — the names on a 3D picture / turntable / video.
 *
 * Mirrors the 2D export rule (v24): a scientist equation gets its scientist
 * name (Instrument Serif italic) + its equation name at the TOP, and the
 * equation itself at the bottom in the theme colour; a user equation gets
 * NO name at the top, but the equation still appears at the bottom. The
 * 3D exports are screenshots of the live WebGL scene, so the labels are
 * drawn on the 2D composer canvas over the frame — the same overlay
 * pattern the footer band already used.
 *
 * One shared helper for all three 3D exporters (single picture, turntable
 * picture, video frames) so the three never drift apart. Pure geometry
 * (positions, fonts, colours) so it is unit-testable without a GPU; the
 * callers own the canvas and the WebGL frame.
 */
import {
  DEFAULT_VIDEO_COLOR_THEME,
  isVideoColorTheme,
  videoColorThemeHex,
  type VideoColorTheme,
} from './videoScene';

export interface Export3DLabelInfo {
  /** Equation exactly as typed / selected. */
  equation: string;
  /** Display name of the equation (preset / scientist equation), if any. */
  equationName?: string | null;
  /** Scientist name — present only for a scientist equation. */
  scientistName?: string | null;
  /** Curve colour theme; the bottom equation is drawn in this colour. */
  colorTheme?: VideoColorTheme;
  /** The theme's canvas colour — the header/footer bands are filled with it. */
  canvasColor: string;
}

/** Scientist mode when a scientist name is present — the top names appear. */
export function isScientist3DExport(info: Export3DLabelInfo): boolean {
  return !!info.scientistName;
}

/** Header band height, as a fraction of the frame height (scientist mode). */
export const EXPORT_3D_HEADER_FRAC = 0.15;

/** Footer band height, as a fraction of the frame height. */
export const EXPORT_3D_FOOTER_FRAC = 0.08;

/**
 * Pure layout: where the header band, the two top lines and the bottom
 * equation sit, for a frame of `width` × `height`. The top lines follow
 * the 2D video layout proportions (scientist name ~5.5%, equation name
 * ~11.5% of the height); the footer band is the bottom 8%, as the 3D
 * picture already had.
 */
export function export3DLabelLayout(width: number, height: number): {
  headerH: number;
  scientistNameY: number;
  equationNameY: number;
  footerH: number;
  footerY: number;
  equationY: number;
  uiScale: number;
} {
  const uiScale = Math.min(width, height) / 720;
  const footerH = Math.max(12, Math.round(height * EXPORT_3D_FOOTER_FRAC));
  return {
    headerH: Math.round(height * EXPORT_3D_HEADER_FRAC),
    scientistNameY: 0.055 * height,
    equationNameY: 0.115 * height,
    footerH,
    footerY: height - footerH,
    equationY: height - footerH / 2,
    uiScale,
  };
}

/** Scientist name font — Instrument Serif italic, like the 2D export. */
export function export3DScientistFont(uiScale: number): string {
  return `italic 500 ${Math.round(22 * uiScale)}px "Instrument Serif", Georgia, serif`;
}

/** Equation name font — Fraunces bold, like the 2D export. */
export function export3DEquationNameFont(uiScale: number): string {
  return `700 ${Math.round(28 * uiScale)}px "Fraunces", Georgia, serif`;
}

/** Bottom equation font — Instrument Serif italic, like the 2D export. */
export function export3DEquationFont(uiScale: number): string {
  return `italic 400 ${Math.round(34 * uiScale)}px "Instrument Serif", Georgia, serif`;
}

/** The bottom equation text, exactly as the 2D export writes it. */
export function export3DEquationText(equation: string): string {
  return `f(x) = ${equation.trim()}`;
}

/** The theme colour for the bottom equation (falls back to white). */
export function export3DEquationColor(colorTheme?: VideoColorTheme): string {
  return videoColorThemeHex(
    isVideoColorTheme(colorTheme) ? colorTheme : DEFAULT_VIDEO_COLOR_THEME,
  );
}

/**
 * Draw the header (scientist mode only) and the footer (bottom equation +
 * "mathsonify.com") on a 2D context, over a 3D frame that is already drawn.
 * The header band covers the top of the scene; the footer band covers the
 * bottom 8% — the same overlay pattern the 3D picture's footer already
 * used, so the scene geometry never changes, only the labels on top of it.
 */
export function drawExport3DLabels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  info: Export3DLabelInfo,
): void {
  const layout = export3DLabelLayout(width, height);
  const scientist = isScientist3DExport(info);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (scientist) {
    // Header band — solid, so the top of the 3D scene does not show
    // through behind the names.
    ctx.fillStyle = info.canvasColor;
    ctx.fillRect(0, 0, width, layout.headerH);
    if (info.scientistName) {
      ctx.font = export3DScientistFont(layout.uiScale);
      ctx.fillStyle = '#DCEBFB';
      ctx.fillText(info.scientistName, width / 2, layout.scientistNameY);
    }
    const title = (info.equationName ?? info.equation ?? '').trim();
    if (title) {
      ctx.font = export3DEquationNameFont(layout.uiScale);
      ctx.fillStyle = '#F5F5F2';
      ctx.fillText(title, width / 2, layout.equationNameY);
    }
  }

  // Footer band — solid, as the 3D picture already had.
  ctx.fillStyle = info.canvasColor;
  ctx.fillRect(0, layout.footerY, width, layout.footerH);

  // Bottom equation, in the theme colour — the 2D style. Present for
  // BOTH scientist and user exports (the "scientist only" rule is about
  // the top names, not the equation itself).
  const eq = (info.equation ?? '').trim();
  if (eq) {
    ctx.font = export3DEquationFont(layout.uiScale);
    ctx.fillStyle = export3DEquationColor(info.colorTheme);
    ctx.fillText(export3DEquationText(eq), width / 2, layout.equationY - 2);
  }

  // Domain, bottom-right, as the 3D picture already had.
  ctx.font = `${Math.max(10, Math.round(width * 0.012))}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(142, 148, 154, 0.85)';
  ctx.fillText('mathsonify.com', width - 12, layout.equationY - 2);
}
