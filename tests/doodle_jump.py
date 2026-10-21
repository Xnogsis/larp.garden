"""Run Doodle Jump through the real hub service worker without external assets."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path != '/':
            return super().do_GET()
        body = b'''<!doctype html><iframe id="game" width="800" height="650"></iframe><script>
        (async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            document.querySelector('#game').src = '/hub/gnmath/470-fix.html';
        })();</script>'''
        self.send_response(200)
        self.send_header('Content-Type', 'text/html')
        self.end_headers()
        self.wfile.write(body)


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'))
        context = browser.new_context(viewport={'width': 1000, 'height': 800})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        errors, failed, external = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        context.on('requestfailed', lambda request: failed.append(request.url))
        context.on('response', lambda response: failed.append((response.status, response.url))
                   if response.status >= 400 and '/doodle-jump/' in response.url else None)
        context.on('request', lambda request: external.append(request.url)
                   if not request.url.startswith(origin + '/') else None)
        page.goto(origin + '/')
        frame = page.frame_locator('#game')
        frame.locator('#play-btn').wait_for()
        game = page.frames[1]
        game.wait_for_function('canvas.width === 422 && canvas.height === 552 && image.complete && image.naturalWidth > 0')
        assert game.url == origin + '/doodle-jump/index.html'
        assert game.evaluate("getComputedStyle(document.body).fontFamily").startswith('"Gloria Hallelujah"')
        frame.locator('#play-btn').click()
        game.wait_for_function("document.querySelector('#mainMenu').style.zIndex === '-1'")
        initial_x = game.evaluate('player.x')
        page.keyboard.down('ArrowRight')
        game.wait_for_function('(x) => player.x > x + 10', arg=initial_x)
        page.keyboard.up('ArrowRight')
        assert game.evaluate('''() => {
            const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            return pixels.some((value, i) => i % 4 === 3 && value > 0);
        }''')
        for suffix in ['470.html', '470-fix2.html']:
            game.goto(origin + '/hub/gnmath/' + suffix)
            frame.locator('#play-btn').wait_for()
            assert page.frames[1].url == origin + '/doodle-jump/index.html'
        assert not failed, failed
        assert not external, external
        assert not errors, errors
        browser.close()
        print('Doodle Jump hub redirects, rendered canvas, Play, and keyboard movement passed with no external requests.')
finally:
    server.shutdown()
