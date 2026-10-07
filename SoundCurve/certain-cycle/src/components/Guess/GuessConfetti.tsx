import { useEffect, useMemo, useState } from 'react';

/**
 * A short celebratory particle burst.
 *
 * Deliberately DOM + CSS rather than canvas: it is a dozen divs that live for
 * under a second, and adding a second animation loop to a page that already has
 * one for the reveal graph would be wasteful.
 *
 * Accessibility: the burst is `aria-hidden` (it conveys nothing that the
 * feedback line does not already announce) and is skipped entirely under
 * `prefers-reduced-motion`, where a screen of flying shards is exactly the
 * kind of motion that setting exists to suppress.
 */

interface Particle {
  id: number;
  /** Angle in degrees, measured from straight up. */
  angle: number;
  distance: number;
  size: number;
  color: string;
  delay: number;
}

/** Deterministic PRNG so a re-render never reshuffles a burst already on screen. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = ['#E8B33C', '#4FC3F7', '#B388FF', '#FF8A65', '#5DD6A0', '#FF7BA9'];

/**
 * Keyframes for the burst, declared once here rather than per particle.
 *
 * The travel distance arrives as `--tx` / `--ty` (precomputed polar-to-cartesian
 * at the call site), so every shard shares one animation and differs only in its
 * custom properties.
 */
const CONFETTI_CSS = `
@keyframes guess-confetti-fly {
  0%   { transform: translate3d(0, 0, 0) scale(1) rotate(0deg); opacity: 1; }
  70%  { opacity: 1; }
  100% { transform: translate3d(var(--tx), calc(var(--ty) + 60px), 0) scale(0.4) rotate(320deg); opacity: 0; }
}
.guess-confetti-particle {
  border-radius: 2px;
  will-change: transform, opacity;
  animation: guess-confetti-fly 1.15s cubic-bezier(0.2, 0.7, 0.4, 1) forwards;
}
@media (prefers-reduced-motion: reduce) {
  .guess-confetti-particle { animation: none; }
}
`;

export default function GuessConfetti({
  /** Bumping this re-runs the burst, so each correct answer gets its own. */
  burstKey,
  count = 18,
  /*
   * Palette override, added for the end-game tiers.
   *
   * The default palette is the general-purpose one used for a correct answer. The
   * celebration tiers need their own colours — gold for a perfect score, cool
   * blue-white for a middling one — because "confetti" means different things in
   * those contexts, and a rainbow would undercut both. Defaults to the shared
   * palette when not supplied, so per-answer bursts are unchanged.
   */
  colors,
}: {
  burstKey: number;
  count?: number;
  colors?: string[];
}) {
  const reduced = usePrefersReducedMotion();
  const palette = colors ?? COLORS;
  const particles = useMemo<Particle[]>(() => {
    const rand = mulberry32(burstKey * 2654435761);
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      // Spread across a wide upward fan so it reads as a burst, not a fountain.
      angle: (rand() - 0.5) * 150,
      distance: 90 + rand() * 130,
      size: 5 + rand() * 6,
      color: palette[Math.floor(rand() * palette.length)],
      delay: rand() * 90,
    }));
  }, [burstKey, count, palette]);

  // No animation means nothing to schedule; render nothing at all.
  if (reduced) return null;

  return (
    <>
      {/* Injected once per burst; the keyframes are static so the animation
          restarts because the particle elements are new, not the CSS. */}
      <style>{CONFETTI_CSS}</style>
      <div
        key={burstKey}
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 z-20 h-0 w-0"
      >
      {particles.map((p) => (
          <span
            key={p.id}
            className="guess-confetti-particle absolute"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              // Polar offset converted to cartesian so the shared keyframe only
              // has to animate a fixed distance.
              '--tx': `${Math.sin((p.angle * Math.PI) / 180) * p.distance}px`,
              '--ty': `${-Math.cos((p.angle * Math.PI) / 180) * p.distance}px`,
              animationDelay: `${p.delay}ms`,
            } as React.CSSProperties}
          />
        ))}
      </div>
    </>
  );
}

/** Tracks the reduced-motion preference, reacting to changes live. */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    // State rather than a ref: the initial read happens after the first render,
    // so a ref would leave the first paint with motion still enabled.
    setReduced(query.matches);
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  return reduced;
}