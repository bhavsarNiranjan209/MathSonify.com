/**
 * Blind / accessibility mode: a spoken and written description of the curve's
 * shape.
 *
 * The wording comes entirely from `curveDescription`, which measures the actual
 * sample points — there is no AI generation here and the component makes no
 * claims of its own. Samples come from `resolveActiveCurve`, the same single
 * source of truth the plot and the audio use, so this can never describe a
 * different curve from the one on screen.
 *
 * The text is always rendered (not speech-only) so it works with the Web Speech
 * API switched off, unavailable, or simply muted — and so screen readers can
 * reach it without triggering audio.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStudioStore } from '../store/studioStore';
import { resolveActiveCurve } from '../utils/activeCurve';
import { describeCurve } from '../utils/curveDescription';

export default function CurveDescriber() {
  const enabled = useStudioStore((s) => s.curveDescriber);
  const setEnabled = useStudioStore((s) => s.setCurveDescriber);
  const equation = useStudioStore((s) => s.equation);
  const minX = useStudioStore((s) => s.minX);
  const maxX = useStudioStore((s) => s.maxX);
  const isCustomCurve = useStudioStore((s) => s.isCustomCurve);
  const splineControlPoints = useStudioStore((s) => s.splineControlPoints);

  const [speaking, setSpeaking] = useState(false);
  const [speechFailed, setSpeechFailed] = useState(false);

  // Same resolver the visualizer and audio engine use. Returns null rather than
  // throwing, so a half-typed equation just means "nothing to describe yet".
  const description = useMemo(() => {
    try {
      const { points } = resolveActiveCurve({ equation, minX, maxX, isCustomCurve, splineControlPoints });
      return describeCurve(points, isCustomCurve ? undefined : equation);
    } catch {
      return null;
    }
  }, [equation, minX, maxX, isCustomCurve, splineControlPoints]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setSpeaking(false);
  }, []);

  const speak = useCallback(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !description) {
      setSpeechFailed(true);
      return;
    }
    const synth = window.speechSynthesis;
    // Cancel anything queued first, otherwise rapid clicks stack up utterances.
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(description.text);
    utterance.rate = 1;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => {
      setSpeaking(false);
      setSpeechFailed(true);
    };
    synth.speak(utterance);
    setSpeaking(true);
    setSpeechFailed(false);
  }, [description]);

  // Never leave speech running when the panel unmounts or the curve changes.
  useEffect(() => stopSpeaking, [stopSpeaking, description]);

  if (!enabled) return null;

  return (
    <section
      className="p-3 rounded-md bg-sc-surface border border-sc-line/15 space-y-2"
      aria-labelledby="curve-description-heading"
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id="curve-description-heading" className="text-[10px] uppercase tracking-wider text-sc-accent">
          Curve description
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={speaking ? stopSpeaking : speak}
            disabled={!description}
            aria-pressed={speaking}
            className="px-2 py-1 rounded text-[10px] border border-sc-line/25 text-sc-text-soft hover:border-sc-accent disabled:opacity-40 min-h-[32px]"
          >
            {speaking ? 'Stop' : 'Speak'}
          </button>
          <button
            type="button"
            onClick={() => setEnabled(false)}
            className="px-2 py-1 rounded text-[10px] text-sc-text-faint hover:text-sc-accent min-h-[32px]"
            aria-label="Hide curve description"
          >
            Hide
          </button>
        </div>
      </div>

      {description ? (
        // Polite, because it changes only when the equation changes — not per frame.
        <p className="text-xs text-sc-text-soft leading-relaxed" aria-live="polite">
          {description.text}
        </p>
      ) : (
        <p className="text-xs text-sc-text-faint">No valid curve to describe yet.</p>
      )}

      {speechFailed && (
        <p className="text-[10px] text-sc-text-faint">
          Speech is unavailable in this browser — the description above is still readable.
        </p>
      )}
    </section>
  );
}
