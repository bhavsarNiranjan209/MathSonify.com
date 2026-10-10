$path = 'c:\Projects(NiJo)\SoundCurve\certain-cycle\scripts\verify-3d-data.mjs'
$js = @'
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
'@
[System.IO.File]::AppendAllText($path, $js + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
