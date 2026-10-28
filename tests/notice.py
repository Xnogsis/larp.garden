"""Check notice removal, hidden Tv navigation, and game viewer regressions."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread
from playwright.sync_api import sync_playwright


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'))
        context = browser.new_context(service_workers='block')
        origin = f'http://127.0.0.1:{server.server_port}'
        context.route('**/*', lambda route: route.continue_()
                      if route.request.url.startswith(origin + '/') else route.abort())
        context.route('**/hub/**', lambda route: route.fulfill(
            content_type='text/html', body='<!doctype html><title>Test game</title>Test game'))
        page = context.new_page()
        errors, requests = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('request', lambda request: requests.append(request.url))
        for width in [320, 390, 768, 1440]:
            page.set_viewport_size({'width': width, 'height': 800})
            page.goto(origin + '/home.html')
            for tab in ['Games', 'UGS', 'Home']:
                page.locator('#top nav').get_by_role('link', name=tab, exact=True).click()
                assert page.locator('a[href="tv.html"]').count() == 0
                assert page.locator('.home-notice').count() == 0
                assert page.get_by_role('button', name='Pause', exact=True).count() == 0
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if width == 320:
                continue
            for tab in ['Games', 'UGS']:
                page.locator('#top nav').get_by_role('link', name=tab, exact=True).click()
                page.wait_for_function('typeof openZone === "function"')
                page.evaluate('openZone({id: 999, name: "Test game", url: "{HTML_URL}/test-game.html"})')
                page.locator('#viewer.open').wait_for()
                assert page.locator('#viewer').bounding_box()['y'] == 0
                assert page.locator('#viewer').bounding_box()['height'] == 800
                page.get_by_role('button', name='hide bar', exact=True).click()
                assert page.locator('#frame').bounding_box()['height'] == 800
                page.locator('#showbar').click()
                page.locator('#close').click()
        assert not any(url.endswith('/notice.js') for url in requests)
        assert not errors, errors
        browser.close()
        print('Passed: notice removal, hidden Tv links and navigation at four widths; full-height game viewers')
finally:
    server.shutdown()
    server.server_close()
