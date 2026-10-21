#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/../.."
celeste_commit=4f043a5ce121b74dc54ce56d74f213a2eeea6b4e
asset_dir="celeste-assets/$celeste_commit"
if [ -f "$asset_dir/.complete-gzip" ]; then
    exit 0
fi
source_dir="${RUNNER_TEMP:-/tmp}/larp-celeste-$celeste_commit"
if [ ! -d "$source_dir/.git" ]; then
    git init --quiet "$source_dir"
    git -C "$source_dir" remote add origin https://github.com/web-ports/celeste.git
fi
git -C "$source_dir" fetch --quiet --depth 1 origin "$celeste_commit"
mkdir -p "$asset_dir"
git -C "$source_dir" archive "$celeste_commit" _framework assets bundle.js cfg.js data.js styles.css reademe.md | tar -x -C "$asset_dir"
python3 - "$asset_dir" <<'PY'
import gzip
from pathlib import Path
import shutil
import sys
root = Path(sys.argv[1])
files = list(root.glob('_framework/data/data.data.part*')) + list(root.rglob('*.wasm'))
for path in (path for path in files if path.suffix != '.gz'):
    with path.open('rb') as source, gzip.open(str(path) + '.gz', 'wb', compresslevel=6) as target:
        shutil.copyfileobj(source, target)
    path.unlink()
(root / '.complete-gzip').touch()
PY
