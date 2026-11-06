/**
 * curve3dPalette — the 3D viewer's scene palette, as plain data (no THREE
 * types), so the mapping from theme to look can be asserted without a GPU.
 *
 * WHY LIGHT IS DESIGNED, NOT INVERTED: the first light palette was a black
 * tube (0x14161a) with zero emissive on a shadow-only floor — a thin black
 * worm in a faint grey cage. It read as broken in the light-mode screenshot.
 * Light mode is authored on its own terms here: the curve is the brass accent
 * (the same #C9A24B the rest of the site uses), thick enough to read as an
 * object, on a warm paper floor with an ink grid that actually reads.
 */
export interface Curve3DPalette {
  /** The curve tube. */
  tube: number;
  emissive: number;
  emissiveI: number;
  metal: number;
  rough: number;
  /** Radius of the curve tube, in scene units. */
  tubeR: number;
  /** Axis lines + cones. */
  axis: number;
  /** Grid lines on the floor / back wall. */
  grid: number;
  gridOp: number;
  wallOp: number;
  /** Plot-box edges. */
  box: number;
  boxOp: number;
  /** Canvas-drawn label colours. */
  text: string;
  tick: string;
  chip: string;
  /** Playhead sphere. */
  head: number;
  /** Floor fill. */
  floor: number;
  /** Light intensities. */
  key: number;
  fill: number;
  rim: number;
  amb: number;
}

export const CURVE_3D_PALETTES = {
  dark: {
    tube: 0xffffff, emissive: 0x9db4ff, emissiveI: 0.22, metal: 0.5, rough: 0.22, tubeR: 0.04,
    axis: 0xe8e8ea, grid: 0xffffff, gridOp: 0.12, wallOp: 0.08, box: 0x6a6a74, boxOp: 0.6,
    text: '#F2F2F0', tick: '#C3C6CD', chip: 'rgba(10,10,12,0.82)', head: 0xffffff, floor: 0x0a0a0c,
    key: 1.3, fill: 0.5, rim: 0.4, amb: 0.55,
  },
  light: {
    // Brass tube with a warm emissive: the curve is the hero, and in light mode
    // a black tube with no glow reads as a flat worm. Brass pops on paper and
    // is the site's accent everywhere else.
    tube: 0xc9a24b, emissive: 0xc9a24b, emissiveI: 0.25, metal: 0.35, rough: 0.3, tubeR: 0.055,
    axis: 0x14161a, grid: 0x14161a, gridOp: 0.5, wallOp: 0.32, box: 0x14161a, boxOp: 0.7,
    text: '#14161A', tick: '#2b2e35', chip: 'rgba(255,255,255,0.9)', head: 0xc9a24b, floor: 0xf7f4ef,
    key: 1.6, fill: 0.5, rim: 0.3, amb: 0.9,
  },
} as const satisfies { dark: Curve3DPalette; light: Curve3DPalette };

/** The 3D scene palette for a mode. */
export function curve3DPalette(dark: boolean): Curve3DPalette {
  return dark ? CURVE_3D_PALETTES.dark : CURVE_3D_PALETTES.light;
}
