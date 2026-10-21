"""Prepare pinned, compressed Buckshot Roulette data without committing large assets."""
from concurrent.futures import ThreadPoolExecutor
import gzip
from pathlib import Path
import shutil
import tempfile
from urllib.request import urlopen

commit = 'b3042ae7a56b2ede39ea4b4371b1d0ab3af8828a'
root = Path(__file__).resolve().parents[2]
target = root / 'buckshot-assets' / commit
if not (target / '.complete').exists():
    source = Path(tempfile.gettempdir()) / f'larp-buckshot-source-{commit}'
    source.mkdir(exist_ok=True)
    target.mkdir(parents=True, exist_ok=True)
    parts = [('pck', 17, 344705792), ('wasm', 3, 43444261)]

    def download(item):
        extension, number, size = item
        name = f'buckshot-roulette.{extension}.part{number}'
        path = source / name
        if not path.exists() or path.stat().st_size != size:
            with urlopen(f'https://raw.githubusercontent.com/giorgirick2-gif/game-webports-onawebsite/{commit}/buckshot-roulette/{name}', timeout=60) as response:
                path.write_bytes(response.read())
        if path.stat().st_size != size:
            raise ValueError(f'Incomplete download: {name}')

    downloads = []
    for extension, count, total in parts:
        part_size = (total + count - 1) // count
        downloads.extend((extension, i, part_size if i < count else total - part_size * (count - 1))
                         for i in range(1, count + 1))
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(download, downloads))
    for extension, count, _ in parts:
        output = target / f'buckshot-roulette.{extension}.gz'
        with gzip.open(output, 'wb', compresslevel=6) as stream:
            for i in range(1, count + 1):
                with (source / f'buckshot-roulette.{extension}.part{i}').open('rb') as part:
                    shutil.copyfileobj(part, stream)
        print(f'Prepared {output.relative_to(root)} ({output.stat().st_size} bytes)')
    (target / '.complete').touch()
