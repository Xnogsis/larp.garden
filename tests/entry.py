"""Entry opens a game library without a password and accepts only known saved catalogs."""
from functools import partial
from http.server import ThreadingHTTPServer
from threading import Thread
import shutil
from playwright.sync_api import sync_playwright, expect
from browser_support import CatalogHandler, ROOT

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(CatalogHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
try:
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=shutil.which('chromium'), headless=True)
        for saved, target in [(None, 'gnmath.html'), ('ugs.html', 'ugs.html'), ('gnmath.html', 'gnmath.html'), ('https://other.example/', 'gnmath.html')]:
            context = browser.new_context()
            if saved:
                context.add_cookies([{'name':'access_granted', 'value':saved, 'url':base}])
            page = context.new_page()
            page.goto(base + '/')
            page.wait_for_url(base + '/' + target)
            page.locator('#grid .zone').first.wait_for()
            expect(page).to_have_title('Clever')
            assert page.locator('input[type=password]').count() == 0
            context.close()
        page = browser.new_page()
        page.goto(base + '/home.html')
        expect(page.locator('main.home')).to_be_visible()
        page.wait_for_function("document.readyState === 'complete'")
        page.locator('#forget').click()
        expect(page.locator('#forget-note')).to_contain_text('next visit will open Games')
        page.goto(base + '/index.html')
        page.wait_for_url(base + '/gnmath.html')
        browser.close()
    print('Passed: password-free entry, Games default, remembered catalogs, safe saved targets and public Home')
finally:
    server.shutdown()
    server.server_close()
