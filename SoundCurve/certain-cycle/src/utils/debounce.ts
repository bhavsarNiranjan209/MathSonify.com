/**
 * debounce.ts — a tiny trailing-edge debounce with cancel + flush.
 *
 * WHY THIS EXISTS — the Studio lag (Nov 2026, performance pass):
 * every keystroke in the equation field re-sampled the curve at 800 points
 * and rebuilt the whole 3D scene (floor, grid, axes, labels, tubes) from
 * scratch. The input itself must stay live — the user sees each character
 * at once — but the expensive derived work only needs to run once the user
 * pauses. `useActiveCurve` debounces the equation it resolves with this;
 * the store, the input field, playback and exports all keep reading the
 * live value, so nothing else waits.
 *
 * Pure function, no React — tested in debounce.test.ts.
 */

/** The debounced wrapper: call it as often as you like; `cancel` drops a pending call, `flush` runs it now. */
export interface DebouncedFunction<F extends (...args: never[]) => void> {
  (...args: Parameters<F>): void;
  cancel(): void;
  flush(): void;
}

export function debounce<F extends (...args: never[]) => void>(
  fn: F,
  wait: number,
): DebouncedFunction<F> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<F> | null = null;

  const debounced = (...args: Parameters<F>): void => {
    lastArgs = args;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (lastArgs) {
        const argsToRun = lastArgs;
        lastArgs = null;
        fn(...argsToRun);
      }
    }, wait);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lastArgs = null;
  };

  debounced.flush = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (lastArgs) {
      const argsToRun = lastArgs;
      lastArgs = null;
      fn(...argsToRun);
    }
  };

  return debounced as DebouncedFunction<F>;
}

/**
 * How long the Studio waits after the last keystroke before re-resolving
 * the curve (2D redraw + 3D rebuild). 200ms is the standard "user paused"
 * beat: short enough that a preset click or a finished equation feels
 * instant, long enough that a fast typist triggers one rebuild, not ten.
 */
export const EQUATION_COMMIT_DEBOUNCE_MS = 200;
