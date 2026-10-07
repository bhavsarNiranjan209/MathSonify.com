/**
 * The one place an equation's display label is defined.
 *
 * Three surfaces put the equation on screen: the user-mode top pill, the intro
 * card subtitle, and the scientist-mode ticker. They all used to print the bare
 * formula, which left a floating `sin(x)` with nothing saying what it was — and
 * in the ticker the equation sat in a row of metadata (`name · field · sin(x)`)
 * where it read like just another value rather than the thing being plotted.
 *
 * They all call `equationLabel`, so the prefix cannot drift out of sync: change
 * it once and all three change together.
 *
 * Deliberately free of DOM and i18n: this is baked into video frames by the
 * canvas compositor, which has no access to the React translation hook. The
 * surrounding export strings ("Made with MathSonify.com", "Turn math into
 * sound") are likewise fixed English in `videoScene`.
 */

/** The prefix, exported so tests and callers can assert against one value. */
export const EQUATION_LABEL_PREFIX = 'Equation:';

/**
 * Formats an equation for display: `Equation: sin(x)`.
 *
 * A blank equation yields the bare prefix rather than a dangling `Equation:`
 * with nothing after it — the caller always gets a non-empty string, so no
 * surface has to special-case the empty label.
 */
export function equationLabel(equation: string): string {
  const trimmed = equation.trim();
  return trimmed ? `${EQUATION_LABEL_PREFIX} ${trimmed}` : EQUATION_LABEL_PREFIX;
}