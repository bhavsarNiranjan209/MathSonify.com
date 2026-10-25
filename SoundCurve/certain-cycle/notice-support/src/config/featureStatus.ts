/**
 * featureStatus.ts — the ONE place that decides what a page shows.
 *   'live'         the normal page
 *   'coming-soon'  the Notice page (feature not built yet) + email sign-up for that feature
 *   'maintenance'  the Notice page in maintenance mode + optional email sign-up
 * NOTHING ever switches to 'maintenance' by itself. It happens only when YOU change a line here and redeploy.
 */
export type Status = 'live' | 'coming-soon' | 'maintenance';
export interface FeatureConfig { status: Status; maintenance?: { note?: string; eta?: string; collectEmail?: boolean } }

export const FEATURES: Record<string, FeatureConfig> = {
  soundlab: { status: 'coming-soon' },
  'music-lab': { status: 'coming-soon' },
  // To take any page down for a while, change e.g.:
  //   guess: { status: 'maintenance', maintenance: { note: 'We are fixing a bug.', eta: 'about 2 hours', collectEmail: false } },
};
export const statusOf = (page: string): Status => FEATURES[page]?.status ?? 'live';

/** Email sign-up stays OFF until the provider adapter + env vars are set and tested. */
export const EMAIL_SIGNUP_ENABLED = false;
