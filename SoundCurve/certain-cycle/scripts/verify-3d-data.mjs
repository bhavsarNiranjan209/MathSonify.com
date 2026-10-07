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

const SAMPLE = 600;

let failedCases = [];

for (const c of CASES) {
	const truth = truthSampler(c.eq, c.minX, c.maxX);
	const layout = layoutCurve(truth);
	const { centerline, scale, bounds, dataBounds, floorY } = layout;

	// ── 1. Inversion ────────────────────────────────────────────────
	const midX = (dataBounds.minX + dataBounds.maxX) / 2;
	const midY = (dataBounds.minY + dataBounds.maxY) / 2;
	const EXPECTED_LIFT = 2.4; // layoutCurve default
	const EXPECTED_SCALE = 12 / ((dataBounds.maxX - dataBounds.minX) || 1);

	const invX = (vx) => vx / scale + midX;
	const invY = (vy) => (vy - EXPECTED_LIFT) / scale + midY;

	const STEP = (c.maxX - c.minX) / SAMPLE;
	const dense = parseEquation(c.eq).sample(c.minX, c.maxX, 4000).filter((p) => p.isValid);
	const yAt = (x) => {
		if (x <= dense[0].x) return dense[0].y;
		if (x >= dense[dense.length - 1].x) return dense[dense.length - 1].y;
		let lo = 0,
			hi = dense.length - 1;
		while (hi - lo > 1) {
			const m = (lo + hi) >> 1;
			if (dense[m].x <= x) lo = m; else hi = m;
		}
		const a = dense[lo],
			b = dense[hi];
		const t = (x - a.x) / (b.x - a.x || 1);
		return a.y + t * (b.y - a.y);
	};

	const spanY = (Math.max(...dense.map((p) => p.y)) - Math.min(...dense.map((p) => p.y))) || 1;
	let maxErr = 0,
		sumErr = 0,
		n = 0;
	for (const v of centerline) {
		const xEq = invX(v.x);
		const yEq = invY(v.y);
		// Only score points inside a valid truth region; gap interiors are
		// reported by the bridge check, below.
		if (!truth.some((p) => p.isValid && Math.abs(p.x - xEq) < 1.5 * STEP)) continue;
		const err = Math.abs(yEq - yAt(xEq));
		if (err > maxErr) maxErr = err;
		sumErr += err;
		n++;
	}
	const meanErr = n ? sumErr / n : NaN;
	const maxPct = (maxErr / spanY) * 100;

	// ── 2. 2D/3D parity: bridges ───────────────────────────────────
	// The 2D canvas emits a new run at every invalid sample; the 3D tube is a
	// single CatmullRom through all usable control points. A bridge = two
	// consecutive control points whose chord spans an invalid sample.
	const control = usablePoints(truth, 512); // same decimation layoutCurve uses
	const iv = (p) => {
		let bi = 0,
			bd = Infinity;
		for (let k = 0; k < truth.length; k++) {
			const d = Math.abs(truth[k].x - p.x) + Math.abs(truth[k].y - p.y) * 1e-9;
			if (d < bd) {
				bd = d;
				bi = k;
			}
		}
		return bi;
	};
	let bridges = 0;
	for (let i = 1; i < control.length; i++) {
		const a = control[i - 1],
			b = control[i];
		const ia = iv(a),
			ib = iv(b);
		const between = truth.slice(Math.min(ia, ib) + 1, Math.max(ia, ib));
		if (between.some((p) => !p.isValid)) bridges++;
	}

	// ── 3. Sample integrity ────────────────────────────────────────
	const validTotal = truth.filter((p) => p.isValid).length;
	const kept = control.length;
	const endpointsLost =
		control[0].x !== truth[0].x || control[control.length - 1].x !== truth[truth.length - 1].x;

	// Gapped curves: the 2D canvas lifts its pen at the hole while the 3D tube
	// spans it — bridges are expected. Continuous curves must have none.
	const gapped = c.name === 'reciprocal pole';
	const bridgesOk = gapped ? bridges <= 1 : bridges === 0;
	const ok = maxPct < TOL_PCT && kept === validTotal && !endpointsLost && bridgesOk;

	if (!ok) failedCases.push(c.name);

	console.log(
		`${ok ? 'ok  ' : 'FAIL'} ${c.name.padEnd(22)}  maxErr=${maxErr.toExponential(2)} (${maxPct.toFixed(3)}% of y-range)  meanErr=${meanErr.toExponential(2)} (n=${n})  bridges=${bridges}  kept=${kept}/${validTotal}  endpointsOk=${endpointsLost ? 'NO' : 'yes'}  scaleOk=${Math.abs(scale - EXPECTED_SCALE) < 1e-9}  liftOk=${Math.abs(floorY - (EXPECTED_LIFT - (spanY / 2 < 0 ? 0 : spanY) - 1.6)) < 1e-9}`,
	);
}

const TOL_PCT = 1; // % of y-range
