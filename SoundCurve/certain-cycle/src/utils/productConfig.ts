/**
 * MathSonify — centralized product configuration.
 *
 * All launch-phase flags, limits, URLs and entitlement rules live here so
 * the rest of the app never scatters product logic across components.
 *
 * This file is intentionally synchronous and environment-driven so it can be
 * imported by both Astro pages (build time) and React islands (runtime).
 */

/* ───────────────────────── launch phase ─────────────────────────── */

/** Current SoundLab release phase. One of the values below. */
export type SoundLabPhase =
  | 'teaser'
  | 'early-access'
  | 'limited-free'
  | 'premium'
  | 'full-release';

/**
 * SoundLab phase. Change this single value to move the whole product between
 * launch phases without touching page markup or component logic.
 *
 * Teaser        → SoundLab shows previews + "get early access" CTA.
 * Early-access  → Selected users can play; banner notes limited access.
 * Limited-free  → Free users get a configurable daily play allowance.
 * Premium       → SoundLab is premium-only; free users see a gate.
 * Full-release  → Everyone can browse; premium unlocks extras.
 */
export const SOUNDLAB_PHASE: SoundLabPhase = (
  (typeof process !== 'undefined' && process.env?.SOUNDLAB_PHASE) ||
  (typeof import.meta !== 'undefined' && import.meta.env?.SOUNDLAB_PHASE) ||
  'early-access'
) as SoundLabPhase;

/** Free-user daily play allowance when phase is 'limited-free'. */
export const SOUNDLAB_FREE_PLAY_LIMIT = (
  typeof process !== 'undefined' && process.env?.SOUNDLAB_FREE_PLAY_LIMIT
    ? Number(process.env.SOUNDLAB_FREE_PLAY_LIMIT)
    : typeof import.meta !== 'undefined' && import.meta.env?.SOUNDLAB_FREE_PLAY_LIMIT
      ? Number(import.meta.env.SOUNDLAB_FREE_PLAY_LIMIT)
      : 3
) as number;

/** Default: 3 plays per day for free users during limited-free phase. */

/* ───────────────────── premium / entitlement ────────────────────── */

/** Whether any premium product exists at all. */
export const PREMIUM_ENABLED = (
  typeof process !== 'undefined' && process.env?.PREMIUM_ENABLED
    ? process.env.PREMIUM_ENABLED === 'true'
    : typeof import.meta !== 'undefined' && import.meta.env?.PREMIUM_ENABLED
      ? import.meta.env.PREMIUM_ENABLED === 'true'
      : true
) as boolean;

/**
 * Music Lab is currently the flagship premium experience.
 * When false, Music Lab shows the premium gate to everyone.
 */
export const MUSIC_LAB_PREMIUM = (
  typeof process !== 'undefined' && process.env?.MUSIC_LAB_PREMIUM
    ? process.env.MUSIC_LAB_PREMIUM === 'true'
    : typeof import.meta !== 'undefined' && import.meta.env?.MUSIC_LAB_PREMIUM
      ? import.meta.env.MUSIC_LAB_PREMIUM === 'true'
      : true
) as boolean;

/**
 * SoundLab access level for free users. Only meaningful when
 * SOUNDLAB_PHASE is 'limited-free' or 'premium'.
 */
export const SOUNDLAB_FREE_ACCESS = (
  typeof process !== 'undefined' && process.env?.SOUNDLAB_FREE_ACCESS
    ? process.env.SOUNDLAB_FREE_ACCESS
    : typeof import.meta !== 'undefined' && import.meta.env?.SOUNDLAB_FREE_ACCESS
      ? import.meta.env.SOUNDLAB_FREE_ACCESS
      : 'limited' // 'none' | 'limited' | 'full'
) as 'none' | 'limited' | 'full';

/* ───────────────────────── Stripe (client-side) ─────────────────── */

/**
 * Stripe publishable key — safe to expose to the browser.
 * Set `STRIPE_PUBLISHABLE_KEY` in your environment.
 *
 * The secret key NEVER lives in this file or anywhere client-side.
 */
export const STRIPE_PUBLISHABLE_KEY = (
  typeof import.meta !== 'undefined' && import.meta.env?.STRIPE_PUBLISHABLE_KEY
    ? import.meta.env.STRIPE_PUBLISHABLE_KEY
    : ''
) as string;

/**
 * Stripe Price ID for the Premium subscription/checkout.
 * Set `STRIPE_PRICE_ID_PREMIUM` in your environment.
 */
export const STRIPE_PRICE_ID_PREMIUM = (
  typeof import.meta !== 'undefined' && import.meta.env?.STRIPE_PRICE_ID_PREMIUM
    ? import.meta.env.STRIPE_PRICE_ID_PREMIUM
    : ''
) as string;

/**
 * URL to return to after Stripe Checkout completes.
 * In practice this is the pricing page with a success param.
 */
export function stripeCheckoutReturnUrl(): string {
  if (typeof window === 'undefined') return '/pricing';
  const base = window.location.origin;
  return `${base}/pricing?success=1`;
}

/* ───────────────────── external support links ───────────────────── */

/** Buy Me a Coffee profile URL — set to your real profile before launch. */
export const BUY_ME_A_COFFEE_URL = (
  typeof process !== 'undefined' && process.env?.BUY_ME_A_COFFEE_URL
    ? process.env.BUY_ME_A_COFFEE_URL
    : typeof import.meta !== 'undefined' && import.meta.env?.BUY_ME_A_COFFEE_URL
      ? import.meta.env.BUY_ME_A_COFFEE_URL
      : 'https://www.buymeacoffee.com/mathsonify'
) as string;

/** Public contact email — the single source of truth for MathSonify contact info. */
export const CONTACT_EMAIL = (
  typeof process !== 'undefined' && process.env?.CONTACT_EMAIL
    ? process.env.CONTACT_EMAIL
    : 'hello@mathsonify.com'
) as string;

/** Href-safe version of the contact email for mailto: links. */
export function contactHref(): string {
  return `mailto:${CONTACT_EMAIL}`;
}

/** Href-safe version of the email for text display. */
export function contactDisplay(): string {
  return CONTACT_EMAIL;
}

/** Stripe Payment Link for Premium checkout — pre-generated URL, no server needed.
 * Create one at https://dashboard.stripe.com/payments/payment-links and paste it here.
 * Set `STRIPE_PAYMENT_LINK` in your environment.
 */
export const STRIPE_PAYMENT_LINK = (
  typeof process !== 'undefined' && process.env?.STRIPE_PAYMENT_LINK
    ? process.env.STRIPE_PAYMENT_LINK
    : typeof import.meta !== 'undefined' && import.meta.env?.STRIPE_PAYMENT_LINK
      ? import.meta.env.STRIPE_PAYMENT_LINK
      : ''
) as string;

/** True when a Stripe payment link is configured and premium is enabled. */
export function premiumCheckoutReady(): boolean {
  return PREMIUM_ENABLED && STRIPE_PAYMENT_LINK.startsWith('https');
}

/** Is SoundLab currently in a preview-only phase? */
export function isSoundLabTeaser(phase?: SoundLabPhase): boolean {
  return (phase ?? SOUNDLAB_PHASE) === 'teaser';
}

/** Can a free user play any SoundLab composition right now? */
export function soundLabFreePlaysAllowed(phase?: SoundLabPhase): boolean {
  const p = phase ?? SOUNDLAB_PHASE;
  return p === 'early-access' || p === 'limited-free' || p === 'full-release';
}
