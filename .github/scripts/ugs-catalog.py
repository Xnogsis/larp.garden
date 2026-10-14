"""Build ugs-games.json from a checkout or bare clone of Xnogsis/ugs-singlefile.

Usage: python .github/scripts/ugs-catalog.py <repository>
"""
import json
from pathlib import Path
import re
import subprocess
import sys

repo = sys.argv[1]
files = set(subprocess.check_output(
    ['git', '-C', repo, 'ls-tree', '-r', '--name-only', 'HEAD', '--', 'UGS-Files'], text=True
).splitlines())
source = subprocess.check_output(['git', '-C', repo, 'show', 'HEAD:games.js'], text=True)
match = re.search(r'let files\s*=\s*(\[.*?\]);', source, re.S)
if not match:
    raise ValueError('UGS game list not found')
names = json.loads(re.sub(r',\s*\]', ']', match[1]))
assert names and all(isinstance(name, str) for name in names)
games = {}
for name in names:
    filename = name if name.endswith('.html') else name + '.html'
    path = 'UGS-Files/' + filename
    if path not in files:
        continue
    title = re.sub(r'^cl', '', filename[:-5])
    title = re.sub(r'([a-z])([A-Z])', r'\1 \2', title).replace('_', ' ').replace('-', ' ')
    games[path] = {'id': filename[:-5], 'name': title, 'url': path}
assert len(games) > 100, 'UGS catalog is unexpectedly small'
output = Path(__file__).resolve().parents[2] / 'ugs-games.json'
output.write_text(json.dumps(sorted(games.values(), key=lambda game: game['name'].casefold()), indent=2) + '\n')
print(f'{len(games)} UGS games written to {output.name}')
