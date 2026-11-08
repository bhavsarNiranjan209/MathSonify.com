import { lazy, Suspense, useMemo } from 'react';
import { buildDemoCurve } from '../../utils/howItWorksMath';

const Curve3DViewer = lazy(() => import('../Studio/Curve3DViewer'));

/**
 * The How It Works demo, reduced to one thing: the 3D graph itself.
 * No card, no 2D/3D toggle, no controls — the curve of sin(x), full-width,
 * drag to rotate. The viewer is the Studio's own Curve3DViewer, loaded on
 * demand so three.js is not paid for by every reader.
 */
export default function HowItWorksDemo() {
  const curve = useMemo(() => buildDemoCurve('sin(x)'), []);
  return (
    <div className="relative w-full h-[320px] sm:h-[420px] lg:h-[480px]">
      <Suspense
        fallback={
          <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
            <span className="block h-px w-3/5 overflow-hidden bg-sc-line/25">
              <span className="block h-px w-1/3 bg-sc-accent/70 motion-safe:animate-pulse" />
            </span>
          </div>
        }
      >
        <Curve3DViewer points={curve.points} label="sin(x)" touchAction="pan-y" />
      </Suspense>
      <div className="absolute left-2.5 bottom-2 font-mono text-[10px] text-sc-text-faint pointer-events-none">
        drag to rotate
      </div>
    </div>
  );
}
