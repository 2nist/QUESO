import ast, json
from pathlib import Path
import os

BACKEND = os.environ.get('QUESO_BACKEND_PATH')
SRC = Path(BACKEND) if BACKEND else Path('src')
TARGETS = [
  'analysis_service.py',
  'section_tools.py',
  'chord_tools.py',
  'subtitle_tools.py',
  'main.py',
]

def list_defs(py_path: Path):
  try:
    tree = ast.parse(py_path.read_text(encoding='utf-8'), filename=str(py_path))
  except Exception as e:
    return {'error': str(e)}
  fns = []
  for n in ast.walk(tree):
    if isinstance(n, ast.FunctionDef) and not n.name.startswith('_'):
      fns.append({'name': n.name, 'args': [a.arg for a in n.args.args]})
  return fns

out = {}
for t in TARGETS:
  p = SRC / t
  out[t] = list_defs(p) if p.exists() else {'error':'missing'}

print(json.dumps(out, indent=2))
