# QUESO Foundry CLI
import argparse, json, sys
from pathlib import Path

from .queso_foundry.progress import MetaProgress
from .queso_foundry.pipeline import run_pipeline


def _deep_merge(a: dict, b: dict) -> dict:
    out = dict(a)
    for k, v in (b or {}).items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def _load_config(config_arg: str | None) -> dict:
    # Order of precedence: provided path > analysis/config.json > analysis/config.default.json
    paths = []
    if config_arg:
        paths.append(Path(config_arg))
    root = Path(__file__).resolve().parent.parent
    paths.append(root / 'analysis' / 'config.json')  # when run from repo root
    paths.append(root / 'config.json')               # when run from analysis pkg
    paths.append(root / 'analysis' / 'config.default.json')
    paths.append(root / 'config.default.json')

    cfg = {}
    for p in paths:
        if p.exists():
            try:
                cfg = _deep_merge(cfg, json.loads(p.read_text(encoding='utf-8')))
            except Exception:
                pass
    return cfg


def main():
    p = argparse.ArgumentParser(description='QUESO analyze')
    p.add_argument('--input', required=True)
    p.add_argument('--out', required=True)
    p.add_argument('--opts', default='{}')
    p.add_argument('--config', default=None, help='Path to JSON config with adapter tuning')
    args = p.parse_args()

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    # merge config and opts
    base_cfg = _load_config(args.config)
    cli_opts = json.loads(args.opts)
    opts = _deep_merge(base_cfg, cli_opts)

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
