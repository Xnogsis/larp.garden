"""Check Slope's real Unity runtime through the hub, without external assets."""
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


server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'),
                                    args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 900, 'height': 650})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.on('console', lambda message: print(message.type, message.text[:200], flush=True))
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin + '/home.html')
        page.evaluate('''async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            const iframe = document.createElement('iframe');
            iframe.id = 'test-game'; iframe.width = 800; iframe.height = 500;
            iframe.src = '/hub/gnmath/198-fix2.html'; document.body.prepend(iframe);
        }''')
        game = page.frame_locator('#test-game')
        game.locator('canvas').wait_for(timeout=60000)
        frame = next(frame for frame in page.frames if '/slope/index.html' in frame.url)
        frame.wait_for_function('window.gameInstance?.Module?.calledRun && document.querySelector("#status").hidden', timeout=120000)
        page.wait_for_timeout(8000)  # Allow Unity's splash animation to finish before inspecting the game.
        assert frame.locator('canvas').evaluate('el => el.width > 0 && el.height > 0')
        canvas = frame.locator('canvas')
        size = canvas.bounding_box()
        canvas.click(position={'x': size['width'] / 2, 'y': size['height'] / 3})
        page.wait_for_timeout(2000)
        frame.locator('canvas').press('ArrowLeft')
        page.screenshot(path='/tmp/slope-running.png')
        assert not errors, errors
        print('Passed: Slope hub redirect, real Unity startup, canvas and keyboard input')
        context.close()
        context = browser.new_context()
        context.route('**/*.part1', lambda route: route.fulfill(status=503, body='unavailable'))
        page = context.new_page()
        page.goto(origin + '/slope/index.html')
        page.wait_for_function('document.querySelector("#status").textContent.includes("HTTP 503")')
        print('Passed: failed Slope data download shows a visible error')
        browser.close()
finally:
    server.shutdown()
    server.server_close()
