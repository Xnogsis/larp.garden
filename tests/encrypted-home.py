"""Exercise PageCrypt's fake 404 using a test password, never the live password."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
from pathlib import Path
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
import os
import shutil
import subprocess
from playwright.sync_api import sync_playwright, expect
from browser_support import CatalogHandler, ROOT

with TemporaryDirectory() as tmp:
    directory = Path(tmp)
    (directory / '.github').mkdir()
    for name in ['index.html', 'home.html']:
        shutil.copyfile(ROOT / name, directory / name)
    password = 'homepage-test-password'
    subprocess.run(['node', str(ROOT / '.github/scripts/encrypt-home.mjs')], cwd=directory,
                   env={**os.environ, 'PAGECRYPT_PASSWORD': password}, check=True)
    protected = (directory / '.github/encrypted-home.html').read_bytes()
    assert password.encode() not in protected
    assert b'id="recent-games"' not in protected

    class Handler(CatalogHandler):
        def do_GET(self):
            if urlsplit(self.path).path in ['/', '/index.html', '/home.html']:
                self.send_response(200)
                self.send_header('Content-Type', 'text/html; charset=utf-8')
                self.end_headers()
                self.wfile.write(protected)
            else:
                super().do_GET()

    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    base = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
            context = browser.new_context()
            context.add_cookies([{'name':'access_granted', 'value':'gnmath.html', 'url':base}])
            page = context.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(base + '/')
            expect(page).to_have_title('Clever')
            expect(page.locator('#fake-404 h1')).to_have_text('404 Not Found')
            expect(page.locator('#pwd')).to_be_focused()
            page.keyboard.type('a')
            assert page.url == base + '/'
            assert page.locator('main.home').count() == 0
            page.locator('#pwd').fill('wrong-password')
            page.locator('#pwd').press('Enter')
            expect(page.locator('#msg')).to_have_text('Wrong password.')
            expect(page.locator('#pwd')).to_be_focused()
            page.locator('#pwd').fill(password)
            page.locator('#pwd').press('Enter')
            expect(page.locator('main.home')).to_be_visible()
            expect(page.locator('#theme')).to_be_visible()
            page.reload()
            expect(page.locator('main.home')).to_be_visible()
            page.locator('#forget').click()
            page.reload()
            expect(page.locator('#pwd')).to_be_visible()
            direct = context.new_page()
            direct.goto(base + '/home.html')
            expect(direct.locator('#pwd')).to_be_visible()
            direct.locator('#pwd').fill(password)
            direct.get_by_role('button', name='Enter', exact=True).click()
            expect(direct.locator('main.home')).to_be_visible()
            # A visitor without a password can still use direct game links.
            game = browser.new_page()
            game.goto(base + '/gnmath.html?id=0')
            game.frame_locator('#frame').locator('#game-control').wait_for()
            assert not errors, errors
            browser.close()
        print('Passed: fake 404, cookie bypass prevention, wrong/correct password, reload, lock, direct Home and public Games')
    finally:
        server.shutdown()
        server.server_close()
