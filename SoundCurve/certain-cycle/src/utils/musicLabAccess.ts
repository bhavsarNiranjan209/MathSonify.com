/**
 * Premium entitlement seam.
 *
 * This is the single place where MathSonify decides whether a feature is
 * available. Today there is no authentication or billing system, so the
 * defaults grant access. When Stripe + accounts are wired in, this module is
 * the only thing that needs to change.
 *
 * Frontend checks here are UX hints. Real entitlement must be verified
 * server-side where billing actually matters (exports, premium audio, etc.).
 */

import {
  PREMIUM_ENABLED,
  MUSIC_LAB_PREMIUM,
  SOUNDLAB_FREE_ACCESS,
  SOUNDLAB_FREE_PLAY_LIMIT,
  isSoundLabTeaser,
  SOUNDLAB_PHASE,
} from './productConfig';

/* ─────────────────────── Music Lab ──────────────────────────────── */

/** Is Music Lab unlocked for the current visitor? */
export function isMusicLabAccessible(): boolean {
  if (!PREMIUM_ENABLED || !MUSIC_LAB_PREMIUM) return true;
  // No auth system yet → grant access so the studio is usable.
  // Replace with `isPremiumUser()` once accounts exist.
  return true;
}

/**
 * Placeholder for future account-based check.
 *
 * When authentication exists, replace the body with something like:
 *   return getSession()?.user?.isPremium === true;
 */
export function isPremiumUser(): boolean {
  // No auth system yet.
  return true;
}

/* ─────────────────────── SoundLab ──────────────────────────────── */

/** SoundLab launch phase. Drives CTA + banner + access logic. */
export function soundLabPhase(): typeof SOUNDLAB_PHASE {
  return SOUNDLAB_PHASE;
}

/** How many compositions a free user can play per day (0 = no access). */
export function soundLabFreePlayLimit(): number {
  return SOUNDLAB_FREE_PLAY_LIMIT;
}

/** What free users can do with SoundLab right now. */
export function soundLabFreeAccessLevel(): 'none' | 'limited' | 'full' {
  return SOUNDLAB_FREE_ACCESS;
}

/** Is SoundLab currently showing a teaser / hype page? */
export function isSoundLabTeaserPhase(): boolean {
  return isSoundLabTeaser();
}

/**
 * For 'limited-free' phase: how many plays remain for the current visitor.
 *
 * This is a frontend estimate. Real accounting happens server-side when a
 * billing system exists. Today it returns the full allowance so the UI can
 * demonstrate the concept.
 */
export function soundLabRemainingPlays(): number {
  if (SOUNDLAB_PHASE !== 'limited-free') return 0;
  // No server-side counter yet — show the full allowance as a placeholder.
  return SOUNDLAB_FREE_PLAY_LIMIT;
}

/** Backward-compatible alias used by MusicLab.tsx. */
export const isMusicLabPremium = isMusicLabAccessible;
