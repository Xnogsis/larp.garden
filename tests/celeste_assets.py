"""Check Celeste's local module imports and streaming WASM with the real worker.

Run with python3 tests/celeste_assets.py (requires Playwright and Chromium).
"""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
commit = '4f043a5ce121b74dc54ce56d74f213a2eeea6b4e'
adapter = f"""
const originalFetch = fetch;
self.fetch = (input, init) => {{
    const url = typeof input === 'string' ? input : input.url;
    if (url.includes('/gh/Xnogsis/html@main/623-fix2.html')) return originalFetch('/upstream/page.html');
    return originalFetch(input, init);
}};
"""
parent = """<!doctype html><iframe id="game"></iframe><script>
(async () => {
    await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) await new Promise(resolve =>
        navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
    document.querySelector('#game').src = '/hub/gnmath/623-fix2.html';
})();
</script>"""


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        if self.path == '/':
            body, mime = parent.encode(), 'text/html'
        elif self.path == '/sw.js':
            body, mime = (adapter + (root / 'sw.js').read_text()).encode(), 'text/javascript'
        elif self.path == '/upstream/page.html':
            body = f'<html><head><base href="https://cdn.jsdelivr.net/gh/web-ports/celeste@{commit}/"><script type="module" src="bundle.js"></script></head><body></body></html>'.encode()
            mime = 'text/html'
        elif self.path == '/celeste-assets/' + commit + '/bundle.js':
            body = b"import {value} from './_framework/dotnet.js'; await WebAssembly.instantiateStreaming(fetch('_framework/runtime.wasm')); window.celesteModuleLoaded=value;"
            mime = 'text/plain'
        elif self.path == '/celeste-assets/' + commit + '/_framework/dotnet.js':
            body, mime = b'export const value=42;', 'text/plain'
        elif self.path == '/celeste-assets/' + commit + '/_framework/runtime.wasm':
            body, mime = b'\x00asm\x01\x00\x00\x00', 'application/octet-stream'
        else:
            self.send_error(404)
            return
        self.send_response(200)
        self.send_header('Content-Type', mime)
        self.end_headers()
        self.wfile.write(body)


server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        page = browser.new_page()
        page.goto(f'http://127.0.0.1:{server.server_port}')
        page.wait_for_function("document.querySelector('#game').contentWindow.celesteModuleLoaded === 42")
        frame = page.frames[1]
        assert '/celeste-assets/' in frame.evaluate('document.baseURI')
        assert frame.evaluate("document.querySelector('script[type=module]').src").startswith(f'http://127.0.0.1:{server.server_port}/celeste-assets/')
        browser.close()
    print('Passed: Celeste base rewrite, relative module imports, and streaming WASM MIME type')
finally:
    server.shutdown()
    server.server_close()
