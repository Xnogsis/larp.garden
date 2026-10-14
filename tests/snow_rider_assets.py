"""Boot Snow Rider's real local build through the worker.

Run prepare-snow-rider.sh first, then python3 tests/snow_rider_assets.py.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
commit = '6b7c2b9167b592528b221428414e63f06c4640b9'
assert (root / 'snow-rider-assets' / commit / '.complete').exists(), 'Run prepare-snow-rider.sh first'


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path != '/':
            return super().do_GET()
        body = b'''<!doctype html><iframe id="game" width="1000" height="650"></iframe><script>
        window.lgDebug = () => { window.debugAttached = true; };
        (async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            document.querySelector('#game').src = '/hub/gnmath/119-fix2.html';
        })();</script>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True,
                                    args=['--enable-unsafe-swiftshader'])
        page = browser.new_page(viewport={'width': 1280, 'height': 900})
        failures = []
        page.on('requestfailed', lambda request: failures.append(request.url))
        origin = f'http://127.0.0.1:{server.server_port}'
        page.goto(origin)
        page.wait_for_function("document.querySelector('#game').contentWindow.gameInstance?.Module?.calledRun === true", timeout=120000)
        frame = page.frames[1]
        assert frame.url == f'{origin}/snow-rider-assets/{commit}/index.html'
        assert page.evaluate('window.debugAttached') is True
        canvas = frame.locator('canvas')
        assert canvas.evaluate('(c) => c.width >= 960 && c.height >= 600')
        resources = frame.evaluate('performance.getEntriesByType("resource").map(r => r.name)')
        assert any(url.endswith('Build/SnowRider3D-gd-1.json') for url in resources)
        assert all(url.startswith(origin + '/') or url.startswith('blob:') for url in resources), resources
        assert not failures, failures
        page.wait_for_timeout(3000)
        page.screenshot(path='/tmp/snow-rider-local.png')
        for width in (1280, 390):
            page.set_viewport_size({'width': width, 'height': 900})
            page.goto(origin + '/home.html')
            bottom = page.locator('.home-bottom')
            assert bottom.inner_text() == 'yes i do'
            assert bottom.bounding_box()['y'] >= page.locator('main').bounding_box()['y'] + page.locator('main').bounding_box()['height']
        browser.close()
    print('Passed: Snow Rider local Unity boot, worker redirect, debug hook, no external assets; Home bottom text on desktop/mobile')
finally:
    server.shutdown()
    server.server_close()
