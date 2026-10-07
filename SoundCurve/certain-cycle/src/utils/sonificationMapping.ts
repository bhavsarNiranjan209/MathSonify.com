/**
 * The one mapping from "curve height" to "what you hear".
 *
 * Learn mode and stereo panning both need to describe what the audio engine is
 * currently doing. The obvious implementation — each recomputing a pitch or a
 * pan value from the sample point — is how the readout and the sound drift
 * apart: someone tweaks a synth formula and the number on screen silently
 * becomes a lie.
 *
 * So the mappings live here, as pure functions, and the engine uses the same
 * ones the UI reads. There is exactly one formula for "what Hz is this sample
 * playing at", and it is the one the oscillator is actually given.
 *
 * No Web Audio here on purpose: these are pure maths and can be unit-tested.
 */
import { normalize, quantizeToScale, type ScaleKey } from './equationParser';

export type SonificationMode = 'frequency' | 'note' | 'rhythm' | 'chord';

/**
 * What the engine is doing with a given y-value.
 *
 * Modelled as a discriminated union rather than a bare number because the four
 * modes genuinely map y to different things, and pretending otherwise would mean
 * Learn mode showing a fabricated "Hz" for a mode that has no pitch. Showing
 * `{ kind: 'amplitude' }` lets the UI say "loudness 62%" — which is true —
 * instead of inventing a frequency that is not being played.
 */
export type PlaybackPitch =
  /** A literal oscillator frequency. */
  | { kind: 'hz'; hz: number }
  /** A frequency snapped to a musical scale. */
  | { kind: 'scaled'; hz: number }
  /** No pitch in this mode — y drives loudness/triggering instead. */
  | { kind: 'amplitude'; value: number };

/** Range the note mode sweeps before quantisation. */
export const NOTE_MIN_HZ = 220;
export const NOTE_MAX_HZ = 880;

/**
 * The pitch (or amplitude) produced by a sample at height `y`.
 *
 * Mirrors the per-mode formulas in `audioEngine`'s synth methods:
 *   frequency -> normalize(y, minY, maxY, minFreq, maxFreq)
 *   note      -> normalize(y, minY, maxY, 220, 880), quantised to the scale
 *   rhythm    -> normalize(y, minY, maxY, 0, 1)      (trigger level)
 *   chord     -> normalize(y, minY, maxY, 0, 0.75)   (voicing level)
 */
export function pitchAt(
  mode: SonificationMode,
  y: number,
  minY: number,
  maxY: number,
  minFreq: number,
  maxFreq: number,
  scale: ScaleKey = 'major',
): PlaybackPitch {
  switch (mode) {
    case 'frequency':
      return { kind: 'hz', hz: normalize(y, minY, maxY, minFreq, maxFreq) };
    case 'note': {
      const raw = normalize(y, minY, maxY, NOTE_MIN_HZ, NOTE_MAX_HZ);
      return { kind: 'scaled', hz: quantizeToScale(raw, scale) };
    }
    case 'rhythm':
      return { kind: 'amplitude', value: normalize(y, minY, maxY, 0, 1) };
    case 'chord':
      return { kind: 'amplitude', value: normalize(y, minY, maxY, 0, 0.75) };
  }
}

/**
 * Stereo position for a sample at height `y`: [-1 = hard left, +1 = hard right].
 *
 * Normalised against the curve's own min/max, exactly as pitch is — so a curve
 * sitting entirely above zero still pans across the full stereo image instead
 * of being jammed hard right.
 *
 * Above the middle of its own range pans right, below pans left, which matches
 * the intuition "higher = right" used elsewhere in the interface. `deadzone`
 * keeps samples near the mid-height from jittering between channels, which on
 * headphones reads as a flutter rather than a sweep.
 */
export function panAt(y: number, minY: number, maxY: number, deadzone = 0.04): number {
  const span = maxY - minY;
  // Treat a curve whose vertical range is negligible *relative to its own
  // magnitude* as flat, and park it in the centre. Without this, a curve like
  // y = 5 ± 0.0001 has a technically-positive span, so the lowest sample reads as
  // "hard left" and the panning slams between channels for a variation that is
  // inaudible — the same negligible span the frequency mapping also renders
  // as an unhearable smear. Panning has to stay consistent with that.
  const magnitude = Math.max(Math.abs(minY), Math.abs(maxY), 1);
  if (span <= magnitude * 1e-3) return 0;

  const unit = (y - minY) / span;      // 0..1
  const centred = unit * 2 - 1;        // -1..1, 0 at mid-height
  const offset = Math.abs(centred);
  if (offset <= deadzone) return 0;
  // Rescale past the deadzone so the usable range still reaches full deflection.
  const scaled = (offset - deadzone) / (1 - deadzone);
  return Math.sign(centred) * Math.min(1, scaled);
}