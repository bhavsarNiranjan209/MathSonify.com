/**
 * TryItCard — the homepage "try it yourself" card (v28, revised).
 *
 * The owner's reference: a wide outer card holding the working equation
 * player pill on the left and, on the right, "Try it yourself." with the
 * line "See how a simple equation can create a unique sound and pattern."
 * and a white "Open Studio →" pill button. The player is the real
 * EquationPlayerCard (it plays sin(x) for 5 seconds, wave animating as
 * it goes); the button is a plain link to /studio.
 */
import EquationPlayerCard from './EquationPlayerCard';

export interface TryItCardProps {
  /** The equation the player plays. Default 'sin(x)'. */
  equation?: string;
  /** How long it plays, seconds. Default 5. */
  duration?: number;
  className?: string;
}

export default function TryItCard({ equation = 'sin(x)', duration = 5, className = '' }: TryItCardProps) {
  return (
    <div
      className={`flex flex-col gap-6 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7 md:flex-row md:items-center md:gap-8 ${className}`}
    >
      <div className="min-w-0 flex-1">
        <EquationPlayerCard equation={equation} duration={duration} />
      </div>
      <span className="hidden w-px self-stretch bg-white/10 md:block" aria-hidden="true" />
      <div className="flex shrink-0 flex-col items-start gap-2.5 md:max-w-[300px]">
        <h2 className="text-[22px] font-bold leading-tight text-white sm:text-2xl">Try it yourself.</h2>
        <p className="text-sm leading-relaxed text-white/60">
          See how a simple equation can create a unique sound and pattern.
        </p>
        <a
          href="/studio"
          className="mt-1 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black transition-transform hover:scale-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          Open Studio
          <span aria-hidden="true">→</span>
        </a>
      </div>
    </div>
  );
}
