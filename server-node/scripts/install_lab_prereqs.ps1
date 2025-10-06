param(
    [string]$PythonPath = ''
)

function Write-Ok($m) { Write-Host "[ok] $m" -ForegroundColor Green }
function Write-Warn($m) { Write-Warning $m }
function Write-Err($m) { Write-Host "[error] $m" -ForegroundColor Red }

try {
    $python = if ($PythonPath -and $PythonPath.Trim() -ne '') { $PythonPath } elseif ($env:PYTHON) { $env:PYTHON } else { 'python' }
    Write-Host "Using python: $python"
    & $python -c "import sys; print(sys.executable)" 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { Write-Err "Python executable not found or not callable: $python"; exit 2 }
}
catch {
    Write-Err "Python probe failed: $_"; exit 2
}

$venv = Join-Path (Get-Location) '.venv'
if (-not (Test-Path $venv)) {
    Write-Host "Creating venv at $venv..."
    & $python -m venv $venv
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to create venv"; exit 3 }
    Write-Ok "venv created"
}
else { Write-Host "Reusing existing venv at $venv" }

# Determine pip path in venv
$pip = Join-Path $venv 'Scripts\pip.exe'
if (-not (Test-Path $pip)) { $pip = Join-Path $venv 'bin/pip' }
if (-not (Test-Path $pip)) { Write-Err "pip not found inside venv"; exit 4 }

Write-Host "Upgrading pip, setuptools and wheel..."
& $pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) { Write-Warn "pip upgrade returned non-zero (continuing)" }

$req = Join-Path (Get-Location) 'analysis\requirements.txt'
if (Test-Path $req) {
    Write-Host "Installing Python packages from $req (this may take a while)..."
    & $pip install -r $req
    if ($LASTEXITCODE -ne 0) { Write-Warn "Some packages failed to install; check the output and install missing ones manually." }
}
else {
    Write-Warn "Requirements file $req not found; skipping pip install -r"
}

Write-Host "Installing yt-dlp via pip..."
& $pip install -U yt-dlp
if ($LASTEXITCODE -ne 0) { Write-Warn "yt-dlp installation failed via pip; you can install yt-dlp manually." } else { Write-Ok "yt-dlp installed" }

# --- PyTorch installation guidance (auto-CUDA selection) ---
Write-Host "Configuring PyTorch installation..."
# Operator overrides: TORCH_CUDA=cpu to force CPU-only; TORCH_CUDA=cu118 (or any cuXXX) to force specific tag
if ($env:TORCH_CUDA) {
    $force = $env:TORCH_CUDA.Trim()
    if ($force.ToLower() -eq 'cpu') {
        Write-Host "TORCH_CUDA=cpu detected; installing CPU-only PyTorch wheels"
        & $pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision torchaudio
        if ($LASTEXITCODE -ne 0) { Write-Warn "CPU PyTorch install failed; please install manually following https://pytorch.org/get-started/locally/" } else { Write-Ok "CPU PyTorch installed" }
    }
    else {
        # If user provided a custom wheel tag (e.g. cu118) try that directly
        Write-Host "TORCH_CUDA override detected: $force. Attempting wheel tag: $force"
        & $pip install --upgrade --index-url "https://download.pytorch.org/whl/$force" torch torchvision torchaudio
        if ($LASTEXITCODE -ne 0) { Write-Warn "Requested wheel tag $force failed; will attempt auto-detection fallback" } else { Write-Ok "PyTorch installed using wheel tag $force" }
    }
}
else {
    $installed = $false
    # Try to detect NVIDIA GPU via nvidia-smi. If present, attempt to probe CUDA runtime version and install the best matching wheel.
    $nvsmi = Get-Command nvidia-smi -ErrorAction SilentlyContinue
    if ($nvsmi) {
        try {
            # Preferred: query only the cuda_version field (works on modern nvidia-smi)
            $cudaOut = & nvidia-smi --query-gpu=cuda_version --format=csv, noheader 2>$null
            if (-not $cudaOut) { $cudaOut = (& nvidia-smi 2>$null) }
            $cudaLine = ($cudaOut -split "`n" | Select-Object -First 1).Trim()
            # Try to extract a version like 12.1 or 11.8
            if ($cudaLine -match '(\d+\.\d+)') { $cudaVer = $matches[1] } else { $cudaVer = $null }
        }
        catch {
            Write-Warn "Error querying nvidia-smi: $_"
            $cudaVer = $null
        }

        if ($cudaVer) {
            Write-Host "Detected CUDA runtime version: $cudaVer"
            # Build candidate wheel tags from the exact detected version, then fall back to common supported tags.
            $parts = $cudaVer -split '\.'
            $major = $parts[0]
            $minor = $parts[1]
            $exactTag = "cu$($major)$($minor)"  # e.g. 11.8 -> cu118, 12.1 -> cu121
            $candidates = @($exactTag, 'cu118', 'cu117', 'cu116')
        }
        else {
            Write-Host "nvidia-smi present but CUDA version not parseable; will try common CUDA tags"
            $candidates = @('cu118', 'cu117', 'cu116')
        }

        foreach ($tag in $candidates) {
            Write-Host "Attempting PyTorch install with wheel tag: $tag"
            & $pip install --upgrade --index-url "https://download.pytorch.org/whl/$tag" torch torchvision torchaudio
            if ($LASTEXITCODE -eq 0) { Write-Ok "PyTorch installed (wheel tag: $tag)"; $installed = $true; break }
            else { Write-Warn "Install with $tag failed (exit $LASTEXITCODE)" }
        }

        if (-not $installed) {
            Write-Warn "All CUDA wheel attempts failed; falling back to CPU-only PyTorch wheels"
            & $pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision torchaudio
            if ($LASTEXITCODE -ne 0) { Write-Warn "Fallback CPU PyTorch install failed; please follow https://pytorch.org/get-started/locally/ to install the correct wheel for your system." } else { Write-Ok "CPU PyTorch installed (fallback)" }
        }
    }
    else {
        Write-Host "No nvidia-smi detected; installing CPU-only PyTorch wheels"
        & $pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision torchaudio
        if ($LASTEXITCODE -ne 0) { Write-Warn "CPU PyTorch install failed; please install manually following https://pytorch.org/get-started/locally/" } else { Write-Ok "CPU PyTorch installed" }
    }
}

# Check for ffmpeg on PATH
try {
    $ff = Get-Command ffmpeg -ErrorAction SilentlyContinue
    if ($ff) { Write-Ok "ffmpeg found: $($ff.Source)" }
    else {
        Write-Warn "ffmpeg not found on PATH. Attempting winget install (requires winget and appropriate privileges)."
        if (Get-Command winget -ErrorAction SilentlyContinue) {
            try {
                Write-Host "Running: winget install Gyan.FFmpeg -e --silent"
                winget install --id Gyan.FFmpeg -e --silent
                Write-Ok "winget ffmpeg install requested. Verify ffmpeg on PATH after installation."
            }
            catch {
                Write-Warn "winget install failed or requires privilege: $_"
            }
        }
        else {
            Write-Warn "winget not available. Please install ffmpeg manually and add it to PATH: https://ffmpeg.org/download.html"
        }
    }
}
catch {
    Write-Warn "FFmpeg check/install encountered an error: $_"
}

Write-Host "Prereqs installation completed. Recommended: activate venv and run the Lab health check via:"
Write-Host "  & .\.venv\Scripts\Activate.ps1"
Write-Host "  npm run lab:dev"
Write-Host "  curl http://localhost:8080/api/lab/health"
Write-Ok "Installer finished"
