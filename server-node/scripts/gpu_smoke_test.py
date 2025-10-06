#!/usr/bin/env python3
"""
Lightweight GPU/CPU smoke test for local developer machines.

Behavior:
- Reports torch version and CUDA availability.
- If CUDA is available, performs a small GPU matrix multiply benchmark.
- Otherwise performs the same benchmark on CPU.
- If demucs or faster_whisper are importable, reports their versions but does not run heavy models.

Writes a JSON object to stdout with fields: torch_version, cuda_available, cuda_version, bench_ms, demucs, faster_whisper
"""
import json
import time
import sys

def safe_import(name):
    try:
        m = __import__(name)
        return getattr(m, '__version__', repr(m))
    except Exception as e:
        return None

out = {}
try:
    import torch
    out['torch_version'] = getattr(torch, '__version__', None)
    out['cuda_available'] = torch.cuda.is_available()
    out['cuda_version'] = getattr(torch.version, 'cuda', None)
    device = torch.device('cuda' if out['cuda_available'] else 'cpu')

    # Micro-benchmark: matrix multiply of modest size to avoid OOM
    N = 1024
    reps = 3
    try:
        a = torch.randn((N, N), device=device)
        b = torch.randn((N, N), device=device)
        # warmup
        for _ in range(2):
            c = torch.matmul(a, b)
            if out['cuda_available']: torch.cuda.synchronize()
        start = time.perf_counter()
        for _ in range(reps):
            c = torch.matmul(a, b)
            if out['cuda_available']: torch.cuda.synchronize()
        end = time.perf_counter()
        ms = (end - start) / reps * 1000.0
        out['bench_ms'] = ms
        out['bench_N'] = N
        out['bench_reps'] = reps
    except Exception as e:
        out['bench_error'] = str(e)

    # Report presence of optional heavy packages
    out['demucs_version'] = safe_import('demucs')
    out['faster_whisper_version'] = safe_import('faster_whisper')

except Exception as e:
    out['error'] = str(e)

print(json.dumps(out, indent=2))
