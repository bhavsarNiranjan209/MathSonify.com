/**
 * Shared theme helpers. The Digital / Monochrome modes are stored
 * on <html data-theme="..."> and persisted under `mathsonify-theme`.
 * Canvas renderers read a palette from this module so graph colors follow
 * the active mode automatically.
 */
export type ThemeMode = 'digital' | 'mono';

export const THEME_KEY = 'mathsonify-theme';
export const THEME_CHANGE_EVENT = 'mathsonify:themechange';

export function getThemeMode(): ThemeMode {
  if (typeof document === 'undefined') return 'digital';
  const v = document.documentElement.dataset.theme;
  if (v === 'digital') return 'digital';
  if (v === 'mono') return 'mono';
  return 'digital';
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

  if (theme === 'digital') {
    cachedPalette = {
      canvas: '#ffffff',
      grid: 'rgba(0, 0, 0, 0.06)',
      axis: 'rgba(0, 0, 0, 0.20)',
      label: 'rgba(0, 0, 0, 0.60)',
      curve: '#000000',
      curveGlow: 'rgba(0, 0, 0, 0.20)',
      curveCore: '#ffffff',
      live: '#000000',
      liveGlow: 'rgba(0, 0, 0, 0.35)',
      liveCore: '#ffffff',
    };
  } else if (theme === 'mono') {
    // Monochrome Elegant — spec palette:
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
