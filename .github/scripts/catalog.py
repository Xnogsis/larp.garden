"""Refresh zones.json from gn-math and make a small WebP thumbnail in t/ for every cover.

Usage: python .github/scripts/catalog.py <checkout of freebuisness/covers>
"""
import json
import sys
import urllib.request
from pathlib import Path

from PIL import Image

ZONES_URL = "https://raw.githubusercontent.com/freebuisness/assets/main/zones.json"
SIZE = (240, 240)

covers = Path(sys.argv[1])
root = Path(__file__).resolve().parents[2]
thumbs = root / "t"
thumbs.mkdir(exist_ok=True)

raw = urllib.request.urlopen(ZONES_URL, timeout=60).read()
zones = json.loads(raw)
assert isinstance(zones, list) and len(zones) > 100, "zones.json looks wrong"
(root / "zones.json").write_bytes(raw)

made = 0
for zone in zones:
    name = zone.get("cover", "").replace("{COVER_URL}/", "")
    src = covers / name
    out = thumbs / (Path(name).stem + ".webp")
    # shortcut: a cover changed upstream under the same name keeps its old thumbnail; delete t/ to rebuild.
    if not name or out.exists() or not src.is_file():
        continue
    with Image.open(src) as im:
        im = im.convert("RGBA")
        im.thumbnail(SIZE, Image.LANCZOS)
        im.save(out, "WEBP", quality=70, method=6)
    made += 1
print(f"{len(zones)} zones, {made} new thumbnails")
