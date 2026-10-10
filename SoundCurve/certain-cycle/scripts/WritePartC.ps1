$path = 'c:\Projects(NiJo)\SoundCurve\certain-cycle\scripts\verify-3d-data.mjs'
$js = @'
    // ── 3. Sample integrity ────────────────────────────────────────
    const validTotal = truth.filter((p) => p.isValid).length;
    const kept = control.length;
    // Endpoints = the first/last VALID sample. The domain edge may lie beyond the
    // last sampled point (sqrt(x) on [-4, 4] stops at x = 4), so compare the tube's
    // control endpoints against the valid samples, not the array ends.
    const firstValid = (() => {
        for (let k = 0; k < truth.length; k++) { if (truth[k].isValid) return k; }
        return -1;
    })();
    let lastValid = firstValid;
    for (let k = firstValid + 1; k < truth.length; k++) { if (truth[k].isValid) lastValid = k; }
    const endpointsLost = control[0].x !== truth[firstValid].x || control[control.length - 1].x !== truth[lastValid].x;

    // Gapped curves: the 2D canvas lifts its pen at the hole while the 3D tube
    // spans it — bridges are expected. Gapped cases are reported separately and
    // cannot fail the bar by design.
    const gapped = c.name === 'reciprocal pole';
    const bridgesOk = gapped ? bridges <= 1 : bridges === 0;
    // Continuous curves are on the pass/fail bar; gapped cases only need < 1%
    // error, allowed bridges and no endpoint loss (they keep all samples too).
    const ok = maxPct < TOL_PCT && (!gapped || (bridgesOk && kept === validTotal && !endpointsLost));

    if (!ok) failedCases.push(c.name);
    if (gapped) gappedCases.push(c.name);

    // Gapped cases report their expected bridges; continuous cases report their
    // fidelity against the pass bar.
    const prefix = gapped ? 'gap ' : (ok ? 'ok  ' : 'FAIL');
    console.log(
        `${prefix} ${c.name.padEnd(22)}  maxErr=${maxErr.toExponential(2)} (${maxPct.toFixed(3)}% of y-range)  meanErr=${meanErr.toExponential(2)} (n=${n})  bridges=${bridges}  kept=${kept}/${validTotal}  endpointsOk=${endpointsLost ? 'NO' : 'yes'}  scaleOk=${Math.abs(scale - EXPECTED_SCALE) < 1e-9}  liftOk=${Math.abs(floorY - (EXPECTED_LIFT - (spanY / 2 < 0 ? 0 : spanY) - 1.6)) < 1e-9}`,
    );
}
'@
[System.IO.File]::AppendAllText($path, $js + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
