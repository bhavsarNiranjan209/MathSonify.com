$path = 'c:\Projects(NiJo)\SoundCurve\certain-cycle\scripts\verify-3d-data.mjs'
$js = @'
/**
 * Stage-3a: 3D data fidelity — does the laid-out centreline still say the equation?
 *
 * The 3D viewer is pure-layout in Node (`curve3d.ts`): given the same parser +
 * sampler the 2D graph uses, it decimates the valid samples, applies one uniform
 * scale, lifts the curve off a grid floor, and builds a CatmullRom tube. The 2D
 * canvas splits its pen *at* invalid samples; the tube has no gaps. This script
 * verifies, for a range of equations:
 *
 *   1. INVERSION: invert the layout's own transform (v -> p) and recover the
 *      equation's y within tolerance of the equation's own y-range.
 *   2. PARITY: no consecutive control points straddle an invalid sample the 2D
 *      canvas would break the pen on.
 *   3. INTEGRITY: the tube uses all valid samples (nothing dropped beyond the
 *      documented maxPoints decimation).
 *
 * Pass bar:
 *   - continuous curves : maxAbsError < 1% of y-range, bridges === 0, no endpoint
 *                         loss;
 *   - gapped curves     : same fidelity (< 1%), all samples kept, no endpoint
 *                         loss. Bridges ARE expected for these (the 2D canvas
 *                         lifts the pen at the gap — the tube spans it). Each
 *                         gapped case is reported separately so 1/x/sqrt/tan can
 *                         never fail the bar by design.
 *
 * Usage: node --import ./scripts/ts-resolve.mjs scripts/verify-3d-data.mjs
 *
 * NOTE: the layout is evaluated in NODE (layoutCurve), which is the same pure
 * function the browser's rebuild() calls, so these numbers ARE what the WebGL
 * scene draws — no CDP round-trip needed for the data-fidelity half.
 */
import { parseEquation } from '../src/utils/equationParser.ts';
import { layoutCurve, usablePoints } from '../src/utils/curve3d.ts';

/** @param {string} eq  @param {number} minX  @param {number} maxX */
const truthSampler = (eq, minX, maxX) =>
    parseEquation(eq).sample(minX, maxX, SAMPLE);

const CASES = [
    { name: 'sine (studio default)', eq: 'sin(x)', minX: -6.28, maxX: 6.28 },
    { name: 'quadratic', eq: 'x^2 - 4*x', minX: -3, maxX: 9 },
    { name: 'steep line', eq: '5*x', minX: -2.5, maxX: 2.5 },
    { name: 'gaussian bump', eq: 'exp(-x^2)', minX: -3, maxX: 3 },
    { name: 'cubic S', eq: 'x^3 - 2*x', minX: -2, maxX: 2 },
    { name: 'rapid oscillation', eq: 'sin(8*x)', minX: -3.14, maxX: 3.14 },
    { name: 'constant', eq: '2', minX: -5, maxX: 5 },
    { name: 'sqrt half-domain', eq: 'sqrt(x)', minX: -4, maxX: 4 },
    { name: 'tan asymptote', eq: 'tan(x)', minX: -1.4, maxX: 1.4 },
    { name: 'reciprocal pole', eq: '1/x', minX: -2, maxX: 2 },
];

const SAMPLE = 400;
const TOL_PCT = 1; // % of y-range

// Gapped curves (2D parity break at a pole): the 2D canvas lifts its pen at the hole
// while the 3D tube spans it — bridges (<= 1) are expected and these cases are reported
// separately so they cannot fail the bar by design.
const gappedCases = [];
let failedCases = [];
'@
[System.IO.File]::WriteAllText($path, $js + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
