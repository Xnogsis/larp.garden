"""Read or update the exact repository refs shipped with each catalog version.

python3 .github/scripts/source_pins.py --update
python3 .github/scripts/source_pins.py --get Xnogsis/html
"""
import argparse
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]
PIN_FILE = ROOT / 'game-source-pins.js'
REPOS = ['Xnogsis/Prestige-Tree', 'Xnogsis/Biotomata-Game', 'Xnogsis/html', 'Xnogsis/ugs-singlefile', 'Xnogsis/html55-new', 'Xnogsis/covers', 'Xnogsis/assets']


def read_pins():
    text = PIN_FILE.read_text()
    pins = json.loads(text[text.index('{'):text.rindex('}') + 1])
    if set(pins) != set(REPOS) or not all(re.fullmatch('[a-f0-9]{40}', ref) for ref in pins.values()):
        raise ValueError('Invalid game source pins')
    return pins


def update():
    pins = {}
    for repo in REPOS:
        branch = 'master' if repo == 'Xnogsis/Prestige-Tree' else 'main'
        output = subprocess.check_output(['git', 'ls-remote', 'https://github.com/' + repo + '.git', 'refs/heads/' + branch], text=True)
        ref = output.split()[0]
        if not re.fullmatch('[a-f0-9]{40}', ref):
            raise ValueError('Invalid source commit for ' + repo)
        pins[repo] = ref
    PIN_FILE.write_text('// Exact catalog sources for this site version. Updated with the catalog refresh.\nself.GAME_SOURCE_PINS = Object.freeze(' + json.dumps(pins, indent=4) + ');\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--update', action='store_true')
    parser.add_argument('--get', choices=REPOS)
    args = parser.parse_args()
    if args.update:
        update()
    if args.get:
        print(read_pins()[args.get])
