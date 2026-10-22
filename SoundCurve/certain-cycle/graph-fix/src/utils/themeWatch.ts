/**
 * themeWatch.ts — theme detection that does not depend on HOW the site toggles light/dark.
 * Reads the REAL background colour behind an element (walking up through transparent
 * ancestors) and re-reads whenever <html>/<body> attributes change.
 */
export interface BgInfo { r: number; g: number; b: number; dark: boolean }

let probe: CanvasRenderingContext2D | null = null;

/** Any CSS colour (rgb, hex, oklch, color-mix...) -> sRGB rgba, via a 1x1 canvas. */
function cssToRgba(css: string): [number, number, number, number] {
  if (!probe) {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    probe = c.getContext('2d', { willReadFrequently: true });
  }
  if (!probe) return [0, 0, 0, 0];
  probe.clearRect(0, 0, 1, 1);
  probe.fillStyle = css;
  probe.fillRect(0, 0, 1, 1);
  const d = probe.getImageData(0, 0, 1, 1).data;
  return [d[0], d[1], d[2], d[3] / 255];
}

export function resolveBackground(el: Element): BgInfo {
  let node: Element | null = el;
  while (node) {
    const [r, g, b, a] = cssToRgba(getComputedStyle(node).backgroundColor);
    if (a > 0.5) return { r, g, b, dark: (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5 };
    node = node.parentElement;
  }
  const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true;
  return dark ? { r: 8, g: 9, b: 11, dark: true } : { r: 241, g: 239, b: 233, dark: false };
}

/** Calls cb after every theme change. Returns an unsubscribe fn. */
export function watchTheme(el: Element, cb: (bg: BgInfo) => void): () => void {
  let timers: number[] = [];
  const fire = () => cb(resolveBackground(el));
  const schedule = () => { // read twice: right away, and after CSS background transitions settle
    timers.forEach(clearTimeout);
    timers = [window.setTimeout(fire, 30), window.setTimeout(fire, 400)];
  };
  const mo = new MutationObserver(schedule);
  const opts: MutationObserverInit = { attributes: true, attributeFilter: ['class', 'data-theme', 'data-mode', 'style'] };
  mo.observe(document.documentElement, opts);
  if (document.body) mo.observe(document.body, opts);
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
  mq?.addEventListener?.('change', schedule);
  return () => { mo.disconnect(); mq?.removeEventListener?.('change', schedule); timers.forEach(clearTimeout); };
}
