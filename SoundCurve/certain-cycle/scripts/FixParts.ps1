$parts = @('WritePartA.ps1','WritePartB.ps1','WritePartC.ps1','WritePartD.ps1')
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
foreach ($p in $parts) {
    $full = Join-Path $scriptDir $p
    $content = Get-Content $full -Raw
    $content = $content -replace "''", "'"
    Set-Content -Path $full -Value $content -NoNewline
    Write-Host ('FIXED: ' + $p)
}