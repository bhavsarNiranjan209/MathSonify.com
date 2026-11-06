/**
 * Shared theme helpers. The Light / Dark modes are stored
 * on <html data-theme="..."> and persisted under `mathsonify-theme`.
 * Canvas renderers read a palette from this module so graph colors follow
 * the active mode automatically.
 */
export type ThemeMode = 'light' | 'dark';

export const THEME_KEY = 'mathsonify-theme';
export const THEME_CHANGE_EVENT = 'mathsonify:themechange';

export function getThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'dark';
  const v = document.documentElement.dataset.theme;
  if (v === 'light') return 'light';
  if (v === 'dark') return 'dark';
  // Legacy migration
  if (v === 'digital') return 'light';
  if (v === 'mono') return 'dark';
  return 'dark';
}

/** Colors used by the canvas graph renderer for each mode. */
export interface CanvasPalette {
  canvas: string; // surface the curve is "inked" onto
  grid: string;
  axis: string;
  label: string;
  curve: string; // idle curve (interactive accent)
  curveGlow: string;
  curveCore: string; // bright hairline on top of the idle curve
  live: string; // live curve / playhead — only present while playing
  liveGlow: string;
  liveCore: string; // hairline on top of the live curve
}

let cachedPalette: CanvasPalette | null = null;
let cachedTheme: ThemeMode | null = null;

export function getCanvasPalette(theme: ThemeMode = getThemeMode()): CanvasPalette {
  if (cachedPalette && cachedTheme === theme) return cachedPalette;

  if (theme === 'light') {
    // Light — pure white / pure black / one black accent.
    //
    // The "core" hairline is deliberately the CURVE colour here, not the
    // canvas colour. Dark mode inks a dark hairline down the middle of a
    // white curve (an outlined stroke that reads well on black), but the
    // mirror image — a white hairline down a black curve on a WHITE canvas —
    // is invisible, leaving only two ~1px black edges: the curve looked thin
    // and washed out, and the playhead's white centre dot vanished entirely.
    // A solid black curve with a soft grey halo is the legible equivalent.
    cachedPalette = {
      canvas: '#ffffff',
      grid: 'rgba(0, 0, 0, 0.06)',
      axis: 'rgba(0, 0, 0, 0.32)',
      label: 'rgba(0, 0, 0, 0.78)',
      curve: '#000000',
      curveGlow: 'rgba(0, 0, 0, 0.30)',
      curveCore: '#000000',
      live: '#000000',
      liveGlow: 'rgba(0, 0, 0, 0.50)',
      liveCore: '#000000',
    };
  } else {
    // Dark — spec palette:
    // Background #080A0C / Panels #101316 / Grid #1C2024 / Axes #8E949A
    // Main text #F2F2F0 / Equation graph #FFFFFF / Secondary #A7ABB0
    // Borders #292D32 / Buttons #E8E8E6 / Button text #080A0C
    cachedPalette = {
      canvas: '#080A0C',
      grid: '#1C2024',
      axis: 'rgba(142, 148, 154, 0.70)',
      label: 'rgba(167, 171, 176, 0.95)',
      curve: '#FFFFFF',
      curveGlow: 'rgba(255, 255, 255, 0.30)',
      curveCore: '#080A0C',
      live: '#FFFFFF',
      liveGlow: 'rgba(255, 255, 255, 0.60)',
      liveCore: '#080A0C',
    };
  }

  cachedTheme = theme;
  return cachedPalette;
}

/** Invalidates the palette cache after the mode changes. */
export function invalidatePaletteCache(): void {
  cachedPalette = null;
  cachedTheme = null;
}

/**
 * Subscribes to theme changes. Returns an unsubscribe function.
 * The handler runs immediately with the current mode so callers can
 * initialise once.
 */
export function onThemeChange(handler: (mode: ThemeMode) => void): () => void {
  const listener = () => {
    invalidatePaletteCache();
    handler(getThemeMode());
  };
  window.addEventListener(THEME_CHANGE_EVENT, listener);
  listener();
  return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}
