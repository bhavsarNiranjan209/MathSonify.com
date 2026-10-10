$parts = @('WritePartA.ps1','WritePartB.ps1','WritePartC.ps1','WritePartD.ps1')
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($p in $parts) {
    $full = Join-Path $scriptDir $p
    & powershell -NoProfile -ExecutionPolicy Bypass -File $full
    if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $p" -ForegroundColor Red }
}
if (Test-Path (Join-Path $scriptDir 'verify-3d-data.mjs')) { Write-Host 'FILE_OK' } else { Write-Host 'FILE_MISSING' }
