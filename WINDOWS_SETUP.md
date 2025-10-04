
# QUESO Analysis Pipeline

This document outlines the steps to run the QUESO analysis pipeline.

## Running on Windows with PowerShell

### 1. Environment Setup

- **Install Python dependencies:**
  ```powershell
  python -m pip install -r external/yt2rpr/requirements.txt
  ```

- **Set Environment Variables:**
  Before running the analysis, you need to set the `QUESO_BACKEND_PATH` and `PYTHONPATH` environment variables.

  ```powershell
  # Set for the current session
  $env:QUESO_BACKEND_PATH = (Resolve-Path 'QUESO/external/yt2rpr').Path
  $env:PYTHONPATH = "$((Resolve-Path 'QUESO').Path);$env:QUESO_BACKEND_PATH;$env:PYTHONPATH"
  ```

- **FFmpeg:**
  Ensure FFmpeg is installed and available in your system's `PATH`. You can install it using a package manager like Chocolatey or Winget, or by downloading a pre-built binary and adding it to your `PATH`.

  ```powershell
  # Example using winget
  winget install ffmpeg
  ```

### 2. Running the Analysis

Once the environment is set up, you can run the analysis using the following command. Note the backticks (`) used to escape the double quotes within the `--opts` JSON string in PowerShell.

```powershell
python -X utf8 -m analysis.cli --input 'QUESO/artifacts/test/sine.wav' --out 'QUESO/artifacts/test/out' --opts "{\`"sections_profile\`":\`"default\`",\`"bar_align\`":true}"
```

This will run the full pipeline and generate the analysis artifacts in the specified output directory.
