"""Entry keeps its address while tabs and games navigate inside the site frame."""
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
            site = page.frame_locator('#content-frame')
            site.locator('#grid .zone').first.wait_for()
            assert site.locator('body').evaluate('() => location.pathname') == '/' + target
            assert page.url == base + '/'
            expect(page).to_have_title('Clever')
            assert page.locator('input[type=password]').count() == 0
            context.close()
        page = browser.new_page()
        page.goto(base + '/')
        site = page.frame_locator('#content-frame')
        for tab, path in [('Home','/home.html'), ('UGS','/ugs.html'), ('Games','/gnmath.html')]:
            site.locator('nav').get_by_role('link', name=tab, exact=True).click()
            site.locator('nav a[aria-current="page"]').wait_for()
            assert site.locator('body').evaluate('() => location.pathname') == path
            assert page.url == base + '/'
        site.locator('#grid .zone').first.click()
        site.frame_locator('#frame').locator('#game-control').wait_for()
        assert page.url == base + '/'
        site.locator('#close').click()
        expect(site.locator('#viewer')).not_to_be_visible()
        assert page.url == base + '/'
        assert page.locator('#content-frame').get_attribute('allowfullscreen') is not None
        page.close()
        page = browser.new_page()
        page.goto(base + '/home.html')
        expect(page.locator('main.home')).to_be_visible()
        page.wait_for_function("document.readyState === 'complete'")
        page.locator('#forget').click()
        expect(page.locator('#forget-note')).to_contain_text('next visit will open Games')
        page.goto(base + '/index.html')
        page.frame_locator('#content-frame').locator('#grid .zone').first.wait_for()
        assert page.url == base + '/index.html'
        browser.close()
    print('Passed: stable site address across tabs and games, remembered catalogs, safe saved targets and public Home')
finally:
    server.shutdown()
    server.server_close()
