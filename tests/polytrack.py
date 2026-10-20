"""Check Polytrack's real physics worker through the game hub."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread
import time

from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
missing = []


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def send_error(self, code, *args):
        if self.path.startswith('/polytrack/'):
            missing.append((self.path, code))
        super().send_error(code, *args)

    def do_GET(self):
        if self.path.endswith('/simulation_worker.bundle.js'):
            time.sleep(1)  # The old Blob wrapper raced this download.
        if self.path != '/':
            return super().do_GET()
        body = b'''<!doctype html><iframe id="game" width="800" height="450"></iframe><script>
        window.lgDebug = () => {window.debugAttached = true;};
        (async () => {
            await navigator.serviceWorker.register('/sw.js');
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise(resolve =>
                navigator.serviceWorker.addEventListener('controllerchange', resolve, {once:true}));
            document.querySelector('#game').src = '/hub/gnmath/123-fix2.html';
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
        context = browser.new_context(viewport={'width': 900, 'height': 550})
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        context.add_init_script('''
            // Keep software rendering inexpensive in the test container.
            localStorage.setItem('polytrack_v4_prod_settings', JSON.stringify([
                ['ShadowQuality', '0'], ['CloudsEnabled', 'false'],
                ['RenderScale', '0.5'], ['Antialiasing', 'false']
            ]));
            window.physicsWorkers = [];
            const NativeWorker = window.Worker;
            window.Worker = class extends NativeWorker {
                constructor(url, options) {
                    super(url, options);
                    if (String(url).includes('simulation_worker.bundle.js')) {
                        const record = {url: new URL(url, document.baseURI).href, maxSpeed: 0, frames: 0, updates: 0, sent: [], error: null};
                        this.testRecord = record;
                        physicsWorkers.push(record);
                        this.addEventListener('error', event => { record.error = event.message; });
                        this.addEventListener('message', ({data}) => {
                            for (const car of data.carStates || []) {
                                record.updates++;
                                record.maxSpeed = Math.max(record.maxSpeed, car.speedKmh);
                                record.frames = Math.max(record.frames, car.frames);
                            }
                        });
                    }
                }
                postMessage(message, ...rest) {
                    if (this.testRecord) this.testRecord.sent.push(message.messageType);
                    return super.postMessage(message, ...rest);
                }
            };
        ''')
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(origin)
        page.wait_for_function("document.querySelector('#game').contentWindow.location.pathname === '/polytrack/index.html'")
        game = page.frames[1]
        game.get_by_text('Play', exact=True).wait_for(timeout=120000)
        assert page.evaluate('window.debugAttached')
        game.get_by_text('Play', exact=True).click()
        game.get_by_text('Summer 1', exact=True).click()
        game.get_by_role('button', name='Play', exact=True).click()
        try:
            game.wait_for_function('physicsWorkers.some(w => w.sent.includes(3))', timeout=30000)
            page.keyboard.down('ArrowUp')
            game.wait_for_function('physicsWorkers.some(w => w.maxSpeed > 5 && w.frames > 0)', timeout=30000)
        except Exception:
            print('Worker state:', game.evaluate('physicsWorkers'), 'Errors:', errors, 'Missing:', missing)
            print('UI:', game.locator('body').inner_text())
            page.screenshot(path='/tmp/polytrack-failed.png')
            raise
        page.keyboard.up('ArrowUp')
        page.screenshot(path='/tmp/polytrack-play.png')
        assert not errors, errors
        assert not missing, missing
        assert game.evaluate('physicsWorkers.length >= 2 && physicsWorkers.every(w => w.url === location.origin + "/polytrack/simulation_worker.bundle.js")')
        browser.close()
    print('Passed: local Polytrack menu and driving physics, hub redirect, native workers with delayed downloads and external requests blocked')
finally:
    server.shutdown()
    server.server_close()
