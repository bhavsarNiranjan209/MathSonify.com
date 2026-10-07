/**
 * End-of-game celebration tiers — the score bands, their musical stings and
 * their visual treatment.
 *
 * PORTED LITERALLY from the reference implementation. The note frequencies,
 * gaps, hold times, volumes, wave types, particle counts, colours and glow
 * timing are all reproduced exactly as written; none of it is tuned here.
 *
 * WHAT CHANGED FROM THE REFERENCE, and why:
 *  - it was driven by three demo buttons; here the score comes from the real
 *    end-of-game total and fires once when the end screen mounts.
 *  - its oscillators ran on a bare AudioContext wired straight to the
 *    destination. Here they run through the site's own `audioEngine` context
 *    and master gain, so a celebration cannot out-volume the site, ignore the
 *    user's volume setting, or leave a node running behind `audioEngine.stop()`.
 *    Every note still schedules its own `stop()`, so nothing is orphaned.
 *
 * The score bands are unchanged: perfect at 9-10, mid at 3-8, low at 0-2.
 */
import { audioEngine } from './audioEngine';

export type CelebrationTier = 'perfect' | 'mid' | 'low';

/** Notes and envelope for one tier, straight from the reference. */
interface Sting {
  /** Frequencies in Hz, played in order. */
  notes: number[];
  /** Seconds between the start of consecutive notes. */
  gap: number;
  /** Seconds each note is held before its release ramp completes. */
  hold: number;
  /** Peak gain for the tier. */
  volume: number;
  wave: OscillatorType;
}

const STINGS: Record<CelebrationTier, Sting> = {
  // PERFECT — bright major arpeggio climbing to a held top note.
  perfect: { notes: [523.25, 659.25, 783.99, 1046.5], gap: 0.14, hold: 0.5, volume: 0.16, wave: 'sine' },
  // MID — simple neutral rising three-note phrase.
  mid: { notes: [440, 523.25, 587.33], gap: 0.17, hold: 0.35, volume: 0.12, wave: 'sine' },
  // LOW — warm, soft, gently descending. Deliberately triangle and deliberately
  // two notes: this band must never read as punishment, so it is quieter,
  // slower, and softer than the others rather than a sad one.
  low: { notes: [392, 329.63], gap: 0.26, hold: 0.55, volume: 0.1, wave: 'triangle' },
};

/** Particle counts and colours per tier, straight from the reference. */
export const TIER_BURSTS: Record<CelebrationTier, { count: number; colors: string[] }[]> = {
  perfect: [
    { count: 70, colors: ['#F5A623', '#fff', '#FFD27A'] },
    { count: 40, colors: ['#F5A623', '#fff'] },
    { count: 40, colors: ['#F5A623', '#fff'] },
  ],
  mid: [{ count: 22, colors: ['#5AA9E0', '#fff'] }],
  // No confetti at all for the low band: encouragement, not consolation.
  low: [],
};

/** Delay in ms before each burst fires, so the reference's stagger is kept. */
export const TIER_BURST_DELAYS = [0, 220, 320];

/** Glow colour and pulse count per tier. */
export const TIER_GLOW: Record<CelebrationTier, { color: string; cycles: number }> = {
  perfect: { color: 'rgba(245,166,35,.55)', cycles: 2 },
  mid: { color: 'rgba(90,169,224,.4)', cycles: 1 },
  low: { color: 'rgba(167,171,176,.35)', cycles: 2 },
};

/**
 * Which band a score falls into. `total` is the round count, so the bands stay
 * correct if the game is ever shortened.
 */
export function tierFor(score: number, total: number): CelebrationTier {
  const ratio = total > 0 ? score / total : 0;
  // The reference hard-codes its thresholds against a game of ten. Scaled, they
  // are 90% and 30% — the same two bands for any length.
  if (ratio >= 0.9) return 'perfect';
  if (ratio >= 0.3) return 'mid';
  return 'low';
}

/**
 * Play a tier's sting.
 *
 * A no-op without an AudioContext, which is the case during SSR and in any
 * browser that has not yet seen a user gesture. End of game is always preceded
 * by a round of play, so in practice the context exists by the time this runs —
 * but a missing context must not throw inside a mount effect.
 */
export function playTierSting(tier: CelebrationTier): void {
  const ctx = audioEngine.getAudioContext();
  const destination = audioEngine.getMasterGain();
  if (!ctx || !destination) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const sting = STINGS[tier];
  const t = ctx.currentTime;

  sting.notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = sting.wave;

    const start = t + i * sting.gap;
    osc.frequency.setValueAtTime(freq, start);
    // Exponential ramps cannot touch zero, hence 0.0001 rather than 0.
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(sting.volume, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + sting.hold);

    osc.connect(gain).connect(destination);
    osc.start(start);
    osc.stop(start + sting.hold + 0.05);
  });
}