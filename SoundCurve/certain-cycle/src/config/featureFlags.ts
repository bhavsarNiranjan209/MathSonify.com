/**
 * MathSonify — centralized feature release control.
 *
 * This is the SINGLE SOURCE OF TRUTH for which features are publicly released.
 * SoundLab, Draw and Music Lab are all currently unreleased: their code,
 * routes, audio research and data stay in the repository, but nothing about
 * them is visible to, or loaded by, a visitor.
 *
 * To release a feature, change exactly one value here and rebuild:
 *
 *   soundLab: true   ->  /soundlab  + its navbar entry go live
 *   draw:     true   ->  /draw      + its navbar entry go live
 *   musicLab: true   ->  /music-lab + its navbar entry go live
 *
 * Nothing else needs to change. The route guards, the navbar and the SEO
 * meta all read from here, so release logic is never duplicated.
 *
 * Each flag can be overridden at build time with an environment variable
 * (SOUNDLAB_ENABLED / DRAW_ENABLED / MUSICALAB_ENABLED = "true"), which is how
 * a preview deploy can enable one feature without editing this file.
 *
 * @see docs/feature-flags.md for the release process
 */

/** The three unreleased experiences, keyed by their public id. */
export type FeatureId = 'soundLab' | 'draw' | 'musicLab';

/** Read a build-time override, if one was provided. */
function fromEnv(name: string): boolean {
  if (typeof process === 'undefined') return false;
  return process.env[name] === 'true';
}

export const FEATURE_FLAGS: Record<FeatureId, boolean> = {
  /** SoundLab — proprietary multi-track equation compositions. */
  soundLab: fromEnv('SOUNDLAB_ENABLED'),
  /** Draw — sketch-to-music experience. */
  draw: fromEnv('DRAW_ENABLED'),
  /** Music Lab — mathematical instrument creation studio. */
  musicLab: fromEnv('MUSICALAB_ENABLED'),
};

/** Public route for each feature. Used by the route guard. */
export const FEATURE_ROUTES: Record<FeatureId, string> = {
  soundLab: '/soundlab',
  draw: '/draw',
  musicLab: '/music-lab',
};

/** A feature is live only when its flag is explicitly true. */
export function isFeatureEnabled(feature: FeatureId): boolean {
  return FEATURE_FLAGS[feature] === true;
}

/**
 * Development-mode detection.
 *
 * NOTE: this deliberately does NOT probe `import.meta.env`. An earlier version
 * tried, and guarded it with `typeof import !== 'undefined'` — but `import` is a
 * reserved word, so that is a hard parse error, not a runtime branch. If a
 * caller ever needs dev-mode detection again, read `import.meta.env.DEV`
 * directly (it is a Vite constant replaced at build time) rather than
 * feature-detecting the keyword.
 *
 * Nothing in the app currently calls this; the release guards deliberately do
 * NOT branch on dev mode, so a set of `true` flags behaves identically in
 * development and in production.
 */
export function isDevelopment(): boolean {
  // Node/SSR contexts only; browsers are handled by Vite's build-time constant.
  return typeof process !== 'undefined' && process.env.NODE_ENV === 'development';
}

/** Returns the navbar items that should be rendered for a visitor. */
export function getVisibleNavLinks<T extends { feature: FeatureId | null }>(
  allLinks: T[],
): T[] {
  return allLinks.filter((link) => link.feature === null || isFeatureEnabled(link.feature));
}

/** The feature that owns a pathname, or null when the route is not gated. */
export function featureForRoute(pathname: string): FeatureId | null {
  const normalized = pathname.replace(/\/$/, '') || '/';
  return (Object.keys(FEATURE_ROUTES) as FeatureId[])
    .find((id) => FEATURE_ROUTES[id] === normalized) ?? null;
}

/**
 * Whether a route should render its "being built" state instead of the real
 * application. Accepts either a feature id or a raw pathname.
 */
export function isRouteDisabled(route: FeatureId | string): boolean {
  const feature = (Object.keys(FEATURE_ROUTES) as FeatureId[])
    .find((id) => id === route || FEATURE_ROUTES[id] === route);
  if (!feature) return false;
  return !isFeatureEnabled(feature);
}
