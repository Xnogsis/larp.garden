"""Boot Burrito Bison's real Unity build with CDN script downloads rejected."""
from concurrent.futures import ThreadPoolExecutor
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import tempfile
from threading import Thread
from urllib.request import urlopen
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
commit = '9cf433220236bb0471ab3a68ec8fe3e0a2799e36'
cache = Path(tempfile.gettempdir()) / ('larp-burrito-test-' + commit)
cache.mkdir(exist_ok=True)
parts = {
    'burrito-bison-ll.data.unityweb.part1': '47b4b2d1bd37f9141ab2f4d545b0eb6772bdaa4c',
    'burrito-bison-ll.data.unityweb.part2': '4a8e3290e2952de52a60bd6c94716fe813d336cb',
    'burrito-bison-ll.asm.code.unityweb.part1': '4eee07d8fde09be237905443cbc9ab97c501c5c0',
    'burrito-bison-ll.asm.code.unityweb.part2': '56348c8e96369cd62293ff7593d03bc700b22d1e',
    'burrito-bison-ll.asm.memory.unityweb.part1': '3c702fbf8d2779d4cfe4efbfe40a1ec731203f71',
    'burrito-bison-ll.asm.framework.unityweb.part1': '0349d3d41e8ee94a52ea21038f89b1f7af3c155a',
}


def prepare_part(item):
    name, expected = item
    target = cache / name
    if not target.exists():
        with urlopen(f'https://raw.githubusercontent.com/bubbls/UGS-Assets/{commit}/BurritoBison-main/{name}', timeout=60) as response:
            data = response.read()
    else:
        data = target.read_bytes()
    assert hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest() == expected, name
    if not target.exists():
        target.write_bytes(data)


with ThreadPoolExecutor(max_workers=4) as pool:
    list(pool.map(prepare_part, parts.items()))

adapter = '''
const actualFetch = fetch;
self.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/\\/gh\\/Xnogsis\\/(?:html|ugs-singlefile)@main\\//.test(url))
        return actualFetch('/fixture-page');
    const part = /\\/bubbls\\/UGS-Assets@([a-f0-9]{40})\\/BurritoBison-main\\/([^?]+\\.part[12])/.exec(url);
    if (part) {
        if (part[1] !== '9cf433220236bb0471ab3a68ec8fe3e0a2799e36') throw Error('Unpinned runtime');
        return actualFetch('/fixture-part/' + part[2]);
    }
    if (/^https?:/.test(url) && new URL(url).origin !== self.location.origin)
        throw Error('Unexpected external worker download: ' + url);
    return actualFetch(input, init);
};
'''
parent = b'''<!doctype html><iframe id="game" width="960" height="600"></iframe><script>
(async()=>{await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;
if(!navigator.serviceWorker.controller)await new Promise(resolve=>
navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));window.workerReady=true;})();
</script>'''


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/':
            body, mime = parent, 'text/html'
        elif self.path == '/sw.js':
            body, mime = (adapter + (root / 'sw.js').read_text()).encode(), 'text/javascript'
        elif self.path == '/fixture-page':
            body, mime = (root / 'tests/fixtures/burrito-bison.html').read_bytes(), 'text/html'
        elif self.path.startswith('/fixture-part/') and self.path.split('/')[-1] in parts:
            body, mime = (cache / self.path.split('/')[-1]).read_bytes(), 'application/octet-stream'
        else:
            return super().do_GET()
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.end_headers()
        self.wfile.write(body)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), args=['--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1000, 'height': 700})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        errors = []
        def record_error(error):
            errors.append(str(error))
            print('Page error:', error, flush=True)
        page.on('pageerror', record_error)
        page.goto(origin)
        page.wait_for_function('window.workerReady')
        for path in ('gnmath/78-fix2.html', 'ugs/UGS-Files/clburritobisonlaunchalibre.html'):
            page.locator('#game').evaluate('(el, path) => el.src = "/hub/" + path', path)
            frame = page.frame_locator('#game')
            frame.locator('canvas').wait_for(timeout=60000)
            game = page.frames[1]
            game.evaluate('''() => {
                const xhr = new XMLHttpRequest();
                xhr.open('GET', '/burrito-bison/burrito-bison-ll.json');
                xhr.responseType = 'arraybuffer';
            }''')
            game.wait_for_function('window.gameInstance?.Module?.calledRun && gameInstance.progress?.style.display === "none"', timeout=120000)
            assert game.evaluate('document.baseURI').startswith(f'https://cdn.jsdelivr.net/gh/bubbls/UGS-Assets@{commit}/')
            page.wait_for_timeout(8000)  # Let the Unity splash finish before inspecting the menu.
            page.screenshot(path='/tmp/burrito-bison-running.png')
            assert game.locator('canvas').evaluate('el => el.width > 0 && el.height > 0')
            game.locator('canvas').click()
            page.wait_for_timeout(2000)
            page.screenshot(path='/tmp/burrito-bison-started.png')
            assert not errors, errors
            print('Passed: real Unity startup with blocked CDN scripts, pinned split assets, ' + path, flush=True)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
