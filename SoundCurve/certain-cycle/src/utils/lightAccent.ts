/**
 * Light-mode legibility for data-driven accent colours.
 *
 * The Guess family accents are brand hues chosen for dark canvases; on a
 * white canvas several of them fall to ~2:1. Rather than forking the data,
 * callers pass the accent through `lightAccent()` at the point of use: in
 * dark mode it returns the colour unchanged, in light mode a darkened
 * version that clears AA against white.
 */
import { getThemeMode } from './theme';

/** Multiplies each channel of a #RRGGBB hex by `factor` (0..1). */
export function darkenHex(hex: string, factor = 0.58): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 0xff) * factor);
  const g = Math.round(((n >> 8) & 0xff) * factor);
  const b = Math.round((n & 0xff) * factor);
  const to = (v: number) => v.toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The accent as it should be drawn in the current theme. */
export function lightAccent(hex: string): string {
  return getThemeMode() === 'light' ? darkenHex(hex) : hex;
}
