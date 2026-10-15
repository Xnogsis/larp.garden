"""Boot the real Flash runtime through the worker without external networking.

python3 tests/ruffle.py [--firefox] (Firefox requires Playwright's browser install).
"""
import base64
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
import sys
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
version = '0.2.0-nightly.2025.10.2'
cdn = f'https://cdn.jsdelivr.net/npm/@ruffle-rs/ruffle@{version}/'
adapter = '''
const actualFetch = fetch;
self.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    const page = /\\/gh\\/Xnogsis\\/html@main\\/(10[346]-fix2?\\.html)/.exec(url);
    if (page) return actualFetch('/fixture/' + page[1]);
    if (/^https?:/.test(url) && new URL(url).origin !== self.location.origin)
        throw new Error('Unexpected external network request: ' + url);
    return actualFetch(input, init);
};
'''
parent = b'''<!doctype html><iframe id="game" width="960" height="600"></iframe><script>
(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    window.workerReady = true;
})();</script>'''


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/':
            body, mime = parent, 'text/html'
        elif self.path == '/sw.js':
            body, mime = (adapter + (root / 'sw.js').read_text()).encode(), 'text/javascript'
        elif self.path.startswith('/fixture/'):
            configured = '106-' in self.path
            config = f'publicPath: "{cdn}",' if configured else ''
            encoded = base64.b64encode((cdn + 'ruffle.min.js').encode()).decode()
            # Match upstream loaders that construct their script URL at runtime.
            body = f'''<!doctype html><html><head><script>
            window.RufflePlayer = {{config: {{{config} autoplay:'on', unmuteOverlay:'hidden'}}}};
            const script = document.createElement('script');
            script.src = atob('{encoded}');
            document.head.appendChild(script);
            </script></head><body><embed src="/ruffle/standalone-113/logo-anim.swf" width="800" height="500"></body></html>'''.encode()
            mime = 'text/html'
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
        browser = p.firefox.launch(timeout=30000) if '--firefox' in sys.argv else p.chromium.launch(
            executable_path=shutil.which('chromium'), args=['--enable-unsafe-swiftshader'])
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function('window.workerReady')
        for game in ('104-fix2.html', '106-fix.html', '113-fix.html'):
            page.locator('#game').evaluate('(frame, path) => frame.src = path', '/hub/gnmath/' + game)
            expected = '/ruffle/standalone-113/index.html' if game.startswith('113') else '/hub/gnmath/' + game
            page.wait_for_function("path => document.querySelector('#game').contentWindow.location.pathname === path", arg=expected)
            frame = page.frames[1]
            frame.wait_for_function('''() => {
                const player = document.querySelector('ruffle-embed, ruffle-object, ruffle-player');
                return player?.ruffle().metadata?.width > 0;
            }''', timeout=60000)
            frame.locator('canvas').first.wait_for(state='visible')
            assert not errors, errors
            if game.startswith('106'):
                assert frame.evaluate('RufflePlayer.config.publicPath').endswith('/ruffle/' + version + '/')
            print('Passed:', browser.browser_type.name, game, 'real WASM boot and SWF metadata', flush=True)
        browser.close()
finally:
    server.shutdown()
    server.server_close()
