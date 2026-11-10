/**
 * EquationPlayerCard — a working "equation player" pill (v28).
 *
 * Looks like the owner's reference: a wide rounded card with the equation
 * in Instrument Serif italic on the left, a sine waveform in the middle,
 * and a round play/pause button on the right. It is not a picture — the
 * button really plays: tap play and the equation is sonified for
 * `duration` seconds (default 5), then it stops by itself. Tap again
 * while it plays to pause (stop) it. The button shows a pause icon while
 * playing and a play triangle when stopped.
 *
 * The wave is alive while it plays: it draws itself left-to-right as the
 * sound plays (a progress-driven stroke reveal), with a small playhead
 * dot riding the curve, and it is fully drawn again when the 5 seconds
 * are up. When paused mid-play the wave freezes where it stopped.
 *
 * It uses the same path as the Studio's Space key: `resolveActiveCurve`
 * for the points, then `audioEngine.playPoints` with the Studio's default
 * voice (sine, frequency mode, 220–750 Hz). The `onFinish` callback flips
 * the button back to play when the 5 seconds are up, so the card never
 * gets stuck in a "playing" state.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { audioEngine } from '../utils/audioEngine';
import { resolveActiveCurve } from '../utils/activeCurve';
import { sineWavePath, sineWavePoint } from '../utils/equationWave';

/** The card's fixed voice: the Studio's defaults, so sin(x) sounds the same here as there. */
const CARD_MIN_X = -6.28;
const CARD_MAX_X = 6.28;
const CARD_MIN_FREQ = 220;
const CARD_MAX_FREQ = 750;
const CARD_VOLUME = 0.7;
/** The wave box, in SVG units. `pathLength={1}` normalises the dash math. */
const WAVE_W = 220;
const WAVE_H = 64;
const WAVE_CYCLES = 3;

export interface EquationPlayerCardProps {
  /** The equation to play, e.g. 'sin(x)'. */
  equation?: string;
  /** How long it plays, seconds. Default 5. */
  duration?: number;
  className?: string;
}

export default function EquationPlayerCard({
  equation = 'sin(x)',
  duration = 5,
  className = '',
}: EquationPlayerCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  /** 0..1 while a play is running (or frozen where it paused); 0 at rest. */
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const playingRef = useRef(false);

  const stop = useCallback(() => {
    audioEngine.stop();
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  // Never leave sound running after the card unmounts (navigation away).
  useEffect(() => stop, [stop]);

  const toggle = useCallback(async () => {
    if (playingRef.current) {
      // Pause: stop the sound, but keep the progress so the wave freezes
      // where it stopped instead of snapping back to a full wave.
      stop();
      return;
    }
    setError(null);
    setProgress(0);
    try {
      const curve = resolveActiveCurve({
        equation,
        minX: CARD_MIN_X,
        maxX: CARD_MAX_X,
        isCustomCurve: false,
        splineControlPoints: [],
      });
      playingRef.current = true;
      setIsPlaying(true);
      await audioEngine.playPoints(
        curve.points,
        CARD_MIN_X,
        CARD_MAX_X,
        CARD_MIN_FREQ,
        CARD_MAX_FREQ,
        duration,
        CARD_VOLUME,
        'sine',
        'frequency',
        false,
        'major',
        // The wave draws itself as the sound plays.
        (prog) => {
          setProgress(Math.min(1, Math.max(0, prog)));
        },
        () => {
          // The 5 seconds are up — back to the play triangle and a full wave.
          playingRef.current = false;
          setIsPlaying(false);
          setProgress(0);
        },
      );
    } catch (err) {
      console.error(err);
      playingRef.current = false;
      setIsPlaying(false);
      setProgress(0);
      setError('Could not play this equation.');
    }
  }, [equation, duration, stop]);

  // While a play is running (or frozen mid-pause) the wave is revealed only
  // up to the progress; at rest it is drawn in full. `pathLength={1}` makes
  // the dash math unit-free.
  const waveDrawn = isPlaying || progress > 0;
  const head = sineWavePoint(WAVE_W, WAVE_H, WAVE_CYCLES, Math.min(1, Math.max(0, progress)));

  return (
    <div
      className={`flex items-center gap-4 sm:gap-6 rounded-2xl border border-white/25 bg-black/40 px-5 py-4 shadow-[0_0_32px_-8px_rgba(255,255,255,0.35)] sm:px-8 sm:py-5 ${className}`}
      role="group"
      aria-label={`Play ${equation}`}
    >
      <span
        className="shrink-0 font-serif italic text-[26px] leading-none text-white sm:text-[32px]"
        style={{ fontFamily: "'Instrument Serif', Georgia, serif" }}
      >
        y = {equation}
      </span>
      <span className="hidden h-10 w-px bg-white/20 sm:block" aria-hidden="true" />
      <svg
        viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
        className="h-10 min-w-0 flex-1 text-white/90 sm:h-12"
        fill="none"
        aria-hidden="true"
      >
        <path
          d={sineWavePath(WAVE_W, WAVE_H, WAVE_CYCLES)}
          pathLength={1}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={waveDrawn ? 1 : undefined}
          strokeDashoffset={waveDrawn ? 1 - progress : undefined}
        />
        {progress > 0 && (
          <circle cx={head.x} cy={head.y} r="4" fill="#fff" stroke="#000" strokeWidth="1.5" />
        )}
      </svg>
      <button
        type="button"
        onClick={toggle}
        aria-label={isPlaying ? `Pause ${equation}` : `Play ${equation}`}
        aria-pressed={isPlaying}
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-black transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:h-14 sm:w-14"
      >
        {isPlaying ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" aria-hidden="true">
            <rect x="6" y="5" width="4" height="14" rx="1" />
            <rect x="14" y="5" width="4" height="14" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="ml-0.5 h-5 w-5 sm:h-6 sm:w-6" fill="currentColor" aria-hidden="true">
            <path d="M8 5.5v13a1 1 0 0 0 1.52.86l10.5-6.5a1 1 0 0 0 0-1.72L9.52 4.64A1 1 0 0 0 8 5.5Z" />
          </svg>
        )}
      </button>
      {error && (
        <span className="sr-only" role="status">
          {error}
        </span>
      )}
    </div>
  );
}
