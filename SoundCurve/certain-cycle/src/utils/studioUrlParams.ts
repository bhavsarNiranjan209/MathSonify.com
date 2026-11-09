/**
 * Parsing for the Studio's shared-link query params.
 *
 * A shared link carries the graph domain as minX/maxX (see ShareModal).
 * Several scientist equations start at exactly 0 (e.g. Poisson, 0..6.283),
 * so a bound of 0 is a real value, not "missing". The old code used
 * `parseFloat(raw) || fallback`, which treats 0 as missing and silently
 * rewrote the domain to -6.28..6.28. Parse with an explicit NaN check
 * instead, so 0 survives and only garbage falls back.
 */

/**
 * Parse one numeric bound from a URL param.
 * Returns null when the param is absent, so the caller keeps its default;
 * returns the fallback only when the param is present but not a number.
 */
export function parseBoundParam(raw: string | null, fallback: number): number | null {
  if (raw === null || raw === '') return null;
  const parsed = parseFloat(raw);
  return Number.isNaN(parsed) ? fallback : parsed;
}
