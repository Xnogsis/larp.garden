"""Run with python3 tests/tripwire.py (requires Playwright and Chromium)."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import shutil
from threading import Thread

from playwright.sync_api import sync_playwright


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass


root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(root)))
Thread(target=server.serve_forever, daemon=True).start()
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.route('**/gnmath.html', lambda route: route.fulfill(body='<h1>Catalog test placeholder</h1>'))
        base = f'http://127.0.0.1:{server.server_port}'
        page.goto(base)
        dialog = page.locator('#modification-dialog')
        page.evaluate("document.body.append(document.createElement('aside'))")
        page.wait_for_timeout(100)
        assert not dialog.is_visible(), 'Must not alert on the 404 screen'
        page.keyboard.press('a')
        page.wait_for_function("document.body.classList.contains('unlocked')")
        assert not dialog.is_visible(), 'Changes before unlocking stay quiet'

        def add(element_id):
            page.evaluate("id => { const el = document.createElement('div'); el.id = id; document.body.append(el); }", element_id)

        add('allowed-overlay')
        dialog.wait_for(state='visible')
        assert page.locator('#modification-detail').inner_text() == 'added div#allowed-overlay'
        page.get_by_role('button', name='Add to whitelist', exact=True).click()
        dialog.wait_for(state='hidden')
        page.reload()
        page.wait_for_function("document.body.classList.contains('unlocked')")
        add('allowed-overlay')
        page.wait_for_timeout(100)
        assert not dialog.is_visible(), 'Whitelist must survive reload; cookie unlock must work'

        add('remove-overlay')
        dialog.wait_for(state='visible')
        page.get_by_role('button', name='Remove element', exact=True).click()
        dialog.wait_for(state='hidden')
        page.wait_for_timeout(100)
        assert page.locator('#remove-overlay').count() == 0
        assert not dialog.is_visible(), 'User removal must not trigger another alert'

        page.evaluate("document.querySelector('#allowed-overlay').remove()")
        dialog.wait_for(state='visible')
        assert page.locator('#modification-detail').inner_text() == 'removed div#allowed-overlay'
        assert page.get_by_role('button', name='Remove element', exact=True).is_disabled()
        page.keyboard.press('Escape')
        dialog.wait_for(state='hidden')

        page.evaluate("for (const id of ['first', 'second']) { const el = document.createElement('div'); el.id = id; document.body.append(el); }")
        dialog.wait_for(state='visible')
        assert page.locator('#modification-detail').inner_text() == 'added div#first'
        page.get_by_role('button', name='Close', exact=True).click()
        page.wait_for_function("document.querySelector('#modification-detail').textContent === 'added div#second'")
        assert dialog.is_visible()
        page.get_by_role('button', name='Close', exact=True).click()
        dialog.wait_for(state='hidden')
        assert not errors, errors
        browser.close()
        print('Passed: locked screen, key/cookie unlock, persistent whitelist, removal, Escape, queued alerts; no page errors')
finally:
    server.shutdown()
    server.server_close()
