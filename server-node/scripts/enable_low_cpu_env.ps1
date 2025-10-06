param(
    [switch]$Apply
)

function Write-Ok($m) { Write-Host "[ok] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Warning $m }

$venvActivate = Join-Path (Get-Location) '.venv\Scripts\Activate.ps1'
$cpu = [Environment]::ProcessorCount
$threads = [Math]::Max(1, [Math]::Min(4, $cpu))
$lines = @(
    "# QUESO low_cpu tuning: set conservative thread counts to reduce contention on CPU-only machines",
    "`$env:OMP_NUM_THREADS = '$threads'",
    "`$env:MKL_NUM_THREADS = '$threads'",
    "`$env:OPENBLAS_NUM_THREADS = '$threads'",
    "`$env:NUMEXPR_NUM_THREADS = '$threads'",
    "`$env:PYTORCH_NUM_THREADS = '$threads'"
)

Write-Host "Detected CPU cores: $cpu; recommending thread count: $threads"
Write-Host "The following lines would be added to: $venvActivate" -ForegroundColor Cyan
Write-Host "" -ForegroundColor Cyan
foreach ($l in $lines) { Write-Host $l }

if ($Apply) {
    if (-not (Test-Path $venvActivate)) { Write-Warn "Activate.ps1 not found at $venvActivate"; exit 2 }
    $backup = "$venvActivate.bak.before_queso"
    if (-not (Test-Path $backup)) { Copy-Item $venvActivate $backup -Force }
    Add-Content -Path $venvActivate -Value "`n# --- QUESO low_cpu tuning ---`n" -Encoding utf8
    Add-Content -Path $venvActivate -Value ($lines -join "`n") -Encoding utf8
    Write-Ok "Appended low_cpu env lines to Activate.ps1 (backup at $backup)"
}
else {
    Write-Host "Run this script with -Apply to persist the changes to the venv Activate.ps1" -ForegroundColor Yellow
}
