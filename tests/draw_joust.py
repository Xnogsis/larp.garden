"""Start Draw Joust through the real hub with external requests blocked."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path != '/':
            return super().do_GET()
        body = b'''<!doctype html><iframe id="game" width="960" height="600"></iframe><script>
        (async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            document.querySelector('#game').src = '/hub/gnmath/387-fix2.html';
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
        context = browser.new_context(viewport={'width': 1100, 'height': 800})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        errors, external, failed = [], [], []
        context.on('request', lambda request: external.append(request.url)
                   if not request.url.startswith(origin + '/') else None)
        context.on('requestfailed', lambda request: failed.append((request.url, request.failure)))
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('console', lambda message: print(message.type, message.text[:400], flush=True))
        page.goto(origin + '/')
        page.frame_locator('#game').locator('#unity-canvas').wait_for()
        game = page.frames[1]
        game.wait_for_function('myGameInstance !== null && initGame && initSDK', timeout=120000)
        assert game.url == origin + '/draw-joust/index.html'
        assert game.evaluate("document.querySelector('#unity-canvas').width > 300")
        assert game.evaluate("document.querySelector('#loading-cover').style.display === 'none'")
        assert game.evaluate('ysdk.deviceInfo.isDesktop() === true')
        page.screenshot(path='/tmp/draw-joust-start.png')
        bounds = game.locator('#unity-canvas').bounding_box()
        page.mouse.move(bounds['x'] + 355, bounds['y'] + 390)
        page.mouse.down()
        page.mouse.move(bounds['x'] + 480, bounds['y'] + 300, steps=15)
        page.mouse.move(bounds['x'] + 605, bounds['y'] + 390, steps=15)
        page.mouse.up()
        game.evaluate('() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
        page.screenshot(path='/tmp/draw-joust-drawn.png')

        game.evaluate("player.setData({saves: ['test-save']})")
        game.goto(game.url)
        game.wait_for_function('myGameInstance !== null && initGame && initSDK', timeout=120000)
        assert game.evaluate("player.getData().then(data => data.saves[0])") == 'test-save'
        assert not errors, errors
        assert not [url for url in external if 'gameanalytics.com/' not in url], external
        assert not [(url, error) for url, error in failed
                    if 'gameanalytics.com/' not in url and error != 'net::ERR_ABORTED'], failed
        browser.close()
        print('Draw Joust Unity startup, guest initialization, drawing input, and saved data passed with external requests blocked.')
finally:
    server.shutdown()
