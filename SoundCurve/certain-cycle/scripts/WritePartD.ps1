$path = 'c:\Projects(NiJo)\SoundCurve\certain-cycle\scripts\verify-3d-data.mjs'
$js = @'
const status = failedCases.length === 0
    ? `PASS: all ${CASES.length} equations reproduce their 2D data in 3D`
    : `FAIL: ${failedCases.join(', ')}`;
console.log(`\nStatus: ${status}`);
console.log(gappedCases.length === 0
    ? '\nGapped: none'
    : `\nGapped (bridges expected, reported separately): ${gappedCases.join(', ')}`);
process.exit(failedCases.length === 0 ? 0 : 1);
'@
[System.IO.File]::AppendAllText($path, $js + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
