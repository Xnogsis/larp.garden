"""Check locally hosted Balatro with external requests blocked."""
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
                                    args=['--enable-unsafe-swiftshader'])
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        page = context.new_page()
        page.goto(origin + '/home.html', wait_until='networkidle')
        page.evaluate('''async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
        }''')
        errors, failures, requests = [], [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('requestfailed', lambda request: failures.append(request.url))
        page.on('request', lambda request: requests.append(request.url))
        single_games = page.locator('section').filter(has=page.get_by_role('heading', name='Single games'))
        single_games.get_by_role('link', name='Balatro').click()
        assert page.url == origin + '/balatro/index.html'
        assert 'access_granted=balatro/index.html' in page.evaluate('document.cookie')
        ready = '''window.Module?.calledRun && window.FS &&
            getComputedStyle(document.getElementById('loadingCanvas')).display === 'none' '''
        page.wait_for_function(ready, timeout=90000)
        page.locator('#canvas').click(position={'x': 640, 'y': 360})
        page.wait_for_timeout(4000)
        page.screenshot(path='/tmp/balatro-home.png')
        assert page.locator('#canvas').evaluate('(c) => c.width === 1280 && c.height === 720')
        assert any('/balatro/love.wasm' in url for url in requests)
        assert any('/balatro/game.data' in url for url in requests)
        assert all(url.startswith(origin + '/') for url in requests), requests
        assert not errors and not failures, (errors, failures)
        page.evaluate('''async () => {
            FS.writeFile('/home/web_user/love/larp-save-check', 'persisted');
            await new Promise((resolve, reject) => FS.syncfs(false, error => error ? reject(error) : resolve()));
        }''')
        page.goto(origin + '/index.html')
        # The root page restores the saved game inside its normal iframe.
        page.wait_for_function("document.getElementById('content-frame').contentWindow.location.pathname === '/balatro/index.html'")
        game = next(f for f in page.frames if '/balatro/index.html' in f.url)
        game.wait_for_function(ready, timeout=90000)
        assert game.evaluate("FS.readFile('/home/web_user/love/larp-save-check', {encoding:'utf8'})") == 'persisted'
        assert not errors and not failures, (errors, failures)
        browser.close()
    print('Passed: Balatro Home link, active-worker loading, WASM/game data, no external requests, saved-page restore, persistent filesystem')
finally:
    server.shutdown()
    server.server_close()
