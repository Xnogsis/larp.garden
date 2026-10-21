"""Boot the real Buckshot engine through the hub, and check visible download errors.

Prepare assets first: python .github/scripts/prepare-buckshot.py
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
commit = 'b3042ae7a56b2ede39ea4b4371b1d0ab3af8828a'
assert (root / 'buckshot-assets' / commit / '.complete').exists(), 'Prepare Buckshot assets first'


class Handler(SimpleHTTPRequestHandler):
    fail = ''

    def log_message(self, *_):
        pass

    def copyfile(self, source, output):
        try:
            super().copyfile(source, output)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        if self.fail and self.path.endswith(self.fail):
            self.send_error(404)
            return
        if self.path != '/':
            return super().do_GET()
        body = b'''<!doctype html><iframe id="game" width="960" height="600"></iframe><script>
        (async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            document.querySelector('#game').src = '/hub/gnmath/205-fix2.html';
        })();</script>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'),
                                    args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        origin = f'http://127.0.0.1:{server.server_port}'
        context = browser.new_context(viewport={'width': 1100, 'height': 800})
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        external, errors = [], []
        context.on('request', lambda request: external.append(request.url)
                   if not request.url.startswith(origin + '/') else None)
        context.on('response', lambda response: print('HTTP error:', response.status, response.url, flush=True)
                   if response.status >= 400 else None)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: print(message.type, message.text[:400], flush=True))
        page.goto(origin + '/')
        game = page.frame_locator('#game')
        game.locator('#canvas').wait_for()
        frame = page.frames[1]
        frame.wait_for_function("document.querySelector('#status-progress').value > 0", timeout=60000)
        print('Download progress visible', flush=True)
        frame.wait_for_function("!document.querySelector('#status')", timeout=180000)
        assert frame.url == origin + '/buckshot-roulette/index.html'
        assert frame.evaluate('canvas.width > 300 && canvas.height > 150')
        assert frame.evaluate('engine.rtenv != null')
        page.screenshot(path='/tmp/buckshot-boot.png')
        assert not external, external
        assert not errors, errors
        print('Real Godot engine and game started with local assets', flush=True)
        context.close()

        Handler.fail = '.wasm.gz'
        context = browser.new_context()
        page = context.new_page()
        page.goto(origin + '/')
        game = page.frame_locator('#game')
        game.locator('#status-notice').wait_for(state='visible', timeout=30000)
        assert 'Failed loading file' in game.locator('#status-notice').inner_text()
        print('Failed WASM download produces a visible error instead of infinite loading', flush=True)
        browser.close()
finally:
    server.shutdown()
