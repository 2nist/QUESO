# QUESO Foundry CLI
import argparse, json, sys
from pathlib import Path

from .queso_foundry.progress import MetaProgress
from .queso_foundry.pipeline import run_pipeline


def main():
    p = argparse.ArgumentParser(description='QUESO analyze')
    p.add_argument('--input', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--opts', default='{}')
    args = p.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    opts = json.loads(args.opts)

    meta = MetaProgress(out, input_path=args.input, opts=opts)
    try:
        run_pipeline(args.input, out, opts, meta)
        meta.done()
        return 0
    except Exception as e:
        meta.fail(e)
        print(f'[error] {e}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
